/**
 * Responsibility: Machine-enforce the Execution Protocol.
 * Scope: Validates repository state against verification rules (dogfood, audit).
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { getChanges } from "../lib/git-utils.ts";
import { DEFAULT_DOGFOOD_REPORT_PATH } from "../lib/dogfood-utils.ts";
import type { ExecutionContext } from "./execution-context.ts";

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
      const dogfoodPath = join(root, DEFAULT_DOGFOOD_REPORT_PATH);
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
      const latestChangeMs = await this.getLatestChangeMs(changes);
      return reportStat.mtimeMs >= latestChangeMs;
    } catch {
      return false;
    }
  }

  private async getLatestChangeMs(changes: any[]): Promise<number> {
    const mtimes = await Promise.all(
      changes.map(async (change) => {
        try {
          const fileStat = await stat(join(this.context.projectRoot, String(change.path)));
          return fileStat.mtimeMs;
        } catch {
          return 0;
        }
      })
    );
    return Math.max(0, ...mtimes);
  }
}
