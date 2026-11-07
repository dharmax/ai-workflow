/**
 * Responsibility: Own the Idea domain entity and its contracts.
 * Scope: Feasibility, impact and Aspect assessment.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { assessAspects, reviewMissingAspects } from '../aspects.ts'


export class Idea extends WorkflowEntity {
    declare status?: string
    declare feasibility?: 'low' | 'medium' | 'high'
    declare impact?: 'low' | 'medium' | 'high'
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    static template = {
        ...baseTemplate,
        feasibility: passthroughValidator,
        impact: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Idea, Idea.template, "Idea")
}
