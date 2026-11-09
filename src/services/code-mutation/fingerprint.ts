/** Deterministic public change fingerprints shared by legacy source and Product preview contracts. */
import crypto from 'node:crypto';
import type {ProductImpact} from '../../product/impact.ts';
import type {TsLspClient} from '../typescript/ts-lsp.ts';
import {normalizeWorkspaceEdits, type WorkspaceEditPlan} from './edits.ts';
import type {ChangeRequest, ChangeMutation, LspTextEdit, ResolvedCodeTarget, ChangePreview} from '../../change/types.ts';

export function computeFileSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
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
  projectRoot?: string,
  editPlan?: WorkspaceEditPlan
): string {
  // Sort original hashes by file path
  const sortedHashes: Record<string, string> = {};
  for (const k of Object.keys(originalHashes).sort()) {
    sortedHashes[k] = originalHashes[k];
  }

  // Canonicalize mutations: extract and sort all text edits and renames by file path
  const canonicalFileEdits: Array<{ file: string; edits: LspTextEdit[] }> = [];
  const canonicalRenames: Array<{ from: string; to: string }> = [];
  const canonicalDeletes: string[] = [];

  const groups = editPlan?.individual ?? (lspClient && projectRoot
    ? normalizeWorkspaceEdits(mutations.filter(m => m.kind === 'workspace_edit').map(m => m.edit), lspClient, projectRoot).individual
    : []);
  for (const norm of groups) {
    for (const [file, edits] of norm.fileEdits.entries()) {
      const sortedEdits = [...edits].sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) return a.range.start.line - b.range.start.line;
        if (a.range.start.character !== b.range.start.character) return a.range.start.character - b.range.start.character;
        return a.newText.localeCompare(b.newText);
      });
      canonicalFileEdits.push({ file, edits: sortedEdits });
    }
    canonicalDeletes.push(...norm.fileDeletes);
    canonicalRenames.push(...norm.fileRenames);
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
    canonicalDeletes: canonicalDeletes.sort(),
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

/** Construct the exact legacy blocked-preview shape, without requiring an LSP client. */
export function blockedChangePreview(request: ChangeRequest, reason: string, warnings: string[], productImpact?: ProductImpact, requiredArguments?: string[]): ChangePreview {
  return {
    fingerprint: computeChangeFingerprint(request, undefined, [], {}, productImpact),
    summary: `Blocked: ${reason}`, request, mutations: [], affectedFiles: [], originalHashes: {},
    productImpact, verification: {diagnosticsExpected: false, typecheck: false, targetedTests: [], graphChecks: {}},
    warnings, blocked: true, blockReason: reason, requiredArguments
  };
}
