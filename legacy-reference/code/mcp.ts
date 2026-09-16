#!/usr/bin/env bun
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { WorkflowStore } from './store.ts';
import { CodeletEngine } from './compiler.ts';
import { LocalGitTransport } from './transport.ts';
import { DecisionManager } from './decisions.ts';
import { MetricsCollector } from './metrics.ts';
import { registry, type CommandContext } from './registry.ts';

export function createAiWorkflowMcpServer(projectRoot: string = process.cwd()) {
  const store = new WorkflowStore(projectRoot);
  const compiler = new CodeletEngine(store);
  const decisions = new DecisionManager(store);
  const transport = new LocalGitTransport(store);
  const metrics = new MetricsCollector(store);

  const ctx: CommandContext = {
    store,
    compiler,
    decisions,
    transport,
    metrics,
    projectRoot
  };

  const server = new McpServer({
    name: 'ai-workflow',
    version: '1.0.0'
  });

  // Automatically register all capabilities from the central registry
  for (const cap of registry.getAll()) {
    const shape = (cap.schema instanceof z.ZodObject) ? cap.schema.shape : {};
    server.tool(cap.name, cap.description, shape, async (args: any) => {
      try {
        const result = await cap.handler(ctx, args);
        const text = typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2);
        return {
          content: [{ type: 'text', text }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error executing ${cap.name}: ${err.message}` }]
        };
      }
    });
  }

  // Shell execution tool for autonomous directives
  server.tool('execute_shell_wish', 'Execute an autonomous wish or command through the ai-workflow Shell Engine', {
    wish: z.string()
  }, async ({ wish }) => {
    const { InteractiveShell } = await import('./shell.ts');
    const shell = new InteractiveShell(store);
    const output = await shell.executeCommand(wish);
    return {
      content: [{ type: 'text', text: output }]
    };
  });

  return { server, store, compiler, decisions, metrics, transport };
}

export async function runMcpStdio(projectRoot?: string) {
  if (process.stdin.isTTY) {
    process.stderr.write('\x1b[1;36mai-workflow MCP server is running on stdio (listening for host JSON-RPC)...\x1b[0m\n');
    process.stderr.write('\x1b[33mNote: This process is launched automatically by AI clients (Claude Desktop, Cursor, Gemini CLI, Claude Code).\x1b[0m\n');
    process.stderr.write('Run \x1b[1;32maiwf setup\x1b[0m to see client configurations. Press \x1b[1mCtrl+C\x1b[0m to exit.\n\n');
  }
  const { server } = createAiWorkflowMcpServer(projectRoot);
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

if (import.meta.main) {
  runMcpStdio().catch(err => {
    console.error('MCP Server Error:', err);
    process.exit(1);
  });
}
