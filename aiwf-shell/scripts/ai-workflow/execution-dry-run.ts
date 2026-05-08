#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "aiwf-common-core/lib/cli";
import { runCodeletScript } from "./_run-codelet.ts";

const args = parseArgs(process.argv.slice(2));
const ticketId = String(args.ticket ?? args.id ?? args._[0] ?? "").trim();
if (!ticketId) {
  process.stderr.write("Usage: tsx aiwf-shell/scripts/ai-workflow/execution-dry-run.ts --ticket <ticket-id>\n");
  process.exit(1);
}
const forwardedArgs = [
  "--ticketId", ticketId,
  "--apply", "false",
  ...(args.json ? ["--json"] : []),
  ...(args.mode ? ["--mode", String(args.mode)] : []),
  ...(args.root ? ["--root", path.resolve(String(args.root))] : []),
  ...(args["evidence-root"] ? ["--evidenceRoot", path.resolve(String(args["evidence-root"]))] : []),
  ...(args.evidenceRoot ? ["--evidenceRoot", path.resolve(String(args.evidenceRoot))] : []),
  ...(args["allow-external-target"] || args.allowExternalTarget ? ["--allowExternalTarget", "true"] : []),
  ...(args.timeout ? ["--timeoutMs", String(args.timeout)] : []),
  ...(args["timeout-ms"] ? ["--timeoutMs", String(args["timeout-ms"])] : [])
];
process.argv.splice(2, process.argv.length - 2, ...forwardedArgs);
await runCodeletScript({
  codeletId: "execute-ticket",
  presenterId: "execute-ticket"
});
