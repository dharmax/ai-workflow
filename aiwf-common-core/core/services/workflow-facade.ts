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
