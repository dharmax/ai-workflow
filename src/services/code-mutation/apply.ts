/**
 * Responsibility: Commit an already authorized and fingerprint-validated source preview.
 * Scope: Lease-fenced disk effects, post-commit graph reconciliation and honest outcome reporting.
 */
import type {SourceChangeApplyResult as ChangeApplyResult, SourceChangePreview as ChangePreview} from './types.ts';
import type {SourceChangeRequest} from './preview.ts';
import {prepareSourceCommit, commitSourceFiles} from './source-commit.ts';
import {reconcileCommittedSource, type SourceReconciliationContext} from './source-reconciliation.ts';

export interface SourceApplyContext extends SourceReconciliationContext {
  ticketLease?: {ticketId: string; claim: import('../../model/ticket.ts').TicketClaim};
}

/** A filesystem commit is not an independent verification or Ticket acceptance. */
export async function applyValidatedSourceChange(
  ctx: SourceApplyContext, request: SourceChangeRequest, preview: ChangePreview
): Promise<ChangeApplyResult> {
  // Build the same aggregate edit plan and in-memory results before touching disk.
  const prepared = prepareSourceCommit(ctx.projectRoot, ctx.lspClient, preview);
  const {fileEdits: combinedFileEdits, fileDeletes: combinedDeletes} = prepared.editPlan;
  const {expectedAfter} = prepared;

  // Admission may await. The final source hash check remains inside the
  // synchronous Ticket-lease write boundary.
  if (ctx.governedAdmission) await ctx.store.governanceAssertion(ctx.governedAdmission);
  let executedRenames: Array<{from: string; to: string}> = [];
  const commit = () => {
    executedRenames = commitSourceFiles(ctx.projectRoot, prepared, preview.originalHashes);
  };
  if (ctx.ticketLease)
    await ctx.store.commitWithTicketLease(ctx.ticketLease.ticketId, ctx.ticketLease.claim, commit);
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
        store: ctx.store, projectRoot: ctx.projectRoot,
        lspClient: ctx.lspClient, governedAdmission: ctx.governedAdmission
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
    fingerprint: preview.fingerprint,
    filesTouched: [...combinedFileEdits.keys(), ...combinedDeletes],
    filesRenamed: executedRenames,
    reindexedFiles,
    migratedAnchors,
    effects,
    verification: {passed: verificationErrors.length === 0, errors: verificationErrors}
  };
}
