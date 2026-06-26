import path from "node:path";
import { routeTask } from "./router.ts";
import {
  createTicket,
  getProjectMetrics,
  getProjectSummary,
  getSmartProjectStatus,
  listCodelets,
  getCodelet,
  searchCodelets,
  searchProject,
  syncProject,
  updateTicketLifecycle,
  withWorkflowStore
} from "./sync.ts";
import { executeCodelet } from "./codelet-executor.ts";
import { forgeProjectCodelet, removeProjectCodelet, upsertProjectCodelet } from "./codelets.ts";
import { importLegacyProjections, writeProjectProjections } from "./projections.ts";
import { buildTicketEntity, inferTicketLane } from "./projections.ts";
import { buildKnowledgeGraphSnapshot } from "./knowledge-graph.ts";
import { resolveProjectStatus } from "./status.ts";
import { run as runExtractTicket } from "../codelets/extract-ticket.ts";
import { run as runExtractGuidelines } from "../codelets/guidance-summary.ts";
import { planWorkTickets } from "./work-ticket-planner.ts";
import { planCodingWorkflow } from "./coding-workflow.ts";
import { executeTicket as executeWorkflowTicket, sweepBugs } from "./orchestrator.ts";
import { judgeArtifacts } from "./artifact-verification.ts";
import { readLatestRunArtifact } from "../lib/run-artifacts.ts";

export function createWorkflowCoreFacade({ projectRoot = process.cwd(), handlers = {} } = {}) {
  const root = path.resolve(String(projectRoot));
  const api = {
    syncProject,
    getProjectSummary,
    getSmartProjectStatus,
    getProjectMetrics,
    searchProject,
    listCodelets,
    getCodelet,
    searchCodelets,
    createTicket,
    updateTicketLifecycle,
    executeCodelet,
    forgeProjectCodelet,
    upsertProjectCodelet,
    removeProjectCodelet,
    routeTask,
    resolveProjectStatus,
    withWorkflowStore,
    writeProjectProjections,
    importLegacyProjections,
    extractTicket: runExtractTicket,
    extractGuidelines: runExtractGuidelines,
    planWorkTickets,
    planCodingWorkflow,
    executeWorkflowTicket,
    sweepBugs,
    judgeArtifacts,
    readLatestRunArtifact,
    ...handlers
  };

  return {
    projectRoot: root,

    async withStore(callback) {
      return api.withWorkflowStore(root, callback);
    },

    async sync(options = {}) {
      return api.syncProject({
        projectRoot: root,
        ...options
      });
    },

    async getSummary() {
      return api.getProjectSummary({ projectRoot: root });
    },

    async getSmartStatus() {
      return api.getSmartProjectStatus({ projectRoot: root });
    },

    async getMetrics() {
      return api.getProjectMetrics({ projectRoot: root });
    },

    async search(query, options = {}) {
      return api.searchProject({ projectRoot: root, query, ...options });
    },

    async capabilityCatalog() {
      const [summary, codelets, metrics] = await Promise.all([
        this.getSummary().catch((error) => ({ error: error?.message ?? String(error) })),
        this.listCodelets().catch(() => []),
        this.getMetrics().catch(() => null)
      ]);
      return {
        projectRoot: root,
        surfaces: {
          mcp: {
            coding: ["analyze_code", "review_code", "debug_issue", "plan_code_change", "refactor_code"],
            mutationGated: ["execute_ticket", "sweep_bugs", "run_codelet", "create_ticket", "update_ticket_lifecycle", "write_projections"],
            graph: ["search_project", "find_dependencies", "project_status", "knowledge_graph"],
            artifacts: ["search_artifacts", "judge_artifacts"],
            codelets: ["list_codelets", "get_codelet", "search_codelets", "run_codelet", "forge_project_codelet", "upsert_project_codelet", "remove_project_codelet"]
          }
        },
        indexed: {
          files: (summary as any)?.fileCount ?? null,
          symbols: (summary as any)?.symbolCount ?? null,
          claims: (summary as any)?.claimCount ?? null,
          codelets: Array.isArray(codelets) ? codelets.length : null
        },
        codelets,
        metrics
      };
    },

    async planCodeCapability(options: any = {}) {
      const text = String(options.text ?? options.goal ?? "").trim();
      const capability = String(options.capability ?? "plan_code_change");
      const query = String(options.query ?? text).trim();
      const [workflow, status, searchResults, codelets] = await Promise.all([
        api.planCodingWorkflow({
          projectRoot: root,
          text,
          parentTicketId: options.parentTicketId ?? null,
          artifacts: options.artifacts ?? [],
          files: options.files ?? [],
          mode: options.mode ?? capability,
          apply: false,
          surface: "mcp"
        }),
        query ? api.resolveProjectStatus({
          projectRoot: root,
          selector: query,
          type: options.type ?? null,
          includeRelated: true,
          rawQuestion: true,
          relatedLimit: options.relatedLimit ?? 12
        }).catch((error) => ({ ok: false, error: error?.message ?? String(error) })) : Promise.resolve(null),
        query ? api.searchProject({ projectRoot: root, query, limit: options.limit ?? 12 }).catch(() => []) : Promise.resolve([]),
        query ? api.searchCodelets({ projectRoot: root, query, limit: 8 }).catch(() => []) : Promise.resolve([])
      ]);
      return {
        ok: true,
        dryRun: true,
        capability,
        workflow,
        status,
        searchResults,
        suggestedCodelets: codelets,
        mutation: {
          allowed: false,
          reason: "Coding MCP analysis tools are dry-run. Use execute_ticket, sweep_bugs, or run_codelet with apply and allowMutation for writes."
        }
      };
    },

    async listTickets(options = {}) {
      return api.withWorkflowStore(root, async (store) => {
        const includeArchived = Boolean((options as any).includeArchived);
        return store.listEntities({ entityType: "ticket" })
          .filter((ticket: any) => includeArchived || !["Done", "Archived"].includes(String(ticket.lane ?? "")))
          .sort((left: any, right: any) => String(left.lane ?? "").localeCompare(String(right.lane ?? "")) || String(left.id).localeCompare(String(right.id)));
      });
    },

    async createTicket(options: any = {}) {
      if (!options.apply) {
        return {
          ok: true,
          dryRun: true,
          ticket: buildTicketEntity({
            id: options.id,
            title: options.title,
            lane: inferTicketLane({ id: options.id, title: options.title, lane: options.lane ?? null }),
            epicId: options.epicId ?? null,
            summary: options.summary ?? ""
          })
        };
      }
      const entity = buildTicketEntity({
        id: options.id,
        title: options.title,
        lane: inferTicketLane({ id: options.id, title: options.title, lane: options.lane ?? null }),
        epicId: options.epicId ?? null,
        summary: options.summary ?? ""
      });
      const ticket = await api.createTicket({ projectRoot: root, entity });
      await this.writeTextualProjections();
      return { ok: true, dryRun: false, ticket };
    },

    async updateTicketLifecycle(options: any = {}) {
      if (!options.apply) {
        return {
          ok: true,
          dryRun: true,
          ticketId: options.ticketId,
          action: options.action,
          lane: options.lane ?? null
        };
      }
      const ticket = await api.updateTicketLifecycle({
        projectRoot: root,
        ticketId: options.ticketId,
        action: options.action,
        lane: options.lane ?? null
      });
      return { ok: true, dryRun: false, ticket };
    },

    async listCodelets(options = {}) {
      return api.listCodelets({ projectRoot: root, ...(options as any) });
    },

    async getCodelet(codeletId: string) {
      return api.getCodelet({ projectRoot: root, codeletId });
    },

    async searchCodelets(query: string, options = {}) {
      return api.searchCodelets({ projectRoot: root, query, ...(options as any) });
    },

    async runCodelet(options: any = {}) {
      const codelet = await api.getCodelet({ projectRoot: root, codeletId: options.codeletId });
      if (!codelet) {
        return { ok: false, refusalReason: `Unknown codelet: ${options.codeletId}`, requiredFlags: [] };
      }
      const requiredFlags = getCodeletMutationRequiredFlags(codelet);
      const canMutate = Boolean(codelet.canMutate ?? codelet.data?.canMutate);
      if (canMutate) {
        const missingFlags = requiredFlags.filter((flag) => !hasRequiredFlag(options.args ?? {}, flag));
        if (!options.allowMutation || missingFlags.length) {
          return {
            ok: false,
            refusalReason: "Mutating codelet requires allowMutation and manifest-required flags.",
            requiredFlags
          };
        }
      }
      const result = await api.executeCodelet(codelet, options.args ?? {}, {
        cwd: root,
        env: process.env,
        mode: options.mode ?? "capture"
      });
      return { ok: true, result };
    },

    async forgeProjectCodelet(options: any = {}) {
      if (!options.apply) {
        return { ok: true, dryRun: true, name: options.name, wouldWrite: [`.ai-workflow/staged-codelets/${options.name}.js`, `.ai-workflow/codelets/${options.name}.json`] };
      }
      const codelet = await api.forgeProjectCodelet(root, options.name);
      await this.sync({ writeProjections: false });
      return { ok: true, dryRun: false, codelet };
    },

    async upsertProjectCodelet(options: any = {}) {
      if (!options.apply) {
        return { ok: true, dryRun: true, name: options.name, entry: options.entry };
      }
      const codelet = await api.upsertProjectCodelet(root, options.name, options.entry, options.mode ?? "update");
      await this.sync({ writeProjections: false });
      return { ok: true, dryRun: false, codelet };
    },

    async removeProjectCodelet(options: any = {}) {
      if (!options.apply) {
        return { ok: true, dryRun: true, name: options.name };
      }
      await api.removeProjectCodelet(root, options.name);
      await this.sync({ writeProjections: false });
      return { ok: true, dryRun: false, name: options.name };
    },

    async resolveStatus(selector, options = {}) {
      return api.resolveProjectStatus({ projectRoot: root, selector, ...options });
    },

    async route(taskClass, options = {}) {
      return api.routeTask({ root, taskClass, ...options });
    },

    async findDependencies(options: any = {}) {
      const query = String(options.query ?? options.selector ?? "").trim();
      const limit = Number(options.limit ?? 20);
      const [status, searchResults, graph] = await Promise.all([
        query ? this.resolveStatus(query, {
          type: options.type ?? null,
          includeRelated: true,
          relatedLimit: limit
        }).catch((error) => ({ ok: false, error: error?.message ?? String(error), query })) : Promise.resolve({ ok: false, error: "query is required", query }),
        query ? this.search(query, { limit }).catch(() => []) : Promise.resolve([]),
        this.exportKnowledgeGraph().catch(() => null)
      ]);
      return {
        ok: Boolean((status as any)?.ok) || (Array.isArray(searchResults) && searchResults.length > 0),
        query,
        status,
        searchResults,
        graphSummary: graph ? {
          nodes: (graph as any).nodes?.length ?? (graph as any).entities?.length ?? null,
          edges: (graph as any).edges?.length ?? (graph as any).predicates?.length ?? null
        } : null
      };
    },

    async searchArtifacts(options: any = {}) {
      const query = String(options.query ?? "artifact").trim();
      const limit = Number(options.limit ?? 20);
      return api.withWorkflowStore(root, async (store) => {
        const latest = await api.readLatestRunArtifact(root).catch(() => null);
        const testRuns = store.listTestRuns()
          .filter((run: any) => {
            if (!run.artifactRef) return false;
            if (!query) return true;
            const haystack = [run.id, run.runId, run.testId, run.targetId, run.label, run.summary, run.artifactRef, JSON.stringify(run.details ?? {})].join("\n").toLowerCase();
            return haystack.includes(query.toLowerCase());
          })
          .slice(0, limit);
        const searchResults = query ? store.search(query, { limit }) : [];
        return {
          ok: true,
          query,
          latestRunArtifact: latest,
          testRunArtifacts: testRuns,
          searchResults
        };
      });
    },

    async judgeArtifacts(options: any = {}) {
      return api.judgeArtifacts({
        projectRoot: root,
        artifactPaths: options.artifactPaths ?? options.artifacts ?? [],
        rubric: options.rubric,
        goal: options.goal ?? null,
        providerId: options.providerId ?? null,
        modelId: options.modelId ?? null,
        forceRouteRefresh: Boolean(options.forceRouteRefresh)
      });
    },

    async executeTicket(options: any = {}) {
      const apply = Boolean(options.apply);
      const allowMutation = Boolean(options.allowMutation);
      if (!apply || !allowMutation) {
        const ticket = await this.extractTicket(options.ticketId, { limit: options.limit ?? 12 }).catch((error) => ({ error: error?.message ?? String(error) }));
        return {
          ok: false,
          dryRun: true,
          refusalReason: "execute_ticket requires apply: true and allowMutation: true.",
          requiredFlags: [{ path: "apply", value: true }, { path: "allowMutation", value: true }],
          ticket
        };
      }
      const result = await api.executeWorkflowTicket({
        root,
        ticketId: options.ticketId,
        apply: true,
        verificationTimeoutMs: options.verificationTimeoutMs
      });
      return { ok: Boolean(result?.success), dryRun: false, result };
    },

    async sweepBugs(options: any = {}) {
      const apply = Boolean(options.apply);
      const allowMutation = Boolean(options.allowMutation);
      if (!apply || !allowMutation) {
        const tickets = await this.listTickets({ includeArchived: false });
        return {
          ok: false,
          dryRun: true,
          refusalReason: "sweep_bugs requires apply: true and allowMutation: true.",
          requiredFlags: [{ path: "apply", value: true }, { path: "allowMutation", value: true }],
          candidateBugs: tickets.filter((ticket: any) => ticket.lane === "Todo" && (/bug/i.test(ticket.title ?? "") || /^BUG/.test(ticket.id ?? "")))
        };
      }
      const report = await api.sweepBugs({
        root,
        verificationTimeoutMs: options.verificationTimeoutMs
      });
      return { ok: true, dryRun: false, report };
    },

    async writeTextualProjections(options = {}) {
      return api.withWorkflowStore(root, async (store) =>
        api.writeProjectProjections(store, { projectRoot: root, ...options })
      );
    },

    async reconcileTextualProjections() {
      return api.withWorkflowStore(root, async (store) =>
        api.importLegacyProjections(store, { projectRoot: root })
      );
    },

    async readTextualProjectionState() {
      return api.withWorkflowStore(root, async (store) => ({
        lastProjectionDigest: store.getMeta("lastProjectionDigest", null),
        mission: Boolean(store.getMeta("mission", null)),
        gemini: Boolean(store.getMeta("gemini", null)),
        projections: [
          "kanban.md",
          "epics.md",
          "MISSION.md",
          ".gemini/GEMINI.md",
          "GEMINI.md"
        ].map((filePath) => ({
          filePath,
          present: Boolean(
            filePath === "MISSION.md"
              ? store.getMeta("mission", null)
              : filePath === ".gemini/GEMINI.md" || filePath === "GEMINI.md"
                ? store.getMeta("gemini", null)
                : store.getFile(filePath)
          )
        }))
      }));
    },

    async exportKnowledgeGraph() {
      return api.withWorkflowStore(root, async (store) =>
        buildKnowledgeGraphSnapshot(store, { projectRoot: root })
      );
    },

    async extractTicket(ticketId, options = {}) {
      return api.extractTicket(
        { ticketId, ...options },
        { context: { projectRoot: root } }
      );
    },

    async extractGuidelines(options = {}) {
      return api.extractGuidelines(
        { root, ...options },
        { context: { projectRoot: root } }
      );
    },

    async planWorkTickets(options = {}) {
      return api.planWorkTickets({ projectRoot: root, ...options });
    },

    async planCodingWorkflow(options = {}) {
      return api.planCodingWorkflow({ projectRoot: root, ...options });
    }
  };
}

function getCodeletMutationRequiredFlags(codelet: any) {
  const required = codelet.requiredFlags ?? codelet.data?.requiredFlags;
  if (Array.isArray(required) && required.length) {
    return required;
  }
  return Boolean(codelet.canMutate ?? codelet.data?.canMutate)
    ? [{ path: "args.apply", value: true }]
    : [];
}

function hasRequiredFlag(args: any, flag: any): boolean {
  const path = String(flag?.path ?? "").replace(/^args\./, "").split(".").filter(Boolean);
  let current = args;
  for (const key of path) {
    current = current?.[key];
  }
  return current === (flag?.value ?? true);
}
