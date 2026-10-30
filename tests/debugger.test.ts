import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { FileNode, SymbolNode } from '../src/model/ontology.ts';
import { ensureAstFresh } from '../src/graph/indexer.ts';
import { parseLocations, extractLineSnippet, diagnoseTarget } from '../src/tools/debugger.ts';
import { initializeTools, commandRegistry } from '../src/tools/index.ts';

describe('AIWF Debugger and Triage Facility', () => {
  let root: string;
  let store: WorkflowStore;
  const source = 'export function greet(name: string) {\n  return name.toUpperCase();\n}\n';

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-debugger-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/greet.ts'), source);
    fs.writeFileSync(path.join(root, 'src/main.ts'),
      "import { greet } from './greet';\nexport function run() { return greet('Ada'); }\n");
    store = new WorkflowStore(root);
    initializeTools();
    await store.withExecutionContext('project-write', undefined, () => ensureAstFresh(store, root));
  });

  afterEach(() => {
    store?.close();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  test('parseLocations extracts file:line:col from direct format', () => {
    expect(parseLocations('src/greet.ts:2:10', root)).toEqual([
      {filePath: 'src/greet.ts', line: 2, col: 10}
    ]);
  });

  test('parseLocations extracts stack frames and filters node_modules', () => {
    const trace = `Error: failure
    at greet (${root}/src/greet.ts:2:10)
    at Object.<anonymous> (${root}/node_modules/bun/test.js:10:2)
    at run (src/main.ts:2:32)`;
    expect(parseLocations(trace, root)).toEqual([
      {filePath: 'src/greet.ts', line: 2, col: 10},
      {filePath: 'src/main.ts', line: 2, col: 32}
    ]);
  });

  test('extractLineSnippet slices the actual target line with pointer', () => {
    const snippet = extractLineSnippet('src/greet.ts', 2, root, 1);
    expect(snippet).toContain('➜');
    expect(snippet).toContain('return name.toUpperCase()');
  });

  test('extractLineSnippet handles non-existent file gracefully', () => {
    expect(extractLineSnippet('missing.ts', 10, root)).toContain('[File not found');
  });

  test('diagnoseTarget resolves location, enclosing symbol and dependent files', async () => {
    const report = await diagnoseTarget(store, 'src/greet.ts:2:10', root);
    expect(report.resolvedKind).toBe('location');
    expect(report.locations).toHaveLength(1);
    expect(report.locations[0]).toMatchObject({
      filePath: 'src/greet.ts', line: 2, column: 10,
      enclosingSymbol: {name: 'greet', kind: 'function', startLine: 1}
    });
    expect(report.locations[0].snippet).toContain('➜');
    expect(report.blastRadius?.affectedFiles.sort()).toEqual(['src/greet.ts', 'src/main.ts']);
  });

  test('debug_target independently executes read-only on a fresh index without mutations', async () => {
    const before = store.db.query('SELECT total_changes() AS count').get();
    const report = await commandRegistry.execute('debug_target', {target: 'greet'}, {store, projectRoot: root});
    expect(report.resolvedKind).toBe('symbol');
    expect(report.locations[0]).toMatchObject({
      filePath: 'src/greet.ts', line: 1,
      enclosingSymbol: {name: 'greet', kind: 'function', startLine: 1}
    });
    expect(report.blastRadius.affectedFiles.sort()).toEqual(['src/greet.ts', 'src/main.ts']);
    expect(store.db.query('SELECT total_changes() AS count').get()).toEqual(before);
  });

  for (const change of ['modified', 'created', 'deleted'] as const) {
    test(`debug_target refuses a ${change} stale index under read-only authority without mutation`, async () => {
      if (change === 'modified') fs.writeFileSync(path.join(root, 'src/greet.ts'), source + 'export const added = 1;\n');
      if (change === 'created') fs.writeFileSync(path.join(root, 'src/added.ts'), 'export const added = 1;\n');
      if (change === 'deleted') fs.unlinkSync(path.join(root, 'src/greet.ts'));
      const before = store.db.query('SELECT total_changes() AS count').get();
      await expect(commandRegistry.execute('debug_target', {target: 'src/greet.ts:2'}, {store, projectRoot: root}))
        .rejects.toThrow('AST index is stale');
      expect(store.db.query('SELECT total_changes() AS count').get()).toEqual(before);
      expect(await store.listEntities<SymbolNode>(SymbolNode.dcr, {title: 'added'})).toHaveLength(0);
    });
  }

  test('diagnoseTarget refreshes before looking up newly indexed symbols under write authority', async () => {
    fs.writeFileSync(path.join(root, 'src/greet.ts'), source + 'export function added() { return 1; }\n');
    const report = await store.withExecutionContext('project-write', undefined, () => diagnoseTarget(store, 'added', root));
    expect(report.resolvedKind).toBe('symbol');
    expect(report.locations[0].enclosingSymbol?.name).toBe('added');
    expect(report.locations[0].line).toBe(4);
  });

  test('aborted fresh read-only diagnostics do not return a current result', async () => {
    const controller = new AbortController();
    controller.abort(new Error('diagnostic cancelled'));
    await expect(commandRegistry.execute('debug_target', {target: 'src/greet.ts:2'},
      {store, projectRoot: root, signal: controller.signal})).rejects.toThrow('diagnostic cancelled');
  });

  test('cancellation during a fresh read settles before store cleanup', async () => {
    const controller = new AbortController();
    const before = store.db.query('SELECT total_changes() AS count').get();
    const operation = commandRegistry.execute('debug_target', {target: 'greet'},
      {store, projectRoot: root, signal: controller.signal});
    controller.abort(new Error('read cancelled'));
    await expect(operation).rejects.toThrow('read cancelled');
    expect(store.db.query('SELECT total_changes() AS count').get()).toEqual(before);
  });

  test('stale local dependency errors preserve the read-only freshness boundary', async () => {
    const dependency = path.join(root, 'node_modules/local');
    fs.mkdirSync(dependency, {recursive: true});
    fs.writeFileSync(path.join(dependency, 'package.json'), '{"main":"index.ts"}');
    fs.writeFileSync(path.join(dependency, 'index.ts'), 'export const value = 1;');
    fs.writeFileSync(path.join(root, 'package.json'), '{"dependencies":{"local":"file:./node_modules/local"}}');
    await store.withExecutionContext('project-write', undefined, () => ensureAstFresh(store, root));
    await commandRegistry.execute('debug_target', {target: 'greet'}, {store, projectRoot: root});
    fs.writeFileSync(path.join(dependency, 'index.ts'), 'export const value = 123;');
    const before = store.db.query('SELECT total_changes() AS count').get();
    await expect(commandRegistry.execute('debug_target', {target: 'greet'}, {store, projectRoot: root}))
      .rejects.toThrow('AST index is stale');
    expect(store.db.query('SELECT total_changes() AS count').get()).toEqual(before);
  });

  test('cancellation during refresh settles before closing the store and permits a new owner', async () => {
    fs.writeFileSync(path.join(root, 'src/greet.ts'), source + 'export const added = 1;\n');
    const controller = new AbortController();
    const before = await store.getEntity<FileNode>('src/greet.ts', FileNode.dcr);
    let reached = false;
    const operation = store.withExecutionContext('project-write', controller.signal, () =>
      ensureAstFresh(store, root, {onProgress: () => {
        reached = true;
        controller.abort(new Error('refresh cancelled'));
      }}));
    await expect(operation).rejects.toThrow();
    expect(reached).toBe(true);
    expect(await store.getEntity<FileNode>('src/greet.ts', FileNode.dcr)).toEqual(before);
    expect(await store.listEntities<SymbolNode>(SymbolNode.dcr, {title: 'added'})).toHaveLength(0);
    // A new store must acquire admission immediately, rather than wait for the cancelled lease.
    store.close();
    store = new WorkflowStore(root);
    await store.withExecutionContext('project-write', undefined, () => ensureAstFresh(store, root));
    expect(await store.listEntities<SymbolNode>(SymbolNode.dcr, {title: 'added'})).toHaveLength(1);
  });
});
