/**
 * Responsibility: Orchestrate ticket planning and execution.
 * Scope: Multi-step workflow handling including verification and artifact recording.
 */

import { executeTicket } from "../services/orchestrator.ts";
import { assertSafeRepairTarget, resolveOperatingContext } from "../lib/operating-context.ts";
import { recordRunArtifact } from "../lib/run-artifacts.ts";
import type { ServiceHub } from "../services/service-hub.ts";

export interface ExecuteTicketOptions {
  ticketId: string;
  apply?: boolean;
  timeoutMs?: number;
  mode?: string;
  root?: string;
  evidenceRoot?: string;
  allowExternalTarget?: boolean;
}

export async function run(options: ExecuteTicketOptions, hub: typeof ServiceHub) {
  const context = await resolveOperatingContext({
    cwd: options.root || hub.context.projectRoot,
    mode: options.mode || null,
    root: options.root || null,
    evidenceRoot: options.evidenceRoot || null,
    allowExternalTarget: Boolean(options.allowExternalTarget)
  });
  
  assertSafeRepairTarget(context, { action: options.apply ? "ticket execution" : "ticket planning" });
  
  const payload = await executeTicket({
    root: context.repairTargetRoot,
    ticketId: options.ticketId,
    apply: Boolean(options.apply),
    verificationTimeoutMs: options.timeoutMs
  });

  payload.mode = context.mode;
  payload.repairTargetRoot = context.repairTargetRoot;
  payload.evidenceRoot = context.evidenceRoot;
  
  const artifactPayload = { ...payload };
  payload.runArtifact = await recordRunArtifact(context.repairTargetRoot, {
    kind: "execute-ticket",
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
