import { z } from 'zod';
import type { TicketLane } from './types.ts';

export const TicketKindSchema = z.enum(['task', 'bug']);
export const TicketDefectSchema = z.object({
  reproduction: z.string().optional(), expected: z.string().optional(), actual: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(), impact: z.string().optional(),
  environment: z.string().optional(), evidence: z.array(z.string().min(1)).optional()
}).strict();

/** Unknown report fields are explicit; evidence paths alone never establish reproduction. */
export function assessBug(ticket: Pick<import('./ontology.ts').Ticket, 'kind' | 'defect'>) {
  const missing = ticket.kind === 'bug' ? ['reproduction', 'expected', 'actual'].filter(key =>
    !ticket.defect?.[key as 'reproduction' | 'expected' | 'actual']?.trim()) : [];
  return {ready: missing.length === 0, missing};
}

/** Shared public start/selection eligibility; dependency state is read from the canonical graph. */
export async function ticketEligibility(store: import('./store.ts').WorkflowStore, ticket: import('./ontology.ts').Ticket, agentId?: string) {
  const reasons: string[] = [];
  if (!['Todo', 'In Progress'].includes(ticket.lane)) reasons.push(`Lane '${ticket.lane}' is not executable.`);
  if (ticket.claim && Date.parse(ticket.claim.expiresAt) > Date.now() && ticket.claim.agentId !== agentId)
    reasons.push(`Actively claimed by '${ticket.claim.agentId}'.`);
  if (ticket.kind === 'bug' && !assessBug(ticket).ready) reasons.push('Incomplete Bug report: ' + assessBug(ticket).missing.join(', '));
  for (const edge of await store.getOutgoing(ticket.id, 'depends_on')) {
    const dependency = await store.getEntity<import('./ontology.ts').Ticket>(edge.targetId);
    if (!dependency || dependency.typeName() !== 'Ticket' || dependency.lane !== 'Done')
      reasons.push(`Unsatisfied prerequisite '${store.localId(edge.targetId)}'.`);
  }
  return {eligible: reasons.length === 0, reasons};
}

export const TicketLaneSchema = z.enum(['Backlog', 'Todo', 'In Progress', 'Blocked', 'Done', 'Cancelled']);

/** Generic transitions may preserve historical Done, but only the completion owner can enter it. */
export function assertTicketAuthoring(fields: {lane?: unknown; status?: unknown}, previous?: {lane?: unknown}): void {
  if ('status' in fields) throw Error('Ticket.status was removed; use lane.');
  if (fields.lane !== undefined) TicketLaneSchema.parse(fields.lane);
  if (fields.lane === 'Done' && previous?.lane !== 'Done')
    throw Error('Done is owned by independent Ticket completion. Use resolve_ticket; generic authoring cannot complete work.');
  if (previous?.lane === 'Cancelled' && fields.lane !== undefined && !['Cancelled','Backlog','Todo'].includes(String(fields.lane)))
    throw Error('Reopen cancelled work to Backlog or Todo before execution.');
}

export function ticketState(lane: TicketLane): {lane: TicketLane} {
  return {lane: TicketLaneSchema.parse(lane)};
}
