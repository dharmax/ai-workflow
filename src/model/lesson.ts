/**
 * Responsibility: Own the Lesson domain entity and its contracts.
 * Scope: Source notes, Ticket references and prevention patterns.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface LessonData extends BaseEntityData {
  ticketId?: string;
  filePath?: string;
  noteType: 'BUG' | 'FIXME' | 'TODO' | 'LESSON' | 'TRAP';
  preventionPattern?: string;
}

export class Lesson extends WorkflowEntity {
    declare status?: string
    declare noteType: LessonData['noteType']
    declare filePath?: string
    static template = {
        ...baseTemplate,
        ticketId: passthroughValidator,
        filePath: passthroughValidator,
        noteType: { validate: (v: unknown) => ({ value: v ?? "LESSON" }) },
        preventionPattern: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Lesson, Lesson.template, "Lesson")
}
