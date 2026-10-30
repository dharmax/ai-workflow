/**
 * Responsibility: Own the SymbolNode domain entity and its contracts.
 * Scope: Indexed declaration identity, source coordinates and signature.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface SymbolData extends BaseEntityData {
  filePath: string;
  kind: 'function' | 'class' | 'method' | 'type' | 'interface' | 'variable' | 'const' | 'enum';
  exported: boolean;
  line: number;
  column: number;
  signature?: string;
}

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
