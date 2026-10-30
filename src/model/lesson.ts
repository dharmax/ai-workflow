import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class Lesson extends WorkflowEntity {
    declare status?: string
    declare noteType: import('./types.ts').LessonData['noteType']
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
