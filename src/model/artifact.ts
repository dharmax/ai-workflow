/**
 * Responsibility: Own the Artifact domain entity and its contracts.
 * Scope: Execution artifacts, outputs and report references.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface ArtifactData extends BaseEntityData {
  action: string;
  output?: string;
  patchPath?: string;
  reportUrl?: string;
}

export class Artifact extends WorkflowEntity {
    declare status?: string
    static template = {
        ...baseTemplate,
        action: passthroughValidator,
        output: passthroughValidator,
        patchPath: passthroughValidator,
        reportUrl: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Artifact, Artifact.template, "Artifact")
}
