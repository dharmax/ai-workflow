#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "aiwf-common-core/lib/cli";
import { runGuidelineAudit } from "aiwf-common-core/lib/audit-utils";

export async function runGuidelineAuditCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.resolve(String(args.root ?? process.cwd()));
  return runGuidelineAudit(root);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1]).href;
if (isEntrypoint) {
  const result = await runGuidelineAuditCli();
  if (result.failures.length) {
    process.stderr.write(`${result.failures.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write("Guideline audit passed.\n");
}

function pathToFileUrl(filePath: string) {
  return new URL(`file://${path.resolve(filePath)}`);
}
