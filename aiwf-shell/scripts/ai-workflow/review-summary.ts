#!/usr/bin/env node

import path from "node:path";
import { getChanges } from "aiwf-common-core/lib/git-utils";
import { parseArgs } from "aiwf-common-core/lib/cli";

export async function runReviewSummary(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = path.resolve(String(args.root ?? process.cwd()));
  const changes = await getChanges(root, process.env);
  const sourceChanges = changes.filter((item) => /^(src\/|cli\/|core\/|runtime\/|shared\/|scripts\/)/.test(item.path));
  const testChanges = changes.filter((item) => /(^tests\/|\.test\.[a-z]+$)/.test(item.path));
  const findings: string[] = [];

  if (sourceChanges.length > 0 && testChanges.length === 0) {
    findings.push("source changed without matching test-file changes");
  }

  return { root, changes, findings };
}

function render(summary) {
  const lines: string[] = [];
  for (const change of summary.changes) {
    lines.push(`[${change.status}] ${change.path}`);
  }
  for (const finding of summary.findings) {
    lines.push(finding);
  }
  return `${lines.join("\n")}\n`;
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1]).href;
if (isEntrypoint) {
  const summary = await runReviewSummary();
  process.stdout.write(render(summary));
}

function pathToFileUrl(filePath: string) {
  return new URL(`file://${path.resolve(filePath)}`);
}
