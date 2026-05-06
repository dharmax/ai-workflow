import * as smartRun from "../codelets/smart-codelet-runner.ts";
import * as contextPack from "../codelets/context-pack.ts";
import * as executeTicket from "../codelets/execute-ticket.ts";
/**
 * Responsibility: Provide a unified, static hub for all core toolkit capabilities and codelets.
 * Scope: The single programmatic entry point for Shell, Skill, and internal orchestration.
 */

import { 
  syncProject, 
  getProjectSummary as getSummary, 
  getProjectMetrics,
  evaluateProjectReadiness,
  searchProject,
  withWorkflowStore
} from "./sync.ts";
import { resolveProjectStatus } from "./status.ts";
import { CoreLLM } from "./core-llm.ts";
import { TerminalContext } from "./terminal-context.ts";
import { detectExecutionMode } from "./execution-context.ts";
import { KanbanManager } from "./kanban-manager.ts";
import type { ExecutionContext } from "./execution-context.ts";

export class ServiceHub {
  private static _context: ExecutionContext | null = null;
  private static _llm: CoreLLM | null = null;
  private static _kanban: KanbanManager | null = null;

  static get context(): ExecutionContext {
    if (!this._context) {
      this._context = {
        projectRoot: process.cwd(),
        mode: detectExecutionMode()
      };
    }
    return this._context;
  }

  static setContext(context: ExecutionContext) {
    this._context = context;
    this._llm = null; // Invalidate dependent services
    this._kanban = null;
  }

  // --- Services ---

  static get llm(): CoreLLM {
    if (!this._llm) {
      this._llm = new CoreLLM(this.context);
    }
    return this._llm;
  }

  static get kanban(): KanbanManager {
    if (!this._kanban) {
      this._kanban = new KanbanManager(this.context);
    }
    return this._kanban;
  }

  static get terminal() {
    return TerminalContext;
  }

  // --- High-Level Codelet APIs ---

  /**
   * Synchronize the project state and update projections.
   */
  static async sync(options: { writeProjections?: boolean } = {}) {
    return syncProject({
      projectRoot: this.context.projectRoot,
      writeProjections: options.writeProjections ?? false
    });
  }

  /**
   * Get a high-level summary of the project status.
   */
  static async getProjectSummary() {
    return getSummary({ projectRoot: this.context.projectRoot });
  }

  /**
   * Resolve project status for a specific selector.
   */
  static async getStatus(selector: string, options: { type?: string | null, includeRelated?: boolean } = {}) {
    return resolveProjectStatus({
      projectRoot: this.context.projectRoot,
      selector,
      type: options.type ?? null,
      includeRelated: options.includeRelated ?? false,
      rawQuestion: false,
      relatedLimit: options.includeRelated ? 24 : 12
    });
  }

  /**
   * Search project entities and claims.
   */
  static async search(query: string) {
    return searchProject({ projectRoot: this.context.projectRoot, query });
  }

  /**
   * Discover exported symbols matching a pattern.
   */
  static async discoverExports(pattern: string | null = null) {
    return withWorkflowStore(this.context.projectRoot, async (store) => {
      const symbols = store.listSymbols();
      const filtered = symbols.filter((s: any) => 
        s.exported && (!pattern || s.name.includes(pattern) || s.filePath.includes(pattern))
      );
      return filtered.map((s: any) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        filePath: s.filePath,
        line: s.line
      }));
    });
  }

  /**
   * Get historical performance metrics.
   */
  static async getMetrics() {
    return getProjectMetrics({ projectRoot: this.context.projectRoot });
  }

  /**
   * Evaluate project readiness for a specific goal.
   */
  static async evaluateReadiness(goalType: string, question: string, options: any = {}) {
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

  // --- Codelet Discovery ---

  static isBuiltinCodelet(id: string): boolean {
    const registry: Record<string, boolean> = {
      "sync": true,
      "project-summary": true,
      "summary": true,
      "metrics": true,
      "search": true,
      "surface": true,
      "execute-ticket": true,
      "context-pack": true,
      "smart-run": true
    };
    return registry[id] === true;
  }

  static async runBuiltinCodelet(id: string, args: any): Promise<any> {
    switch (id) {
      case "sync": return this.sync(args);
      case "project-summary":
      case "summary": return this.getProjectSummary();
      case "metrics": return this.getMetrics();
      case "search": return this.search(args.query || args._[0]);
      case "surface": return this.discoverExports(args._[0]);
      case "execute-ticket": return this.executeTicket({ ticketId: args.ticket || args._[0], apply: Boolean(args.apply), timeoutMs: args["timeout-ms"] });
      case "context-pack": return this.contextPack({ ticket: args.ticket, changed: Boolean(args.changed), files: args.files ? String(args.files).split(",") : [] });
      case "smart-run": return this.smartRun(args);
      default: throw new Error(`Unknown builtin codelet: ${id}`);
    }
  }

  /**
   * Execute or plan a specific ticket.
   */
  static async executeTicket(options: executeTicket.ExecuteTicketOptions) {
    return executeTicket.run(options, this);
  }

  /**
   * Bundle project context for agent consumption.
   */
  static async contextPack(options: contextPack.ContextPackOptions) {
    return contextPack.run(options, this);
  }

  /**
   * Execute an AI-driven smart codelet.
   */
  static async smartRun(options: smartRun.SmartCodeletOptions) {
    return smartRun.run(options, this);
  }
}
