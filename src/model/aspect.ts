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
    /**
     * Direct applies_to is exact for supported product and engineering artifacts.
     * Stories inherit enabling Features (and legacy containing Features).
     * Tickets inherit parent Tickets/Epics and implemented/addressed/targeted scopes.
     * File/Symbol/Test/Artifact tags are direct only; evidence and Epic targets never propagate policy.
     */
    static async getAspectList(entity: WorkflowEntity, store: WorkflowStore): Promise<Aspect[]> {
        const { productKind, validateProductRelation } = await import('../product/mutation.ts');
        const { Epic, Feature, UserStory, Ticket } = await import('./ontology.ts');
        const result = new Map<string, Aspect>();
        const visited = new Set<string>();
        const active = new Set<string>();
        async function visit(scope: WorkflowEntity): Promise<void> {
          if (active.has(scope.id)) throw new Error(`Ticket containment cycle at '${store.localId(scope.id)}'.`);
          if (visited.has(scope.id)) return;
          visited.add(scope.id); active.add(scope.id);
          const kind = productKind(scope);
          if (!kind) throw new Error(`Applicable Aspects are unsupported for '${scope.typeName()}'.`);
          validateProductRelation('Aspect', 'applies_to', kind);
          for (const edge of await store.getIncoming(scope.id, 'applies_to')) {
            const aspect = await store.getEntity<Aspect>(edge.sourceId, Aspect.dcr);
            if (aspect && aspect.status === 'accepted') result.set(aspect.id, aspect);
          }
          if (scope instanceof Ticket) {
            for (const edge of await store.getIncoming(scope.id, 'contains')) {
              const parent = await store.getEntity(edge.sourceId);
              if (parent instanceof Ticket || parent instanceof Epic) await visit(parent);
            }
            for (const edge of await store.getOutgoing(scope.id)) {
              const target = await store.getEntity(edge.targetId);
              if ((edge.predicateName === 'implements' && target instanceof Feature)
                || (edge.predicateName === 'addresses' && target instanceof UserStory)
                || (['targets', 'modifies'].includes(edge.predicateName) && ['Module', 'File', 'Symbol'].includes(productKind(target) ?? ''))) {
                if (target) await visit(target);
              }
              // Only accepted concerns govern explicit addressing, even without an applies_to edge.
              if (edge.predicateName === 'addresses' && target instanceof Aspect && target.status === 'accepted') result.set(target.id, target);
            }
          } else if (scope instanceof UserStory) {
            for (const predicate of ['enables', 'contains']) {
              for (const edge of await store.getIncoming(scope.id, predicate)) {
                const parent = await store.getEntity<import('./feature.ts').Feature>(edge.sourceId, Feature.dcr);
                if (parent) await visit(parent);
              }
            }
          }
          active.delete(scope.id);
        }
        await visit(entity);
        return [...result.values()].sort((a, b) => store.localId(a.id).localeCompare(store.localId(b.id)));
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
