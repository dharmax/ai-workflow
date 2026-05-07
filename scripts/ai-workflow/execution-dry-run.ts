#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "../../core/lib/cli.ts";
import { runCodeletScript } from "./_run-codelet.ts";

const args = parseArgs(process.argv.slice(2));
const ticketId = String(args.ticket ?? args.id ?? args._[0] ?? "").trim();
if (!ticketId) {
  process.stderr.write("Usage: tsx scripts/ai-workflow/execution-dry-run.ts --ticket <ticket-id>\n");
  process.exit(1);
}
process.argv.splice(2, process.argv.length - 2, "--ticketId", ticketId, "--apply", "false", ...(args.json ? ["--json"] : []), ...(args.root ? ["--root", path.resolve(String(args.root))] : []));
await runCodeletScript({
  codeletId: "execute-ticket",
  modulePath: "core/codelets/execute-ticket.ts",
  presenterId: "execute-ticket"
});
