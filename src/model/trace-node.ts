/**
 * Responsibility: Own the TraceNode domain entity and its contracts.
 * Scope: Ephemeral execution steps, input, output and duration.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface TraceData extends BaseEntityData {
  traceId: string;
  step: number;
  input?: any;
  output?: any;
  durationMs?: number;
}

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
