#!/usr/bin/env bun
/**
 * Responsibility: Stdio MCP (Model Context Protocol) Server.
 * Scope: Exposes all domain tools and autonomous actor capabilities to host AI environments
 * (Google Antigravity, Claude Code, Cursor, Codex).
 */

import path from 'node:path';
import fs from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool as McpTool
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from '@dharmax/llm-utils';
import { WorkflowStore, findProjectRoot } from './graph/store.ts';
import { initializeTools, registry, type ToolContext } from './tools/index.ts';
import { WorkflowActor, type ShellMode } from './actor/engine.ts';

export interface McpServerOptions {
  store?: WorkflowStore;
  projectRoot?: string;
  actor?: WorkflowActor;
}

export function createMcpServer(options: McpServerOptions = {}) {
  const root = options.projectRoot || findProjectRoot().root;
  const store = options.store || new WorkflowStore(root);
  initializeTools();

  const actor = options.actor || new WorkflowActor({
    store,
    projectRoot: root,
    preferLocal: true
  });

  const server = new Server(
    {
      name: 'ai-workflow',
      version: '2.0.0'
    },
    {
      capabilities: {
        tools: {
          listChanged: true
        }
      }
    }
  );

  // 1. List Available Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: McpTool[] = [];

    // Autonomous wish tool
    tools.push({
      name: 'execute_shell_wish',
      description: 'Execute an autonomous coding wish or high-level task via AI-Workflow cognitive engine with automatic mode switching ([DESIGN], [DEV], [TRIAGE], [PRODUCT]).',
      inputSchema: {
        type: 'object',
        properties: {
          wish: {
            type: 'string',
            description: 'The natural language instruction, wish, or question to execute'
          },
          mode: {
            type: 'string',
            enum: ['design', 'dev', 'triage', 'product'],
            description: 'Optional manual mode override'
          }
        },
        required: ['wish']
      }
    });

    // Domain facilities from registry
    for (const t of registry.getAll()) {
      let schema: any = { type: 'object' };
      try {
        const conv = zodToJsonSchema(t.parameters as any);
        if (conv.ok && conv.schema) schema = conv.schema;
      } catch {}

      tools.push({
        name: t.name,
        description: `[${t.category.toUpperCase()}]: ${t.description}`,
        inputSchema: schema
      });
    }

    return { tools };
  });

  // 2. Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Dynamically resolve target project root if caller passed a file/path/target/projectRoot
    let activeRoot = root;
    let activeStore = store;
    const potentialPath = (args as any)?.projectRoot || (args as any)?.file || (args as any)?.path || (args as any)?.target;
    if (typeof potentialPath === 'string' && (path.isAbsolute(potentialPath) || fs.existsSync(potentialPath))) {
      try {
        const resolvedPath = path.resolve(potentialPath);
        const candidateDir = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()
          ? resolvedPath
          : path.dirname(resolvedPath);
        const found = findProjectRoot(candidateDir);
        if (found.root !== root) {
          activeRoot = found.root;
          activeStore = new WorkflowStore(activeRoot);
        }
      } catch {}
    }

    const ctx: ToolContext = {
      store: activeStore,
      projectRoot: activeRoot
    };

    try {
      if (name === 'execute_shell_wish') {
        const wish = String(args?.wish || '');
        const mode = args?.mode as ShellMode | undefined;
        const activeActor = activeRoot === root ? actor : new WorkflowActor({
          store: activeStore,
          projectRoot: activeRoot,
          preferLocal: true
        });
        const res = await activeActor.execute(wish, mode);

        let text = `### [AI-Workflow: ${res.mode.toUpperCase()}]\n${res.answer}`;
        if (res.stepsCount > 0) {
          text += `\n\n*Executed ${res.stepsCount} autonomous step(s).*`;
        }
        return {
          content: [{ type: 'text', text }]
        };
      }

      const tool = registry.get(name);
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool '${name}' is not registered in AI-Workflow.` }]
        };
      }

      const result = await registry.execute(name, args || {}, ctx);
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Execution error in '${name}': ${err.message}` }]
      };
    } finally {
      if (activeStore !== store) {
        try { activeStore.close(); } catch {}
      }
    }
  });

  return { server, store, actor, projectRoot: root };
}

/**
 * Generates lazy-loaded JSON tool schema definitions for MCP hosts (e.g. ~/.gemini/antigravity-cli/mcp/ai-workflow/).
 */
export function exportMcpSchemas(targetDir: string): string[] {
  fs.mkdirSync(targetDir, { recursive: true });
  initializeTools();
  const exportedFiles: string[] = [];

  // 1. Wish tool
  const wishSchema = {
    name: 'execute_shell_wish',
    description: 'Execute an autonomous coding wish or high-level task via AI-Workflow cognitive engine with automatic mode switching ([DESIGN], [DEV], [TRIAGE], [PRODUCT]).',
    parameters: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        wish: {
          type: 'string',
          description: 'The natural language instruction, wish, or question to execute'
        },
        mode: {
          type: 'string',
          enum: ['design', 'dev', 'triage', 'product'],
          description: 'Optional manual mode override'
        }
      },
      required: ['wish'],
      additionalProperties: false
    }
  };
  const wishPath = path.join(targetDir, 'execute_shell_wish.json');
  fs.writeFileSync(wishPath, JSON.stringify(wishSchema, null, 2), 'utf8');
  exportedFiles.push('execute_shell_wish.json');

  // 2. All domain tools
  for (const t of registry.getAll()) {
    let parameters: any = { type: 'object' };
    try {
      const conv = zodToJsonSchema(t.parameters as any);
      if (conv.ok && conv.schema) {
        parameters = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          ...conv.schema
        };
      }
    } catch {}

    const toolJson = {
      name: t.name,
      description: `[${t.category.toUpperCase()}]: ${t.description}`,
      parameters
    };
    const toolFilePath = path.join(targetDir, `${t.name}.json`);
    fs.writeFileSync(toolFilePath, JSON.stringify(toolJson, null, 2), 'utf8');
    exportedFiles.push(`${t.name}.json`);
  }

  return exportedFiles;
}

// Standalone execution entrypoint
if (import.meta.main) {
  const { server } = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

