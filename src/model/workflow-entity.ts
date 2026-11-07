/**
 * Responsibility: Common identity and optional domain-event handling for workflow entities.
 * Semantika owns entity loading and graph relationships.
 */
import {AbstractEntity, type EntityDcr} from '@dharmax/semantika';

/** Legacy DTO contract; consolidate entity field typing in a later, separate change. */
export interface BaseEntityData {
    id: string;
    title: string;
    status?: string;
    body?: string;
    metadata?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
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

    /** Domain entities opt in to relevant events; they do not broadcast all graph edges. */
    async handleEvent(_type: string, _source: WorkflowEntity, _data: unknown, visited?: Set<string>): Promise<void> {
        visited?.add(this.id);
    }
}
