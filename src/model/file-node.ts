import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class FileNode extends WorkflowEntity {
    declare path?: string
    declare mtime?: number
    declare size?: number
    declare status?: string
    declare language?: string
    static template = {
        ...baseTemplate,
        path: passthroughValidator,
        language: passthroughValidator,
        fileKind: passthroughValidator,
        size: passthroughValidator,
        hash: passthroughValidator,
        mtime: passthroughValidator
    }
    static readonly dcr = new EntityDcr(FileNode, FileNode.template, "FileNode")
}
