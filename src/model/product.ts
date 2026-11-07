/**
 * Responsibility: Own the Product domain entity and its contracts.
 * Scope: Product charter fields.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'

export class Product extends WorkflowEntity {
    declare status?: string
    declare purpose?: string
    declare actors?: string[]
    declare scope?: string
    declare nonGoals?: string[]
    declare bounds?: string

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
