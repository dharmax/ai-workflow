/**
 * Read-only audit of durable Ticket lanes versus ephemeral execution leases.
 * A lane alone does not prove active execution, and an expired lease does not
 * prove that unfinished work is obsolete. No automatic state transitions.
 */
import type {WorkflowStore} from '../graph/store.ts';
import {Ticket} from '../graph/ontology.ts';
import {systemJournal, type JournalEntry} from '../graph/journal.ts';

export type TicketAuditIssue =
  | 'unleased_in_progress'
  | 'expired_in_progress_lease'
  | 'blocked'
  | 'blocked_with_lease'
  | 'terminal_with_lease';

export interface TicketAuditItem {
  id: string;
  title: string;
  lane: string;
  issue: TicketAuditIssue;
  lease?: {agentId: string; expiresAt: string; active: boolean};
  lastFailure?: {at: string; message: string};
}

export async function auditTicketLifecycle(store: WorkflowStore, now = Date.now()): Promise<TicketAuditItem[]> {
  const tickets = await store.listEntities<Ticket>(Ticket.dcr);
  const journal = await systemJournal(store);
  const items: TicketAuditItem[] = [];
  for (const ticket of tickets) {
    const lane = ticket.lane;
    if (!['In Progress', 'Blocked', 'Done', 'Cancelled'].includes(lane)) continue;
    const claim = ticket.claim;
    const lease = claim ? {
      agentId: claim.agentId,
      expiresAt: claim.expiresAt,
      active: Number.isFinite(Date.parse(claim.expiresAt)) && Date.parse(claim.expiresAt) > now
    } : undefined;
    let issue: TicketAuditIssue | undefined;
    if (lane === 'In Progress')
      issue = !lease ? 'unleased_in_progress' : lease.active ? undefined : 'expired_in_progress_lease';
    else if (lane === 'Blocked')
      issue = lease ? 'blocked_with_lease' : 'blocked';
    else if (lease)
      issue = 'terminal_with_lease';
    if (!issue) continue;
    const id = store.localId(ticket.id);
    const failures = await journal.findSome<JournalEntry>(
      {ticketId: id, type: 'event', kind: 'failure'}, {sort: {_id: -1}, limit: 1});
    const failure = failures[0];
    items.push({
      id, title: ticket.title ?? id, lane, issue,
      ...(lease ? {lease} : {}),
      ...(failure ? {lastFailure: {at: failure.timestamp, message: failure.message.slice(0, 400)}} : {})
    });
  }
  return items.sort((a,b) => a.lane.localeCompare(b.lane) || a.id.localeCompare(b.id));
}
