import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/store.ts';
import { InteractiveShell } from '../src/shell.ts';

describe('AI-Workflow Interactive Shell Tests', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let shell: InteractiveShell;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'aiwf-shell-test-'));
    store = new WorkflowStore(tempDir);
    const mockAsker = {
      ask: async () => ({ ok: true, text: 'Architectural evaluation summary.' })
    } as any;
    shell = new InteractiveShell(store, mockAsker);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('Mode switching works for all valid modes and rejects invalid modes', async () => {
    expect(shell.mode).toBe('design');

    const resDev = await shell.executeCommand('/dev');
    expect(resDev).toContain('Switched to DEV mode');
    expect(shell.mode).toBe('dev');

    const resProduct = await shell.executeCommand('/product');
    expect(resProduct).toContain('Switched to PRODUCT mode');
    expect(shell.mode).toBe('product');

    const resTriage = await shell.executeCommand('/triage');
    expect(resTriage).toContain('Switched to TRIAGE mode');
    expect(shell.mode).toBe('triage');

    const resInvalid = await shell.executeCommand('/invalid');
    expect(resInvalid).toContain('Unknown mode');
  });

  test('Fast commands: status, digest, doctor, audit, metrics', async () => {
    const statusOut = await shell.executeCommand('status');
    expect(statusOut).toContain('AI-WORKFLOW CAUSAL OS & PROJECT VISIBILITY DASHBOARD');

    const digestOut = await shell.executeCommand('digest 24');
    expect(digestOut).toContain('Daily Digest');

    const docOut = await shell.executeCommand('doctor');
    expect(docOut).toContain('Repo Doctor Health Report');

    const auditOut = await shell.executeCommand('audit');
    expect(auditOut).toContain('Audit');

    const metricsOut = await shell.executeCommand('metrics');
    expect(metricsOut).toContain('Context & Performance Telemetry Metrics');
  });

  test('Ticket workflow commands: start, done, claim, release', async () => {
    store.upsertEntity({
      id: 'TKT-TEST-001',
      type: 'ticket',
      title: 'Build Neural Interface',
      lane: 'Todo'
    });

    // Claim ticket
    const claimRes = await shell.executeCommand('claim TKT-TEST-001 subagent-alpha 15');
    expect(claimRes).toContain('claimed by subagent-alpha');
    expect(store.isTicketClaimed('TKT-TEST-001')).toBe(true);

    // Collision check: another agent cannot claim it
    const collisionRes = await shell.executeCommand('claim TKT-TEST-001 subagent-beta 15');
    expect(collisionRes).toContain('Failed to claim ticket');

    // Move to In Progress (preserves title!)
    const startRes = await shell.executeCommand('start TKT-TEST-001');
    expect(startRes).toContain('moved to In Progress');
    const updated = store.getEntity('TKT-TEST-001');
    expect(updated?.lane).toBe('In Progress');
    expect(updated?.title).toBe('Build Neural Interface');

    // Move to Done
    const doneRes = await shell.executeCommand('done TKT-TEST-001');
    expect(doneRes).toContain('moved to Done');
    const doneTicket = store.getEntity('TKT-TEST-001');
    expect(doneTicket?.lane).toBe('Done');
    expect(doneTicket?.status).toBe('verified');
    expect(doneTicket?.title).toBe('Build Neural Interface');

    // Release ticket
    const releaseRes = await shell.executeCommand('release TKT-TEST-001');
    expect(releaseRes).toContain('released successfully');
    expect(store.isTicketClaimed('TKT-TEST-001')).toBe(false);
  });

  test('Decision lifecycle via shell: propose, accept, list, revert', async () => {
    const propRes = await shell.executeCommand('decision propose DEC-100 Use-Postgres-Causal-Store Migration details');
    expect(propRes).toContain('Proposed decision DEC-100');

    const listRes = await shell.executeCommand('decision list');
    expect(listRes).toContain('DEC-100');

    const acceptRes = await shell.executeCommand('decision accept DEC-100');
    expect(acceptRes).toContain('Accepted decision DEC-100');

    const revertRes = await shell.executeCommand('decision revert DEC-100 Security compliance failure');
    expect(revertRes).toContain('Reverted decision DEC-100');
  });

  test('Impact and next task recommendations', async () => {
    store.upsertEntity({
      id: 'src/core.ts',
      type: 'file',
      title: 'core.ts'
    });
    store.upsertEntity({
      id: 'TKT-CORE-01',
      type: 'ticket',
      title: 'Optimize Core',
      lane: 'Todo'
    });
    store.addRelation({ fromId: 'TKT-CORE-01', toId: 'src/core.ts', relation: 'modifies' });

    const nextRes = await shell.executeCommand('next');
    expect(nextRes).toContain('TKT-CORE-01');
  });

  test('Tool-Aware Autonomous Wishes: next task, query count, feature blast radius, create ticket', async () => {
    store.upsertEntity({
      id: 'TKT-AUTO-01',
      type: 'ticket',
      title: 'Auto Dispatch Task',
      lane: 'Todo',
      body: 'Verify autonomous dispatcher'
    });

    // 1. "how many todo items do we have?"
    const countRes = await shell.executeCommand('how many todo items do we have?');
    expect(countRes).toContain('Project Ticket Counts');
    expect(countRes).toContain('TKT-AUTO-01');

    // 2. "can you handle the next one?"
    const handleRes = await shell.executeCommand('can you handle the next one?');
    expect(handleRes).toContain('Autonomously dispatched next task');
    expect(handleRes).toContain('TKT-AUTO-01');
    const updated = store.getEntity('TKT-AUTO-01');
    expect(updated?.lane).toBe('In Progress');
    expect(store.isTicketClaimed('TKT-AUTO-01')).toBe(true);

    // 3. "what breaks if we refactor database store?"
    const blastRes = await shell.executeCommand('what breaks if we refactor database store?');
    expect(blastRes).toContain('Feature Blast Radius');
    expect(blastRes).toContain('Risk Level');

    // 4. "create ticket Implement Webhook Notifications"
    const createRes = await shell.executeCommand('create ticket Implement Webhook Notifications');
    expect(createRes).toContain('Created ticket');
    expect(createRes).toContain('Implement Webhook Notifications');

    // 5. "why are tests failing?"
    const triageRes = await shell.executeCommand('why are tests failing?');
    expect(triageRes).toBeDefined();

    // 6. "burndown"
    const burnRes = await shell.executeCommand('burndown');
    expect(burnRes).toBeDefined();

    // 7. "environment info"
    const envRes = await shell.executeCommand('environment info');
    expect(envRes).toContain('Environment & Toolchain Orientation');
  });

  test('Comprehensive Shell Capability Suite: root, env, git-status, notes, snapshot, pr-summary, tokens, outline, help, edge cases', async () => {
    // 1. Root
    const rootRes = await shell.executeCommand('root');
    expect(rootRes).toContain('Project Root');

    // 2. Env
    const envRes = await shell.executeCommand('env');
    expect(envRes).toContain('Platform');

    // 3. Git Status
    const gitStatusRes = await shell.executeCommand('git-status');
    expect(gitStatusRes).toBeDefined();

    // 4. Scratchpad Notes
    const noteRes = await shell.executeCommand('note Refactored shell REPL with Tab completion');
    expect(noteRes).toContain('Appended note');
    const readNotesRes = await shell.executeCommand('notes');
    expect(readNotesRes).toContain('Refactored shell REPL');

    // 5. Token budget estimation
    const tokenRes = await shell.executeCommand('token-count package.json');
    expect(tokenRes).toContain('Estimated Tokens');

    // 6. PR Summary
    const prRes = await shell.executeCommand('pr-summary');
    expect(prRes).toContain('PR Markdown Body');

    // 7. Graph linter
    const lintRes = await shell.executeCommand('lint-graph');
    expect(lintRes).toContain('Causal Graph Integrity Lint');

    // 8. Help
    const helpRes = await shell.executeCommand('help');
    expect(helpRes).toContain('AI-Workflow Interactive Commands');

    // 9. Edge cases: Empty string, whitespace
    const emptyRes = await shell.executeCommand('   ');
    expect(emptyRes).toBe('');
  });





  test('Multi‑sentence natural language handling (5 sentences)', async () => {
    const multiRes = await shell.executeCommand('Can you handle the next task? Also show me the metrics. List all open tickets now. What is the current environment info? Finally, summarize any blocked tickets.');
    expect(multiRes).toBeDefined();
    // Basic sanity checks for each component

    expect(multiRes).toContain('Metrics');
    expect(multiRes).toContain('Open tickets');
    expect(multiRes).toContain('Environment');
    expect(multiRes).toContain('Blocked tickets');
  });

  test('Live Cockpit Web Server endpoints: HTML, health, metrics, burndown, shell execution', async () => {
    const { startWebServer } = await import('../src/ui.ts');
    const server = startWebServer(store, 3999);

    try {
      // 1. Root HTML
      const htmlRes = await fetch('http://localhost:3999/');
      expect(htmlRes.status).toBe(200);
      const htmlText = await htmlRes.text();
      expect(htmlText).toContain('app-root');
      expect(htmlText).toContain('page-metrics.riot');

      // 2. Health API
      const healthRes = await fetch('http://localhost:3999/api/health');
      expect(healthRes.status).toBe(200);
      const healthJson = await healthRes.json();
      expect(healthJson.totalTickets).toBeDefined();

      // 3. Metrics API
      const metricsRes = await fetch('http://localhost:3999/api/metrics');
      expect(metricsRes.status).toBe(200);

      // 4. Burndown API
      const burndownRes = await fetch('http://localhost:3999/api/burndown');
      expect(burndownRes.status).toBe(200);

      // 5. Shell Execution API
      const shellExecRes = await fetch('http://localhost:3999/api/shell/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'status' })
      });
      expect(shellExecRes.status).toBe(200);
      const shellExecJson = await shellExecRes.json();
      expect(shellExecJson.output).toContain('AI-WORKFLOW');
    } finally {
      server.stop();
    }
  });
});
