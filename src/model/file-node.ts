/**
 * Responsibility: Own the FileNode domain entity and its contracts.
 * Scope: Indexed source paths, language, size, hashes and modification times.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export class FileNode extends WorkflowEntity {
    declare path?: string
    declare hash?: string
    declare mtime?: number
    declare size?: number
    declare status?: string
    declare language?: string
    declare fileKind?: string
    /** Propagate source changes only to graph dependents, not every related entity. */
    override async handleEvent(type: string, source: WorkflowEntity, data: unknown, visited: Set<string> = new Set()): Promise<void> {
        if (type !== 'fileChanged' || visited.has(this.id)) return;
        visited.add(this.id);

        // Importers depend on this file; verifying tests depend on its behavior.
        for (const relation of ['depends_on', 'verifies']) {
            for (const edge of await this.incomingPreds(relation)) {
                const dependent = await edge.getSource();
                if (dependent instanceof WorkflowEntity && !visited.has(dependent.id))
                    await dependent.handleEvent(type, source, data, visited);
            }
        }
        // A test source also contains its own TestNode.
        for (const edge of await this.outgoingPreds('contains')) {
            if (edge.targetType !== 'TestNode') continue;
            const dependent = await edge.getTarget();
            if (dependent instanceof WorkflowEntity && !visited.has(dependent.id))
                await dependent.handleEvent(type, source, data, visited);
        }
    }

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
