/**
 * Responsibility: Own the Idea domain entity and its contracts.
 * Scope: Feasibility, impact and Aspect assessment.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'


export interface IdeaData extends BaseEntityData {
  feasibility?: 'low' | 'medium' | 'high';
  impact?: 'low' | 'medium' | 'high';
}

export class Idea extends WorkflowEntity {
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
        feasibility: passthroughValidator,
        impact: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Idea, Idea.template, "Idea")
}
