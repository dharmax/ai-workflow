/**
 * Responsibility: Orchestrate ticket planning and execution.
 * Scope: Multi-step workflow handling including verification and artifact recording.
 */

import { executeTicket } from "../services/orchestrator.ts";
import { assertSafeRepairTarget, resolveOperatingContext } from "../lib/operating-context.ts";
import { recordRunArtifact } from "../lib/run-artifacts.ts";
import { buildSurgicalContext } from "../services/context-packer.ts";


export interface ExecuteTicketOptions {
  ticketId: string;
  apply?: boolean;
  timeoutMs?: number;
  mode?: string;
  root?: string;
  evidenceRoot?: string;
  allowExternalTarget?: boolean;
}

export async function run(options: ExecuteTicketOptions, hub: any) {
  const apply = toBoolean(options.apply);
  const context = await resolveOperatingContext({
    cwd: options.root || hub.context.projectRoot,
    mode: options.mode || null,
    root: options.root || null,
    evidenceRoot: options.evidenceRoot || null,
    allowExternalTarget: toBoolean(options.allowExternalTarget)
  });
  
  assertSafeRepairTarget(context, { action: apply ? "ticket execution" : "ticket planning" });
  
  const payload = await executeTicket({
    root: context.repairTargetRoot,
    ticketId: options.ticketId,
    apply,
    verificationTimeoutMs: options.timeoutMs
  });
  const surgicalContext = await buildSurgicalContext(context.repairTargetRoot, { ticketId: options.ticketId });

  payload.mode = context.mode;
  payload.root = context.repairTargetRoot;
  payload.repairTargetRoot = context.repairTargetRoot;
  payload.evidenceRoot = context.evidenceRoot;
  payload.ticket = surgicalContext.ticket
    ? {
        id: surgicalContext.ticket.id,
        title: surgicalContext.ticket.title,
        lane: surgicalContext.ticket.lane,
        state: surgicalContext.ticket.state,
        summary: String(surgicalContext.ticket.data?.summary ?? "").trim()
      }
    : null;
  payload.workingSetEvidence = (surgicalContext.retrieval?.evidence ?? []).map((item: any) => ({
    ...item,
    kind: item.kind === "file" || item.kind === "test" ? "selected-file" : item.kind
  }));
  
  const artifactPayload = { ...payload };
  payload.runArtifact = await recordRunArtifact(context.repairTargetRoot, {
    kind: apply ? "execute-ticket" : "execution-dry-run",
    mode: context.mode,
    repairTargetRoot: context.repairTargetRoot,
    evidenceRoot: context.evidenceRoot,
    operationalRoot: context.repairTargetRoot,
    ticketId: options.ticketId,
    ok: payload.success,
    payload: artifactPayload
  });

  return payload;
}

function toBoolean(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
  }
  return Boolean(value);
}
