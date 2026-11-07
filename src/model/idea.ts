/**
 * Responsibility: Own the Idea domain entity and its contracts.
 * Scope: Feasibility and impact fields.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export class Idea extends WorkflowEntity {
    declare status?: string
    declare feasibility?: 'low' | 'medium' | 'high'
    declare impact?: 'low' | 'medium' | 'high'
    static template = {
        ...baseTemplate,
        feasibility: passthroughValidator,
        impact: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Idea, Idea.template, "Idea")
}
