import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools } from '../src/tools/index.ts';
import { WorkflowActor } from '../src/actor/engine.ts';
import { processShellInput, type ShellSession } from '../src/shell.ts';

describe('Interactive Shell REPL Bridge', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let session: ShellSession;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'temp-shell-test-'));
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

  it('should execute fast-paths without LLM invocation', async () => {
    const statusRes = await processShellInput('status', session);
    expect(statusRes.output).toContain('[Git]');

    const evalRes = await processShellInput('eval 10 * 4', session);
    expect(evalRes.output).toBe('40');

    const nextRes = await processShellInput('next', session);
    expect(nextRes.output).toBeDefined();
  });

  it('should delegate complex natural language wishes to cognitive actor', async () => {
    const wishRes = await processShellInput('tell me about the project architecture', session);
    expect(wishRes.output).toContain('Offline Fast-Path');
    expect(wishRes.output).toBeDefined();
  });
});
