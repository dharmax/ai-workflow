/**
 * Responsibility: Common identity and optional domain-event handling for workflow entities.
 * Scope: Shared workflow entity identity and optional event handling; Semantika owns loading and relationships.
 */
import {AbstractEntity, type EntityDcr} from '@dharmax/semantika';

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
