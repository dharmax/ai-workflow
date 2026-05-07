#!/usr/bin/env node
import { parseArgs } from "../../core/lib/cli.ts";
import { ServiceHub } from "../../core/services/service-hub.ts";
import { initializeRegistry } from "../../core/services/registry-init.ts";
import { ExecutionMode } from "../../core/services/execution-context.ts";

const args = parseArgs(process.argv.slice(2));
ServiceHub.setContext({ projectRoot: process.cwd(), mode: ExecutionMode.Shell });
initializeRegistry();
const mod = await import("../../core/codelets/guidance-summary.ts");
const result = await mod.run(args, ServiceHub);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

const lines = [];
if (Array.isArray(result.validationPlan?.files) && result.validationPlan.files.length) {
  lines.push(`Files: ${result.validationPlan.files.join(", ")}`);
}
lines.push("Contributing");
for (const item of result.guidance?.contributing ?? []) {
  lines.push(`- ${item}`);
}
lines.push("Execution Protocol");
for (const item of result.guidance?.executionProtocol ?? []) {
  lines.push(`- ${item}`);
}
lines.push("Enforcement");
for (const item of result.guidance?.enforcement ?? []) {
  lines.push(`- ${item}`);
}
process.stdout.write(`${lines.join("\n")}\n`);
