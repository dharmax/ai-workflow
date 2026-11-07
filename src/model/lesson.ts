/**
 * Responsibility: Own the Lesson domain entity and its contracts.
 * Scope: Source notes, Ticket references and prevention patterns.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export class Lesson extends WorkflowEntity {
    declare status?: string
    declare noteType: 'BUG' | 'FIXME' | 'TODO' | 'LESSON' | 'TRAP'
    declare filePath?: string
    declare ticketId?: string
    declare preventionPattern?: string
    static template = {
        ...baseTemplate,
        ticketId: passthroughValidator,
        filePath: passthroughValidator,
        noteType: { validate: (v: unknown) => ({ value: v ?? "LESSON" }) },
        preventionPattern: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Lesson, Lesson.template, "Lesson")
}
