/**
 * Responsibility: Calculate source-only change previews and their exact aggregate effects.
 * Scope: Purely pre-commit operations; no source writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {WorkflowStore} from '../../graph/store.ts';
import type {TsLspClient} from '../../change/ts-lsp.ts';
import type {Ts6RefactorClient} from '../../change/ts6-refactor.ts';
import {getProductImpact, type ProductImpact} from '../../product/impact.ts';
import {computeChangeFingerprint, computeFileSha256, blockedChangePreview} from '../../change/fingerprint.ts';
import {ensureAstFresh} from '../../graph/indexer.ts';
import {workspacePath} from '../../change/workspace-path.ts';
import {normalizeWorkspaceEdits, type WorkspaceEditPlan} from './edits.ts';
import {prepareSourceOperation} from './preview-operations.ts';
import type {ChangeRequest, ChangePreview, ChangeMutation, ResolvedCodeTarget, VerificationPlan} from '../../change/types.ts';

export type SourceChangeRequest = Exclude<ChangeRequest, {action: 'product_change'}>;

export interface SourcePreviewContext {
  store: WorkflowStore;
  projectRoot: string;
  lspClient: TsLspClient;
  ts6Client: Ts6RefactorClient;
}

export async function buildSourcePreview(ctx: SourcePreviewContext, request: SourceChangeRequest): Promise<ChangePreview> {
    if (process.env.DEBUG_LSP) console.error('[LSP boundary] ensureAstFresh start');
    await ensureAstFresh(ctx.store, ctx.projectRoot);
    if (process.env.DEBUG_LSP) console.error('[LSP boundary] ensureAstFresh end');

    let productImpact: ProductImpact | undefined;
    if ('productContextEntityId' in request && request.productContextEntityId) {
      try {
        productImpact = await getProductImpact(ctx.store, request.productContextEntityId);
      } catch {}
    }

    const warnings: string[] = [];
    const mutations: ChangeMutation[] = [];
    let resolvedTarget: ResolvedCodeTarget | undefined;
    let summary = '';
    const originalHashes: Record<string, string> = {};

    if (request.action === 'source_change') {
    // Composite changes retain their existing child-preview recursion and no-write contract.
    const seen = new Set<string>();
    for (const change of request.changes) {
      const file = workspacePath(ctx.projectRoot, change.filePath);
      if (seen.has(file))
        return blockedChangePreview(request, `Multiple operations target '${file}'; combine its replacement first.`, warnings, productImpact);
      seen.add(file);
      const child = await buildSourcePreview(ctx, change);
      if (child.blocked) return blockedChangePreview(request, child.blockReason ?? child.summary, warnings, productImpact);
      mutations.push(...child.mutations);
      warnings.push(...child.warnings);
    }
    summary = `Coherent source change across ${seen.size} files.`;
  } else {
    const prepared = await prepareSourceOperation({
      store: ctx.store,
      projectRoot: ctx.projectRoot,
      lspClient: ctx.lspClient,
      ts6Client: ctx.ts6Client
    }, request, productImpact, warnings);
    if ('request' in prepared) return prepared;
    mutations.push(prepared.mutation);
    summary = prepared.summary;
    resolvedTarget = prepared.resolvedTarget;
  }

  // A single aggregate source plan covers all secondary edits and both rename endpoints.
  let editPlan: WorkspaceEditPlan;
  try {
    editPlan = normalizeWorkspaceEdits(
      mutations.filter(m => m.kind === 'workspace_edit').map(m => m.edit),
      ctx.lspClient, ctx.projectRoot
    );
  } catch (error) {
    return blockedChangePreview(request, String(error), warnings, productImpact);
  }
  const affectedFiles = editPlan.affectedFiles;

  // Read and record original hashes
  for (const f of affectedFiles) {
    const abs = path.resolve(ctx.projectRoot, f);
    if (fs.existsSync(abs)) {
      const content = fs.readFileSync(abs, 'utf8');
      originalHashes[f] = computeFileSha256(content);
    } else originalHashes[f] = 'missing';
  }

  const verification: VerificationPlan = {
    diagnosticsExpected: true,
    typecheck: true,
    targetedTests: productImpact?.tests || [],
    graphChecks: {
      expectedDefinition: request.action === 'rename_symbol' ? request.newName : undefined,
      oldDefinitionRemoved: request.action === 'rename_symbol',
      migratedAnchor: resolvedTarget?.graphEntityId
        ? { oldId: resolvedTarget.graphEntityId }
        : undefined
    }
  };

  const fingerprint = computeChangeFingerprint(
    request,
    resolvedTarget,
    mutations,
    originalHashes,
    productImpact,
    ctx.lspClient,
    ctx.projectRoot,
    editPlan
  );

  return {
    fingerprint,
    summary,
    request,
    resolvedTarget,
    mutations,
    affectedFiles,
    originalHashes,
    productImpact,
    verification,
    warnings,
    blocked: false
  };
}
