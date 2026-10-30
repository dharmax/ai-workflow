import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class CallSite extends WorkflowEntity {
    declare status?: string
    static template = {
        ...baseTemplate,
        callerFile: passthroughValidator,
        calleeName: passthroughValidator,
        line: passthroughValidator,
        column: passthroughValidator
    }
    static readonly dcr = new EntityDcr(CallSite, CallSite.template, "CallSite")
}
