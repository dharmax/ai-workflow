import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { assessAspects } from '../aspects.ts'

export class Aspect extends WorkflowEntity {
    declare title: string
    declare body: string
    declare status: "draft" | "proposed" | "accepted" | "deprecated"
    declare acceptanceCriteria?: string[]
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        acceptanceCriteria: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Aspect, Aspect.template, "Aspect")
    static async create(
        store: WorkflowStore,
        data: {
            id: string
            title: string
            body?: string
            status?: "draft" | "proposed" | "accepted" | "deprecated"
            acceptanceCriteria?: string[]
        }
    ) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        const { id, ...fields } = data
        await applyProductMutations(store, [{ kind: "product_create", entityType: "Aspect", id, fields }])
        return (await store.getEntity<Aspect>(id, Aspect.dcr))!
    }
    async revise(
        store: WorkflowStore,
        fields: { title?: string; body?: string; status?: "draft" | "proposed" | "accepted" | "deprecated"; acceptanceCriteria?: string[] }
    ) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        await applyProductMutations(store, [{ kind: "product_update", entityType: "Aspect", id: store.localId(this.id), fields }])
        return (await store.getEntity<Aspect>(this.id, Aspect.dcr))!
    }
    async view(store: WorkflowStore) {
        const scopes = (await store.getOutgoing(this.id, "applies_to")).map(e => store.localId(e.targetId)).sort()
        return {
            id: store.localId(this.id),
            version: this.version,
            title: this.title,
            body: this.body,
            status: this.status,
            acceptanceCriteria: this.acceptanceCriteria ?? [],
            scopes,
            assessment: (await assessAspects(this, store, [this])).aspects[0]
        }
    }
    async applyTo(scope: WorkflowEntity, store: WorkflowStore) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        await applyProductMutations(store, [
            { kind: "product_link", sourceId: store.localId(this.id), predicate: "applies_to", targetId: store.localId(scope.id) }
        ])
    }
    async removeFrom(scope: WorkflowEntity, store: WorkflowStore) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        await applyProductMutations(store, [
            { kind: "product_unlink", sourceId: store.localId(this.id), predicate: "applies_to", targetId: store.localId(scope.id) }
        ])
    }
    assess(scope: WorkflowEntity, store: WorkflowStore) {
        return assessAspects(scope, store, [this])
    }
}
