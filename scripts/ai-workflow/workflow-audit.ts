#!/usr/bin/env node
import { parseArgs } from "../../core/lib/cli.ts";
import { ServiceHub } from "../../core/services/service-hub.ts";
import { initializeRegistry } from "../../core/services/registry-init.ts";
import { ExecutionMode } from "../../core/services/execution-context.ts";

const args = parseArgs(process.argv.slice(2));
ServiceHub.setContext({ projectRoot: process.cwd(), mode: ExecutionMode.Shell });
initializeRegistry();
const result = await ServiceHub.execute("audit", args);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "pass" ? 0 : 1);
}

if (result.status === "pass") {
  process.stdout.write("workflow-audit: OK\n");
  process.exit(0);
}

process.stderr.write(`workflow-audit: FAIL\n${(result.failures ?? []).join("\n")}\n`);
process.exit(1);
