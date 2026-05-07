/**
 * Responsibility: Extract a ticket plus its likely working set from the workflow store.
 */

import { inferTicketWorkingSet, loadTicketContext } from "../lib/workflow-store-utils.ts";

export async function run(options: { ticketId?: string; limit?: number }, hub: any) {
  const root = hub.context.projectRoot;
  const ticketId = String(options.ticketId ?? "").trim();
  if (!ticketId) {
    throw new Error("ticketId is required");
  }

  const context = await loadTicketContext({ root, ticketId });
  if (!context.ticket) {
    throw new Error(`Ticket ${ticketId} not found.`);
  }

  const workingSet = await inferTicketWorkingSet({
    root,
    ticket: context.ticket,
    entity: context.entity,
    limit: Number(options.limit ?? 8)
  });

  return {
    ticketId,
    sourcePath: context.sourcePath,
    ticket: context.ticket,
    entity: context.entity,
    workingSet
  };
}
