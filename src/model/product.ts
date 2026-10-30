/**
 * Responsibility: Own the Product domain entity and its contracts.
 * Scope: Charter fields and Aspect assessment.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects } from '../aspects.ts'

export class Product extends WorkflowEntity {
    declare status?: string
    declare purpose?: string
    declare actors?: string[]
    declare scope?: string
    declare nonGoals?: string[]
    declare bounds?: string

    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        purpose: passthroughValidator,
        actors: passthroughValidator,
        scope: passthroughValidator,
        nonGoals: passthroughValidator,
        bounds: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Product, Product.template, "Product")
}
