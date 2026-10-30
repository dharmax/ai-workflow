import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class Decision extends WorkflowEntity {
    declare status?: string
    declare decision?: string
    declare context?: string
    declare consequences?: string
    static template = {
        ...baseTemplate,
        decision: passthroughValidator,
        context: passthroughValidator,
        consequences: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Decision, Decision.template, "Decision")
}
