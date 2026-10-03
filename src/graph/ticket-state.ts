import { z } from 'zod';
import type { TicketLane, TicketStatus } from './types.ts';

export function ticketState(lane: TicketLane, status?: string): { lane: TicketLane; status: TicketStatus } {
  const inferred: TicketStatus = lane === 'Done' ? 'verified' : lane === 'In Progress' ? 'in_progress' : lane === 'Blocked' ? 'blocked' : 'planned';
  const parsed = z.enum(['planned', 'in_progress', 'verified', 'blocked', 'rejected']).parse(status ?? inferred);
  if (parsed !== inferred && !(lane === 'Done' && parsed === 'rejected')) throw new Error(`Incoherent Ticket state: ${lane}/${parsed}.`);
  return { lane, status: parsed };
}
