/**
 * Responsibility: Provide common identity behavior for workflow entities.
 * Scope: Common entity fields and Semantika descriptor identity.
 */
import { AbstractEntity, type EntityDcr, type SemanticPackage } from '@dharmax/semantika';
import {AsyncLocalStorage} from 'node:async_hooks';

export interface BaseEntityData {
  id: string;
  title: string;
  status?: string;
  body?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface FilterSpec {
  predicateTypes?: readonly string[];
  direction?: 'incoming' | 'outgoing' | 'both';
}

type EventPropagation = {type: string; source: WorkflowEntity; data: unknown; visited: Set<string>};
const eventPropagation = new AsyncLocalStorage<EventPropagation>();
const entityResolvers = new WeakMap<SemanticPackage, (id: string) => Promise<AbstractEntity | null>>();

/** Preserve the owning store's entity authority when navigating native predicates. */
export function bindWorkflowEntityResolver(semanticPackage: SemanticPackage, resolve: (id: string) => Promise<AbstractEntity | null>): void {
    entityResolvers.set(semanticPackage, resolve);
}

export abstract class WorkflowEntity extends AbstractEntity {
    declare title?: string;
    declare body?: string;
    declare metadata?: Record<string, unknown>;
    static readonly dcr: EntityDcr;

    override typeName(): string {
        return (this.constructor as typeof WorkflowEntity).dcr?.name || this.constructor.name;
    }

    override get descriptor(): EntityDcr {
        return (this.constructor as typeof WorkflowEntity).dcr || super.descriptor;
    }

    async getRelatedEntities(filter: FilterSpec = {}): Promise<WorkflowEntity[]> {
        const direction = filter.direction ?? 'both';
        const types = filter.predicateTypes === undefined ? [undefined] : [...new Set(filter.predicateTypes)];
        const related = new Map<string, WorkflowEntity>();
        for (const incoming of [true, false]) {
            if (incoming && direction === 'outgoing' || !incoming && direction === 'incoming') continue;
            for (const predicate of types) {
                for (const edge of await this.semanticPackage.findPredicates(incoming, predicate, this.id)) {
                    const resolve = entityResolvers.get(this.semanticPackage);
                    const peer = resolve ? await resolve(incoming ? edge.sourceId : edge.targetId)
                        : incoming ? await edge.getSource() : await edge.getTarget();
                    if (!(peer instanceof WorkflowEntity)) throw Error('Related graph entity is not a WorkflowEntity.');
                    related.set(peer.id, peer);
                }
            }
        }
        return [...related.values()];
    }

    async handleEvent(type: string, source: WorkflowEntity, data: unknown): Promise<void> {
        const current = eventPropagation.getStore();
        const propagate = async (scope: EventPropagation) => {
            for (const entity of await this.getRelatedEntities()) {
                if (scope.visited.has(entity.id)) continue;
                scope.visited.add(entity.id);
                await entity.handleEvent(type, source, data);
            }
        };
        if (current && current.type === type && current.source.id === source.id && current.data === data) {
            current.visited.add(this.id);
            await propagate(current);
        } else {
            const scope: EventPropagation = {type, source, data, visited: new Set([this.id])};
            await eventPropagation.run(scope, () => propagate(scope));
        }
    }
}
