import { AbstractEntity, type EntityDcr } from '@dharmax/semantika';
import type { WorkflowStore } from '../graph/store.ts';
import type { ProcessOptions, ProcessedIntent } from '../product/process-types.ts';
import type { OperationResult } from '../ticket-operation-types.ts';
import type { Epic } from './epic.ts';
import type { Feature } from './feature.ts';
import type { UserStory } from './user-story.ts';

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

    /** Shared concrete reconciliation for the three Product Intent entities; no workflow state is persisted. */
    static async processIntent(
        root: Epic | Feature | UserStory,
        store: WorkflowStore,
        options: ProcessOptions
    ): Promise<OperationResult<ProcessedIntent>> {
        const { processIntent } = await import("../product/process.ts");
        return processIntent(store, root, options);
    }
}
