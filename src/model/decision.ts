/**
 * Responsibility: Own the Decision domain entity and its contracts.
 * Scope: Recorded choices, context and consequences.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'


export interface DecisionData extends BaseEntityData {
  decision: string;
  context?: string;
  consequences?: string;
}

export class Decision extends WorkflowEntity {
    declare status?: string
    declare decision?: string
    declare context?: string
    declare consequences?: string
    static template = {
        ...baseTemplate,
        decision: passthroughValidator,
        context: passthroughValidator,
        consequences: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Decision, Decision.template, "Decision")
}
