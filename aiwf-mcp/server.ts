#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWorkflowCoreFacade } from "aiwf-common-core/services/workflow-facade";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AI_WORKFLOW_MCP_TOOL_NAMES = [
  "project_summary",
  "sync_project",
  "search_project",
  "plugin_status",
  "list_tickets",
  "create_ticket",
  "update_ticket_lifecycle",
  "extract_ticket",
  "extract_guidelines",
  "plan_work_tickets",
  "plan_coding_workflow",
  "project_status",
  "route_task",
  "knowledge_graph",
  "write_projections",
  "list_codelets",
  "get_codelet",
  "search_codelets",
  "run_codelet",
  "forge_project_codelet",
  "upsert_project_codelet",
  "remove_project_codelet"
] as const;

function makeFacade(projectRoot?: string) {
  return createWorkflowCoreFacade({ projectRoot: projectRoot || process.cwd() });
}

export function registerAiWorkflowMcpTools(server: McpServer) {
  server.tool("project_summary", "Return the DB-backed project summary with entity and predicate counts.", {
    projectRoot: z.string().optional()
  }, async ({ projectRoot }) => jsonResult(await makeFacade(projectRoot).getSummary()));

  server.tool("sync_project", "Sync the project into the workflow DB and optionally write textual projections.", {
    projectRoot: z.string().optional(),
    writeProjections: z.boolean().optional()
  }, async ({ projectRoot, writeProjections }) => jsonResult(await makeFacade(projectRoot).sync({
    writeProjections: Boolean(writeProjections)
  })));

  server.tool("search_project", "Search the DB-backed project graph, files, tickets, notes, and codelet index.", {
    projectRoot: z.string().optional(),
    query: z.string(),
    limit: z.number().int().positive().optional()
  }, async ({ projectRoot, query, limit }) => jsonResult(await makeFacade(projectRoot).search(query, { limit })));

  server.tool("plugin_status", "Report MCP inventory, indexed codelets, Bun runtime, SQLite adapter, and readiness verdict.", {
    projectRoot: z.string().optional()
  }, async ({ projectRoot }) => jsonResult(await buildPluginStatus(projectRoot)));

  server.tool("list_tickets", "List workflow tickets from the DB. Archived/Done tickets are omitted unless includeArchived is true.", {
    projectRoot: z.string().optional(),
    includeArchived: z.boolean().optional()
  }, async ({ projectRoot, includeArchived }) => jsonResult(await makeFacade(projectRoot).listTickets({ includeArchived })));

  server.tool("create_ticket", "Create a workflow ticket. Dry-run by default; set apply true to persist and refresh projections.", {
    projectRoot: z.string().optional(),
    id: z.string(),
    title: z.string(),
    lane: z.string().optional(),
    epicId: z.string().optional(),
    summary: z.string().optional(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, id, title, lane, epicId, summary, apply }) => jsonResult(await makeFacade(projectRoot).createTicket({
    id,
    title,
    lane,
    epicId,
    summary,
    apply: Boolean(apply)
  })));

  server.tool("update_ticket_lifecycle", "Move, resolve, or reopen a workflow ticket. Dry-run by default; set apply true to persist.", {
    projectRoot: z.string().optional(),
    ticketId: z.string(),
    action: z.enum(["move", "start", "resolve", "reopen"]),
    lane: z.string().optional(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, ticketId, action, lane, apply }) => jsonResult(await makeFacade(projectRoot).updateTicketLifecycle({
    ticketId,
    action: action === "start" ? "move" : action,
    lane: action === "start" ? "In Progress" : lane,
    apply: Boolean(apply)
  })));

  server.tool("extract_ticket", "Load a ticket plus its working set from the workflow DB and projections.", {
    projectRoot: z.string().optional(),
    ticketId: z.string(),
    limit: z.number().int().positive().optional()
  }, async ({ projectRoot, ticketId, limit }) => jsonResult(await makeFacade(projectRoot).extractTicket(ticketId, { limit })));

  server.tool("extract_guidelines", "Extract workflow guidance and active guardrails for a ticket or file set.", {
    projectRoot: z.string().optional(),
    ticket: z.string().optional(),
    changed: z.boolean().optional(),
    files: z.array(z.string()).optional()
  }, async ({ projectRoot, ticket, changed, files }) => jsonResult(await makeFacade(projectRoot).extractGuidelines({
    ticket,
    changed: Boolean(changed),
    files
  })));

  server.tool("plan_work_tickets", "Plan deterministic linked work tickets. Dry-run by default; set apply true to persist tickets and graph links.", {
    projectRoot: z.string().optional(),
    goal: z.string(),
    parentTicketId: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    mode: z.string().optional(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, goal, parentTicketId, artifacts, files, mode, apply }) => jsonResult(await makeFacade(projectRoot).planWorkTickets({
    goal,
    parentTicketId: parentTicketId ?? null,
    artifacts: artifacts ?? [],
    files: files ?? [],
    mode: mode ?? "implementation",
    apply: Boolean(apply)
  })));

  server.tool("plan_coding_workflow", "Return the shared normalized coding/review/debug workflow plan. Dry-run by default.", {
    projectRoot: z.string().optional(),
    text: z.string(),
    parentTicketId: z.string().optional(),
    artifacts: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    mode: z.string().optional(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, text, parentTicketId, artifacts, files, mode, apply }) => jsonResult(await makeFacade(projectRoot).planCodingWorkflow({
    text,
    parentTicketId: parentTicketId ?? null,
    artifacts: artifacts ?? [],
    files: files ?? [],
    mode: mode ?? "implementation",
    apply: Boolean(apply),
    surface: "mcp"
  })));

  server.tool("project_status", "Resolve workflow-backed status for a project, ticket, epic, file, symbol, or related selector.", {
    projectRoot: z.string().optional(),
    selector: z.string(),
    type: z.string().optional(),
    includeRelated: z.boolean().optional()
  }, async ({ projectRoot, selector, type, includeRelated }) => jsonResult(await makeFacade(projectRoot).resolveStatus(selector, {
    type,
    includeRelated: includeRelated ?? true
  })));

  server.tool("route_task", "Return the cheapest-capable routed model choice for a task class.", {
    projectRoot: z.string().optional(),
    taskClass: z.string(),
    preferLocal: z.boolean().optional(),
    allowWeak: z.boolean().optional()
  }, async ({ projectRoot, taskClass, preferLocal, allowWeak }) => jsonResult(await makeFacade(projectRoot).route(taskClass, {
    preferLocal: preferLocal ?? true,
    allowWeak: allowWeak ?? false
  })));

  server.tool("knowledge_graph", "Export the richer ai-workflow knowledge graph snapshot and semantika-shaped projection.", {
    projectRoot: z.string().optional()
  }, async ({ projectRoot }) => jsonResult(await makeFacade(projectRoot).exportKnowledgeGraph()));

  server.tool("write_projections", "Write the bidirectional textual projections controlled by the workflow core.", {
    projectRoot: z.string().optional(),
    reconcileLegacy: z.boolean().optional()
  }, async ({ projectRoot, reconcileLegacy }) => {
    const facade = makeFacade(projectRoot);
    if (reconcileLegacy) await facade.reconcileTextualProjections();
    return jsonResult(await facade.writeTextualProjections({ reconcileLegacy: Boolean(reconcileLegacy) }));
  });

  server.tool("list_codelets", "List registered toolkit and project codelets from the DB registry.", {
    projectRoot: z.string().optional(),
    sourceKind: z.string().optional()
  }, async ({ projectRoot, sourceKind }) => jsonResult(await makeFacade(projectRoot).listCodelets({ sourceKind: sourceKind ?? null })));

  server.tool("get_codelet", "Return a registered codelet manifest and variants by id.", {
    projectRoot: z.string().optional(),
    codeletId: z.string()
  }, async ({ projectRoot, codeletId }) => jsonResult(await makeFacade(projectRoot).getCodelet(codeletId)));

  server.tool("search_codelets", "Search registered toolkit and project codelets.", {
    projectRoot: z.string().optional(),
    query: z.string(),
    sourceKind: z.string().optional(),
    limit: z.number().int().positive().optional()
  }, async ({ projectRoot, query, sourceKind, limit }) => jsonResult(await makeFacade(projectRoot).searchCodelets(query, {
    sourceKind: sourceKind ?? null,
    limit
  })));

  server.tool("run_codelet", "Run a registered codelet. Mutating codelets require allowMutation and manifest-required args such as args.apply true.", {
    projectRoot: z.string().optional(),
    codeletId: z.string(),
    args: z.record(z.string(), z.any()).optional(),
    mode: z.enum(["capture", "stream"]).optional(),
    allowMutation: z.boolean().optional()
  }, async ({ projectRoot, codeletId, args, mode, allowMutation }) => jsonResult(await makeFacade(projectRoot).runCodelet({
    codeletId,
    args: args ?? {},
    mode,
    allowMutation: Boolean(allowMutation)
  })));

  server.tool("forge_project_codelet", "Forge a staged project codelet. Dry-run by default; set apply true to write files and refresh the registry.", {
    projectRoot: z.string().optional(),
    name: z.string(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, name, apply }) => jsonResult(await makeFacade(projectRoot).forgeProjectCodelet({ name, apply: Boolean(apply) })));

  server.tool("upsert_project_codelet", "Create or update a project codelet manifest for an existing entry file. Dry-run by default; set apply true to persist.", {
    projectRoot: z.string().optional(),
    name: z.string(),
    entry: z.string(),
    mode: z.string().optional(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, name, entry, mode, apply }) => jsonResult(await makeFacade(projectRoot).upsertProjectCodelet({
    name,
    entry,
    mode,
    apply: Boolean(apply)
  })));

  server.tool("remove_project_codelet", "Remove a project codelet manifest. Dry-run by default; set apply true to persist.", {
    projectRoot: z.string().optional(),
    name: z.string(),
    apply: z.boolean().optional()
  }, async ({ projectRoot, name, apply }) => jsonResult(await makeFacade(projectRoot).removeProjectCodelet({ name, apply: Boolean(apply) })));
}

export function getAiWorkflowMcpToolNames() {
  return [...AI_WORKFLOW_MCP_TOOL_NAMES];
}

async function buildPluginStatus(projectRoot?: string) {
  const facade = makeFacade(projectRoot);
  const codelets = await facade.listCodelets().catch(() => []);
  const runtime = {
    bun: typeof Bun !== "undefined" ? Bun.version : null,
    argv0: process.argv[0],
    isBun: typeof Bun !== "undefined"
  };
  const missingExpectedTools: string[] = [];
  return {
    ok: missingExpectedTools.length === 0 && runtime.isBun,
    readiness: missingExpectedTools.length === 0 && runtime.isBun ? "ready" : "not_ready",
    exposedTools: getAiWorkflowMcpToolNames(),
    expectedTools: getAiWorkflowMcpToolNames(),
    missingExpectedTools,
    indexedCodelets: codelets.length,
    runtime,
    dbAdapter: {
      name: "bun:sqlite",
      status: "configured"
    }
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export async function startServer() {
  const server = new McpServer({
    name: "aiwf-mcp",
    version: "0.1.0"
  });
  registerAiWorkflowMcpTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  await startServer();
}
