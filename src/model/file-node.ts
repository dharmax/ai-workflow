/**
 * Responsibility: Own the FileNode domain entity and its contracts.
 * Scope: Indexed source paths, language, size, hashes and modification times.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface FileData extends BaseEntityData {
  path: string;
  language?: string;
  fileKind?: string;
  size?: number;
  hash?: string;
}

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
