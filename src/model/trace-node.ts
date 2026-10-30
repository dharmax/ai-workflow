import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class TraceNode extends WorkflowEntity {
    declare status?: string
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
