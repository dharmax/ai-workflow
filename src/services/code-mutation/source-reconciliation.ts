/**
 * Responsibility: Reconcile committed source effects with durable graph obligations.
 * Scope: Post-write indexing, anchor migration, and observed effects; never performs source commits.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {WorkflowStore} from '../../graph/store.ts';
import {ensureAstFresh, indexSingleFile} from '../../graph/indexer.ts';
import {FileNode, SymbolNode} from '../../model/ontology.ts';
import {computeFileSha256} from './fingerprint.ts';
import {workspacePath} from '../../helpers/workspace-path.ts';
import type {TsLspClient} from '../typescript/ts-lsp.ts';
import type {ChangePreview, ChangeRequest, LspTextEdit} from '../../change/types.ts';

type SourceRequest = Exclude<ChangeRequest, {action: 'product_change'}>;
type Anchor = {oldId: string; symbol?: SymbolNode; relations: Array<{sourceId: string; predicate: string}>};

export interface SourceReconciliationContext {
  store: WorkflowStore;
  projectRoot: string;
  lspClient: TsLspClient;
  governedAdmission?: string;
}

/** Collect only existing durable inbound obligations before indexing replaces graph nodes. */
async function collectSourceAnchors(ctx: SourceReconciliationContext, request: SourceRequest, preview: ChangePreview): Promise<Anchor[]> {
  const {store, projectRoot} = ctx;
  const renamingFile = request.action === 'rename_file';
  const migrating = renamingFile || request.action === 'rename_symbol' ||
    (request.action === 'refactor' && /move|extract/i.test(request.refactorKind));
  const anchors: Array<FileNode | SymbolNode> = [];
  if (request.action === 'rename_file') {
    const oldFile = workspacePath(projectRoot, request.oldPath);
    const file = await store.getEntity<FileNode>(oldFile, FileNode.dcr);
    if (file) anchors.push(file);
    anchors.push(...(await store.listEntities<SymbolNode>(SymbolNode.dcr, {filePath: oldFile}))
      .filter(symbol => symbol.status !== 'deprecated'));
  } else if (migrating && preview.resolvedTarget?.graphEntityId) {
    const symbol = await store.getEntity<SymbolNode>(preview.resolvedTarget.graphEntityId, SymbolNode.dcr);
    if (symbol) anchors.push(symbol);
  }
  const sources: Anchor[] = [];
  for (const anchor of anchors) {
    const relations: Anchor['relations'] = [];
    for (const predicate of ['modifies', 'targets', 'governs'])
      for (const edge of await store.getIncoming(anchor.id, predicate))
        relations.push({sourceId: edge.sourceId, predicate});
    if (relations.length)
      sources.push({oldId: anchor.id, symbol: anchor instanceof SymbolNode ? anchor : undefined, relations});
  }
  return sources;
}

async function reindexSourceFiles(ctx: SourceReconciliationContext, files: Set<string>, affected: string[]): Promise<string[]> {
  const {store, projectRoot, governedAdmission} = ctx;
  const reindexedFiles: string[] = [];
  const reindex = async () => {
    for (const file of files) {
      const absolute = path.resolve(projectRoot, file);
      if (fs.existsSync(absolute)) {
        await indexSingleFile(store, absolute, file, projectRoot);
        reindexedFiles.push(file);
      }
    }
  };
  if (governedAdmission) await store.withGovernedIndexing(governedAdmission, affected, reindex);
  else await reindex();
  return reindexedFiles;
}

async function migrateSourceAnchors(
  ctx: SourceReconciliationContext, request: SourceRequest, anchors: Anchor[], files: Set<string>
): Promise<Array<{oldId: string; newId: string}>> {
  const {store, projectRoot, governedAdmission} = ctx;
  const migrated: Array<{oldId: string; newId: string}> = [];
  for (const anchor of anchors) {
    let target: FileNode | SymbolNode | null = null;
    if (request.action === 'rename_file' && !anchor.symbol)
      target = await store.getEntity<FileNode>(workspacePath(projectRoot, request.newPath), FileNode.dcr);
    else {
      const title = request.action === 'rename_symbol' ? request.newName : anchor.symbol!.title;
      const candidates = (await store.listEntities<SymbolNode>(SymbolNode.dcr, {title}))
        .filter(symbol => symbol.status !== 'deprecated' && symbol.containerName === anchor.symbol!.containerName &&
          files.has(symbol.filePath!) && (request.action !== 'rename_file' || symbol.filePath === workspacePath(projectRoot, request.newPath)));
      if (candidates.length === 1) target = candidates[0];
    }
    if (!target) throw Error(`Durable anchor '${anchor.oldId}' lacks an unambiguous post-change target.`);
    for (const relation of anchor.relations)
      await store.migrateCodeAnchor(relation.sourceId, relation.predicate, anchor.oldId, target, governedAdmission);
    migrated.push({oldId: anchor.oldId, newId: target.id});
  }
  return migrated;
}

/** These are observed checks, not typecheck, diagnostics, or test execution claims. */
async function verifySourceEffects(
  ctx: SourceReconciliationContext, preview: ChangePreview, expectedAfter: Record<string, string>
): Promise<string[]> {
  const errors: string[] = [];
  if (preview.verification.graphChecks.expectedDefinition && preview.resolvedTarget) {
    try {
      const defs = await ctx.lspClient.getDefinition(preview.resolvedTarget.filePath, preview.resolvedTarget.position);
      if (!defs.length)
        errors.push(`Post-change verification: definition for '${preview.verification.graphChecks.expectedDefinition}' could not be resolved.`);
    } catch (error: any) {
      errors.push(`Post-change LSP probe failed: ${error.message}`);
    }
  }
  for (const [file, expected] of Object.entries(expectedAfter)) {
    const absolute = path.resolve(ctx.projectRoot, file);
    const actual = fs.existsSync(absolute) ? computeFileSha256(fs.readFileSync(absolute, 'utf8')) : 'missing';
    if (actual !== expected) errors.push(`Observed effect for '${file}' differs from the guarded preview.`);
  }
  return errors;
}

/** Run only after filesystem commit; errors are reported by the caller as partially applied. */
export async function reconcileCommittedSource(
  ctx: SourceReconciliationContext,
  request: SourceRequest,
  preview: ChangePreview,
  fileEdits: ReadonlyMap<string, LspTextEdit[]>,
  expectedAfter: Record<string, string>
) {
  const anchors = await collectSourceAnchors(ctx, request, preview);
  const files = new Set<string>([...preview.affectedFiles, ...fileEdits.keys()]);
  const reindexedFiles = await reindexSourceFiles(ctx, files, preview.affectedFiles);
  const migratedAnchors = await migrateSourceAnchors(ctx, request, anchors, files);
  const refresh = () => ensureAstFresh(ctx.store, ctx.projectRoot);
  if (ctx.governedAdmission)
    await ctx.store.withGovernedIndexing(ctx.governedAdmission, preview.affectedFiles, refresh);
  else await refresh();
  const verificationErrors = await verifySourceEffects(ctx, preview, expectedAfter);
  return {reindexedFiles, migratedAnchors, verificationErrors};
}
