/**
 * Responsibility: Own the Epic domain entity and its contracts.
 * Scope: Delivery grouping, priority, completeness and Product processing.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, completenessValidator, CompletenessSchema } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'
import { scopeTarget } from '../artifact-policy.ts'
import type { CompletenessLevel } from '../artifact-policy.ts'
import type { ProcessOptions } from '../product/process-types.ts'
import { PrioritySchema } from './types.ts'


export interface EpicData extends BaseEntityData {
  completenessTarget?: CompletenessLevel | null;
  status?: EpicStatus;
  priority?: number;
}
export type EpicStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'completed'
  | 'cancelled';

export class Epic extends WorkflowEntity {
    declare priority: number
    declare status?: string
    async process(store: WorkflowStore, options: ProcessOptions = {}) {
        const { processIntent } = await import('../product/process.ts')
        return processIntent(store, this, options)
    }
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    declare completenessTarget?: CompletenessLevel | null
    getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) {
        return scopeTarget(this, store, options)
    }
    async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
        return store.upsertEntity(Epic.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        priority: { validate: (v: unknown) => ({ value: PrioritySchema.default(2).parse(v) }) }
    }
    static readonly dcr = new EntityDcr(Epic, Epic.template, "Epic")
}
