#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "../../core/lib/cli.ts";
import { loadTicketContext } from "../../core/lib/workflow-store-utils.ts";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(String(args.root ?? process.cwd()));
const ticketId = String(args.id ?? args.ticket ?? args._[0] ?? "").trim();

if (!ticketId) {
  process.stderr.write("Usage: tsx scripts/ai-workflow/kanban-ticket.ts --id <ticket-id>\n");
  process.exit(1);
}

const context = await loadTicketContext({ root, ticketId });
if (!context.ticket) {
  process.stderr.write(`Unknown ticket: ${ticketId}\n`);
  process.exit(1);
}

const lane = context.entity?.lane ?? context.ticket.section ?? "unknown";
process.stdout.write(`${context.ticket.id} | ${lane} | ${context.ticket.title}\n`);
