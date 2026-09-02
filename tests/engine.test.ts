import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { WorkflowStore } from '../src/store.ts';
import { indexCodebase } from '../src/indexer.ts';
import { exportMarkdown, importMarkdown } from '../src/sync.ts';
import { DecisionManager } from '../src/decisions.ts';
import { packTicketContext } from '../src/context.ts';
import { parseAndStoreGuidelines, auditCodebase } from '../src/guidelines.ts';
import { getBlastRadius, generateDigest, recommendNextTask, doctorCheck } from '../src/impact.ts';
import { createAiWorkflowMcpServer } from '../src/mcp.ts';

describe('ai-workflow Reborn Engine Tests', () => {
  let tempDir: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'aiwf-test-'));
    store = new WorkflowStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('Store entity and relation lifecycle', () => {
    const epic = store.upsertEntity({
      id: 'EPC-AUTH-001',
      type: 'epic',
      title: 'Enterprise Authentication',
      status: 'planned'
    });
    expect(epic.id).toBe('EPC-AUTH-001');

    const ticket = store.upsertEntity({
      id: 'TKT-AUTH-001',
      type: 'ticket',
      title: 'OAuth2 Callback Handler',
      lane: 'Todo',
      status: 'planned'
    });

    store.addRelation({
      fromId: ticket.id,
      toId: epic.id,
      relation: 'implements'
    });

    const parents = store.getOutgoing(ticket.id, 'implements');
    expect(parents.length).toBe(1);
    expect(parents[0].id).toBe('EPC-AUTH-001');
  });

  test('DecisionManager propose, accept, and revert with ticket reconciliation', () => {
    const dm = new DecisionManager(store);
    const dec = dm.proposeDecision({
      id: 'DEC-002',
      title: 'Use Redis for Session Caching',
      body: 'Decided to use Redis clusters.'
    });
    expect(dec.status).toBe('proposed');

    dm.acceptDecision('DEC-002');
    expect(store.getEntity('DEC-002')?.status).toBe('accepted');

    const ticket = store.upsertEntity({
      id: 'TKT-REDIS-001',
      type: 'ticket',
      title: 'Provision Redis Cluster',
      lane: 'In Progress'
    });

    store.addRelation({ fromId: 'DEC-002', toId: ticket.id, relation: 'governs' });

    const revertRes = dm.revertDecision('DEC-002', 'Cost too high');
    expect(revertRes.decision?.status).toBe('reverted');
    expect(revertRes.affectedTickets.length).toBe(1);
    expect(revertRes.affectedTickets[0].lane).toBe('Blocked');
    expect(revertRes.affectedTickets[0].metadata?.blockedReason).toContain('Cost too high');
  });

  test('Context packing bounded token generation', async () => {
    store.upsertEntity({
      id: 'TKT-PAY-001',
      type: 'ticket',
      title: 'Stripe Webhook Verification',
      lane: 'In Progress',
      body: 'Verify webhook HMAC signature with signing secret.',
      metadata: { verificationCommand: 'bun test tests/pay.test.ts' }
    });

    const pack = await packTicketContext(store, 'TKT-PAY-001', { format: 'xml' });
    expect(pack.rendered).toContain('Ticket TKT-PAY-001');
    expect(pack.rendered).toContain('Stripe Webhook Verification');
    expect(pack.rendered).toContain('bun test tests/pay.test.ts');
  });

  test('2-Way Markdown Sync generates kanban.md, epics.md, and decisions.md', async () => {
    store.upsertEntity({
      id: 'TKT-UI-001',
      type: 'ticket',
      title: 'Add Dark Mode Toggle',
      lane: 'Todo'
    });

    await exportMarkdown(store);
    const kanbanFile = Bun.file(path.join(tempDir, 'kanban.md'));
    const content = await kanbanFile.text();
    expect(content).toContain('TKT-UI-001');
    expect(content).toContain('Add Dark Mode Toggle');
  });

  test('Design and Planning documents are automatically discovered, represented as tickets, and linked in causal graph', async () => {
    const { syncPlanDocuments } = await import('../src/sync.ts');
    
    // 1. Create a design plan document
    const planPath = path.join(tempDir, 'implementation_plan.md');
    await Bun.write(planPath, '# Autonomous Shell Agent Implementation Plan\n\nDetailed design specifications and steps.');

    // 2. Discover and sync
    const created = await syncPlanDocuments(store);
    expect(created.length).toBe(1);
    expect(created[0].title).toContain('Autonomous Shell Agent Implementation Plan');
    expect(created[0].lane).toBe('In Progress');
    expect(created[0].status).toBe('in_design');

    // 3. Verify relations in causal graph
    const docEntity = store.getEntity(`doc:implementation_plan.md`);
    expect(docEntity).toBeDefined();
    expect(docEntity?.type).toBe('document');

    const outgoing = store.getOutgoing(created[0].id, 'documents');
    expect(outgoing.length).toBe(1);
    expect(outgoing[0].id).toBe('doc:implementation_plan.md');

    // 4. Verify kanban export contains the plan ticket
    await exportMarkdown(store);
    const kanbanText = await Bun.file(path.join(tempDir, 'kanban.md')).text();
    expect(kanbanText).toContain(created[0].id);
    expect(kanbanText).toContain('Autonomous Shell Agent Implementation Plan');
  });

  test('Impact analysis and Task Recommender', () => {
    const file = store.upsertEntity({
      id: 'src/auth.ts',
      type: 'file',
      title: 'auth.ts'
    });
    const ticket = store.upsertEntity({
      id: 'TKT-AUTH-002',
      type: 'ticket',
      title: 'Refactor Token Refresh',
      lane: 'In Progress'
    });

    store.addRelation({ fromId: ticket.id, toId: file.id, relation: 'modifies' });

    const impact = getBlastRadius(store, 'src/auth.ts');
    expect(impact.affectedFiles).toContain('src/auth.ts');
    expect(impact.affectedTickets.some(t => t.id === 'TKT-AUTH-002')).toBe(true);

    const next = recommendNextTask(store);
    expect(next.ticket?.id).toBe('TKT-AUTH-002');
  });

  test('Guidelines audit detection', async () => {
    const enfPath = path.join(tempDir, 'enforcement.md');
    await writeFile(enfPath, `
\`\`\`ai-workflow-audit
{
  "forbiddenPatterns": [
    {
      "id": "no-alert",
      "include": ["src"],
      "extensions": [".ts"],
      "pattern": "alert\\\\(",
      "message": "Do not use alert()"
    }
  ]
}
\`\`\`
`, 'utf8');

    await parseAndStoreGuidelines(store);

    const badFile = path.join(tempDir, 'src', 'bad.ts');
    await Bun.write(badFile, 'alert("hello");');
    store.upsertEntity({ id: 'src/bad.ts', type: 'file', title: 'bad.ts' });

    const audit = await auditCodebase(store);
    expect(audit.passed).toBe(false);
    expect(audit.violationsCount).toBe(1);
    expect(audit.findings[0].ruleId).toBe('no-alert');
  });

  test('MCP server creation and tool definitions', () => {
    const { server } = createAiWorkflowMcpServer(tempDir);
    expect(server).toBeDefined();
  });

  test('CLI setup command returns valid JSON configuration', async () => {
    const proc = Bun.spawn(['bun', 'src/cli.ts', 'setup', '--json'], {
      cwd: path.resolve(__dirname, '..'),
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.mcpConfig).toBeDefined();
    expect(json.mcpConfig.mcpServers['ai-workflow']).toBeDefined();
    expect(json.claudeCodeCommand).toContain('claude mcp add ai-workflow');
    expect(json.binaries.length).toBeGreaterThan(0);
  });
});
