/**
 * Responsibility: Core Causal Change Engine for previewing and safely applying code changes.
 * Scope:
 *   - previewChange(request, options): computes preview, mutations, affected files, hashes, impact, verification, fingerprint.
 *   - applyChange(request, fingerprint, options): verifies fingerprint freshness, validates edits, executes disk mutations with rollback safety, re-indexes, migrates durable anchors, and verifies.
 * Rules:
 *   - Zero disk writes during preview.
 *   - No home-grown AST parsing/refactoring; uses TS7 LSP WorkspaceEdits.
 *   - Best-effort rollback on filesystem failure during commit.
 *   - No speculative rollback on verification/test failure after successful commit.
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { WorkflowStore } from '../graph/store.ts';
import { getTsLspClient, TsLspClient } from './ts-lsp.ts';
import { getTs6RefactorClient, Ts6RefactorClient } from './ts6-refactor.ts';
import { resolveCodeTarget } from './target-resolver.ts';
import { getProductImpact, type ProductImpact } from '../product/impact.ts';
import { ensureAstFresh, indexSingleFile, withAstSnapshot } from '../graph/indexer.ts';
import { getExactSymbolSource } from './symbol-source.ts';
import { SymbolNode, Ticket, Decision } from '../graph/ontology.ts';
import { validateProductMutations, applyProductMutations, productDependents } from '../product/mutation.ts';
import { getCoverage } from '../product/coverage.ts';
import type {
  ChangeRequest,
  ChangePreview,
  ChangeApplyResult,
  ChangeMutation,
  WorkspaceEditLike,
  LspTextEdit,
  LspPosition,
  LspRange,
  ResolvedCodeTarget,
  VerificationPlan
} from './types.ts';

export interface ChangeEngineOptions {
  store: WorkflowStore;
  projectRoot: string;
  lspClient?: TsLspClient;
  ts6Client?: Ts6RefactorClient;
}

export function computeFileSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Applies a list of LspTextEdits to file text in memory (0-based line/col).
 * Applies edits in reverse order so line/column offsets remain stable.
 */
export function applyTextEdits(content: string, edits: LspTextEdit[]): string {
  if (edits.length === 0) return content;

  const lines = content.split('\n');

  // Convert position to char offset
  function posToOffset(pos: LspPosition): number {
    let offset = 0;
    for (let i = 0; i < Math.min(pos.line, lines.length); i++) {
      offset += lines[i].length + 1; // +1 for \n
    }
    if (pos.line < lines.length) {
      offset += Math.min(pos.character, lines[pos.line].length);
    }
    return offset;
  }

  // Sort edits descending by start offset
  const sortedEdits = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  let result = content;
  for (const edit of sortedEdits) {
    const startOff = posToOffset(edit.range.start);
    const endOff = posToOffset(edit.range.end);
    result = result.slice(0, startOff) + edit.newText + result.slice(endOff);
  }

  return result;
}

/**
 * Normalizes all edits from a WorkspaceEdit into a standard map:
 * relPath -> LspTextEdit[]
 * plus any file renames: Array<{ from: string; to: string }>
 */
export function normalizeWorkspaceEdit(
  edit: WorkspaceEditLike,
  lspClient: TsLspClient,
  projectRoot: string
): {
  fileEdits: Map<string, LspTextEdit[]>;
  fileRenames: Array<{ from: string; to: string }>;
} {
  const fileEdits = new Map<string, LspTextEdit[]>();
  const fileRenames: Array<{ from: string; to: string }> = [];

  // 1. Direct changes map { [uri]: edits }
  if (edit.changes) {
    for (const [uriOrPath, edits] of Object.entries(edit.changes)) {
      const absPath = uriOrPath.startsWith('file://') ? lspClient.fromUri(uriOrPath) : uriOrPath;
      const relPath = path.isAbsolute(absPath) ? path.relative(projectRoot, absPath) : absPath;
      const existing = fileEdits.get(relPath) || [];
      existing.push(...edits);
      fileEdits.set(relPath, existing);
    }
  }

  // 2. documentChanges array
  if (edit.documentChanges) {
    for (const docChange of edit.documentChanges) {
      if ('kind' in docChange && docChange.kind === 'rename') {
        const fromAbs = lspClient.fromUri(docChange.oldUri);
        const toAbs = lspClient.fromUri(docChange.newUri);
        fileRenames.push({
          from: path.relative(projectRoot, fromAbs),
          to: path.relative(projectRoot, toAbs)
        });
      } else if ('textDocument' in docChange) {
        const absPath = lspClient.fromUri(docChange.textDocument.uri);
        const relPath = path.relative(projectRoot, absPath);
        const existing = fileEdits.get(relPath) || [];
        existing.push(...docChange.edits);
        fileEdits.set(relPath, existing);
      }
    }
  }

  return { fileEdits, fileRenames };
}

/**
 * Computes deterministic fingerprint from normalized request, targets, edits, and file hashes.
 */
export function computeChangeFingerprint(
  request: ChangeRequest,
  resolvedTarget: ResolvedCodeTarget | undefined,
  mutations: ChangeMutation[],
  originalHashes: Record<string, string>,
  productImpact?: ProductImpact,
  lspClient?: TsLspClient,
  projectRoot?: string
): string {
  // Sort original hashes by file path
  const sortedHashes: Record<string, string> = {};
  for (const k of Object.keys(originalHashes).sort()) {
    sortedHashes[k] = originalHashes[k];
  }

  // Canonicalize mutations: extract and sort all text edits and renames by file path
  const canonicalFileEdits: Array<{ file: string; edits: LspTextEdit[] }> = [];
  const canonicalRenames: Array<{ from: string; to: string }> = [];

  for (const mutation of mutations) {
    if (mutation.kind === 'workspace_edit' && lspClient && projectRoot) {
      const norm = normalizeWorkspaceEdit(mutation.edit, lspClient, projectRoot);
      for (const [file, edits] of norm.fileEdits.entries()) {
        const sortedEdits = [...edits].sort((a, b) => {
          if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
          if (a.range.start.character !== b.range.start.character) return a.range.start.character - b.range.start.character;
          return a.newText.localeCompare(b.newText);
        });
        canonicalFileEdits.push({ file, edits: sortedEdits });
      }
      for (const r of norm.fileRenames) {
        canonicalRenames.push(r);
      }
    }
  }

  canonicalFileEdits.sort((a, b) => a.file.localeCompare(b.file));
  canonicalRenames.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const payload = {
    request,
    resolvedTarget: resolvedTarget
      ? {
          filePath: resolvedTarget.filePath,
          symbolName: resolvedTarget.symbolName,
          containerName: resolvedTarget.containerName,
          position: resolvedTarget.position
        }
      : undefined,
    canonicalFileEdits,
    canonicalRenames,
    sortedHashes,
    productContext: productImpact
      ? {
          id: productImpact.entityId,
          tickets: [...productImpact.tickets].sort(),
          code: [...productImpact.code].sort()
        }
      : undefined
  };

  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export class CausalChangeEngine {
  public readonly store: WorkflowStore;
  public readonly projectRoot: string;
  public readonly lspClient: TsLspClient;
  public readonly ts6Client: Ts6RefactorClient;

  constructor(options: ChangeEngineOptions) {
    this.store = options.store;
    this.projectRoot = path.resolve(options.projectRoot);
    this.lspClient = options.lspClient || getTsLspClient(this.projectRoot);
    this.ts6Client = options.ts6Client || getTs6RefactorClient(this.projectRoot);
  }

  /**
   * Previews a change request without mutating disk.
   */
  async previewChange(request: ChangeRequest): Promise<ChangePreview> {
    return withAstSnapshot(() => this.buildPreview(request));
  }

  private async buildPreview(request: ChangeRequest): Promise<ChangePreview> {
    if (request.action === 'product_change') return this.previewProductChange(request);
    await ensureAstFresh(this.store, this.projectRoot);

    let productImpact: ProductImpact | undefined;
    if (request.productContextEntityId) {
      try {
        productImpact = await getProductImpact(this.store, request.productContextEntityId);
      } catch {}
    }

    const warnings: string[] = [];
    const mutations: ChangeMutation[] = [];
    let resolvedTarget: ResolvedCodeTarget | undefined;
    let summary = '';
    const affectedFilesSet = new Set<string>();
    const originalHashes: Record<string, string> = {};

    switch (request.action) {
      case 'replace_symbol': {
        try {
          resolvedTarget = await resolveCodeTarget(request.target, this.store, this.lspClient, this.projectRoot);
          const qualified = resolvedTarget.containerName ? `${resolvedTarget.containerName}.${resolvedTarget.symbolName}` : resolvedTarget.symbolName;
          const exact = await getExactSymbolSource(this.projectRoot, resolvedTarget.filePath, qualified, this.lspClient);
          // LSP SymbolKind: Method=6, Function=12. Other declarations need their own acceptance case.
          if (exact.kind !== 6 && exact.kind !== 12) throw new Error('Replacement supports only known functions/methods.');
          resolvedTarget.range = exact.range;
          mutations.push({ kind: 'workspace_edit', source: 'typescript-lsp', edit: {
            changes: { [resolvedTarget.uri]: [{ range: exact.range, newText: request.replacement }] }
          } });
          affectedFilesSet.add(resolvedTarget.filePath);
          summary = `Replace '${qualified}' using its exact TypeScript declaration range.`;
        } catch (error) {
          return this.createBlockedPreview(request, String(error), warnings, productImpact);
        }
        break;
      }
      case 'rename_symbol': {
        try {
          resolvedTarget = await resolveCodeTarget(request.target, this.store, this.lspClient, this.projectRoot);
        } catch (err: any) {
          return this.createBlockedPreview(request, err.message, warnings, productImpact);
        }

        // Verify with prepareRename
        const prep = await this.lspClient.prepareRename(resolvedTarget.filePath, resolvedTarget.position);
        if (!prep) {
          return this.createBlockedPreview(
            request,
            `Symbol '${resolvedTarget.symbolName}' cannot be renamed at this location (prepareRename rejected).`,
            warnings,
            productImpact
          );
        }

        const edit = await this.lspClient.rename(resolvedTarget.filePath, resolvedTarget.position, request.newName);
        mutations.push({ kind: 'workspace_edit', source: 'typescript-lsp', edit });

        const normalized = normalizeWorkspaceEdit(edit, this.lspClient, this.projectRoot);
        for (const f of normalized.fileEdits.keys()) affectedFilesSet.add(f);

        summary = `Rename symbol '${resolvedTarget.symbolName}' -> '${request.newName}' in ${affectedFilesSet.size} file(s).`;
        break;
      }

      case 'rename_file': {
        const oldRel = path.isAbsolute(request.oldPath) ? path.relative(this.projectRoot, request.oldPath) : request.oldPath;
        const newRel = path.isAbsolute(request.newPath) ? path.relative(this.projectRoot, request.newPath) : request.newPath;

        if (!fs.existsSync(path.resolve(this.projectRoot, oldRel))) {
          return this.createBlockedPreview(request, `Source file '${oldRel}' does not exist.`, warnings, productImpact);
        }
        if (fs.existsSync(path.resolve(this.projectRoot, newRel))) {
          return this.createBlockedPreview(request, `Destination file '${newRel}' already exists.`, warnings, productImpact);
        }

        // Call workspace/willRenameFiles
        const willRenameEdit = await this.lspClient.willRenameFiles([{ oldPath: oldRel, newPath: newRel }]);

        // Add file rename operation into mutations
        const combinedEdit: WorkspaceEditLike = {
          ...willRenameEdit,
          documentChanges: [
            ...(willRenameEdit.documentChanges || []),
            {
              kind: 'rename',
              oldUri: this.lspClient.toUri(oldRel),
              newUri: this.lspClient.toUri(newRel)
            }
          ]
        };

        mutations.push({ kind: 'workspace_edit', source: 'typescript-lsp', edit: combinedEdit });

        const normalized = normalizeWorkspaceEdit(combinedEdit, this.lspClient, this.projectRoot);
        for (const f of normalized.fileEdits.keys()) affectedFilesSet.add(f);
        affectedFilesSet.add(oldRel);

        summary = `Rename file '${oldRel}' -> '${newRel}' and update references across ${affectedFilesSet.size} file(s).`;
        break;
      }

      case 'source_action': {
        const relPath = path.isAbsolute(request.filePath) ? path.relative(this.projectRoot, request.filePath) : request.filePath;
        const absPath = path.resolve(this.projectRoot, relPath);
        if (!fs.existsSync(absPath)) {
          return this.createBlockedPreview(request, `File '${relPath}' does not exist.`, warnings, productImpact);
        }

        // Request code actions for whole file
        const fullRange: LspRange = {
          start: { line: 0, character: 0 },
          end: { line: 100000, character: 0 }
        };

        const actions = await this.lspClient.getCodeActions(relPath, fullRange, [request.actionKind]);
        const matchingAction = actions.find(a => a.kind === request.actionKind || a.title.toLowerCase().includes(request.actionKind.toLowerCase()));

        if (!matchingAction || !matchingAction.edit) {
          return this.createBlockedPreview(
            request,
            `Native TS7 LSP does not currently advertise a usable edit for source action '${request.actionKind}'.`,
            warnings,
            productImpact
          );
        }

        mutations.push({ kind: 'workspace_edit', source: 'typescript-lsp', edit: matchingAction.edit });
        const normalized = normalizeWorkspaceEdit(matchingAction.edit, this.lspClient, this.projectRoot);
        for (const f of normalized.fileEdits.keys()) affectedFilesSet.add(f);

        summary = `Apply source action '${request.actionKind}' (${matchingAction.title}) in '${relPath}'.`;
        break;
      }

      case 'refactor': {
        try {
          resolvedTarget = await resolveCodeTarget(request.target, this.store, this.lspClient, this.projectRoot);
        } catch (err: any) {
          return this.createBlockedPreview(request, err.message, warnings, productImpact);
        }

        const targetRange: LspRange = resolvedTarget.range || {
          start: resolvedTarget.position,
          end: resolvedTarget.position
        };

        // 1. Check TS7 native LSP capabilities probe first (TS7 always wins if supported)
        const ts7Actions = await this.lspClient.getCodeActions(resolvedTarget.filePath, targetRange, [request.refactorKind]);
        const matchingTs7 = ts7Actions.find(a =>
          a.edit && (a.kind === request.refactorKind || a.title.toLowerCase().includes(request.refactorKind.toLowerCase()))
        );

        if (matchingTs7?.edit) {
          mutations.push({ kind: 'workspace_edit', source: 'typescript-lsp', edit: matchingTs7.edit });
          const normalized = normalizeWorkspaceEdit(matchingTs7.edit, this.lspClient, this.projectRoot);
          for (const f of normalized.fileEdits.keys()) affectedFilesSet.add(f);
          summary = `Apply TS7 refactor '${request.refactorKind}' (${matchingTs7.title}) in '${resolvedTarget.filePath}'.`;
          break;
        }

        // 2. Fallback to TypeScript 6 mature refactor sidecar
        // Check for missing interactive arguments before invoking sidecar
        const lowerRefactor = request.refactorKind.toLowerCase();
        const isMoveToFile = lowerRefactor.includes('move to file') || lowerRefactor.includes('move_to_file') || lowerRefactor === 'move';
        if (isMoveToFile && !request.arguments?.targetFile && !request.actionName?.toLowerCase().includes('new file')) {
          // If actionName isn't explicitly 'Move to a new file', require targetFile
          if (request.refactorKind.includes('newFile') || request.actionName?.includes('new file')) {
            // Move to new file - targetFile is generated automatically by tsserver
          } else {
            return this.createBlockedPreview(
              request,
              "Move to file requires destination argument 'targetFile'.",
              warnings,
              productImpact,
              ['targetFile']
            );
          }
        }

        let applicableRefactors = await this.ts6Client.getApplicableRefactors(resolvedTarget.filePath, targetRange);
        if (applicableRefactors.length === 0 && resolvedTarget.range) {
          applicableRefactors = await this.ts6Client.getApplicableRefactors(resolvedTarget.filePath, resolvedTarget.range);
        }

        // Match applicable refactor by refactorKind or name, prioritizing refactors with applicable actions
        let matchedRefactor = applicableRefactors.find(r =>
          (r.name.toLowerCase().includes(request.refactorKind.toLowerCase()) ||
           r.description.toLowerCase().includes(request.refactorKind.toLowerCase()) ||
           r.actions.some(a => a.kind?.toLowerCase() === request.refactorKind.toLowerCase() || a.name.toLowerCase().includes(request.refactorKind.toLowerCase()))) &&
          r.actions.some(a => !a.notApplicableReason)
        );

        if (!matchedRefactor) {
          matchedRefactor = applicableRefactors.find(r =>
            r.name.toLowerCase().includes(request.refactorKind.toLowerCase()) ||
            r.description.toLowerCase().includes(request.refactorKind.toLowerCase()) ||
            r.actions.some(a => a.kind?.toLowerCase() === request.refactorKind.toLowerCase() || a.name.toLowerCase().includes(request.refactorKind.toLowerCase()))
          );
        }

        // Special handling: "extract" matches "Extract Symbol" with applicable actions
        if (!matchedRefactor && lowerRefactor.includes('extract')) {
          matchedRefactor = applicableRefactors.find(r => r.name.toLowerCase().includes('extract') && r.actions.some(a => !a.notApplicableReason)) ||
                            applicableRefactors.find(r => r.name.toLowerCase().includes('extract'));
        }
        // Special handling: "move" matches "Move to a new file" or "Move to file"
        if (!matchedRefactor && lowerRefactor.includes('move')) {
          matchedRefactor = applicableRefactors.find(r => r.name.toLowerCase().includes('move') && r.actions.some(a => !a.notApplicableReason)) ||
                            applicableRefactors.find(r => r.name.toLowerCase().includes('move'));
        }
        // Special handling: "inline" matches "Inline variable"
        if (!matchedRefactor && lowerRefactor.includes('inline')) {
          matchedRefactor = applicableRefactors.find(r => r.name.toLowerCase().includes('inline') && r.actions.some(a => !a.notApplicableReason)) ||
                            applicableRefactors.find(r => r.name.toLowerCase().includes('inline'));
        }

        if (!matchedRefactor || !matchedRefactor.actions.some(a => !a.notApplicableReason)) {
          const reason = matchedRefactor?.actions[0]?.notApplicableReason;
          return this.createBlockedPreview(
            request,
            reason
              ? `Cannot execute refactor '${matchedRefactor!.name}': ${reason}`
              : `Unsupported refactor: neither TS7 nor TS6 mature refactor supports '${request.refactorKind}' at this location. Available refactors: ${applicableRefactors.map(r => r.name).join(', ') || 'none'}.`,
            warnings,
            productImpact
          );
        }

        // Determine refactor and action name
        let refactorNameToUse = matchedRefactor.name;
        let actionToExecute: string = request.actionName || '';

        // If moving to an existing file with targetFile provided, tsserver expects 'Move to file'
        if (isMoveToFile && request.arguments?.targetFile) {
          refactorNameToUse = 'Move to file';
          if (!actionToExecute) {
            actionToExecute = 'Move to file';
          }
        } else if (!actionToExecute) {
          const validAction = matchedRefactor.actions.find(a => !a.notApplicableReason);
          if (validAction) {
            actionToExecute = validAction.name;
          } else if (matchedRefactor.actions.length > 0) {
            actionToExecute = matchedRefactor.actions[0].name;
          }
        }

        const edit = await this.ts6Client.getEditsForRefactor(
          resolvedTarget.filePath,
          targetRange,
          refactorNameToUse,
          actionToExecute,
          request.arguments
        );

        if (!edit) {
          return this.createBlockedPreview(
            request,
            `TypeScript 6 sidecar was unable to generate edits for refactor '${matchedRefactor.name}' (action: '${actionToExecute}').`,
            warnings,
            productImpact
          );
        }

        mutations.push({ kind: 'workspace_edit', source: 'typescript6-refactor', edit });
        const normalized = normalizeWorkspaceEdit(edit, this.lspClient, this.projectRoot);
        for (const f of normalized.fileEdits.keys()) affectedFilesSet.add(f);
        for (const r of normalized.fileRenames) {
          affectedFilesSet.add(r.from);
          affectedFilesSet.add(r.to);
        }

        summary = `Apply TS6 mature refactor '${matchedRefactor.name}' (${actionToExecute}) across ${affectedFilesSet.size} file(s).`;
        break;
      }
    }

    const affectedFiles = Array.from(affectedFilesSet).sort();

    // Read and record original hashes
    for (const f of affectedFiles) {
      const abs = path.resolve(this.projectRoot, f);
      if (fs.existsSync(abs)) {
        const content = fs.readFileSync(abs, 'utf8');
        originalHashes[f] = computeFileSha256(content);
      }
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
      this.lspClient,
      this.projectRoot
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

  private async previewProductChange(request: Extract<ChangeRequest, { action: 'product_change' }>): Promise<ChangePreview> {
    try {
      const { snapshot } = await validateProductMutations(this.store, request.mutations);
      const deleted = request.mutations.filter(m => m.kind === 'product_delete');
      const dependents = (await Promise.all(deleted.map(m => productDependents(this.store, m.id)))).flat();
      const affected = new Set<string>();
      for (const mutation of request.mutations) {
        if ('id' in mutation) affected.add(mutation.id);
        else { affected.add(mutation.sourceId); affected.add(mutation.targetId); }
      }
      const productImpacts: ProductImpact[] = [];
      for (const id of affected) {
        const entity = await this.store.getEntity(id);
        if (entity && ['Epic', 'Feature', 'UserStory'].includes(entity.typeName())) {
          productImpacts.push(await getProductImpact(this.store, id));
        }
      }
      const fingerprint = computeFileSha256(JSON.stringify({ request, snapshot }));
      return {
        fingerprint, summary: `${request.mutations.length} Product Intent mutation(s): ${[...affected].sort().join(', ')}`,
        request, mutations: request.mutations, affectedFiles: [], originalHashes: {},
        affectedProducts: [...affected].sort(), productImpact: productImpacts[0], productImpacts,
        dependents, warnings: dependents.length ? [`Explicit deletion affects ${dependents.length} relation(s).`] : [],
        blocked: false, verification: { diagnosticsExpected: false, typecheck: false, targetedTests: [], graphChecks: {} }
      };
    } catch (error) {
      const blocked = this.createBlockedPreview(request, error instanceof Error ? error.message : String(error), []);
      const deleted = request.mutations.filter(m => m.kind === 'product_delete');
      blocked.dependents = (await Promise.all(deleted.map(async m => {
        try { return await productDependents(this.store, m.id); } catch { return []; }
      }))).flat();
      return blocked;
    }
  }

  private createBlockedPreview(
    request: ChangeRequest,
    reason: string,
    warnings: string[],
    productImpact?: ProductImpact,
    requiredArguments?: string[]
  ): ChangePreview {
    return {
      fingerprint: computeChangeFingerprint(
        request,
        undefined,
        [],
        {},
        productImpact,
        this.lspClient,
        this.projectRoot
      ),
      summary: `Blocked: ${reason}`,
      request,
      mutations: [],
      affectedFiles: [],
      originalHashes: {},
      productImpact,
      verification: {
        diagnosticsExpected: false,
        typecheck: false,
        targetedTests: [],
        graphChecks: {}
      },
      warnings,
      blocked: true,
      blockReason: reason,
      requiredArguments
    };
  }

  /**
   * Safely applies the previewed change.
   */
  async applyChange(request: ChangeRequest, fingerprint: string): Promise<ChangeApplyResult> {
    // 1. Recompute preview immediately and assert fingerprint matches
    const preview = await this.previewChange(request);
    if (preview.blocked) {
      return {
        ok: false,
        fingerprint,
        filesTouched: [],
        filesRenamed: [],
        reindexedFiles: [],
        migratedAnchors: [],
        verification: { passed: false, diagnosticsOk: false, errors: [preview.blockReason || 'Preview blocked'] },
        error: preview.blockReason
      };
    }

    if (preview.fingerprint !== fingerprint) {
      throw new Error(`Stale change preview: fingerprint mismatch (expected '${fingerprint}', recomputed '${preview.fingerprint}'). Workspace or causal graph modified since preview.`);
    }

    if (request.action === 'product_change') {
      await applyProductMutations(this.store, request.mutations);
      const errors: string[] = [];
      const finalRelations = new Map<string, boolean>();
      for (const mutation of request.mutations) {
        if (mutation.kind === 'product_link' || mutation.kind === 'product_unlink') {
          finalRelations.set(JSON.stringify([mutation.sourceId, mutation.predicate, mutation.targetId]), mutation.kind === 'product_link');
        }
      }
      for (const mutation of request.mutations) {
        if (mutation.kind === 'product_delete') {
          if (await this.store.getEntity(mutation.id)) errors.push(`Deleted entity '${mutation.id}' remains.`);
        } else if ('id' in mutation) {
          if (!await this.store.getEntity(mutation.id)) errors.push(`Entity '${mutation.id}' is missing after apply.`);
          if (mutation.entityType !== 'Ticket') {
            try { await getCoverage(this.store, mutation.id); await getProductImpact(this.store, mutation.id); }
            catch (error) { errors.push(String(error)); }
          }
        } else {
          const key = JSON.stringify([mutation.sourceId, mutation.predicate, mutation.targetId]);
          if (finalRelations.get(key) !== (mutation.kind === 'product_link')) continue;
          const source = await this.store.getEntity(mutation.sourceId);
          const target = await this.store.getEntity(mutation.targetId);
          const outgoing = source ? await this.store.getOutgoing(source.id, mutation.predicate) : [];
          const linked = outgoing.some(edge => edge.targetId === target?.id);
          if (linked !== finalRelations.get(key)) errors.push(`Relation '${mutation.sourceId} ${mutation.predicate} ${mutation.targetId}' verification failed.`);
        }
      }
      return {
        ok: true, fingerprint, filesTouched: [], filesRenamed: [], reindexedFiles: [], migratedAnchors: [],
        verification: { passed: errors.length === 0, diagnosticsOk: errors.length === 0, errors }
      };
    }

    // 2. Validate current disk hashes against preview original hashes
    for (const [relPath, expectedHash] of Object.entries(preview.originalHashes)) {
      const absPath = path.resolve(this.projectRoot, relPath);
      if (!fs.existsSync(absPath)) {
        throw new Error(`File '${relPath}' was removed after preview was computed.`);
      }
      const currentContent = fs.readFileSync(absPath, 'utf8');
      const currentHash = computeFileSha256(currentContent);
      if (currentHash !== expectedHash) {
        throw new Error(`File '${relPath}' has been modified since preview. Aborting apply.`);
      }
    }

    // 3. Normalize all edits across all mutations
    const combinedFileEdits = new Map<string, LspTextEdit[]>();
    const combinedRenames: Array<{ from: string; to: string }> = [];

    for (const mutation of preview.mutations) {
      if (mutation.kind === 'workspace_edit') {
        const norm = normalizeWorkspaceEdit(mutation.edit, this.lspClient, this.projectRoot);
        for (const [f, edits] of norm.fileEdits) {
          const list = combinedFileEdits.get(f) || [];
          list.push(...edits);
          combinedFileEdits.set(f, list);
        }
        combinedRenames.push(...norm.fileRenames);
      }
    }

    // 4. Materialize every resulting file in memory before touching disk
    const materializedFiles = new Map<string, string>();
    const originalBackups = new Map<string, string | null>();

    for (const [relPath, edits] of combinedFileEdits) {
      const absPath = path.resolve(this.projectRoot, relPath);
      let original = '';
      if (fs.existsSync(absPath)) {
        original = fs.readFileSync(absPath, 'utf8');
        originalBackups.set(absPath, original);
      } else {
        originalBackups.set(absPath, null); // Newly created file
      }
      const updated = applyTextEdits(original, edits);
      materializedFiles.set(absPath, updated);
    }

    // 5. Commit phase with best-effort rollback on filesystem error
    const writtenFiles: string[] = [];
    const executedRenames: Array<{ from: string; to: string }> = [];

    try {
      // 5a. Write modified / new file contents
      for (const [absPath, content] of materializedFiles) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
        writtenFiles.push(absPath);
      }

      // 5b. Execute file renames
      for (const r of combinedRenames) {
        const fromAbs = path.resolve(this.projectRoot, r.from);
        const toAbs = path.resolve(this.projectRoot, r.to);
        fs.mkdirSync(path.dirname(toAbs), { recursive: true });
        fs.renameSync(fromAbs, toAbs);
        executedRenames.push(r);
      }
    } catch (err: any) {
      // Best-effort rollback
      for (const r of executedRenames.reverse()) {
        try {
          fs.renameSync(path.resolve(this.projectRoot, r.to), path.resolve(this.projectRoot, r.from));
        } catch {}
      }
      for (const abs of writtenFiles) {
        try {
          const original = originalBackups.get(abs);
          if (original !== null && original !== undefined) {
            fs.writeFileSync(abs, original, 'utf8');
          } else if (original === null) {
            fs.unlinkSync(abs);
          }
        } catch {}
      }
      throw new Error(`Failed to commit change to disk; rolled back touches: ${err.message}`);
    }

    // 6a. Snapshot durable incoming relations for anchor migration before re-indexing deletes old symbol
    const durableRelationsSnapshot: Array<{ sourceId: string; predicate: string }> = [];
    let oldAnchorId: string | undefined;
    const isAnchorMigratingAction = request.action === 'rename_symbol' ||
      (request.action === 'refactor' && (request.refactorKind.toLowerCase().includes('move') || request.refactorKind.toLowerCase().includes('extract')));

    if (preview.resolvedTarget?.graphEntityId && isAnchorMigratingAction) {
      oldAnchorId = preview.resolvedTarget.graphEntityId;
      const durablePredicates = ['modifies', 'targets', 'governs'];
      for (const pred of durablePredicates) {
        const incoming = await this.store.getIncoming(oldAnchorId, pred);
        for (const edge of incoming) {
          durableRelationsSnapshot.push({ sourceId: edge.sourceId, predicate: pred });
        }
      }
    }

    // 6b. Re-index touched files
    const reindexedFiles: string[] = [];
    const filesToReindex = new Set<string>([...preview.affectedFiles, ...combinedFileEdits.keys()]);
    for (const f of filesToReindex) {
      const abs = path.resolve(this.projectRoot, f);
      if (fs.existsSync(abs)) {
        await indexSingleFile(this.store, abs, f, this.projectRoot);
        reindexedFiles.push(f);
      }
    }
    for (const r of executedRenames) {
      const toAbs = path.resolve(this.projectRoot, r.to);
      if (fs.existsSync(toAbs)) {
        await indexSingleFile(this.store, toAbs, r.to, this.projectRoot);
        reindexedFiles.push(r.to);
      }
    }

    // 7. Migrate durable semantic graph anchors (Ticket modifies, Decision governs, etc.)
    const migratedAnchors: Array<{ oldId: string; newId: string }> = [];
    if (preview.resolvedTarget?.graphEntityId && oldAnchorId && durableRelationsSnapshot.length > 0) {
      const targetSymbolName = request.action === 'rename_symbol' ? request.newName : preview.resolvedTarget.symbolName;

      // Locate newly reconciled symbol node across touched files
      let newAnchor: SymbolNode | null = null;
      for (const f of filesToReindex) {
        const syms = await this.store.listEntities<SymbolNode>(SymbolNode.dcr, {
          filePath: f,
          title: targetSymbolName
        });
        if (syms.length === 1) {
          newAnchor = syms[0];
          break;
        }
      }

      if (newAnchor && oldAnchorId) {
        const newAnchorId = newAnchor.id;
        for (const snap of durableRelationsSnapshot) {
          try {
            const source = await this.store.getEntity(snap.sourceId);
            if (source) {
              await this.store.relate(source, snap.predicate, newAnchor);
            }
          } catch {}
        }
        migratedAnchors.push({ oldId: oldAnchorId, newId: newAnchorId });
      }
    }

    // 8. Verification checks
    const verificationErrors: string[] = [];
    let diagnosticsOk = true;

    // Check expected definition in TS7 LSP
    if (preview.verification.graphChecks.expectedDefinition && preview.resolvedTarget) {
      try {
        const defs = await this.lspClient.getDefinition(preview.resolvedTarget.filePath, preview.resolvedTarget.position);
        if (defs.length === 0) {
          verificationErrors.push(`Post-change verification: definition for '${preview.verification.graphChecks.expectedDefinition}' could not be resolved.`);
          diagnosticsOk = false;
        }
      } catch (err: any) {
        verificationErrors.push(`Post-change LSP probe failed: ${err.message}`);
        diagnosticsOk = false;
      }
    }

    const passed = verificationErrors.length === 0;

    return {
      ok: true,
      fingerprint,
      filesTouched: Array.from(combinedFileEdits.keys()),
      filesRenamed: executedRenames,
      reindexedFiles,
      migratedAnchors,
      verification: {
        passed,
        diagnosticsOk,
        errors: verificationErrors
      }
    };
  }
}
