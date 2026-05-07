/**
 * Responsibility: Initialize the ServiceHub with all toolkit capabilities.
 */

import { ServiceHub } from "./service-hub.ts";
import { CoreLLM } from "./core-llm.ts";
import { KanbanManager } from "./kanban-manager.ts";
import { TerminalContext } from "./terminal-context.ts";
import { ProtocolEnforcer } from "./protocol-enforcer.ts";

import * as guidance from "../codelets/guidance-summary.ts";
import * as sync from "../codelets/sync.ts";
import * as summary from "../codelets/project-summary.ts";
import * as kanban from "../codelets/kanban.ts";
import * as metrics from "../codelets/metrics.ts";
import * as executeTicket from "../codelets/execute-ticket.ts";
import * as contextPack from "../codelets/context-pack.ts";
import * as smartRun from "../codelets/smart-codelet-runner.ts";
import * as status from "../codelets/status.ts";
import * as discovery from "../codelets/discovery.ts";
import * as dogfood from "../codelets/dogfood.ts";
import * as audit from "../codelets/workflow-audit.ts";
import * as extractTicket from "../codelets/extract-ticket.ts";
import * as search from "../codelets/search.ts";

export function initializeRegistry() {
  // --- Infrastructure Services ---
  ServiceHub.register("llm", new CoreLLM(ServiceHub.context));
  ServiceHub.register("kanban", new KanbanManager(ServiceHub.context));
  ServiceHub.register("terminal", TerminalContext);
  ServiceHub.register("enforcer", new ProtocolEnforcer(ServiceHub.context));

  // --- Codelets ---
    ServiceHub.register("extract-guidelines", guidance);
  ServiceHub.register("sync", sync);
  ServiceHub.register("project-summary", summary);
  ServiceHub.register("summary", summary);
  ServiceHub.register("kanban-ops", kanban);
  ServiceHub.register("metrics", metrics);
  ServiceHub.register("execute-ticket", executeTicket);
  ServiceHub.register("context-pack", contextPack);
  ServiceHub.register("smart-run", smartRun);
  ServiceHub.register("status", status);
  ServiceHub.register("surface", discovery);
  ServiceHub.register("dogfood", dogfood);
  ServiceHub.register("audit", audit);
  ServiceHub.register("extract-ticket", extractTicket);
  ServiceHub.register("search", search);
}
