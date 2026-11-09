/**
 * Responsibility: Public source-only Code Mutation Service facade.
 * Scope: Preview/apply API, LSP client lifecycle and same-instance stale-preview guard.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {WorkflowStore} from '../graph/store.ts';
import {getTsLspClient, type TsLspClient} from '../change/ts-lsp.ts';
import {getTs6RefactorClient, type Ts6RefactorClient} from '../change/ts6-refactor.ts';
import {computeFileSha256} from '../change/fingerprint.ts';
import {withAstSnapshot} from '../graph/indexer.ts';
import type {ChangeRequest, ChangePreview, ChangeApplyResult} from '../change/types.ts';
import {buildSourcePreview, type SourceChangeRequest} from './code-mutation/preview.ts';
import {applyValidatedSourceChange} from './code-mutation/apply.ts';

export type {SourceChangeRequest} from './code-mutation/preview.ts';

export interface CodeMutationServiceOptions {
  store: WorkflowStore;
  projectRoot: string;
  codeMutationAllowed?: boolean;
  ticketLease?: {ticketId: string; claim: import('../model/ticket.ts').TicketClaim};
  governedAdmission?: string;
  lspClient?: TsLspClient;
  ts6Client?: Ts6RefactorClient;
}

export class CodeMutationService {
  public readonly store: WorkflowStore;
  public readonly projectRoot: string;
  public readonly lspClient: TsLspClient;
  public readonly ts6Client: Ts6RefactorClient;
  private readonly codeMutationAllowed?: boolean;
  private readonly ticketLease: CodeMutationServiceOptions['ticketLease'];
  private readonly governedAdmission?: string;
  protected lastPreview?: Pick<ChangePreview, 'fingerprint' | 'originalHashes'>;

  constructor(options: CodeMutationServiceOptions) {
    this.store = options.store;
    this.projectRoot = path.resolve(options.projectRoot);
    this.lspClient = options.lspClient || getTsLspClient(this.projectRoot);
    this.ts6Client = options.ts6Client || getTs6RefactorClient(this.projectRoot);
    this.codeMutationAllowed = options.codeMutationAllowed;
    this.ticketLease = options.ticketLease;
    this.governedAdmission = options.governedAdmission;
  }

  async previewCodeChange(request: SourceChangeRequest): Promise<ChangePreview> {
    if ((request as ChangeRequest).action === 'product_change')
      throw Error('Product changes require the Product change owner.');
    const preview = await withAstSnapshot(() => buildSourcePreview(this, request));
    if (!preview.blocked)
      this.lastPreview = {fingerprint: preview.fingerprint, originalHashes: {...preview.originalHashes}};
    return preview;
  }

  async applyCodeChange(request: SourceChangeRequest, fingerprint: string): Promise<ChangeApplyResult> {
    if ((request as ChangeRequest).action === 'product_change')
      throw Error('Product changes require the Product change owner.');
    this.store.assertCanWrite();
    if (this.codeMutationAllowed === false) throw Error('Code mutation is forbidden by the host.');
    // Fast rejection only: independently recompute the preview and its full fingerprint below.
    if (this.lastPreview?.fingerprint === fingerprint)
      for (const [file, expected] of Object.entries(this.lastPreview.originalHashes)) {
        const absolute = path.resolve(this.projectRoot, file);
        const actual = fs.existsSync(absolute) ? computeFileSha256(fs.readFileSync(absolute, 'utf8')) : 'missing';
        if (actual !== expected) throw Error(`File '${file}' has been modified since preview. Aborting apply.`);
      }
    const preview = await this.previewCodeChange(request);
    if (preview.blocked) return {
      ok: false, fingerprint, filesTouched: [], filesRenamed: [], reindexedFiles: [], migratedAnchors: [],
      verification: {passed: false, diagnosticsOk: false, errors: [preview.blockReason || 'Preview blocked']},
      error: preview.blockReason,
      ...(preview.status === 'needs_input' ? {status: 'needs_input' as const, preview} : {})
    };
    if (preview.fingerprint !== fingerprint)
      throw Error(`Stale change preview: fingerprint mismatch (expected '${fingerprint}', recomputed '${preview.fingerprint}'). Workspace or causal graph modified since preview.`);
    return applyValidatedSourceChange({
      store: this.store, projectRoot: this.projectRoot, lspClient: this.lspClient,
      governedAdmission: this.governedAdmission, ticketLease: this.ticketLease
    }, request, preview);
  }
}
