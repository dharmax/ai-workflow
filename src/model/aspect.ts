/**
 * Responsibility: Own the Aspect domain entity and its contracts.
 * Scope: Authored acceptance criteria, governed revisions and applicability.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { assessAspects } from '../aspects.ts'



export class Aspect extends WorkflowEntity {
    /** Direct and containing-entity Aspects; status policy belongs to callers. */
    static async getAspectList(entity: WorkflowEntity): Promise<Aspect[]> {
        const aspects = new Map<string, Aspect>()
        const visited = new Set<string>()
        const active = new Set<string>()

        async function visit(scope: WorkflowEntity): Promise<void> {
            if (active.has(scope.id)) throw Error(`Containment cycle at '${scope.id}'.`)
            if (visited.has(scope.id)) return
            active.add(scope.id)
            for (const edge of await scope.incomingPreds('applies_to')) {
                const aspect = await edge.getSource<Aspect>()
                if (aspect instanceof Aspect) aspects.set(aspect.id, aspect)
            }
            for (const edge of await scope.incomingPreds('contains')) {
                const parent = await edge.getSource<WorkflowEntity>()
                if (parent) await visit(parent)
            }
            active.delete(scope.id)
            visited.add(scope.id)
        }

        await visit(entity)
        return [...aspects.values()].sort((a, b) => a.id.localeCompare(b.id))
    }
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
