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
import { getPublicMcpTools, PUBLIC_MCP_TOOL_NAMES } from './tools/surface.ts';
import { WorkflowActor, type ShellMode } from './actor/engine.ts';
import { MCP_INSTRUCTIONS_2_0 } from './client-guidance.ts';
import { SemanticPackage } from '@dharmax/semantika';

function withProjectRoot(schema: McpTool['inputSchema']): McpTool['inputSchema'] {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      projectRoot: {type: 'string', description: 'Optional target project directory, absolute or relative to the MCP server project. Use this for sibling repositories; filePath is relative to this project.'}
    },
    ...(Array.isArray(schema.oneOf) ? {oneOf: schema.oneOf.map(branch => withProjectRoot(branch as McpTool['inputSchema']))} : {})
  };
}

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
      instructions: MCP_INSTRUCTIONS_2_0,
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
      inputSchema: withProjectRoot({
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
      })
    });

    // Domain facilities from registry
    for (const t of getPublicMcpTools(registry)) {
      let schema: any = { type: 'object' };
      try {
        const conv = zodToJsonSchema(t.parameters as any);
        if (conv.ok && conv.schema) schema = { ...conv.schema, type: 'object' };
      } catch {}

      tools.push({
        name: t.name,
        description: `[${t.category.toUpperCase()}]: ${t.description}`,
        inputSchema: withProjectRoot(schema)
      });
    }

    return { tools };
  });

  // 2. Call Tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const {projectRoot: requestedRoot, ...toolArgs} = args || {};
    let activeRoot = root;
    let activeStore = store;

    try {
      if (requestedRoot !== undefined) {
        if (typeof requestedRoot !== 'string' || !requestedRoot.trim()) throw new Error('projectRoot must be a non-empty directory path.');
        activeRoot = path.resolve(root, requestedRoot);
        if (!fs.existsSync(activeRoot) || !fs.statSync(activeRoot).isDirectory()) throw new Error(`Project directory not found: ${requestedRoot}`);
      } else {
        const potentialPath = toolArgs.filePath || toolArgs.file || toolArgs.path || toolArgs.target;
        if (typeof potentialPath === 'string') {
          const resolvedPath = path.resolve(root, potentialPath);
          if (fs.existsSync(resolvedPath)) {
            const candidateDir = fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
            activeRoot = findProjectRoot(candidateDir).root;
            if (toolArgs.filePath === potentialPath) toolArgs.filePath = path.relative(activeRoot, resolvedPath);
          }
        }
      }
      if (activeRoot !== root) {
        activeStore = new WorkflowStore(activeRoot);
        await activeStore.sp.ready();
      }
      const ctx: ToolContext = {store: activeStore, projectRoot: activeRoot};

      if (name === 'execute_shell_wish') {
        const wish = String(toolArgs.wish || '');
        const mode = toolArgs.mode as ShellMode | undefined;
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

      if (!PUBLIC_MCP_TOOL_NAMES.has(name)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool '${name}' is not exposed by the AI-Workflow MCP surface.` }]
        };
      }

      const tool = registry.get(name);
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool '${name}' is not registered in AI-Workflow.` }]
        };
      }

      const result = await registry.execute(name, toolArgs, ctx);
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
        // SemanticArtifact resolves its package by name; do not leave the host bound to a closed sibling store.
        SemanticPackage.semanticPackages[store.sp.name] = store.sp;
      }
    }
  });

  return { server, store, actor, projectRoot: root };
}

/**
 * Generates lazy-loaded JSON tool schema definitions for MCP hosts (e.g. ~/.gemini/antigravity-cli/mcp/ai-workflow/).
 */
export function buildMcpSchemas(): Record<string, string> {
  initializeTools();
  const schemas: Record<string, string> = {};

  // 1. Wish tool
  const wishSchema = {
    name: 'execute_shell_wish',
    description: 'Execute an autonomous coding wish or high-level task via AI-Workflow cognitive engine with automatic mode switching ([DESIGN], [DEV], [TRIAGE], [PRODUCT]).',
    parameters: withProjectRoot({
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
    })
  };
  schemas['execute_shell_wish.json'] = JSON.stringify(wishSchema, null, 2);

  // 2. All domain tools
  for (const t of getPublicMcpTools(registry)) {
    let parameters: any = { type: 'object' };
    try {
      const conv = zodToJsonSchema(t.parameters as any);
      if (conv.ok && conv.schema) {
        parameters = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          ...conv.schema,
          type: 'object'
        };
      }
    } catch {}

    const toolJson = {
      name: t.name,
      description: `[${t.category.toUpperCase()}]: ${t.description}`,
      parameters: withProjectRoot(parameters)
    };
    schemas[`${t.name}.json`] = JSON.stringify(toolJson, null, 2);
  }

  return schemas;
}

// Standalone execution entrypoint
if (import.meta.main) {
  const { server } = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function exportMcpSchemas(targetDir: string): string[] {
  const schemas = buildMcpSchemas();
  fs.mkdirSync(targetDir, {recursive: true});
  for (const name of fs.readdirSync(targetDir)) {
    if (name.endsWith('.json') && !Object.hasOwn(schemas, name)) fs.unlinkSync(path.join(targetDir, name));
  }
  for (const [name, content] of Object.entries(schemas)) {
    const filePath = path.join(targetDir, name);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content) fs.writeFileSync(filePath, content, 'utf8');
  }
  return Object.keys(schemas);
}
