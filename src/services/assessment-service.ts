/**
 * Assessment is deferred. Preserve applicable requirements for governance without
 * inventing adherence verdicts, evidence, or gap findings.
 */
import type { WorkflowStore } from '../graph/store.ts';
import { Aspect } from '../model/aspect.ts';
import type { WorkflowEntity } from '../model/workflow-entity.ts';

export interface AspectAssessment {
  assessed: boolean;
  scopeId: string;
  aspects: Array<{
    id: string; title: string; body?: string; status: string; criteria: string[];
    tickets: string[]; tests: string[]; artifacts: string[];
    decisions: string[]; code: string[]; gaps: string[];
  }>;
  knownGaps: string[];
}

/** Placeholder, not a compliance or evidence assessment. */
export async function assessAspects(
  entity: WorkflowEntity, store: WorkflowStore, selected?: Aspect[]
): Promise<AspectAssessment> {
  const aspects = selected ?? (await Aspect.getAspectList(entity)).filter(a => a.status === 'accepted');
  return {
    assessed: false,
    scopeId: store.localId(entity.id),
    aspects: aspects.map(a => ({
      id: store.localId(a.id), title: a.title, body: a.body, status: a.status,
      criteria: a.acceptanceCriteria ?? [],
      tickets: [], tests: [], artifacts: [], decisions: [], code: [], gaps: []
    })),
    knownGaps: []
  };
}
