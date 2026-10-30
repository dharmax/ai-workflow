import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator, completenessValidator, CompletenessSchema } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'
import { scopeTarget } from '../artifact-policy.ts'
import type { CompletenessLevel } from '../artifact-policy.ts'

export class ModuleNode extends WorkflowEntity {
    declare status?: string
    declare responsibilities?: string[]
    declare boundaries?: string
    declare intentStatus?: "draft" | "proposed" | "accepted" | "deprecated"
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    declare completenessTarget?: CompletenessLevel | null
    getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) {
        return scopeTarget(this, store, options)
    }
    async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
        return store.upsertEntity(ModuleNode.dcr, {
            id: this.id,
            completenessTarget: level == null ? null : CompletenessSchema.parse(level)
        })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        path: passthroughValidator,
        responsibilities: passthroughValidator,
        boundaries: passthroughValidator,
        intentStatus: passthroughValidator
    }
    static readonly dcr = new EntityDcr(ModuleNode, ModuleNode.template, "ModuleNode")
}
