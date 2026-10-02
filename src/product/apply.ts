/** Apply an accepted Epic structure through the shared Product Intent mutation rules. */
import { WorkflowStore } from '../graph/store.ts';
import { Epic, Feature, UserStory } from '../graph/ontology.ts';
import type { EpicStructureProposal } from './decompose.ts';
import { applyProductMutations, type ProductMutation } from './mutation.ts';

export interface ApplyResult {
  applied: boolean;
  epicId: string;
  featureIds: string[];
  storyIds: string[];
}

export async function applyEpicStructure(store: WorkflowStore, proposal: EpicStructureProposal): Promise<ApplyResult> {
  const blocking = proposal.questions.filter(q => q.blocking);
  if (blocking.length) throw new Error(`Cannot apply proposal: blocking question(s) must be resolved first: ${blocking.map(q => `[${q.id}] ${q.text}`).join('; ')}`);

  const mutations: ProductMutation[] = [];
  // Proposal reuse and existing references must already be in the graph.
  const epic = await store.getEntity(proposal.epic.id);
  if (proposal.epic.action === 'existing' && !(epic instanceof Epic)) throw new Error(`Referenced Epic '${proposal.epic.id}' does not exist in graph.`);
  if (proposal.epic.action !== 'existing' && epic && !(epic instanceof Epic)) throw new Error(`Candidate Epic ID '${proposal.epic.id}' collides with an existing '${epic.typeName()}' entity.`);
  mutations.push({ kind: epic ? 'product_update' : 'product_create', entityType: 'Epic', id: proposal.epic.id,
    fields: { title: proposal.epic.title, body: proposal.epic.body || '', status: proposal.epic.status || 'planned' } });
  for (const f of proposal.features) {
    const existing = await store.getEntity(f.id);
    if (f.action === 'reuse' && !(existing instanceof Feature)) throw new Error(`Reused Feature '${f.id}' does not exist in graph as a Feature.`);
    mutations.push({ kind: existing ? 'product_update' : 'product_create', entityType: 'Feature', id: f.id,
      fields: { title: f.title, body: f.body || '', acceptanceCriteria: f.acceptanceCriteria || [], status: 'accepted' } });
    mutations.push({ kind: 'product_link', sourceId: proposal.epic.id, predicate: 'targets', targetId: f.id });
  }
  for (const s of proposal.stories) {
    const existing = await store.getEntity(s.id);
    if (s.action === 'reuse' && !(existing instanceof UserStory)) throw new Error(`Reused UserStory '${s.id}' does not exist in graph as a UserStory.`);
    mutations.push({ kind: existing ? 'product_update' : 'product_create', entityType: 'UserStory', id: s.id,
      fields: { title: s.title, actor: s.actor || '', story: s.story || '', context: s.context || '',
        acceptanceCriteria: s.acceptanceCriteria || [], status: 'accepted' } });
    mutations.push({ kind: 'product_link', sourceId: proposal.epic.id, predicate: 'targets', targetId: s.id });
    mutations.push({ kind: 'product_link', sourceId: s.featureId, predicate: 'contains', targetId: s.id });
  }
  await applyProductMutations(store, mutations);
  return { applied: true, epicId: proposal.epic.id, featureIds: proposal.features.map(f => f.id), storyIds: proposal.stories.map(s => s.id) };
}
