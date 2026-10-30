/**
 * Responsibility: Own the UserStory domain entity and its contracts.
 * Scope: Scenario fields, definition review, completeness and derived-state access.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator, completenessValidator, CompletenessSchema } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'
import { scopeTarget } from '../artifact-policy.ts'
import type { CompletenessLevel } from '../artifact-policy.ts'
import type { ProcessOptions } from '../product/process-types.ts'
import { z } from 'zod'

export const UserStoryStateSchema = z.enum(["draft", "proposed", "accepted", "deprecated"])

import type { IntentStatus } from './types.ts'

export interface UserStoryData extends BaseEntityData {
  intent?: string;
  initialState?: string;
  action?: string;
  expectedResult?: string;
  exceptions?: string;
  bounds?: string;
  completenessTarget?: CompletenessLevel | null;
  status?: IntentStatus;
  actor?: string;
  story?: string;
  context?: string;
  acceptanceCriteria?: string[];
  sla?: string;
}

export class UserStory extends WorkflowEntity {
    declare status: IntentStatus
    declare actor?: string
    declare intent?: string
    declare initialState?: string
    declare action?: string
    declare expectedResult?: string
    declare exceptions?: string
    declare bounds?: string
    declare story?: string
    declare context?: string
    declare acceptanceCriteria?: string[]
    declare sla?: string

    async getEffectiveState(store: WorkflowStore) {
        const {storyEffectiveState} = await import("../product/story-tests.ts")
        const current = await store.getEntity<UserStory>(this.id, UserStory.dcr)
        return current ? storyEffectiveState(store, current) : {
            state: 'needs-review' as const, reasons: ['Story definition no longer exists.'], references: [store.localId(this.id)]
        }
    }

    /** Read-time migration: retain historical acceptance and never guess missing scenario content. */
    get definitionReview() {
        const missingFields = (["actor", "intent", "initialState", "action", "expectedResult"] as const)
            .filter(field => typeof this[field] !== "string" || !this[field]?.trim())
        return { status: missingFields.length ? "needs_review" as const : "complete" as const, missingFields }
    }
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
        return store.upsertEntity(UserStory.dcr, {
            id: this.id,
            completenessTarget: level == null ? null : CompletenessSchema.parse(level)
        })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        status: { validate: (v: unknown) => ({ value: UserStoryStateSchema.parse(v ?? 'draft') }) },
        actor: passthroughValidator,
        intent: passthroughValidator,
        initialState: passthroughValidator,
        action: passthroughValidator,
        expectedResult: passthroughValidator,
        exceptions: passthroughValidator,
        bounds: passthroughValidator,
        story: passthroughValidator,
        context: passthroughValidator,
        acceptanceCriteria: passthroughValidator,
        sla: passthroughValidator
    }
    static readonly dcr = new EntityDcr(UserStory, UserStory.template, "UserStory")
}
