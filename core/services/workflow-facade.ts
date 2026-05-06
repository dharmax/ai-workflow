/**
 * Responsibility: Provide a unified, headless entry point for all high-level workflow operations.
 * Scope: Aggregates services like sync, status, metrics, and summary into a programmatic API.
 */

import { 
  getProjectSummary, 
  syncProject, 
  getProjectMetrics,
  evaluateProjectReadiness,
  searchProject,
  withWorkflowStore
} from "./sync.ts";
import { resolveProjectStatus } from "./status.ts";
import { ExecutionContext, ExecutionMode } from "./execution-context.ts";

export class WorkflowFacade {
  constructor(private context: ExecutionContext) {}

  get mode() { return this.context.mode; }

  async getSummary() {
    return getProjectSummary({ projectRoot: this.context.projectRoot });
  }

  async sync(writeProjections: boolean = false) {
    return syncProject({ 
      projectRoot: this.context.projectRoot, 
      writeProjections 
    });
  }

  async getStatus(selector: string, type: string | null = null, includeRelated: boolean = false) {
    return resolveProjectStatus({
      projectRoot: this.context.projectRoot,
      selector,
      type,
      includeRelated,
      rawQuestion: false,
      relatedLimit: includeRelated ? 24 : 12
    });
  }

  async getMetrics() {
    return getProjectMetrics({ projectRoot: this.context.projectRoot });
  }

  async evaluateReadiness(goalType: string, question: string, options: any = {}) {
    return evaluateProjectReadiness({
      projectRoot: this.context.projectRoot,
      request: {
        protocol_version: "1.0",
        operation: "evaluate_readiness",
        goal: { type: goalType, target: "project", question },
        ...options
      }
    });
  }

  async search(query: string) {
    return searchProject({ projectRoot: this.context.projectRoot, query });
  }

  async discoverExports(pattern: string | null = null) {
    return withWorkflowStore(this.context.projectRoot, async (store) => {
      const symbols = store.listSymbols();
      const filtered = symbols.filter((s: any) => s.exported && (!pattern || s.name.includes(pattern) || s.filePath.includes(pattern)));
      return filtered.map((s: any) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        filePath: s.filePath,
        line: s.line
      }));
    });
  }
}
