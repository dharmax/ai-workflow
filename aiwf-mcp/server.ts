#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createWorkflowCoreFacade } from "aiwf-common-core/services/workflow-facade";
import path from "node:path";
import { fileURLToPath } from "node:url";

function makeFacade(projectRoot?: string) {
  return createWorkflowCoreFacade({ projectRoot: projectRoot || process.cwd() });
}

export function registerAiWorkflowMcpTools(server: McpServer) {
  server.tool(
    "project_summary",
    "Return the DB-backed project summary with entity and predicate counts.",
    {
      projectRoot: z.string().optional()
    },
    async ({ projectRoot }) => {
      const result = await makeFacade(projectRoot).getSummary();
      return jsonResult(result);
    }
  );

  server.tool(
    "sync_project",
    "Sync the project into the workflow DB and optionally write textual projections.",
    {
      projectRoot: z.string().optional(),
      writeProjections: z.boolean().optional()
    },
    async ({ projectRoot, writeProjections }) => {
      const result = await makeFacade(projectRoot).sync({
        writeProjections: Boolean(writeProjections)
      });
      return jsonResult(result);
    }
  );

  server.tool(
    "extract_ticket",
    "Load a ticket plus its working set from the workflow DB and projections.",
    {
      projectRoot: z.string().optional(),
      ticketId: z.string(),
      limit: z.number().int().positive().optional()
    },
    async ({ projectRoot, ticketId, limit }) => {
      const result = await makeFacade(projectRoot).extractTicket(ticketId, { limit });
      return jsonResult(result);
    }
  );

  server.tool(
    "extract_guidelines",
    "Extract workflow guidance and active guardrails for a ticket or file set.",
    {
      projectRoot: z.string().optional(),
      ticket: z.string().optional(),
      changed: z.boolean().optional(),
      files: z.array(z.string()).optional()
    },
    async ({ projectRoot, ticket, changed, files }) => {
      const result = await makeFacade(projectRoot).extractGuidelines({
        ticket,
        changed: Boolean(changed),
        files
      });
      return jsonResult(result);
    }
  );

  server.tool(
    "project_status",
    "Resolve workflow-backed status for a project, ticket, epic, file, symbol, or related selector.",
    {
      projectRoot: z.string().optional(),
      selector: z.string(),
      type: z.string().optional(),
      includeRelated: z.boolean().optional()
    },
    async ({ projectRoot, selector, type, includeRelated }) => {
      const result = await makeFacade(projectRoot).resolveStatus(selector, {
        type,
        includeRelated: includeRelated ?? true
      });
      return jsonResult(result);
    }
  );

  server.tool(
    "route_task",
    "Return the cheapest-capable routed model choice for a task class.",
    {
      projectRoot: z.string().optional(),
      taskClass: z.string(),
      preferLocal: z.boolean().optional(),
      allowWeak: z.boolean().optional()
    },
    async ({ projectRoot, taskClass, preferLocal, allowWeak }) => {
      const result = await makeFacade(projectRoot).route(taskClass, {
        preferLocal: preferLocal ?? true,
        allowWeak: allowWeak ?? false
      });
      return jsonResult(result);
    }
  );

  server.tool(
    "knowledge_graph",
    "Export the richer ai-workflow knowledge graph snapshot and semantika-shaped projection.",
    {
      projectRoot: z.string().optional()
    },
    async ({ projectRoot }) => {
      const result = await makeFacade(projectRoot).exportKnowledgeGraph();
      return jsonResult(result);
    }
  );

  server.tool(
    "write_projections",
    "Write the bidirectional textual projections controlled by the workflow core.",
    {
      projectRoot: z.string().optional(),
      reconcileLegacy: z.boolean().optional()
    },
    async ({ projectRoot, reconcileLegacy }) => {
      const facade = makeFacade(projectRoot);
      if (reconcileLegacy) {
        await facade.reconcileTextualProjections();
      }
      const result = await facade.writeTextualProjections({
        reconcileLegacy: Boolean(reconcileLegacy)
      });
      return jsonResult(result);
    }
  );
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

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  await startServer();
}
