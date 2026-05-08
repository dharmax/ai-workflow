#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "aiwf-common-core/lib/cli";
import { resolveOperatingContext } from "aiwf-common-core/lib/operating-context";
import { recordRunArtifact } from "aiwf-common-core/lib/run-artifacts";
import { executeTicket as planTicket } from "aiwf-common-core/services/orchestrator";
import { buildSurgicalContext } from "aiwf-common-core/services/context-packer";

const args = parseArgs(process.argv.slice(2));
const ticketIds = String(args.tickets ?? args.ticket ?? args.id ?? args._?.[0] ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!ticketIds.length) {
  process.stderr.write("Usage: tsx aiwf-shell/scripts/ai-workflow/ticket-proving-run.ts --tickets <id[,id...]>\n");
  process.exit(1);
}

const requestedEvidenceRoot = args["evidence-root"] ?? args.evidenceRoot ?? args.root ?? null;
const context = await resolveOperatingContext({
  cwd: process.cwd(),
  mode: args.mode ?? null,
  root: null,
  evidenceRoot: requestedEvidenceRoot ? path.resolve(String(requestedEvidenceRoot)) : null,
  allowExternalTarget: Boolean(args["allow-external-target"] || args.allowExternalTarget)
});

const projectRoot = context.evidenceRoot;
const tickets = [];
for (const ticketId of ticketIds) {
  const result = await planTicket({
    root: projectRoot,
    ticketId,
    apply: false
  });
  const surgicalContext = await buildSurgicalContext(projectRoot, { ticketId });
  tickets.push({
    ...result,
    ticket: surgicalContext.ticket
      ? {
          id: surgicalContext.ticket.id,
          title: surgicalContext.ticket.title,
          lane: surgicalContext.ticket.lane,
          state: surgicalContext.ticket.state,
          summary: String(surgicalContext.ticket.data?.summary ?? "").trim()
        }
      : null,
    workingSetEvidence: surgicalContext.retrieval?.evidence ?? []
  });
}

const payload = {
  mode: context.mode,
  root: projectRoot,
  repairTargetRoot: context.repairTargetRoot,
  evidenceRoot: context.evidenceRoot,
  total: tickets.length,
  passed: tickets.filter((item) => item.success).length,
  verificationPlanned: tickets.filter((item) => Array.isArray(item.executionPlan?.verificationCommands) && item.executionPlan.verificationCommands.length > 0).length,
  tickets
};

const artifactPayload = { ...payload };
payload.runArtifact = await recordRunArtifact(context.repairTargetRoot, {
  kind: "ticket-proving-run",
  mode: context.mode,
  repairTargetRoot: context.repairTargetRoot,
  evidenceRoot: context.evidenceRoot,
  operationalRoot: projectRoot,
  ticketId: ticketIds.join(","),
  ok: payload.passed === payload.total,
  payload: artifactPayload
});

if (args.json) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write([
    `Mode: ${payload.mode}`,
    `Project root: ${payload.root}`,
    `Repair target: ${payload.repairTargetRoot}`,
    payload.evidenceRoot !== payload.repairTargetRoot ? `Evidence root: ${payload.evidenceRoot}` : null,
    `Tickets: ${payload.passed}/${payload.total} planned`,
    `Verification planned: ${payload.verificationPlanned}`
  ].filter(Boolean).join("\n") + "\n");
}
