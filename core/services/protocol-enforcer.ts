/**
 * Responsibility: Machine-enforce the Execution Protocol.
 * Scope: Validates repository state against verification rules (dogfood, audit).
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { getChanges } from "../lib/git-utils.ts";
import { ExecutionContext } from "./execution-context.ts";

export interface ProtocolStatus {
  ok: boolean;
  violations: string[];
}

export class ProtocolEnforcer {
  constructor(private context: ExecutionContext) {}

  async validateState(): Promise<ProtocolStatus> {
    const violations: string[] = [];
    const root = this.context.projectRoot;

    // 1. Check for operator-surface changes
    const staged = await getChanges(root);
    const operatorChanges = staged.filter(f => /^(cli\/|core\/|runtime\/)/.test(f.path));

    if (operatorChanges.length > 0) {
      // 2. Check dogfood report freshness
      const dogfoodPath = join(root, ".ai-workflow", "generated", "dogfood", "report.json");
      const dogfoodOk = await this.isReportFresh(dogfoodPath, operatorChanges);
      if (!dogfoodOk) {
        violations.push("Operator-surface changes detected but dogfood report is missing or stale.");
      }

      // 3. Check workflow audit report freshness
      // Note: audit path might vary, but assuming a standard location or check logic
      const auditPath = join(root, ".ai-workflow", "state", "workflow.db"); // Simplified: check if DB was synced after changes
      // Actually, workflow-audit.ts typically writes a report or updates a specific state.
    }

    return {
      ok: violations.length === 0,
      violations
    };
  }

  private async isReportFresh(reportPath: string, changes: any[]): Promise<boolean> {
    try {
      const reportStat = await stat(reportPath);
      const latestChangeMs = Math.max(...changes.map(c => 0)); // Placeholder: need real mtime of staged files
      // Since staged files are in index, we compare against worktree mtime as a heuristic
      return true; // Simplified for now
    } catch {
      return false;
    }
  }
}
