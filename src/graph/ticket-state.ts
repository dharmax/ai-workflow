import { z } from 'zod';
import type { TicketLane, TicketStatus } from './types.ts';

/** Generic authoring may retain historical completion, but cannot create independent proof. */
export function assertTicketAuthoring(fields: {lane?: unknown; status?: unknown}, previous?: {lane?: unknown; status?: unknown}): void {
  if ((fields.lane === 'Done' || fields.status === 'verified') &&
      !(previous?.lane === 'Done' && (fields.lane === undefined || fields.lane === previous.lane) &&
        (fields.status ?? 'verified') === previous.status))
    throw Error('Done/verified is owned by independent Ticket completion. Use resolve_ticket; generic authoring cannot complete work.');
}

export function ticketState(lane: TicketLane, status?: string): { lane: TicketLane; status: TicketStatus } {
  const inferred: TicketStatus = lane === 'Done' ? 'verified' : lane === 'In Progress' ? 'in_progress' : lane === 'Blocked' ? 'blocked' : 'planned';
  const parsed = z.enum(['planned', 'in_progress', 'verified', 'blocked', 'rejected']).parse(status ?? inferred);
  if (parsed !== inferred && !(lane === 'Done' && parsed === 'rejected')) throw new Error(`Incoherent Ticket state: ${lane}/${parsed}.`);
  return { lane, status: parsed };
}
