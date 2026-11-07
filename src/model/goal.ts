/**
 * Responsibility: Own the Goal domain entity and its contracts.
 * Scope: Product goals and outcomes.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate } from './entity-templates.ts'

export class Goal extends WorkflowEntity {
    declare status?: string
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) }
    }
    static readonly dcr = new EntityDcr(Goal, Goal.template, "Goal")
}
