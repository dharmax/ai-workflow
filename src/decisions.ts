import { WorkflowStore } from './store.ts';
import type { Entity } from './types.ts';

export class DecisionManager {
  constructor(private store: WorkflowStore) {}

  proposeDecision(params: {
    id: string;
    title: string;
    body: string;
    impactedModules?: string[];
    epicId?: string;
  }): Entity {
    const dec = this.store.upsertEntity({
      id: params.id,
      type: 'decision',
      title: params.title,
      status: 'proposed',
      body: params.body,
      metadata: {
        impactedModules: params.impactedModules ?? [],
        epicId: params.epicId ?? null
      }
    });

    if (params.epicId) {
      this.store.addRelation({
        fromId: params.id,
        toId: params.epicId,
        relation: 'governs'
      });
    }

    if (params.impactedModules) {
      for (const mod of params.impactedModules) {
        this.store.addRelation({
          fromId: params.id,
          toId: `mod:${mod}`,
          relation: 'governs'
        });
      }
    }

    return dec;
  }

  acceptDecision(id: string): Entity | null {
    const existing = this.store.getEntity(id);
    if (!existing || existing.type !== 'decision') return null;

    return this.store.upsertEntity({
      ...existing,
      status: 'accepted'
    });
  }

  revertDecision(id: string, reason: string): { decision: Entity | null; affectedTickets: Entity[] } {
    const existing = this.store.getEntity(id);
    if (!existing || existing.type !== 'decision') {
      return { decision: null, affectedTickets: [] };
    }

    const updatedDecision = this.store.upsertEntity({
      ...existing,
      status: 'reverted',
      metadata: {
        ...existing.metadata,
        revertedAt: new Date().toISOString(),
        revertReason: reason
      }
    });

    // Reconcile affected tickets
    const linkedTickets = this.store.getIncoming(id, 'governs').concat(this.store.getOutgoing(id, 'governs'))
      .filter(e => e.type === 'ticket');

    const affectedTickets: Entity[] = [];
    for (const t of linkedTickets) {
      if (t.lane !== 'Done') {
        const cancelled = this.store.upsertEntity({
          ...t,
          lane: 'Blocked',
          status: 'deprecated',
          metadata: {
            ...t.metadata,
            blockedReason: `Decision ${id} was reverted: ${reason}`
          }
        });
        affectedTickets.push(cancelled);
      }
    }

    return { decision: updatedDecision, affectedTickets };
  }

  listDecisions(status?: string): Entity[] {
    return this.store.listEntities({ type: 'decision', status });
  }
}
