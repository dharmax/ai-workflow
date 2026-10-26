/** Prepare an inert Epic structure preview; only explicit reviewed apply_change commits it. */
import { WorkflowStore } from '../graph/store.ts';
import { Epic, Feature, UserStory } from '../graph/ontology.ts';
import type { EpicStructureProposal } from './decompose.ts';
import type { ProductMutation, ProductRevision } from './mutation.ts';
import { CausalChangeEngine } from '../change/engine.ts';
import type { ChangePreview } from '../change/types.ts';

export interface ApplyResult {
  applied: false;
  preview: ChangePreview;
  epicId: string;
  featureIds: string[];
  storyIds: string[];
}

export async function applyEpicStructure(store: WorkflowStore, proposal: EpicStructureProposal): Promise<ApplyResult> {
  const blocking = proposal.questions.filter(q => q.blocking);
  if (blocking.length) throw new Error(`Cannot apply proposal: blocking question(s) must be resolved first: ${blocking.map(q => `[${q.id}] ${q.text}`).join('; ')}`);

  const mutations: ProductMutation[] = [];
  if (proposal.basis?.length) {
    // Validate generation-time sources before interpreting or refreshing the review.
    for (const source of proposal.basis) {
      const current = await store.getEntity(source.id, source.entityType);
      if (!current || current.version !== source.version) throw new Error(`Stale product source revision '${source.id}'.`);
    }
  }
  // Proposal reuse and existing references must already be in the graph.
  const epic = await store.getEntity(proposal.epic.id);
  if (proposal.epic.action === 'existing' && !(epic instanceof Epic)) throw new Error(`Referenced Epic '${proposal.epic.id}' does not exist in graph.`);
  if (proposal.epic.action !== 'existing' && epic && !(epic instanceof Epic)) throw new Error(`Candidate Epic ID '${proposal.epic.id}' collides with an existing '${epic.typeName()}' entity.`);
  const basis: ProductRevision[] = [...proposal.basis ?? []];
  if (epic) basis.push({id: store.localId(epic.id), entityType: epic.typeName(), version: epic.version});
  else mutations.push({ kind: 'product_create', entityType: 'Epic', id: proposal.epic.id,
    fields: { priority: proposal.epic.priority, title: proposal.epic.title, body: proposal.epic.body || '', status: proposal.epic.status || 'planned' } });
  for (const f of proposal.features) {
    const existing = await store.getEntity(f.id);
    if ((f.action === 'reuse' || existing) && !(existing instanceof Feature)) throw new Error(`Reused Feature '${f.id}' does not exist in graph as a Feature.`);
    if (existing) basis.push({id: store.localId(existing.id), entityType: existing.typeName(), version: existing.version});
    else mutations.push({ kind: 'product_create', entityType: 'Feature', id: f.id,
      fields: { priority: f.priority, title: f.title, body: f.body || '', acceptanceCriteria: f.acceptanceCriteria || [], status: 'proposed' } });
    mutations.push({ kind: 'product_link', sourceId: proposal.epic.id, predicate: 'targets', targetId: f.id });
  }
  for (const s of proposal.stories) {
    const existing = await store.getEntity(s.id);
    if ((s.action === 'reuse' || existing) && !(existing instanceof UserStory)) throw new Error(`UserStory '${s.id}' is unavailable as a UserStory.`);
    if (existing) basis.push({id: store.localId(existing.id), entityType: existing.typeName(), version: existing.version});
    // Decomposition is not developer acceptance of a Story or permission to rewrite a reused definition.
    if (!existing) mutations.push({ kind: 'product_create', entityType: 'UserStory', id: s.id,
      fields: { title: s.title, actor: s.actor || '', story: s.story || '', context: s.context || '',
        acceptanceCriteria: s.acceptanceCriteria || [], status: 'proposed' } });
    mutations.push({ kind: 'product_link', sourceId: proposal.epic.id, predicate: 'targets', targetId: s.id });
    if (s.featureId) mutations.push({ kind: 'product_link', sourceId: s.featureId, predicate: 'enables', targetId: s.id });
  }
  const engine = new CausalChangeEngine({store, projectRoot: store.root});
  const preview = await engine.previewChange({action: 'product_change', mutations, basis: [...new Map(basis.map(source => [source.entityType + ':' + source.id, source])).values()], originalRequest: proposal.originalRequest ?? proposal.epic.body ?? proposal.epic.title});
  if (preview.blocked) throw new Error(preview.blockReason);
  return { applied: false, preview, epicId: proposal.epic.id, featureIds: proposal.features.map(f => f.id), storyIds: proposal.stories.map(s => s.id) };
}
