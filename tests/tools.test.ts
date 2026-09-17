import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initializeTools, type ToolContext } from '../src/tools/index.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { SymbolNode, FileNode } from '../src/graph/ontology.ts';

describe('Tool Registry & Deterministic Facilities', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;
  const registry = initializeTools();

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-tools-test-'));
    Bun.spawnSync(['git', 'init'], { cwd: tempDir });
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'temp-tools-test' }));
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

  it('should create, list, lease, prioritize, and transition tickets', async () => {
    const created = await registry.execute('create_ticket', {
      title: 'Implement JIT Compiler',
      lane: 'Todo',
      priority: 'P1',
      body: 'Synthesize codelets dynamically'
    }, ctx);

    expect(created.id).toBeDefined();
    expect(created.lane).toBe('Todo');
    expect(created.title).toBe('Implement JIT Compiler');

    const listed = await registry.execute('list_tickets', { lane: 'Todo' }, ctx);
    expect(listed.length).toBe(1);
    expect(listed[0].id).toBe(created.id);
    expect(listed[0].title).toBe('Implement JIT Compiler');

    // 1. Claim ticket for agent-alpha -> moves lane to In Progress
    const claimRes = await registry.execute('claim_ticket', {
      ticketId: created.id,
      agentId: 'agent-alpha',
      durationMinutes: 10
    }, ctx);
    expect(claimRes.success).toBe(true);
    expect(claimRes.claim?.agentId).toBe('agent-alpha');

    // 2. recommend_next_task should return the actively leased task
    const nextTaskActive = await registry.execute('recommend_next_task', { agentId: 'agent-alpha' }, ctx);
    expect(nextTaskActive.ticket).not.toBeNull();
    expect(nextTaskActive.ticket!.id).toBe(created.id);
    expect(nextTaskActive.ticket!.lane).toBe('In Progress');
    expect(nextTaskActive.reason).toContain('Active task currently in progress');

    // 3. Create a high-priority bug in Todo
    const bugTicket = await registry.execute('create_ticket', {
      id: 'BUG-001',
      title: 'Fix null pointer in indexer',
      lane: 'Todo',
      priority: 'P0',
      body: 'AST indexer throws when file is empty'
    }, ctx);

    // 4. Release lease on the first ticket
    const releaseRes = await registry.execute('release_ticket', {
      ticketId: created.id
    }, ctx);
    expect(releaseRes.success).toBe(true);

    // Put first ticket back to Todo
    await registry.execute('update_ticket_state', {
      ticketId: created.id,
      lane: 'Todo'
    }, ctx);

    // 5. recommend_next_task must prioritize the BUG over normal Todo task
    const nextTaskBug = await registry.execute('recommend_next_task', {}, ctx);
    expect(nextTaskBug.ticket).not.toBeNull();
    expect(nextTaskBug.ticket!.id).toBe('BUG-001');
    expect(nextTaskBug.reason).toContain('High-priority bug fix');

    // 6. Mark bug as Done
    await registry.execute('update_ticket_state', {
      ticketId: 'BUG-001',
      lane: 'Done'
    }, ctx);

    // 7. Now recommend_next_task selects the normal Todo task
    const nextTaskTodo = await registry.execute('recommend_next_task', {}, ctx);
    expect(nextTaskTodo.ticket).not.toBeNull();
    expect(nextTaskTodo.ticket!.id).toBe(created.id);
    expect(nextTaskTodo.reason).toContain('Next planned task in Todo lane');

    // 7b. Move task to In Progress without lease, verify recommend_next_task selects it
    await registry.execute('update_ticket_state', {
      ticketId: created.id,
      lane: 'In Progress'
    }, ctx);
    const nextTaskUnleased = await registry.execute('recommend_next_task', {}, ctx);
    expect(nextTaskUnleased.ticket).not.toBeNull();
    expect(nextTaskUnleased.ticket!.id).toBe(created.id);
    expect(nextTaskUnleased.reason).toContain('Unleased task in In Progress lane ready for pickup');

    // 8. Negative test: updating non-existent ticket must throw Error
    expect(registry.execute('update_ticket_state', {
      ticketId: 'TKT-NON-EXISTENT',
      lane: 'Done'
    }, ctx)).rejects.toThrow('Ticket TKT-NON-EXISTENT not found');
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

    // 1. Query existing symbol
    const found = await registry.execute('find_symbol', { name: 'add' }, ctx);
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('add');
    expect(found[0].kind).toBe('function');
    expect(found[0].line).toBe(2);

    // 2. Query non-existent symbol returns empty array
    const notFound = await registry.execute('find_symbol', { name: 'non_existent_fn' }, ctx);
    expect(notFound.length).toBe(0);

    // 3. File outline returns structured symbols
    const outline = await registry.execute('get_file_outline', { filePath: 'src/sample.ts' }, ctx);
    expect(outline.symbolCount).toBe(2);
    expect(outline.symbols.map((s: any) => s.name)).toEqual(['add', 'Calculator']);

    // 4. Symbol source slice
    const slice = await registry.execute('get_symbol_source', {
      filePath: 'src/sample.ts',
      symbolName: 'add'
    }, ctx);
    expect(slice.code).toContain('export function add(a: number, b: number): number {');

    // 5. Slice non-existent symbol returns null code
    const missingSlice = await registry.execute('get_symbol_source', {
      filePath: 'src/sample.ts',
      symbolName: 'non_existent'
    }, ctx);
    expect(missingSlice.code).toBeNull();

    // 6. Token budget estimation
    const budget = await registry.execute('estimate_token_budget', {
      filePaths: ['src/sample.ts']
    }, ctx);
    expect(budget.fileCount).toBe(1);
    expect(budget.totalEstimatedTokens).toBeGreaterThan(0);
    expect(budget.contextRisk).toBe('Low');

    // 7. Blast radius
    const blast = await registry.execute('analyze_blast_radius', { target: 'src/sample.ts' }, ctx);
    expect(blast.target).toBe('src/sample.ts');
    expect(blast.affectedFiles).toContain('src/sample.ts');
  });

  it('should run git and os facilities with error handling', async () => {
    const envInfo = await registry.execute('get_environment_info', {}, ctx);
    expect(envInfo.root).toBe(tempDir);
    expect(typeof envInfo.platform).toBe('string');
    expect(typeof envInfo.runtime).toBe('string');

    const rootRes = await registry.execute('get_project_root', { startDir: tempDir }, ctx);
    expect(rootRes.root).toBe(tempDir);

    const cmdRes = await registry.execute('run_command', {
      command: 'echo "hello ai-workflow"'
    }, ctx);
    expect(cmdRes.success).toBe(true);
    expect(cmdRes.output.trim()).toBe('hello ai-workflow');

    // Test failing command execution
    const failCmd = await registry.execute('run_command', {
      command: 'bun -e "process.exit(42)"'
    }, ctx);
    expect(failCmd.success).toBe(false);
    expect(failCmd.exitCode).toBe(42);

    const gitStatus = await registry.execute('get_git_status', {}, ctx);
    expect(typeof gitStatus.clean).toBe('boolean');
    expect(Array.isArray(gitStatus.modifiedFiles)).toBe(true);
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
    expect(triage.failingCount).toBe(0);
    expect(triage.summary).toContain('passed cleanly');

    // Test failure triage capturing error lines
    const triageFail = await registry.execute('triage_test_failures', {
      testCommand: 'bun -e "console.error(\\"FAIL: arithmetic test\\"); process.exit(1)"'
    }, ctx);
    expect(triageFail.passed).toBe(false);
    expect(triageFail.failingCount).toBeGreaterThanOrEqual(1);
  });

  it('should evaluate custom JS scripts on the fly and catch errors with script_eval', async () => {
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

    // Negative test 1: Syntax error
    const syntaxErrRes = await registry.execute('script_eval', {
      code: 'const x = ;'
    }, ctx);
    expect(syntaxErrRes.success).toBe(false);
    expect(syntaxErrRes.error).toBeDefined();

    // Negative test 2: Runtime thrown exception
    const runtimeErrRes = await registry.execute('script_eval', {
      code: 'throw new Error("Intentional test explosion");'
    }, ctx);
    expect(runtimeErrRes.success).toBe(false);
    expect(runtimeErrRes.error).toContain('Intentional test explosion');
  });
});
