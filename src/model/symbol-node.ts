import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class SymbolNode extends WorkflowEntity {
    declare title?: string
    declare body?: string
    declare status?: string
    filePath?: string
    kind?: string
    exported?: boolean
    line?: number
    column?: number
    signature?: string
    containerName?: string

    static template = {
        ...baseTemplate,
        filePath: passthroughValidator,
        kind: passthroughValidator,
        exported: { validate: (v: unknown) => ({ value: Boolean(v) }) },
        line: { validate: (v: unknown) => ({ value: Number(v) || 1 }) },
        column: { validate: (v: unknown) => ({ value: Number(v) || 0 }) },
        signature: passthroughValidator,
        containerName: passthroughValidator
    }
    static readonly dcr = new EntityDcr(SymbolNode, SymbolNode.template, "SymbolNode")
}
