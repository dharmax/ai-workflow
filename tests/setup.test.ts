import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initProject, installGlobalBinary, configureMcp } from '../src/setup.ts';
import { runDiagnostics, formatDiagnosticReport } from '../src/doctor.ts';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/config.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Epic } from '../src/graph/ontology.ts';

describe('Project Initialization, Global Setup & Diagnostics Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-setup-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize a fresh project with AST indexing and markdown projections', async () => {
    // 1. Create a dummy codebase in tempDir
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'auth.ts'),
      `// TODO: Add OAuth2 provider support
export function authenticate(token: string): boolean {
  return token.length > 10;
}
`,
      'utf8'
    );

    // 2. Run initProject
    const res = await initProject(tempDir);

    expect(res.projectRoot).toBe(tempDir);
    expect(res.filesIndexed).toBe(1);
    expect(res.symbolsIndexed).toBeGreaterThanOrEqual(1);
    expect(res.notesIndexed).toBe(1);
    expect(res.projectionsExported).toContain('kanban.md');
    expect(res.projectionsExported).toContain('epics.md');

    // 3. Verify disk projections exist
    expect(fs.existsSync(path.join(tempDir, 'kanban.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'epics.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.ai-workflow', 'config.json'))).toBe(true);

    const kanbanContent = fs.readFileSync(path.join(tempDir, 'kanban.md'), 'utf8');
    expect(kanbanContent).toContain('TKT-001');
    expect(kanbanContent).toContain('Explore codebase');

    // 4. Verify SQLite store contains starter entities
    const store = new WorkflowStore(tempDir);
    const tickets = await store.listEntities<Ticket>(Ticket.dcr);
    expect(tickets.length).toBe(1);
    expect(store.localId(tickets[0].id)).toBe('TKT-001');

    const epics = await store.listEntities<Epic>(Epic.dcr);
    expect(epics.length).toBe(1);
    expect(store.localId(epics[0].id)).toBe('EPIC-ONBOARDING');
    store.close();
  });

  it('should run doctor diagnostics and produce a healthy report on initialized repo', async () => {
    await initProject(tempDir);
    const store = new WorkflowStore(tempDir);

    const report = await runDiagnostics(store, tempDir);
    expect(report.projectRoot).toBe(tempDir);
    expect(report.healthy).toBe(true);

    const checkNames = report.checks.map(c => c.name);
    expect(checkNames).toContain('Bun Engine');
    expect(checkNames).toContain('AST+ Semantic Graph');
    expect(checkNames).toContain('Markdown Sync');
    expect(checkNames).toContain('Lease & Flow Health');

    const formatted = formatDiagnosticReport(report);
    expect(formatted).toContain('Doctor Report');
    expect(formatted).toContain('HEALTHY');

    store.close();
  });

  it('should read, update, and persist configuration', () => {
    // Default config
    const initialCfg = loadConfig(tempDir);
    expect(initialCfg.defaultAgentId).toBe(DEFAULT_CONFIG.defaultAgentId);
    expect(initialCfg.defaultLeaseMinutes).toBe(30);

    // Update config
    const updated = saveConfig(tempDir, {
      defaultAgentId: 'autonomous-sentinel',
      defaultLeaseMinutes: 45,
      model: 'qwen2.5-coder:14b'
    });

    expect(updated.defaultAgentId).toBe('autonomous-sentinel');
    expect(updated.defaultLeaseMinutes).toBe(45);
    expect(updated.model).toBe('qwen2.5-coder:14b');

    // Read back fresh from disk
    const reloaded = loadConfig(tempDir);
    expect(reloaded.defaultAgentId).toBe('autonomous-sentinel');
    expect(reloaded.defaultLeaseMinutes).toBe(45);
  });

  it('should execute CLI binary commands end-to-end with zero exit codes', async () => {
    await initProject(tempDir);

    // 1. aiwf help
    const helpProc = Bun.spawn(['bun', path.resolve('src/cli.ts'), 'help'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const helpOut = await new Response(helpProc.stdout).text();
    expect(await helpProc.exited).toBe(0);
    expect(helpOut).toContain('AI-Workflow 2.0');
    expect(helpOut).toContain('Usage: aiwf <command>');

    // 2. aiwf doctor
    const docProc = Bun.spawn(['bun', path.resolve('src/cli.ts'), 'doctor'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const docOut = await new Response(docProc.stdout).text();
    expect(await docProc.exited).toBe(0);
    expect(docOut).toContain('Doctor Report');
    expect(docOut).toContain('HEALTHY');

    // 3. aiwf eval
    const evalProc = Bun.spawn(['bun', path.resolve('src/cli.ts'), 'eval', 'return 7 * 6;'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe'
    });
    const evalOut = await new Response(evalProc.stdout).text();
    expect(await evalProc.exited).toBe(0);
    expect(evalOut.trim()).toBe('42');
  });
});

