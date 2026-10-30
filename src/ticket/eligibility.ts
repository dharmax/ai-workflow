/**
 * Responsibility: Determine whether a Ticket can enter execution.
 * Scope: Executable lanes, active claim ownership, Bug completeness and graph prerequisites.
 */
import type { WorkflowStore } from '../graph/store.ts';
import { Ticket } from '../model/ticket.ts';

/** Shared public start/selection eligibility; dependency state is read from the canonical graph. */
export async function ticketEligibility(store: WorkflowStore, ticket: Ticket, agentId?: string) {
  const reasons: string[] = [];
  if (!['Todo', 'In Progress'].includes(ticket.lane)) reasons.push(`Lane '${ticket.lane}' is not executable.`);
  if (ticket.claim && Date.parse(ticket.claim.expiresAt) > Date.now() && ticket.claim.agentId !== agentId)
    reasons.push(`Actively claimed by '${ticket.claim.agentId}'.`);
  if (ticket.kind === 'bug' && !Ticket.assessBug(ticket).ready) reasons.push('Incomplete Bug report: ' + Ticket.assessBug(ticket).missing.join(', '));
  for (const edge of await store.getOutgoing(ticket.id, 'depends_on')) {
    const dependency = await store.getEntity<Ticket>(edge.targetId);
    if (!dependency || dependency.typeName() !== 'Ticket' || dependency.lane !== 'Done')
      reasons.push(`Unsatisfied prerequisite '${store.localId(edge.targetId)}'.`);
  }
  return {eligible: reasons.length === 0, reasons};
}
