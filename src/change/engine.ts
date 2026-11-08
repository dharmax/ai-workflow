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
import type { WorkflowStore } from '../graph/store.ts';
import { getTsLspClient, TsLspClient } from './ts-lsp.ts';
import { getTs6RefactorClient, Ts6RefactorClient } from './ts6-refactor.ts';
import { getProductImpact, type ProductImpact } from '../product/impact.ts';
import {previewProductChange, commitProductChange} from '../product/change-operations.ts';
import {computeChangeFingerprint, computeFileSha256, blockedChangePreview} from './fingerprint.ts';
export {computeChangeFingerprint, computeFileSha256} from './fingerprint.ts';
import { ensureAstFresh, indexSingleFile, withAstSnapshot } from '../graph/indexer.ts';
import { workspacePath } from './workspace-path.ts';
import {normalizeWorkspaceEdits, type WorkspaceEditPlan} from '../services/code-mutation/edits.ts';
import {prepareSourceCommit, commitSourceFiles} from '../services/code-mutation/source-commit.ts';
import {prepareSourceOperation} from '../services/code-mutation/preview-operations.ts';
export {applyTextEdits, normalizeWorkspaceEdit} from '../services/code-mutation/edits.ts';
import { SymbolNode, FileNode, Ticket, Decision } from '../model/ontology.ts';
import type {
  ChangeRequest,
  ChangePreview,
  ChangeApplyResult,
  ChangeMutation,
  ResolvedCodeTarget,
  VerificationPlan
} from './types.ts';

export interface ChangeEngineOptions {
  codeMutationAllowed?: boolean;
  ticketLease?: {ticketId: string; claim: import('../model/ticket.ts').TicketClaim};
  governedAdmission?: string;
  store: WorkflowStore;
  projectRoot: string;
  lspClient?: TsLspClient;
  ts6Client?: Ts6RefactorClient;
}

export class CausalChangeEngine {
  public readonly store: WorkflowStore;
  private readonly governedAdmission?: string;
  private readonly codeMutationAllowed?: boolean;
  private readonly ticketLease: ChangeEngineOptions['ticketLease'];
  private lastPreview?: Pick<ChangePreview, 'fingerprint' | 'originalHashes'>;
  public readonly projectRoot: string;
  public readonly lspClient: TsLspClient;
  public readonly ts6Client: Ts6RefactorClient;

  constructor(options: ChangeEngineOptions) {
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
  async previewChange(request: ChangeRequest): Promise<ChangePreview> {
    const preview = await withAstSnapshot(() => this.buildPreview(request));
    // Retain only rejection evidence; acceptance always recomputes the full fingerprint.
    if (!preview.blocked) this.lastPreview = { fingerprint: preview.fingerprint, originalHashes: {...preview.originalHashes} };
    return preview;
  }

  private async buildPreview(request: ChangeRequest): Promise<ChangePreview> {
    if (request.action === 'product_change') return previewProductChange(this.store, request);
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
  async applyChange(request: ChangeRequest, fingerprint: string): Promise<ChangeApplyResult> {
    this.store.assertCanWrite();
    if (request.action !== 'product_change' && this.codeMutationAllowed === false) throw Error('Code mutation is forbidden by the host.');
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

    if (request.action === 'product_change') return commitProductChange(this.store, request, fingerprint, preview);

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

    try {
      // Preserve durable source-anchor identities and provenance before re-indexing.
      const anchorSources: Array<{oldId: string; symbol?: SymbolNode; relations: Array<{sourceId: string; predicate: string}>}> = [];
      const renameFile = request.action === 'rename_file';
      const migrating = renameFile || request.action === 'rename_symbol' ||
        (request.action === 'refactor' && /move|extract/i.test(request.refactorKind));
      const anchors: Array<FileNode | SymbolNode> = [];
      if (renameFile) {
        const file = await this.store.getEntity<FileNode>(workspacePath(this.projectRoot, request.oldPath), FileNode.dcr);
        if (file) anchors.push(file);
        anchors.push(...(await this.store.listEntities<SymbolNode>(SymbolNode.dcr, {filePath: workspacePath(this.projectRoot, request.oldPath)}))
          .filter(symbol => symbol.status !== 'deprecated'));
      } else if (migrating && preview.resolvedTarget?.graphEntityId) {
        const symbol = await this.store.getEntity<SymbolNode>(preview.resolvedTarget.graphEntityId, SymbolNode.dcr);
        if (symbol) anchors.push(symbol);
      }
      for (const anchor of anchors) {
        const relations: Array<{sourceId: string; predicate: string}> = [];
        for (const predicate of ['modifies', 'targets', 'governs'])
          for (const edge of await this.store.getIncoming(anchor.id, predicate)) relations.push({sourceId: edge.sourceId, predicate});
        if (relations.length) anchorSources.push({oldId: anchor.id, symbol: anchor instanceof SymbolNode ? anchor : undefined, relations});
      }

      // 6b. Re-index touched files
      const reindexedFiles: string[] = [];
      const filesToReindex = new Set<string>([...preview.affectedFiles, ...combinedFileEdits.keys()]);
      const reindex = async () => {
      for (const f of filesToReindex) {
        const abs = path.resolve(this.projectRoot, f);
        if (fs.existsSync(abs)) {
          await indexSingleFile(this.store, abs, f, this.projectRoot);
          reindexedFiles.push(f);
        }
      }
      };
      if (this.governedAdmission) await this.store.withGovernedIndexing(this.governedAdmission, preview.affectedFiles, reindex);
      else await reindex();

      // Migrate only existing durable authority; failures cannot silently lose source obligations.
      const migratedAnchors: Array<{oldId: string; newId: string}> = [];
      for (const anchor of anchorSources) {
        let target: FileNode | SymbolNode | null = null;
        if (renameFile && !anchor.symbol) target = await this.store.getEntity<FileNode>(workspacePath(this.projectRoot, request.newPath), FileNode.dcr);
        else {
          const title = request.action === 'rename_symbol' ? request.newName : anchor.symbol!.title;
          const candidates = (await this.store.listEntities<SymbolNode>(SymbolNode.dcr, {title}))
            .filter(symbol => symbol.status !== 'deprecated' && symbol.containerName === anchor.symbol!.containerName &&
              filesToReindex.has(symbol.filePath!) && (!renameFile || symbol.filePath === workspacePath(this.projectRoot, request.newPath)));
          if (candidates.length === 1) target = candidates[0];
        }
        if (!target) throw Error(`Durable anchor '${anchor.oldId}' lacks an unambiguous post-change target.`);
        for (const relation of anchor.relations)
          await this.store.migrateCodeAnchor(relation.sourceId, relation.predicate, anchor.oldId, target, this.governedAdmission);
        migratedAnchors.push({oldId: anchor.oldId, newId: target.id});
      }
      const refresh = () => ensureAstFresh(this.store, this.projectRoot);
      if (this.governedAdmission) await this.store.withGovernedIndexing(this.governedAdmission, preview.affectedFiles, refresh);
      else await refresh();

      // 8. Verification checks
      const verificationErrors: string[] = [];

      // Check expected definition in TS7 LSP
      if (preview.verification.graphChecks.expectedDefinition && preview.resolvedTarget) {
        try {
          const defs = await this.lspClient.getDefinition(preview.resolvedTarget.filePath, preview.resolvedTarget.position);
          if (defs.length === 0) {
            verificationErrors.push(`Post-change verification: definition for '${preview.verification.graphChecks.expectedDefinition}' could not be resolved.`);
          }
        } catch (err: any) {
          verificationErrors.push(`Post-change LSP probe failed: ${err.message}`);
        }
      }

      for (const [file, expected] of Object.entries(expectedAfter)) {
        const absolute = path.resolve(this.projectRoot, file);
        const actual = fs.existsSync(absolute) ? computeFileSha256(fs.readFileSync(absolute, 'utf8')) : 'missing';
        if (actual !== expected) verificationErrors.push(`Observed effect for '${file}' differs from the guarded preview.`);
      }
      const passed = verificationErrors.length === 0;

      return {
        ok: true,
        ...(!passed ? {error: 'PARTIALLY APPLIED: filesystem changes committed; post-write verification failed. ' + verificationErrors.join('; ')} : {}),
        fingerprint,
        filesTouched: [...combinedFileEdits.keys(), ...combinedDeletes],
        filesRenamed: executedRenames,
        reindexedFiles,
        migratedAnchors,
        effects: {before: preview.originalHashes, after: expectedAfter,
          edits: [...combinedFileEdits].map(([filePath, edits]) => ({filePath, edits}))},
        verification: {
          passed,
          errors: verificationErrors
        }
      };
    } catch (cause) {
      const messages: string[] = [];
      for (let error: unknown = cause; error; error = error instanceof Error ? error.cause : undefined)
        messages.push(error instanceof Error ? error.message : String(error));
      throw new Error(`PARTIALLY APPLIED: filesystem changes committed; post-write indexing, anchor migration or verification failed. Do not reapply the operation. ${messages.join(' Caused by: ')}`, {cause});
    }
  }
}
