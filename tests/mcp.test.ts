import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { createMcpServer } from '../src/mcp.ts';
import { WorkflowActor } from '../src/actor/engine.ts';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

describe('Stdio MCP Server Bridge', () => {
  let tempDir: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-mcp-test-'));
    store = new WorkflowStore(tempDir, true);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should list all tools including execute_shell_wish and domain facilities', async () => {
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      offline: true
    });

    const { server } = createMcpServer({
      store,
      projectRoot: tempDir,
      actor
    });

    // In-memory request simulation against MCP server internal handler
    const handler = (server as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
    expect(handler).toBeDefined();

    const response = await handler({ method: 'tools/list', params: {} });
    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBeGreaterThanOrEqual(16);

    const wishTool = response.tools.find((t: any) => t.name === 'execute_shell_wish');
    expect(wishTool).toBeDefined();
    expect(wishTool.description).toContain('AI-Workflow cognitive engine');

    const ticketTool = response.tools.find((t: any) => t.name === 'claim_ticket');
    expect(ticketTool).toBeDefined();
  });

  it('should call domain tools through the MCP request handler', async () => {
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      offline: true
    });

    const { server } = createMcpServer({
      store,
      projectRoot: tempDir,
      actor
    });

    const callHandler = (server as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
    expect(callHandler).toBeDefined();

    // 1. Call recommend_next_task
    const recRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'recommend_next_task',
        arguments: {}
      }
    });

    expect(recRes.content).toBeDefined();
    expect(recRes.content[0].text).toContain('reason');

    // 2. Call execute_shell_wish
    const wishRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'execute_shell_wish',
        arguments: {
          wish: 'What is the recommended next task?'
        }
      }
    });

    expect(wishRes.content).toBeDefined();
    expect(wishRes.content[0].text).toContain('AI-Workflow');

    // 3. Call non-existent tool
    const unknownRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'non_existent_tool',
        arguments: {}
      }
    });

    expect(unknownRes.isError).toBe(true);
    expect(unknownRes.content[0].text).toContain('not registered');

    // 4. Call tool that triggers execution error (update_ticket_state on missing ticket)
    const errRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'update_ticket_state',
        arguments: {
          ticketId: 'TKT-NON-EXISTENT',
          lane: 'Done'
        }
      }
    });

    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain("Ticket TKT-NON-EXISTENT not found");
  });

  it('should export valid MCP JSON tool schemas to disk for host discovery', async () => {
    const { exportMcpSchemas } = await import('../src/mcp.ts');
    const schemasDir = path.join(tempDir, 'mcp-schemas');

    const files = exportMcpSchemas(schemasDir);
    expect(files.length).toBeGreaterThanOrEqual(16);
    expect(files).toContain('execute_shell_wish.json');
    expect(files).toContain('claim_ticket.json');

    // Verify written JSON schema contents
    const claimSchemaPath = path.join(schemasDir, 'claim_ticket.json');
    expect(fs.existsSync(claimSchemaPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(claimSchemaPath, 'utf8'));
    expect(parsed.name).toBe('claim_ticket');
    expect(parsed.parameters).toBeDefined();
    expect(parsed.parameters.properties).toBeDefined();
    expect(parsed.parameters.properties.ticketId).toBeDefined();
  });
});
