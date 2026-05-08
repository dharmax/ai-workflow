/**
 * Responsibility: Execute workflow audit.
 */
import path from "node:path";
import { buildWorkflowAuditSummary } from "../lib/workflow-audit-report.ts";


export interface AuditOptions {
  root?: string;
}

export async function run(options: AuditOptions, hub: any) {
  const root = path.resolve(String(options.root ?? hub.context.projectRoot));
  return buildWorkflowAuditSummary(root);
}
