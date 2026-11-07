/**
 * Responsibility: Own the TraceNode domain entity and its contracts.
 * Scope: Ephemeral execution steps, input, output and duration.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export class TraceNode extends WorkflowEntity {
    declare status?: string
    declare traceId?: string
    declare step?: number
    declare input?: unknown
    declare output?: unknown
    declare durationMs?: number
    static template = {
        ...baseTemplate,
        traceId: passthroughValidator,
        step: passthroughValidator,
        input: passthroughValidator,
        output: passthroughValidator,
        durationMs: passthroughValidator
    }
    static readonly dcr = new EntityDcr(TraceNode, TraceNode.template, "TraceNode")
}
