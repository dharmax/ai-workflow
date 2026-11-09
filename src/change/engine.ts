/**
 * Compatibility entry for legacy Causal Change consumers.
 * Source mutation belongs to CodeMutationService; Product mutation belongs to Product.
 * Remove this adapter only after every caller is migrated and the final gate passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {withAstSnapshot} from '../graph/indexer.ts';
import {previewProductChange, commitProductChange} from '../product/change-operations.ts';
import {computeFileSha256} from './fingerprint.ts';
import {CodeMutationService, type CodeMutationServiceOptions} from '../services/code-mutation-service.ts';
import type {ChangeRequest, ChangePreview, ChangeApplyResult} from './types.ts';

export type ChangeEngineOptions = CodeMutationServiceOptions;
export {computeChangeFingerprint, computeFileSha256} from './fingerprint.ts';
export {applyTextEdits, normalizeWorkspaceEdit} from '../services/code-mutation/edits.ts';

export class CausalChangeEngine extends CodeMutationService {
  override async previewChange(request: ChangeRequest): Promise<ChangePreview> {
    if (request.action !== 'product_change') return super.previewChange(request);
    const preview = await withAstSnapshot(() => previewProductChange(this.store, request));
    if (!preview.blocked)
      this.lastPreview = {fingerprint: preview.fingerprint, originalHashes: {...preview.originalHashes}};
    return preview;
  }

  override async applyChange(request: ChangeRequest, fingerprint: string): Promise<ChangeApplyResult> {
    if (request.action !== 'product_change') return super.applyChange(request, fingerprint);
    this.store.assertCanWrite();
    if (this.lastPreview?.fingerprint === fingerprint) {
      for (const [file, expected] of Object.entries(this.lastPreview.originalHashes)) {
        const absolute = path.resolve(this.projectRoot, file);
        const actual = fs.existsSync(absolute) ? computeFileSha256(fs.readFileSync(absolute, 'utf8')) : 'missing';
        if (actual !== expected)
          throw new Error(`File '${file}' has been modified since preview. Aborting apply.`);
      }
    }
    const preview = await this.previewChange(request);
    if (preview.blocked) return {
      ok: false, fingerprint, filesTouched: [], filesRenamed: [], reindexedFiles: [], migratedAnchors: [],
      verification: {passed: false, diagnosticsOk: false, errors: [preview.blockReason || 'Preview blocked']},
      error: preview.blockReason,
      ...(preview.status === 'needs_input' ? {status: 'needs_input' as const, preview} : {})
    };
    if (preview.fingerprint !== fingerprint)
      throw new Error(`Stale change preview: fingerprint mismatch (expected '${fingerprint}', recomputed '${preview.fingerprint}'). Workspace or causal graph modified since preview.`);
    return commitProductChange(this.store, request, fingerprint, preview);
  }
}
