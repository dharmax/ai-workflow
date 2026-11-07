import { z } from 'zod';
import { LayaSystemOne, type SystemOne } from '@dharmax/llm-utils';
import type { WorkflowStore } from './graph/store.ts';
import { Aspect } from './model/aspect.ts';
import { type WorkflowEntity } from './model/workflow-entity.ts';
import type { ArtifactCritic, CompletenessLevel } from './artifact-policy.ts';
import { loadConfig } from './services/config-service.ts';

export { assessAspects } from './services/assessment-service.ts';
export type { AspectAssessment } from './services/assessment-service.ts';

/** Shortlisting never creates intent, and every candidate is adjudicated by the caller's read-only Critic. */
export async function reviewMissingAspects(entity: WorkflowEntity, store: WorkflowStore, options: {
  candidates: readonly { id: string; title: string; body?: string }[];
  completeness: CompletenessLevel;
  critic: ArtifactCritic;
  systemOne?: SystemOne;
}) {
  const applicable = (await Aspect.getAspectList(entity)).filter(a => a.status === 'accepted');
  const candidates = z.array(z.object({ id: z.string(), title: z.string(), body: z.string().optional() })).max(loadConfig(store.root).maxArtifacts).parse(options.candidates)
    .filter(c => !applicable.some(a => store.localId(a.id) === c.id));
  const assessment = await (options.systemOne ?? new LayaSystemOne()).assess(
    { intent: entity.title ?? store.localId(entity.id), completeness: options.completeness, candidates: candidates.map(c => ({ id: c.id, title: c.title })) },
    Object.fromEntries(candidates.map(c => [c.id, { type: 'choice' as const, instructions: `Could ${c.title} be a material missing concern?`, criteria: { consider: 'Material to this scope', omit: 'Unrelated or ceremonial' } }]))
  );
  const shortlisted = candidates.filter(c => assessment?.answers[c.id]?.choice !== 'omit' || assessment.quality === 'low');
  const review = await options.critic.review({ artifactId: store.localId(entity.id), intent: entity.title ?? store.localId(entity.id),
    completeness: options.completeness, depth: 0, neighborhood: [], proposal: shortlisted,
    applicableAspects: applicable.map(a => store.localId(a.id)), candidateAspects: candidates.map(c => c.id),
    evidence: [] /* Adherence/evidence assessment is not implemented. */ });
  return { applicable: applicable.map(a => store.localId(a.id)), shortlisted, review, systemOne: assessment && { backendId: assessment.backendId, quality: assessment.quality } };
}
