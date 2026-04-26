#!/usr/bin/env node

import { parseArgs } from "./lib/cli.mjs";
import { getProjectSummary } from "../../../core/services/sync.mjs";

const args = parseArgs(process.argv.slice(2));
const summary = await getProjectSummary({ projectRoot: process.cwd() });

if (args.json) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
  const assessmentStatusBits = Object.entries(summary.assessmentSummary?.byStatus ?? {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([status, count]) => `${count} ${status}`);
  const topAssessmentError = summary.assessmentSummary?.topErrors?.[0] ?? null;
  process.stdout.write([
    `Files indexed: ${summary.fileCount}`,
    `Symbols indexed: ${summary.symbolCount}`,
    `Notes tracked: ${summary.noteCount}`,
    `Tickets: ${summary.activeTickets.length}`,
    `Assessments: ${summary.assessmentCount}${assessmentStatusBits.length ? ` (${assessmentStatusBits.join(", ")})` : ""}`,
    topAssessmentError ? `Top assessment failure: ${topAssessmentError.error} (${topAssessmentError.count})` : null,
    `Candidates: ${summary.candidates.length}`
  ].filter(Boolean).join("\n") + "\n");
}
