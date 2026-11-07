/**
 * Responsibility: Own the Concept domain entity and its contracts.
 * Scope: Shared Product concepts.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate } from './entity-templates.ts'

export class Concept extends WorkflowEntity {
    declare status?: string
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) }
    }
    static readonly dcr = new EntityDcr(Concept, Concept.template, "Concept")
}
