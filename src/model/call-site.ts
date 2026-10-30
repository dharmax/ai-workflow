/**
 * Responsibility: Own the CallSite domain entity and its contracts.
 * Scope: Ephemeral caller/callee coordinates.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface CallSiteData extends BaseEntityData {
  callerFile: string;
  calleeName: string;
  line: number;
  column: number;
}

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
