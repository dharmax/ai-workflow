/**
 * Responsibility: Govern one source-change operation independently of its transport.
 * Scope: Ticket authorization, reviewed dirty targets, lease admission and attributable effect recording.
 */
import {hashFiles} from '../graph/test-artifacts.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {requireStoryTests} from '../product/story-tests.ts';
import {assertChangeScope, normalizeDirtyTargets, sourceChangeFingerprint, sourceChangeScope} from '../ticket/source-scope.ts';
import {CodeMutationService, type SourceChangeRequest} from '../services/code-mutation-service.ts';

export interface SourceManagerOptions {
  store: WorkflowStore;
  projectRoot: string;
  codeMutationAllowed?: boolean;
}

export interface SourceOperationOptions {
  ticketId?: string;
  agentId?: string;
  allowDirtyTargets?: string[];
}

type SourceScope = Awaited<ReturnType<typeof sourceChangeScope>>['scope'];

function ownedFiles(root: string, scope: SourceScope): Set<string> {
  const latest = new Map<string, string | null>();
  for (const effect of scope.effects)
    for (const [file, hash] of Object.entries(effect.after)) latest.set(file, hash);
  return new Set([...latest]
    .filter(([file, hash]) => hashFiles(root, [file])[file] === hash)
    .map(([file]) => file));
}

export class SourceManager {
  constructor(private readonly options: SourceManagerOptions) {}

  async previewSourceChange(request: SourceChangeRequest, options: SourceOperationOptions = {}) {
    const {store, projectRoot} = this.options;
    const preview = await new CodeMutationService({store, projectRoot}).previewCodeChange(request);
    const {ticketId, agentId, allowDirtyTargets} = options;
    if (allowDirtyTargets?.length && (!ticketId || !agentId))
      throw Error('Dirty targets require a governed source Ticket and active lease.');
    if (!ticketId || !agentId || preview.blocked) return preview;

    const {ticket, scope} = await sourceChangeScope(store, ticketId, agentId);
    const owned = ownedFiles(projectRoot, scope);
    const dirtyTargets = normalizeDirtyTargets(projectRoot, preview, allowDirtyTargets)
      .filter(file => !owned.has(file));
    await assertChangeScope(store, ticket, scope, preview, request, owned, dirtyTargets);
    return {
      ...preview, allowDirtyTargets: dirtyTargets,
      dirtyTargetApprovalRequired: dirtyTargets.length > 0,
      fingerprint: sourceChangeFingerprint(preview, scope, dirtyTargets, ticket.claim)
    };
  }

  async applySourceChange(request: SourceChangeRequest, fingerprint: string, options: SourceOperationOptions = {}) {
    const {store, projectRoot, codeMutationAllowed} = this.options;
    store.assertCanWrite();
    if (codeMutationAllowed === false) throw Error('Code mutation is forbidden by the host.');
    const {ticketId, agentId, allowDirtyTargets} = options;
    if (!ticketId || !agentId) throw Error('Source application requires ticketId and the active lease agentId.');

    const admission = await store.admitGovernance('governed');
    try {
      const {ticket, scope} = await sourceChangeScope(store, ticketId, agentId);
      const service = new CodeMutationService({
        store, projectRoot, governedAdmission: admission,
        ticketLease: {ticketId, claim: ticket.claim!}
      });
      const preview = await service.previewCodeChange(request);
      if (preview.blocked) throw Error(preview.blockReason ?? 'Source preview blocked.');
      const owned = ownedFiles(projectRoot, scope);
      const dirtyTargets = normalizeDirtyTargets(projectRoot, preview, allowDirtyTargets)
        .filter(file => !owned.has(file));
      const expected = sourceChangeFingerprint(preview, scope, dirtyTargets, ticket.claim);
      if (expected !== fingerprint)
        throw Error('Stale change preview: source, Ticket scope or governance fingerprint changed.');
      if (dirtyTargets.length && !store.canReviewProduct(fingerprint))
        throw Error('Dirty targets require trusted host approval of this exact source preview.');
      await assertChangeScope(store, ticket, scope, preview, request, owned, dirtyTargets);
      await requireStoryTests(store, ticket);
      await store.saveGovernedScope(ticketId, ticket.claim!, admission, scope);

      const result = await service.applyCodeChange(request, preview.fingerprint);
      if (result.ok && result.effects)
        await store.saveGovernedScope(ticketId, ticket.claim!, admission, {
          ...scope, revision: scope.revision + 1,
          effects: [...scope.effects, {fingerprint, ...result.effects, renames: result.filesRenamed}]
        });
      return {...result, fingerprint};
    } finally {
      await store.releaseGovernance(admission);
    }
  }
}
