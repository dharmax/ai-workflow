import { WorkflowStore } from './store.ts';
import { exportMarkdown, importMarkdown } from './sync.ts';

export interface SyncTransport {
  sync(): Promise<void>;
  claimTicket(ticketId: string, user: string): Promise<boolean>;
  broadcast(event: string, payload: Record<string, any>): Promise<void>;
}

export class LocalGitTransport implements SyncTransport {
  constructor(private store: WorkflowStore) {}

  async sync(): Promise<void> {
    await importMarkdown(this.store);
    await exportMarkdown(this.store);
  }

  async claimTicket(ticketId: string, user: string): Promise<boolean> {
    const ticket = this.store.getEntity(ticketId);
    if (!ticket) return false;

    this.store.upsertEntity({
      ...ticket,
      metadata: {
        ...ticket.metadata,
        claimedBy: user,
        claimedAt: new Date().toISOString()
      }
    });
    await this.sync();
    return true;
  }

  async broadcast(event: string, payload: Record<string, any>): Promise<void> {
    // Local-first logging. In commercial tier, this forwards to WebSocket/Telegram relay.
    if (process.env.AIWF_DEBUG) {
      console.log(`[transport:event] ${event}`, payload);
    }
  }
}
