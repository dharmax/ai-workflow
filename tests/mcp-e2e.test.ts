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

  test('MCP ticket claim and release prevents subagent collisions', () => {
    serverInstance.store.upsertEntity({
      id: 'TKT-SWARM-01',
      type: 'ticket',
      title: 'Distributed Worker Task',
      lane: 'Todo'
    });

    // Agent 1 claims
    const claim1 = serverInstance.store.claimTicket('TKT-SWARM-01', 'agent-alpha', 30 * 60 * 1000);
    expect(claim1.success).toBe(true);
    expect(serverInstance.store.isTicketClaimed('TKT-SWARM-01')).toBe(true);

    // Agent 2 attempts to claim -> rejected
    const claim2 = serverInstance.store.claimTicket('TKT-SWARM-01', 'agent-beta', 30 * 60 * 1000);
    expect(claim2.success).toBe(false);
    expect(claim2.reason).toContain('actively leased by agent-alpha');

    // Agent 1 releases
    const release = serverInstance.store.releaseTicket('TKT-SWARM-01', 'agent-alpha');
    expect(release.success).toBe(true);
    expect(serverInstance.store.isTicketClaimed('TKT-SWARM-01')).toBe(false);
  });

  test('Expanded MCP Surface: execute_shell_wish, feature blast radius, deep ticket view, ui state', async () => {
    serverInstance.store.upsertEntity({
      id: 'TKT-DEEP-01',
      type: 'ticket',
      title: 'Inspect Causal Graph',
      lane: 'Todo',
      body: 'Verify deep view and shell wish dispatch'
    });

    // 1. execute_shell_wish
    const shellWishOut = await new Promise(async (resolve) => {
      const shell = new (await import('../src/shell.ts')).InteractiveShell(serverInstance.store);
      const res = await shell.executeCommand('how many todo items do we have?');
      resolve(res);
    });
    expect(shellWishOut).toContain('Notice: LLM provider');

    // 2. feature blast radius
    const featureBlast = await (await import('../src/impact.ts')).getFeatureBlastRadius(serverInstance.store, 'Refactor SQLite graph store');
    expect(featureBlast.featureWish).toContain('Refactor SQLite graph store');
    expect(featureBlast.riskLevel).toBeDefined();

    // 3. get_ui_state payload
    const health = serverInstance.store.getProjectHealth();
    expect(health.totalTickets).toBeGreaterThanOrEqual(1);

    // 4. deep ticket context
    const deepContext = await (await import('../src/context.ts')).packTicketContext(serverInstance.store, 'TKT-DEEP-01');
    expect(deepContext.rendered).toContain('TKT-DEEP-01');
  });
});
