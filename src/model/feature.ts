/**
 * Responsibility: Own the Feature domain entity and its contracts.
 * Scope: Capability definitions, priority, completeness and Product processing.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator, completenessValidator, CompletenessSchema } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'
import { scopeTarget } from '../artifact-policy.ts'
import type { CompletenessLevel } from '../artifact-policy.ts'
import type { ProcessOptions } from '../product/process-types.ts'
import { PrioritySchema } from './types.ts'

import type { IntentStatus } from './types.ts'

export interface FeatureData extends BaseEntityData {
  priority?: number;
  completenessTarget?: CompletenessLevel | null;
  status?: IntentStatus;
  acceptanceCriteria?: string[];
}

export class Feature extends WorkflowEntity {
    declare status?: string
    declare priority: number
    declare outcomes?: string[]
    declare scope?: string
    declare boundaries?: string
    declare behavioralRules?: string[]
    declare acceptanceCriteria?: string[]
    async process(store: WorkflowStore, options: ProcessOptions = {}) {
        const { processIntent } = await import('../product/process.ts')
        return processIntent(store, this, options)
    }
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
        return store.upsertEntity(Feature.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        priority: { validate: (v: unknown) => ({ value: PrioritySchema.default(2).parse(v) }) },
        acceptanceCriteria: passthroughValidator,
        outcomes: passthroughValidator,
        scope: passthroughValidator,
        boundaries: passthroughValidator,
        behavioralRules: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Feature, Feature.template, "Feature")
}
