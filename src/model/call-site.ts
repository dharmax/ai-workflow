/**
 * Responsibility: Own the CallSite domain entity and its contracts.
 * Scope: Ephemeral caller/callee coordinates.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export class CallSite extends WorkflowEntity {
    declare status?: string
    declare callerFile?: string
    declare calleeName?: string
    declare line?: number
    declare column?: number
    static template = {
        ...baseTemplate,
        callerFile: passthroughValidator,
        calleeName: passthroughValidator,
        line: passthroughValidator,
        column: passthroughValidator
    }
    static readonly dcr = new EntityDcr(CallSite, CallSite.template, "CallSite")
}
