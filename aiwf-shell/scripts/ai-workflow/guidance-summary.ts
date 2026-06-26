#!/usr/bin/env node
import { parseArgs } from "aiwf-common-core/lib/cli";
import { ServiceHub } from "aiwf-common-core/services/service-hub";
import { initializeRegistry } from "aiwf-common-core/services/registry-init";
import { ExecutionMode } from "aiwf-common-core/services/execution-context";
import { getChanges, isGitRepo } from "aiwf-common-core/lib/git-utils";

const args = parseArgs(process.argv.slice(2));
ServiceHub.setContext({ projectRoot: process.cwd(), mode: ExecutionMode.Shell });
initializeRegistry();
const result = await ServiceHub.execute("guidance-summary", args);

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

function isRelevantChangedFile(file) {
  return !file.startsWith(".ai-workflow/state/");
}

const lines: string[] = [];
const changedFiles = args.changed && await isGitRepo(process.cwd())
  ? (await getChanges(process.cwd())).map((item) => item.path).filter(isRelevantChangedFile)
  : [];
const validationFiles = Array.isArray(result.validationPlan?.files) ? result.validationPlan.files : [];
const files = [...new Set([...changedFiles, ...validationFiles])];
if (files.length) {
  lines.push(`Files: ${files.join(", ")}`);
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
