/** Product preview, approved mutation and post-commit evidence; no LSP or source write access. */
import {computeHash} from '../kb/canonical.ts';
import type {WorkflowStore} from '../graph/store.ts';
import {Aspect} from '../model/ontology.ts';
import {getCoverage} from './coverage.ts';
import {getProductImpact, type ProductImpact} from './impact.ts';
import {validateProductMutations, assessCharterAlignment, applyProductMutations, ProductReviewRequired, ProductAlignmentRequired, productDependents} from './mutation.ts';
import {blockedChangePreview} from '../services/code-mutation/fingerprint.ts';
import type {ChangeRequest, ChangePreview, ChangeApplyResult} from '../change/types.ts';

type ProductChangeRequest = Extract<ChangeRequest, {action: 'product_change'}>;

export async function previewProductChange(store: WorkflowStore, request: ProductChangeRequest): Promise<ChangePreview> {
    try {
      const validated = await validateProductMutations(store, request.mutations, request.basis);
      const {snapshot} = validated;
      const alignmentWarnings = await assessCharterAlignment(store, request.mutations, validated, request);
      const deleted = request.mutations.filter(m => m.kind === 'product_delete');
      const dependents = (await Promise.all(deleted.map(m => productDependents(store, m.id)))).flat();
      const affected = new Set<string>();
      for (const mutation of request.mutations) {
        if ('id' in mutation) affected.add(mutation.id);
        else { affected.add(mutation.sourceId); affected.add(mutation.targetId); }
      }
      const productImpacts: ProductImpact[] = [];
      for (const id of affected) {
        const entity = await store.getEntity(id);
        if (entity && ['Epic', 'Feature', 'UserStory'].includes(entity.typeName())) {
          productImpacts.push(await getProductImpact(store, id));
        }
      }
      const fingerprint = computeHash({ request, snapshot });
      return {
        fingerprint, summary: `${request.mutations.length} Product Intent mutation(s): ${[...affected].sort().join(', ')}`,
        request, mutations: request.mutations, affectedFiles: [], originalHashes: {},
        affectedProducts: [...affected].sort(), productImpact: productImpacts[0], productImpacts,
        dependents, warnings: [...alignmentWarnings, ...(dependents.length ? [`Explicit deletion affects ${dependents.length} relation(s).`] : [])],
        blocked: false, verification: { diagnosticsExpected: false, typecheck: false, targetedTests: [], graphChecks: {} }
      };
    } catch (error) {
      const blocked = blockedChangePreview(request, error instanceof Error ? error.message : String(error), []);
      const deleted = request.mutations.filter(m => m.kind === 'product_delete');
      if (error instanceof ProductAlignmentRequired) {
        const {snapshot} = await validateProductMutations(store, request.mutations, request.basis);
        blocked.fingerprint = computeHash({request, snapshot});
        blocked.status = 'needs_input';
        blocked.warnings = error.warnings;
        blocked.required = error.required;
      }
      blocked.dependents = (await Promise.all(deleted.map(async m => {
        try { return await productDependents(store, m.id); } catch { return []; }
      }))).flat();
      return blocked;
    }
  }


export async function commitProductChange(store: WorkflowStore, request: ProductChangeRequest, fingerprint: string, preview: ChangePreview): Promise<ChangeApplyResult> {
      let committed: Awaited<ReturnType<typeof applyProductMutations>>;
      try { committed = await applyProductMutations(store, request.mutations, {request, fingerprint}); }
      catch (error) {
        if (!(error instanceof ProductReviewRequired)) throw error;
        if (error instanceof ProductAlignmentRequired) {
          preview.status = 'needs_input';
          preview.blocked = true;
          preview.blockReason = error.message;
          preview.warnings = error.warnings;
          preview.required = error.required;
        }
        return {ok: false, status: error instanceof ProductAlignmentRequired ? 'needs_input' : 'review_required', fingerprint, filesTouched: [], filesRenamed: [], reindexedFiles: [], migratedAnchors: [],
          verification: {passed: false, errors: []}, error: error.message, preview};
      }
      const errors: string[] = [];
      for (const mutation of request.mutations) {
        if (mutation.kind === 'product_delete') {
          if (await store.getEntity(mutation.id)) errors.push(`Deleted entity '${mutation.id}' remains.`);
        } else if ('id' in mutation) {
          if (!await store.getEntity(mutation.id)) errors.push(`Entity '${mutation.id}' is missing after apply.`);
          if (mutation.entityType === 'Aspect') {
            const aspect = await store.getEntity<Aspect>(mutation.id, Aspect.dcr);
            if (aspect) await aspect.view(store);
          } else if (['Epic', 'Feature', 'UserStory'].includes(mutation.entityType)) {
            try { await getCoverage(store, mutation.id); await getProductImpact(store, mutation.id); }
            catch (error) { errors.push(String(error)); }
          }
        } else {
          const key = JSON.stringify([mutation.sourceId, mutation.predicate, mutation.targetId]);
          const source = await store.getEntity(mutation.sourceId);
          const target = await store.getEntity(mutation.targetId);
          const outgoing = source ? await store.getOutgoing(source.id, mutation.predicate) : [];
          const linked = outgoing.some(edge => edge.targetId === target?.id);
          if (linked !== committed.edges.has(key)) errors.push(`Relation '${mutation.sourceId} ${mutation.predicate} ${mutation.targetId}' verification failed.`);
        }
      }
      return {
        ok: true, fingerprint, filesTouched: [], filesRenamed: [], reindexedFiles: [], migratedAnchors: [],
        verification: { passed: errors.length === 0, diagnosticsOk: errors.length === 0, errors }
      };
}

/** Recompute Product evidence before commit; trusted host review is enforced by the Product mutation owner. */
export async function applyProductChange(store: WorkflowStore, request: ProductChangeRequest, fingerprint: string): Promise<ChangeApplyResult> {
  store.assertCanWrite();
  const preview = await previewProductChange(store, request);
  if (preview.blocked) {
    return {
      ok: false, fingerprint, filesTouched: [], filesRenamed: [], reindexedFiles: [], migratedAnchors: [],
      verification: {passed: false, diagnosticsOk: false, errors: [preview.blockReason || 'Preview blocked']},
      error: preview.blockReason,
      ...(preview.status === 'needs_input' ? {status: 'needs_input' as const, preview} : {})
    };
  }
  if (preview.fingerprint !== fingerprint)
    throw Error(`Stale change preview: fingerprint mismatch (expected '${fingerprint}', recomputed '${preview.fingerprint}'). Workspace or causal graph modified since preview.`);
  return commitProductChange(store, request, fingerprint, preview);
}
