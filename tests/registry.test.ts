import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { WorkflowStore } from '../src/store.ts';
import { DecisionManager } from '../src/decisions.ts';
import { CodeletEngine } from '../src/compiler.ts';
import { LocalGitTransport } from '../src/transport.ts';
import { MetricsCollector } from '../src/metrics.ts';
import { registry, type CommandContext } from '../src/registry.ts';
import { InteractiveShell } from '../src/shell.ts';

describe('ai-workflow Unified Capability Registry Tests', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwf-reg-test-'));
    store = new WorkflowStore(tempDir);
    const compiler = new CodeletEngine(store);
    const decisions = new DecisionManager(store);
    const transport = new LocalGitTransport(store);
    const metrics = new MetricsCollector(store);

    ctx = {
      store,
      compiler,
      decisions,
      transport,
      metrics,
      projectRoot: tempDir
    };
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('Registry contains all core capabilities with valid schemas and handlers', () => {
    const all = registry.getAll();
    expect(all.length).toBeGreaterThanOrEqual(20);

    const names = all.map(c => c.name);
    expect(names).toContain('get_project_overview');
    expect(names).toContain('get_ticket_context');
    expect(names).toContain('list_tickets');
    expect(names).toContain('list_codelets');
    expect(names).toContain('claim_ticket');
    expect(names).toContain('release_ticket');
    expect(names).toContain('get_blast_radius');
    expect(names).toContain('check_blast_gate');
    expect(names).toContain('find_symbol');
    expect(names).toContain('sweep_bugs');
  });

  test('CLI command routing finds single and multi-word capabilities', () => {
    const matchStatus = registry.findForCli(['status']);
    expect(matchStatus.capability?.name).toBe('get_project_overview');

    const matchCodelets = registry.findForCli(['codelet', 'list']);
    expect(matchCodelets.capability?.name).toBe('list_codelets');

    const matchTicketInspect = registry.findForCli(['ticket', 'inspect', 'TKT-001']);
    expect(matchTicketInspect.capability?.name).toBe('get_ticket_deep_view');
    expect(matchTicketInspect.args).toEqual(['TKT-001']);

    const matchGate = registry.findForCli(['gate', 'src/core.ts']);
    expect(matchGate.capability?.name).toBe('check_blast_gate');
    expect(matchGate.args).toEqual(['src/core.ts']);

    const matchSymbol = registry.findForCli(['symbol', 'WorkflowStore']);
    expect(matchSymbol.capability?.name).toBe('find_symbol');
    expect(matchSymbol.args).toEqual(['WorkflowStore']);
  });

  test('Ticket lifecycle and context packing via registry handlers', async () => {
    // 1. Create ticket
    const createCap = registry.get('create_ticket')!;
    const ticket = await createCap.handler(ctx, { title: 'Implement Neural Mesh', lane: 'Todo' });
    expect(ticket.id).toBeDefined();
    expect(ticket.title).toBe('Implement Neural Mesh');

    // 2. Claim ticket
    const claimCap = registry.get('claim_ticket')!;
    const claimRes = await claimCap.handler(ctx, { ticketId: ticket.id, agentId: 'agent-7', durationMinutes: 15 });
    expect(claimRes.success).toBe(true);

    // 3. Move to In Progress
    const startCap = registry.get('start_ticket')!;
    const started = await startCap.handler(ctx, { ticketId: ticket.id });
    expect(started.lane).toBe('In Progress');

    // 4. Extract context
    const contextCap = registry.get('get_ticket_context')!;
    const pack = await contextCap.handler(ctx, { ticketId: ticket.id, format: 'markdown' });
    expect(pack.rendered).toContain(ticket.id);
    expect(pack.rendered).toContain('Implement Neural Mesh');

    // 5. Pre-flight gate check
    const gateCap = registry.get('check_blast_gate')!;
    const gateRes = await gateCap.handler(ctx, { target: 'src/neural.ts' });
    expect(gateRes.target).toBe('src/neural.ts');
    expect(gateRes.gatePassed).toBe(true);

    // 6. Move to Done
    const doneCap = registry.get('done_ticket')!;
    const done = await doneCap.handler(ctx, { ticketId: ticket.id });
    expect(done.lane).toBe('Done');
    expect(done.status).toBe('verified');
  });

  test('InteractiveShell executes "list codelets" and registry commands deterministically', async () => {
    const shell = new InteractiveShell(store);

    // "list codelets" when empty
    const codeletEmpty = await shell.executeCommand('list codelets');
    expect(codeletEmpty).toContain('No compiled codelets found');

    // Create a mock codelet in .codelets/
    const codeletDir = path.join(tempDir, '.codelets');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(codeletDir, { recursive: true });
    await Bun.write(path.join(codeletDir, 'routine-test.json'), JSON.stringify({
      meta: { title: 'routine-test', doc: 'Test routine doc', tags: ['test'] },
      sourceCode: 'return { ok: true };'
    }));

    // "list codelets" when populated
    const codeletOut = await shell.executeCommand('list codelets');
    expect(codeletOut).toContain('routine-test');

    // "codelet list"
    const codeletListOut = await shell.executeCommand('codelet list');
    expect(codeletListOut).toContain('routine-test');

    // "status"
    const statusOut = await shell.executeCommand('status');
    expect(statusOut).toContain('AI-WORKFLOW CAUSAL OS & PROJECT VISIBILITY DASHBOARD');

    // "next"
    const nextOut = await shell.executeCommand('next');
    expect(nextOut).toContain('Recommended Next Task');

    // "help"
    const helpOut = await shell.executeCommand('help');
    expect(helpOut).toContain('AI-Workflow Interactive Commands');
  });

  test('Bug sweep and auto-ticket creation', async () => {
    store.saveCodeNotes('src/engine.ts', [
      { filePath: 'src/engine.ts', line: 42, noteType: 'BUG', body: 'Fix edge case in token knapsack' },
      { filePath: 'src/engine.ts', line: 99, noteType: 'TODO', body: 'Add benchmark telemetry' }
    ]);

    const sweepCap = registry.get('sweep_bugs')!;
    const sweepRes = await sweepCap.handler(ctx, { maxBugs: 10, autoTicket: true });

    expect(sweepRes.totalFound).toBe(2);
    expect(sweepRes.autoFixedTickets.length).toBe(2);

    const todos = store.listEntities({ type: 'ticket', lane: 'Todo' });
    expect(todos.length).toBe(2);
    expect(todos[0].title).toContain('src/engine.ts');
  });

  test('Workspace & Environment capabilities: root, env, git-status', async () => {
    // 1. Root discovery
    const rootCap = registry.get('get_project_root')!;
    const rootRes = await rootCap.handler(ctx, {});
    expect(rootRes.root).toBeDefined();

    // 2. Environment Info
    const envCap = registry.get('get_environment_info')!;
    const envRes = await envCap.handler(ctx, {});
    expect(envRes.runtime).toContain('Bun');
    expect(envRes.platform).toBeDefined();

    // 3. Git Status
    const gitCap = registry.get('get_git_status')!;
    const gitRes = await gitCap.handler(ctx, {});
    expect(gitRes.isGit).toBeDefined();
  });

  test('Context & Navigation capabilities: outline, test target resolver, hotspots', async () => {
    // 1. Outline
    store.upsertEntity({ id: 'src/calc.ts', type: 'file', title: 'calc.ts' });
    store.upsertEntity({
      id: 'sym:add',
      type: 'symbol',
      title: 'add(a, b)',
      metadata: { file: 'src/calc.ts', line: 10, kind: 'function' }
    });
    store.addRelation({ fromId: 'src/calc.ts', toId: 'sym:add', relation: 'contains' });

    const outlineCap = registry.get('get_file_outline')!;
    const outlineRes = await outlineCap.handler(ctx, { file: 'src/calc.ts' });
    expect(outlineRes.symbolCount).toBe(1);
    expect(outlineRes.signatures[0].name).toBe('add(a, b)');

    // 2. Test Resolver
    const testResolverCap = registry.get('resolve_test_command')!;
    const resolverRes = await testResolverCap.handler(ctx, { file: 'src/registry.ts' });
    expect(resolverRes.sourceFile).toContain('src/registry.ts');
    expect(resolverRes.testCommand).toBeDefined();

    // 3. Hotspots
    const hotspotsCap = registry.get('get_project_hotspots')!;
    const hotspotsRes = await hotspotsCap.handler(ctx, { days: 7 });
    expect(hotspotsRes.sinceDays).toBe(7);
  });

  test('Workflow Safety & State capabilities: scratchpad, diff, graph linter', async () => {
    // 1. Scratchpad drop & read
    const noteCap = registry.get('drop_agent_note')!;
    await noteCap.handler(ctx, { note: 'Subagent Alpha completed AST indexing pass' });

    const readNotesCap = registry.get('read_scratchpad')!;
    const notesRes = await readNotesCap.handler(ctx, {});
    expect(notesRes.notesCount).toBeGreaterThanOrEqual(1);
    expect(notesRes.content).toContain('Subagent Alpha completed AST indexing pass');

    // 2. Diff
    const diffCap = registry.get('get_ticket_diff')!;
    const diffRes = await diffCap.handler(ctx, {});
    expect(diffRes.target).toBe('working-tree');

    // 3. Graph Linter
    const lintCap = registry.get('lint_workflow_graph')!;
    const lintRes = await lintCap.handler(ctx, {});
    expect(lintRes.orphanTicketsCount).toBeDefined();
    expect(lintRes.deadSymbolsSampleCount).toBeDefined();
  });

  test('Advanced Agent Primitives: triage, lesson, slice, tokens, snapshot, PR summary, burndown', async () => {
    // 1. Triage tests
    const triageCap = registry.get('triage_test_failures')!;
    const triageRes = await triageCap.handler(ctx, { command: 'echo "all good"' });
    expect(triageRes.passed).toBe(true);

    // 2. Lesson recorder
    const lessonCap = registry.get('record_ticket_lesson')!;
    const lessonRes = await lessonCap.handler(ctx, { ticketId: 'TKT-01', lesson: 'Avoid regex backtracking' });
    expect(lessonRes.lesson).toContain('Avoid regex backtracking');

    // 3. Symbol Slice
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    writeFileSync(path.join(tempDir, 'src', 'calc.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');

    const sliceCap = registry.get('get_symbol_source')!;
    const sliceRes = await sliceCap.handler(ctx, { file: 'src/calc.ts', symbol: 'add' });
    expect(sliceRes.found).toBe(true);
    expect(sliceRes.symbol).toBeDefined();
    expect(sliceRes.code).toContain('return a + b');

    // 4. Token Budget Estimator
    const tokenCap = registry.get('estimate_token_budget')!;
    const tokenRes = await tokenCap.handler(ctx, { files: ['src/calc.ts'] });
    expect(tokenRes.totalEstimatedTokens).toBeGreaterThan(0);
    expect(tokenRes.budgetRisk).toBeDefined();

    // 5. Snapshot Checkpoint
    const snapCap = registry.get('create_snapshot_checkpoint')!;
    const snapRes = await snapCap.handler(ctx, { label: 'pre-refactor' });
    expect(snapRes.snapshotName).toBe('pre-refactor');

    // 6. PR Summary Generator
    store.upsertEntity({ id: 'TKT-01', type: 'ticket', title: 'Test Ticket for PR' });
    const prCap = registry.get('generate_pr_summary')!;
    const prRes = await prCap.handler(ctx, { ticketId: 'TKT-01' });
    expect(prRes.commitTitle).toContain('TKT-01');
    expect(prRes.prMarkdown).toContain('## Summary');

    // 7. Epic Burndown & Progress
    store.upsertEntity({ id: 'EPIC-01', type: 'epic', title: 'Core Reliability' });
    store.addRelation({ fromId: 'TKT-01', toId: 'EPIC-01', relation: 'implements' });

    const burndownCap = registry.get('get_epic_progress')!;
    const burndownRes = await burndownCap.handler(ctx, {});
    expect(burndownRes.totalEpics).toBeGreaterThanOrEqual(1);
    expect(burndownRes.epics[0].title).toBe('Core Reliability');
  });
});
