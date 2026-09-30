/**
 * Responsibility: Deterministic, idempotent apply of an EpicStructureProposal.
 * Scope: Prevalidates entity integrity and references, applies Epic/Features/Stories,
 *        and establishes causal target/contains edges without creating tickets.
 */

import { WorkflowStore } from '../graph/store.ts';
import { Epic, Feature, UserStory } from '../graph/ontology.ts';
import type { EpicStructureProposal } from './decompose.ts';

export interface ApplyResult {
  applied: boolean;
  epicId: string;
  featureIds: string[];
  storyIds: string[];
}

export async function applyEpicStructure(
  store: WorkflowStore,
  proposal: EpicStructureProposal
): Promise<ApplyResult> {
  // 1. Validate: blocking questions
  const blockingQuestions = proposal.questions.filter(q => q.blocking);
  if (blockingQuestions.length > 0) {
    const list = blockingQuestions.map(q => `[${q.id}] ${q.text}`).join('; ');
    throw new Error(`Cannot apply proposal: blocking question(s) must be resolved first: ${list}`);
  }

  // 2. Validate: Epic reference / candidate collision
  function getEntityKindName(entity: any): string {
    if (entity instanceof Epic) return 'Epic';
    if (entity instanceof Feature) return 'Feature';
    if (entity instanceof UserStory) return 'UserStory';
    return (entity as any).dcr?.name || entity?.constructor?.name || 'Unknown';
  }

  // 2. Validate: Epic reference / candidate collision
  const existingEpicRaw = await store.getEntity(proposal.epic.id);
  if (proposal.epic.action === 'existing') {
    if (!existingEpicRaw || !(existingEpicRaw instanceof Epic)) {
      throw new Error(`Referenced Epic '${proposal.epic.id}' does not exist in graph.`);
    }
  } else if (existingEpicRaw && !(existingEpicRaw instanceof Epic)) {
    throw new Error(`Candidate Epic ID '${proposal.epic.id}' collides with an existing '${getEntityKindName(existingEpicRaw)}' entity.`);
  }

  // 3. Validate: Features (reuse must exist, candidate must not collide)
  const proposalFeatureIds = new Set<string>();
  for (const f of proposal.features) {
    proposalFeatureIds.add(f.id);
    const existingRaw = await store.getEntity(f.id);
    if (f.action === 'reuse') {
      if (!existingRaw || !(existingRaw instanceof Feature)) {
        throw new Error(`Reused Feature '${f.id}' does not exist in graph as a Feature.`);
      }
    } else if (existingRaw && !(existingRaw instanceof Feature)) {
      throw new Error(`Candidate Feature ID '${f.id}' collides with an existing '${getEntityKindName(existingRaw)}' entity.`);
    }
  }

  // 4. Validate: Stories (reuse must exist, candidate must not collide, containing feature must exist)
  for (const s of proposal.stories) {
    const existingRaw = await store.getEntity(s.id);
    if (s.action === 'reuse') {
      if (!existingRaw || !(existingRaw instanceof UserStory)) {
        throw new Error(`Reused UserStory '${s.id}' does not exist in graph as a UserStory.`);
      }
    } else if (existingRaw && !(existingRaw instanceof UserStory)) {
      throw new Error(`Candidate UserStory ID '${s.id}' collides with an existing '${getEntityKindName(existingRaw)}' entity.`);
    }

    // Containing feature check
    if (!proposalFeatureIds.has(s.featureId)) {
      const featRaw = await store.getEntity(s.featureId, Feature.dcr);
      if (!featRaw) {
        throw new Error(`UserStory '${s.id}' references containing Feature '${s.featureId}', which does not exist in proposal or graph.`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Mutation Phase (Dependency order: Epic -> Features -> Stories -> Edges)
  // ---------------------------------------------------------------------------

  // 1. Epic
  const epic = await store.upsertEntity<Epic>(Epic.dcr, {
    id: proposal.epic.id,
    title: proposal.epic.title,
    body: proposal.epic.body || '',
    status: proposal.epic.status || 'planned'
  });

  // 2. Features
  const featureEntities: Feature[] = [];
  for (const f of proposal.features) {
    const feat = await store.upsertEntity<Feature>(Feature.dcr, {
      id: f.id,
      title: f.title,
      body: f.body || '',
      acceptanceCriteria: f.acceptanceCriteria || [],
      status: 'accepted'
    });
    featureEntities.push(feat);
  }

  // 3. Stories
  const storyEntities: UserStory[] = [];
  for (const s of proposal.stories) {
    const story = await store.upsertEntity<UserStory>(UserStory.dcr, {
      id: s.id,
      title: s.title,
      actor: s.actor || '',
      story: s.story || '',
      context: s.context || '',
      acceptanceCriteria: s.acceptanceCriteria || [],
      status: 'accepted'
    });
    storyEntities.push(story);
  }

  // 4. Epic targets Features
  for (const feat of featureEntities) {
    await store.relate(epic, 'targets', feat);
  }

  // 5. Epic targets Stories specifically introduced/changed by this proposal
  for (const story of storyEntities) {
    await store.relate(epic, 'targets', story);
  }

  // 6. Feature contains Stories
  for (const s of proposal.stories) {
    const storyEntity = storyEntities.find(st => store.localId(st.id) === s.id || st.id === s.id);
    const featureEntity = featureEntities.find(fe => store.localId(fe.id) === s.featureId || fe.id === s.featureId)
      || await store.getEntity<Feature>(s.featureId, Feature.dcr);

    if (featureEntity && storyEntity) {
      await store.relate(featureEntity, 'contains', storyEntity);
    }
  }

  return {
    applied: true,
    epicId: store.localId(epic.id),
    featureIds: featureEntities.map(f => store.localId(f.id)),
    storyIds: storyEntities.map(s => store.localId(s.id))
  };
}
