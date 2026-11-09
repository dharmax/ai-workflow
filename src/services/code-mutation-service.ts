/**
 * Responsibility: Source-only Code Mutation Service; real preview and guarded apply owner.
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
import type { WorkflowStore } from '../graph/store.ts';
import { getTsLspClient, TsLspClient } from '../change/ts-lsp.ts';
import { getTs6RefactorClient, Ts6RefactorClient } from '../change/ts6-refactor.ts';
import { getProductImpact, type ProductImpact } from '../product/impact.ts';
import {computeChangeFingerprint, computeFileSha256, blockedChangePreview} from '../change/fingerprint.ts';
import { ensureAstFresh, withAstSnapshot } from '../graph/indexer.ts';
import { workspacePath } from '../change/workspace-path.ts';
import {normalizeWorkspaceEdits, type WorkspaceEditPlan} from './code-mutation/edits.ts';
import {prepareSourceCommit, commitSourceFiles} from './code-mutation/source-commit.ts';
import {reconcileCommittedSource} from './code-mutation/source-reconciliation.ts';
import {prepareSourceOperation} from './code-mutation/preview-operations.ts';

import type {
  ChangeRequest,
  ChangePreview,
  ChangeApplyResult,
  ChangeMutation,
  ResolvedCodeTarget,
  VerificationPlan
} from '../change/types.ts';

export type SourceChangeRequest = Exclude<ChangeRequest, {action: 'product_change'}>;

export interface CodeMutationServiceOptions {
  codeMutationAllowed?: boolean;
  ticketLease?: {ticketId: string; claim: import('../model/ticket.ts').TicketClaim};
  governedAdmission?: string;
  store: WorkflowStore;
  projectRoot: string;
  lspClient?: TsLspClient;
  ts6Client?: Ts6RefactorClient;
}

export class CodeMutationService {
  public readonly store: WorkflowStore;
  private readonly governedAdmission?: string;
  private readonly codeMutationAllowed?: boolean;
  private readonly ticketLease: CodeMutationServiceOptions['ticketLease'];
  protected lastPreview?: Pick<ChangePreview, 'fingerprint' | 'originalHashes'>;
  public readonly projectRoot: string;
  public readonly lspClient: TsLspClient;
  public readonly ts6Client: Ts6RefactorClient;

  constructor(options: CodeMutationServiceOptions) {
    this.store = options.store;
    this.codeMutationAllowed = options.codeMutationAllowed;
    this.governedAdmission = options.governedAdmission;
    this.ticketLease = options.ticketLease;
    this.projectRoot = path.resolve(options.projectRoot);
    this.lspClient = options.lspClient || getTsLspClient(this.projectRoot);
    this.ts6Client = options.ts6Client || getTs6RefactorClient(this.projectRoot);
  }

  /**
   * Previews a change request without mutating disk.
   */
  async previewChange(request: SourceChangeRequest): Promise<ChangePreview> {
    if ((request as ChangeRequest).action === 'product_change')
      throw Error('Product changes require the Product change owner.');
    const preview = await withAstSnapshot(() => this.buildPreview(request));
    // Retain only rejection evidence; acceptance always recomputes the full fingerprint.
    if (!preview.blocked) this.lastPreview = { fingerprint: preview.fingerprint, originalHashes: {...preview.originalHashes} };
    return preview;
  }

  private async buildPreview(request: SourceChangeRequest): Promise<ChangePreview> {
    if (process.env.DEBUG_LSP) console.error('[LSP boundary] ensureAstFresh start');
    await ensureAstFresh(this.store, this.projectRoot);
    if (process.env.DEBUG_LSP) console.error('[LSP boundary] ensureAstFresh end');

    let productImpact: ProductImpact | undefined;
    if ('productContextEntityId' in request && request.productContextEntityId) {
      try {
        productImpact = await getProductImpact(this.store, request.productContextEntityId);
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
        const file = workspacePath(this.projectRoot, change.filePath);
        if (seen.has(file))
          return this.createBlockedPreview(request, `Multiple operations target '${file}'; combine its replacement first.`, warnings, productImpact);
        seen.add(file);
        const child = await this.buildPreview(change);
        if (child.blocked) return this.createBlockedPreview(request, child.blockReason ?? child.summary, warnings, productImpact);
        mutations.push(...child.mutations);
        warnings.push(...child.warnings);
      }
      summary = `Coherent source change across ${seen.size} files.`;
    } else {
      const prepared = await prepareSourceOperation({
        store: this.store,
        projectRoot: this.projectRoot,
        lspClient: this.lspClient,
        ts6Client: this.ts6Client
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
        this.lspClient, this.projectRoot
      );
    } catch (error) {
      return this.createBlockedPreview(request, String(error), warnings, productImpact);
    }
    const affectedFiles = editPlan.affectedFiles;

    // Read and record original hashes
    for (const f of affectedFiles) {
      const abs = path.resolve(this.projectRoot, f);
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
      this.lspClient,
      this.projectRoot,
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

  private createBlockedPreview(
    request: ChangeRequest,
    reason: string,
    warnings: string[],
    productImpact?: ProductImpact,
    requiredArguments?: string[]
  ): ChangePreview {
    return blockedChangePreview(request, reason, warnings, productImpact, requiredArguments);
  }

  /**
   * Safely applies the previewed change.
   */
  async applyChange(request: SourceChangeRequest, fingerprint: string): Promise<ChangeApplyResult> {
    if ((request as ChangeRequest).action === 'product_change')
      throw Error('Product changes require the Product change owner.');
    this.store.assertCanWrite();
    if (this.codeMutationAllowed === false) throw Error('Code mutation is forbidden by the host.');
    // Reject known stale sources before AST/LSP work. A different engine/process still
    // recomputes the complete preview below; these retained hashes never authorize edits.
    if (this.lastPreview?.fingerprint === fingerprint) {
      for (const [file, expected] of Object.entries(this.lastPreview.originalHashes)) {
        const absolute = path.resolve(this.projectRoot, file);
        const actual = fs.existsSync(absolute) ? computeFileSha256(fs.readFileSync(absolute, 'utf8')) : 'missing';
        if (actual !== expected) throw new Error(`File '${file}' has been modified since preview. Aborting apply.`);
      }
    }
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
        error: preview.blockReason,
        ...(preview.status === 'needs_input' ? {status: 'needs_input' as const, preview} : {})
      };
    }

    if (preview.fingerprint !== fingerprint) {
      throw new Error(`Stale change preview: fingerprint mismatch (expected '${fingerprint}', recomputed '${preview.fingerprint}'). Workspace or causal graph modified since preview.`);
    }

    // Build the same aggregate edit plan and in-memory results before touching disk.
    const prepared = prepareSourceCommit(this.projectRoot, this.lspClient, preview);
    const {fileEdits: combinedFileEdits, fileDeletes: combinedDeletes} = prepared.editPlan;
    const {expectedAfter} = prepared;

    // Admission may await. The final source hash check remains inside the
    // synchronous Ticket-lease write boundary.
    if (this.governedAdmission) await this.store.governanceAssertion(this.governedAdmission);
    let executedRenames: Array<{from: string; to: string}> = [];
    const commit = () => {
      executedRenames = commitSourceFiles(this.projectRoot, prepared, preview.originalHashes);
    };
    if (this.ticketLease)
      await this.store.commitWithTicketLease(this.ticketLease.ticketId, this.ticketLease.claim, commit);
    else commit();

    // Files are committed at this point. Any subsequent failure must preserve
    // the attributable effects and distinguish incomplete reconciliation.
    const effects = {
      before: preview.originalHashes, after: expectedAfter,
      edits: [...combinedFileEdits].map(([filePath, edits]) => ({filePath, edits}))
    };
    let reindexedFiles: string[] = [];
    let migratedAnchors: Array<{oldId: string; newId: string}> = [];
    let verificationErrors: string[] = [];
    let status: ChangeApplyResult['status'];
    let error: string | undefined;
    try {
      const result = await reconcileCommittedSource(
        {
          store: this.store, projectRoot: this.projectRoot,
          lspClient: this.lspClient, governedAdmission: this.governedAdmission
        },
        request, preview, combinedFileEdits, expectedAfter
      );
      reindexedFiles = result.reindexedFiles;
      migratedAnchors = result.migratedAnchors;
      verificationErrors = result.verificationErrors;
      if (verificationErrors.length) {
        status = 'committed_verification_failed';
        error = 'PARTIALLY APPLIED: filesystem changes committed; post-write verification failed. ' + verificationErrors.join('; ');
      }
    } catch (cause) {
      const messages: string[] = [];
      for (let current: unknown = cause; current; current = current instanceof Error ? current.cause : undefined)
        messages.push(current instanceof Error ? current.message : String(current));
      status = 'committed_unreconciled';
      verificationErrors = [messages.join(' Caused by: ')];
      error = 'PARTIALLY APPLIED: filesystem changes committed; post-write indexing, anchor migration or verification failed. Do not reapply the operation. ' + verificationErrors[0];
    }

    return {
      ok: true, // disk commit succeeded; never means independent acceptance passed
      ...(status ? {status, error} : {}),
      fingerprint,
      filesTouched: [...combinedFileEdits.keys(), ...combinedDeletes],
      filesRenamed: executedRenames,
      reindexedFiles,
      migratedAnchors,
      effects,
      verification: {passed: verificationErrors.length === 0, errors: verificationErrors}
    };
  }
}
