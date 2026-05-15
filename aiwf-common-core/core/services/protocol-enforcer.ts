/**
 * Responsibility: Machine-enforce the Execution Protocol.
 * Scope: Delegates protocol validation to the same workflow-audit logic used by CLI/codelet surfaces.
 */

import { buildWorkflowAuditSummary } from "../lib/workflow-audit-report.ts";
import type { ExecutionContext } from "./execution-context.ts";

export interface ProtocolStatus {
  ok: boolean;
  violations: string[];
}

export class ProtocolEnforcer {
  constructor(private context: ExecutionContext) {}

  async validateState(): Promise<ProtocolStatus> {
    const root = this.context.projectRoot;
    const audit = await buildWorkflowAuditSummary(root);
    const violations = (audit.failures ?? []).map((item) => String(item)).filter(Boolean);

    return {
      ok: audit.status === "pass" && violations.length === 0,
      violations
    };
  }
}
