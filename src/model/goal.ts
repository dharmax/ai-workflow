/**
 * Responsibility: Own the Goal domain entity and its contracts.
 * Scope: Product outcomes and Aspect assessment.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'

export class Goal extends WorkflowEntity {
    declare status?: string
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) }
    }
    static readonly dcr = new EntityDcr(Goal, Goal.template, "Goal")
}
