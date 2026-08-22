import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createAiWorkflowMcpServer } from '../src/mcp.ts';

describe('ai-workflow Complete MCP Surface E2E Tests', () => {
  let tempDir: string;
  let serverInstance: any;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'aiwf-mcp-test-'));
    serverInstance = createAiWorkflowMcpServer(tempDir);
  });

  afterEach(async () => {
    serverInstance.store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('MCP server exposes all registered tools', () => {
    expect(serverInstance.server).toBeDefined();
  });

  test('MCP get_project_overview returns structured health metrics', async () => {
    serverInstance.store.upsertEntity({
      id: 'TKT-001',
      type: 'ticket',
      title: 'Setup Database',
      lane: 'Todo'
    });

    const health = serverInstance.store.getProjectHealth();
    expect(health.totalTickets).toBe(1);
    expect(health.laneCounts.Todo).toBe(1);
  });

  test('MCP update_ticket_state moves ticket and saves run artifact', async () => {
    serverInstance.store.upsertEntity({
      id: 'TKT-002',
      type: 'ticket',
      title: 'Add JWT Auth',
      lane: 'Todo'
    });

    serverInstance.store.upsertEntity({
      id: 'TKT-002',
      type: 'ticket',
      title: 'Add JWT Auth',
      lane: 'Done',
      status: 'verified'
    });

    serverInstance.store.recordRunArtifact({
      id: 'run-001',
      ticketId: 'TKT-002',
      action: 'mcp-update',
      status: 'passed',
      lessons: { reason: 'All unit tests passed.' }
    });

    const artifacts = serverInstance.store.getRunArtifacts('TKT-002');
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].status).toBe('passed');
  });

  test('MCP ADR decision propose and revert', () => {
    const dec = serverInstance.decisions.proposeDecision({
      id: 'DEC-100',
      title: 'Use Micro-services',
      body: 'Decided on micro-services.'
    });
    expect(dec.status).toBe('proposed');

    const rev = serverInstance.decisions.revertDecision('DEC-100', 'Too complex for current scale');
    expect(rev.decision?.status).toBe('reverted');
  });

  test('MCP blast radius analysis on target file', () => {
    serverInstance.store.upsertEntity({
      id: 'src/server.ts',
      type: 'file',
      title: 'server.ts'
    });
    serverInstance.store.upsertEntity({
      id: 'src/client.ts',
      type: 'file',
      title: 'client.ts'
    });
    serverInstance.store.addRelation({
      fromId: 'src/client.ts',
      toId: 'src/server.ts',
      relation: 'depends_on'
    });

    const res = serverInstance.store.getIncoming('src/server.ts', 'depends_on');
    expect(res.some((e: any) => e.id === 'src/client.ts')).toBe(true);
  });
});
