import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools } from '../src/tools/index.ts';
import { WorkflowActor } from '../src/actor/engine.ts';
import { processShellInput, type ShellSession } from '../src/shell.ts';

describe('Interactive Shell REPL Bridge', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let session: ShellSession;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-shell-test-'));
    store = new WorkflowStore(tempDir, true);
    initializeTools();
    const actor = new WorkflowActor({
      store,
      projectRoot: tempDir,
      offline: true
    });
    session = { store, actor, projectRoot: tempDir };
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should handle session control and help', async () => {
    const exitRes = await processShellInput('exit', session);
    expect(exitRes.exit).toBe(true);

    const helpRes = await processShellInput('help', session);
    expect(helpRes.output).toContain('AI-Workflow 2.0 Terminal REPL');
  });

  it('should dynamically switch modes', async () => {
    const designRes = await processShellInput('/design', session);
    expect(designRes.newMode).toBe('design');
    expect(session.actor.mode).toBe('design');

    const triageRes = await processShellInput('/triage', session);
    expect(triageRes.newMode).toBe('triage');
    expect(session.actor.mode).toBe('triage');
  });

  it('should execute all domain fast-paths without LLM invocation', async () => {
    // 1. Status & Diff
    const statusRes = await processShellInput('status', session);
    expect(statusRes.output).toContain('[Git]');
    expect(statusRes.output).toContain('[Active Leases]');

    const diffRes = await processShellInput('diff', session);
    expect(typeof diffRes.output).toBe('string');

    // 2. Eval
    const evalRes = await processShellInput('eval 10 * 4', session);
    expect(evalRes.output).toBe('40');

    // 3. Tickets, Claim, Next, Release
    const emptyTickets = await processShellInput('tickets', session);
    expect(emptyTickets.output).toContain('No tickets found');

    const nextRes = await processShellInput('next', session);
    expect(nextRes.output).toContain('No pending tasks');

    // Create a ticket via eval or direct store
    const { Ticket } = await import('../src/graph/ontology.ts');
    await session.store.upsertEntity(Ticket.dcr, {
      id: 'TKT-SHELL-1',
      title: 'Test Shell Verb Execution',
      lane: 'Todo'
    });

    const listRes = await processShellInput('tickets', session);
    expect(listRes.output).toContain('TKT-SHELL-1');
    expect(listRes.output).toContain('Test Shell Verb Execution');

    const claimRes = await processShellInput('claim TKT-SHELL-1 agent-tester 15', session);
    expect(claimRes.output).toContain("Claimed ticket TKT-SHELL-1 for 15m by 'agent-tester'");

    const releaseRes = await processShellInput('release TKT-SHELL-1', session);
    expect(releaseRes.output).toContain('Released ticket TKT-SHELL-1');

    // 4. Config Get & Set
    const cfgGet = await processShellInput('config get defaultAgentId', session);
    expect(cfgGet.output).toContain('defaultAgentId');

    const cfgSet = await processShellInput('config set defaultAgentId custom-operator', session);
    expect(cfgSet.output).toContain('defaultAgentId = custom-operator');

    // 5. Index & Doctor
    const idxRes = await processShellInput('index', session);
    expect(idxRes.output).toContain('Indexed');

    const docRes = await processShellInput('doctor', session);
    expect(docRes.output).toContain('Doctor Report');

    const auditRes = await processShellInput('audit', session);
    expect(auditRes.output).toContain('AI-Workflow Audit');

    const metricsRes = await processShellInput('metrics', session);
    expect(metricsRes.output).toContain('Project Metrics');
  });

  it('should auto-complete shell commands with shellCompleter', async () => {
    const { shellCompleter } = await import('../src/shell.ts');

    const [staHits] = shellCompleter('sta');
    expect(staHits).toContain('status');

    const [cliHits] = shellCompleter('cl');
    expect(cliHits).toContain('claim');

    const [docHits] = shellCompleter('doc');
    expect(docHits).toContain('doctor');

    const [modeHits] = shellCompleter('/d');
    expect(modeHits).toContain('/design');
    expect(modeHits).toContain('/dev');
  });

  it('should delegate complex natural language wishes to cognitive actor', async () => {
    const wishRes = await processShellInput('tell me about the project architecture', session);
    expect(wishRes.output).toContain('Offline Fast-Path');
    expect(wishRes.output).toBeDefined();
  });
});
