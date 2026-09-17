import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import { initializeTools, type ToolContext } from '../src/tools/index.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { SymbolNode, FileNode } from '../src/graph/ontology.ts';

describe('Tool Registry & Deterministic Facilities', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;
  const registry = initializeTools();

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), 'temp-tools-test-'));
    store = new WorkflowStore(tempDir, true);
    ctx = {
      store,
      projectRoot: tempDir
    };
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should initialize registry with all standard facilities', () => {
    const allTools = registry.getAll();
    expect(allTools.length).toBeGreaterThanOrEqual(15);

    const categories = new Set(allTools.map(t => t.category));
    expect(categories.has('ticket')).toBe(true);
    expect(categories.has('graph')).toBe(true);
    expect(categories.has('git')).toBe(true);
    expect(categories.has('os')).toBe(true);
    expect(categories.has('planning')).toBe(true);
    expect(categories.has('test')).toBe(true);
    expect(categories.has('script')).toBe(true);
  });

  it('should create, list, lease, and recommend tickets', async () => {
    const created = await registry.execute('create_ticket', {
      title: 'Implement JIT Compiler',
      lane: 'Todo',
      priority: 'P1',
      body: 'Synthesize codelets dynamically'
    }, ctx);

    expect(created.id).toBeDefined();
    expect(created.lane).toBe('Todo');

    const listed = await registry.execute('list_tickets', { lane: 'Todo' }, ctx);
    expect(listed.length).toBe(1);
    expect(listed[0].title).toBe('Implement JIT Compiler');

    const claimRes = await registry.execute('claim_ticket', {
      ticketId: created.id,
      agentId: 'agent-alpha',
      durationMinutes: 10
    }, ctx);
    expect(claimRes.success).toBe(true);

    const nextTask = await registry.execute('recommend_next_task', {}, ctx);
    expect(nextTask.ticket).toBeDefined();

    const releaseRes = await registry.execute('release_ticket', {
      ticketId: created.id
    }, ctx);
    expect(releaseRes.success).toBe(true);

    const updated = await registry.execute('update_ticket_state', {
      ticketId: created.id,
      lane: 'Done'
    }, ctx);
    expect(updated.lane).toBe('Done');
  });

  it('should query AST symbols, file outlines, and blast radius', async () => {
    // Setup dummy file & symbols
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const sampleFile = path.join(srcDir, 'sample.ts');
    fs.writeFileSync(sampleFile, `
export function add(a: number, b: number): number {
  return a + b;
}

export class Calculator {
  multiply(x: number, y: number): number {
    return x * y;
  }
}
`, 'utf8');

    await store.upsertEntity<FileNode>(FileNode.dcr, {
      id: 'src/sample.ts',
      path: 'src/sample.ts',
      language: 'typescript'
    });

    await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
      id: 'src/sample.ts:add',
      title: 'add',
      filePath: 'src/sample.ts',
      kind: 'function',
      exported: true,
      line: 2
    });

    await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {
      id: 'src/sample.ts:Calculator',
      title: 'Calculator',
      filePath: 'src/sample.ts',
      kind: 'class',
      exported: true,
      line: 6
    });

    const found = await registry.execute('find_symbol', { name: 'add' }, ctx);
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('add');
    expect(found[0].line).toBe(2);

    const outline = await registry.execute('get_file_outline', { filePath: 'src/sample.ts' }, ctx);
    expect(outline.symbolCount).toBe(2);

    const slice = await registry.execute('get_symbol_source', {
      filePath: 'src/sample.ts',
      symbolName: 'add'
    }, ctx);
    expect(slice.code).toContain('export function add');

    const budget = await registry.execute('estimate_token_budget', {
      filePaths: ['src/sample.ts']
    }, ctx);
    expect(budget.fileCount).toBe(1);
    expect(budget.totalEstimatedTokens).toBeGreaterThan(0);
    expect(budget.contextRisk).toBe('Low');

    const blast = await registry.execute('analyze_blast_radius', { target: 'src/sample.ts' }, ctx);
    expect(blast.target).toBe('src/sample.ts');
    expect(blast.affectedFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('should run git and os facilities', async () => {
    const envInfo = await registry.execute('get_environment_info', {}, ctx);
    expect(envInfo.root).toBe(tempDir);
    expect(envInfo.platform).toBeDefined();

    const rootRes = await registry.execute('get_project_root', { startDir: tempDir }, ctx);
    expect(rootRes).toBeDefined();

    const cmdRes = await registry.execute('run_command', {
      command: 'echo "hello ai-workflow"'
    }, ctx);
    expect(cmdRes.success).toBe(true);
    expect(cmdRes.output).toContain('hello ai-workflow');

    const gitStatus = await registry.execute('get_git_status', {}, ctx);
    expect(gitStatus).toBeDefined();
  });

  it('should propose ADRs and manage scratchpad notes', async () => {
    const adr = await registry.execute('propose_decision', {
      title: 'Use Dual-Storage Semantika Architecture',
      decision: 'Split into SQLite disk and SQLite in-memory',
      context: 'Zero disk bloat for expression traces'
    }, ctx);

    expect(adr.id).toBeDefined();
    expect(adr.title).toBe('Use Dual-Storage Semantika Architecture');

    const appendRes = await registry.execute('append_scratchpad_note', {
      note: 'Verified dual-storage architecture with unit tests'
    }, ctx);
    expect(appendRes.note).toContain('Verified dual-storage');

    const pad = await registry.execute('read_scratchpad', {}, ctx);
    expect(pad.notesCount).toBe(1);
    expect(pad.content).toContain('Verified dual-storage');
  });

  it('should resolve test targets and triage test runs', async () => {
    const resolved = await registry.execute('resolve_test_target', {
      filePath: 'src/tools/registry.ts'
    }, ctx);
    expect(resolved.sourceFile).toBe('src/tools/registry.ts');

    const triage = await registry.execute('triage_test_failures', {
      testCommand: 'bun -e "process.exit(0)"'
    }, ctx);
    expect(triage.passed).toBe(true);
    expect(triage.summary).toContain('passed');
  });

  it('should evaluate custom JS scripts on the fly with script_eval', async () => {
    const evalRes = await registry.execute('script_eval', {
      code: 'return ctx.projectRoot;'
    }, ctx);

    expect(evalRes.success).toBe(true);
    expect(evalRes.result).toBe(tempDir);

    const evalStoreRes = await registry.execute('script_eval', {
      code: 'const tickets = await store.listEntities("Ticket"); return tickets.length;'
    }, ctx);

    expect(evalStoreRes.success).toBe(true);
    expect(typeof evalStoreRes.result).toBe('number');
  });
});
