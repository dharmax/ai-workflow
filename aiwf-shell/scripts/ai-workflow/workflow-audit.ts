#!/usr/bin/env node
import { parseArgs } from "aiwf-common-core/lib/cli";
import { ServiceHub } from "aiwf-common-core/services/service-hub";
import { initializeRegistry } from "aiwf-common-core/services/registry-init";
import { ExecutionMode } from "aiwf-common-core/services/execution-context";

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
