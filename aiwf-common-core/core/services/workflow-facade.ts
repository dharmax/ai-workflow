import path from "node:path";
import { routeTask } from "./router.ts";
import {
  getProjectMetrics,
  getProjectSummary,
  getSmartProjectStatus,
  searchProject,
  syncProject,
  withWorkflowStore
} from "./sync.ts";
import { importLegacyProjections, writeProjectProjections } from "./projections.ts";
import { buildKnowledgeGraphSnapshot } from "./knowledge-graph.ts";
import { resolveProjectStatus } from "./status.ts";
import { run as runExtractTicket } from "../codelets/extract-ticket.ts";
import { run as runExtractGuidelines } from "../codelets/guidance-summary.ts";

export function createWorkflowCoreFacade({ projectRoot = process.cwd(), handlers = {} } = {}) {
  const root = path.resolve(String(projectRoot));
  const api = {
    syncProject,
    getProjectSummary,
    getSmartProjectStatus,
    getProjectMetrics,
    searchProject,
    routeTask,
    resolveProjectStatus,
    withWorkflowStore,
    writeProjectProjections,
    importLegacyProjections,
    extractTicket: runExtractTicket,
    extractGuidelines: runExtractGuidelines,
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
    }
  };
}
