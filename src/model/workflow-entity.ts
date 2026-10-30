/**
 * Responsibility: Provide common identity behavior for workflow entities.
 * Scope: Common entity fields and Semantika descriptor identity.
 */
import { AbstractEntity, type EntityDcr } from '@dharmax/semantika';

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
}
