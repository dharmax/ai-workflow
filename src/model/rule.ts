import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class Rule extends WorkflowEntity {
    declare ruleId: string
    declare type: string
    declare scope: any
    declare importance: number
    declare rule: string
    declare status: "active" | "draft" | "disabled"
    declare disableReason?: string
    declare languages?: string[]
    declare examples?: any[]
    declare references?: any[]
    declare test?: any
    declare revision: number
    declare provenance: string

    static template = {
        ...baseTemplate,
        ruleId: passthroughValidator,
        type: { validate: (v: unknown) => ({ value: v ?? "universal" }) },
        scope: { validate: (v: unknown) => ({ value: v ?? { kind: "universal" } }) },
        importance: { validate: (v: unknown) => ({ value: typeof v === "number" ? v : 5 }) },
        rule: passthroughValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "active" }) },
        disableReason: passthroughValidator,
        languages: passthroughValidator,
        examples: { validate: (v: unknown) => ({ value: Array.isArray(v) ? v : [] }) },
        references: { validate: (v: unknown) => ({ value: Array.isArray(v) ? v : [] }) },
        test: { validate: (v: unknown) => ({ value: v ?? { kind: "llm" } }) },
        revision: { validate: (v: unknown) => ({ value: typeof v === "number" ? v : 1 }) },
        provenance: { validate: (v: unknown) => ({ value: v ?? "bundled-default" }) }
    }
    static readonly dcr = new EntityDcr(Rule, Rule.template, "Rule")
}
