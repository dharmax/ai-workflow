/**
 * Responsibility: Own the Flow domain entity and its contracts.
 * Scope: Product journey context.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class Flow extends WorkflowEntity {
    declare status?: string
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        actor: passthroughValidator,
        context: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Flow, Flow.template, "Flow")
}
