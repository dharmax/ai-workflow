import { z } from 'zod';
import { LayaSystemOne, type SystemOne } from '@dharmax/llm-utils';
import type { WorkflowStore } from './graph/store.ts';
import { Aspect } from './model/aspect.ts';
import { Epic } from './model/epic.ts';
import { Feature } from './model/feature.ts';
import { UserStory } from './model/user-story.ts';
import { Ticket } from './model/ticket.ts';
import { TestNode } from './model/test-node.ts';
import { Artifact } from './model/artifact.ts';
import { Decision } from './model/decision.ts';
import { type WorkflowEntity } from './model/workflow-entity.ts';
import type { ArtifactCritic, CompletenessLevel } from './artifact-policy.ts';
import { loadConfig } from './services/config-service.ts';

export interface AspectAssessment {
  scopeId: string;
  aspects: Array<{ id: string; title: string; status: string; criteria: string[]; tickets: string[]; tests: string[]; artifacts: string[]; decisions: string[]; code: string[]; gaps: string[] }>;
  knownGaps: string[];
}

/**
 * Direct applies_to is exact for supported product and engineering artifacts.
 * Stories inherit enabling Features (and legacy containing Features).
 * Tickets inherit parent Tickets/Epics and implemented/addressed/targeted scopes.
 * File/Symbol/Test/Artifact tags are direct only; evidence and Epic targets never propagate policy.
 */
export async function applicableAspects(entity: WorkflowEntity, store: WorkflowStore): Promise<Aspect[]> {
  const { productKind, validateProductRelation } = await import('./product/mutation.ts');
  const result = new Map<string, Aspect>();
  const visited = new Set<string>();
  const active = new Set<string>();
  async function visit(scope: WorkflowEntity): Promise<void> {
    if (active.has(scope.id)) throw new Error(`Ticket containment cycle at '${store.localId(scope.id)}'.`);
    if (visited.has(scope.id)) return;
    visited.add(scope.id); active.add(scope.id);
    const kind = productKind(scope);
    if (!kind) throw new Error(`Applicable Aspects are unsupported for '${scope.typeName()}'.`);
    validateProductRelation('Aspect', 'applies_to', kind);
    for (const edge of await store.getIncoming(scope.id, 'applies_to')) {
      const aspect = await store.getEntity<Aspect>(edge.sourceId, Aspect.dcr);
      if (aspect && aspect.status === 'accepted') result.set(aspect.id, aspect);
    }
    if (scope instanceof Ticket) {
      for (const edge of await store.getIncoming(scope.id, 'contains')) {
        const parent = await store.getEntity(edge.sourceId);
        if (parent instanceof Ticket || parent instanceof Epic) await visit(parent);
      }
      for (const edge of await store.getOutgoing(scope.id)) {
        const target = await store.getEntity(edge.targetId);
        if ((edge.predicateName === 'implements' && target instanceof Feature)
          || (edge.predicateName === 'addresses' && target instanceof UserStory)
          || (['targets', 'modifies'].includes(edge.predicateName) && ['Module', 'File', 'Symbol'].includes(productKind(target) ?? ''))) {
          if (target) await visit(target);
        }
        // Only accepted concerns govern explicit addressing, even without an applies_to edge.
        if (edge.predicateName === 'addresses' && target instanceof Aspect && target.status === 'accepted') result.set(target.id, target);
      }
    } else if (scope instanceof UserStory) {
      for (const predicate of ['enables', 'contains']) {
        for (const edge of await store.getIncoming(scope.id, predicate)) {
          const parent = await store.getEntity<Feature>(edge.sourceId, Feature.dcr);
          if (parent) await visit(parent);
        }
      }
    }
    active.delete(scope.id);
  }
  await visit(entity);
  return [...result.values()].sort((a, b) => store.localId(a.id).localeCompare(store.localId(b.id)));
}

export async function assessAspects(entity: WorkflowEntity, store: WorkflowStore, selected?: Aspect[]): Promise<AspectAssessment> {
  const aspects: AspectAssessment['aspects'] = [];
  for (const aspect of selected ?? await applicableAspects(entity, store)) {
    const item: AspectAssessment['aspects'][number] = { id: store.localId(aspect.id), title: aspect.title, status: aspect.status,
      criteria: aspect.acceptanceCriteria ?? [], tickets: [], tests: [], artifacts: [], decisions: [], code: [], gaps: [] };
    for (const edge of await store.getIncoming(aspect.id)) {
      const source = await store.getEntity(edge.sourceId);
      if (edge.predicateName === 'addresses' && source instanceof Ticket) {
        item.tickets.push(store.localId(source.id));
        for (const anchor of await store.getOutgoing(source.id, 'modifies')) item.code.push(store.localId(anchor.targetId));
      }
      if (edge.predicateName === 'verifies' && source instanceof TestNode) item.tests.push(store.localId(source.id));
      if (edge.predicateName === 'verifies' && source instanceof Artifact) item.artifacts.push(store.localId(source.id));
      if (edge.predicateName === 'governs' && source instanceof Decision) item.decisions.push(store.localId(source.id));
    }
    if (!item.criteria.length) item.gaps.push('missing_acceptance_criteria');
    if (!item.tickets.length && !item.tests.length && !item.artifacts.length && !item.decisions.length) item.gaps.push('missing_work_or_evidence');
    for (const field of ['tickets', 'tests', 'artifacts', 'decisions', 'code'] as const) item[field] = [...new Set(item[field])].sort();
    aspects.push(item);
  }
  return { scopeId: store.localId(entity.id), aspects, knownGaps: aspects.flatMap(a => a.gaps.map(g => `${a.id}: ${g}`)) };
}

/** Shortlisting never creates intent, and every candidate is adjudicated by the caller's read-only Critic. */
export async function reviewMissingAspects(entity: WorkflowEntity, store: WorkflowStore, options: {
  candidates: readonly { id: string; title: string; body?: string }[];
  completeness: CompletenessLevel;
  critic: ArtifactCritic;
  systemOne?: SystemOne;
}) {
  const applicable = await applicableAspects(entity, store);
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
    evidence: (await assessAspects(entity, store, applicable)).aspects.flatMap(a => [...a.code, ...a.tests, ...a.artifacts, ...a.decisions, ...a.gaps.map(g => `${a.id}: ${g}`)]) });
  return { applicable: applicable.map(a => store.localId(a.id)), shortlisted, review, systemOne: assessment && { backendId: assessment.backendId, quality: assessment.quality } };
}
