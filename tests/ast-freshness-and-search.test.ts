import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { FileNode, SymbolNode, ModuleNode } from '../src/graph/ontology.ts';
import { indexCodebase, ensureAstFresh } from '../src/graph/indexer.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { processShellInput } from '../src/shell.ts';

describe('AST Coverage, Incremental Freshness, and Graph Search API', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    initializeTools();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-ast-test-'));
    store = new WorkflowStore(tmpDir);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('covers all JS/TS symbol types in AST graph (classes, methods, interfaces, types, enums, destructuring)', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const complexFile = path.join(srcDir, 'kitchen-sink.ts');
    fs.writeFileSync(
      complexFile,
      `
import { helper } from './helper';

export const API_PORT = 8080;
export let requestCounter = 0;
export const { configA, configB: renamedB } = { configA: 'a', configB: 'b' };
export const [headItem, ...tailItems] = ['first', 'second'];
export const handlerFunc = async (req: string) => req.trim();

export function standardFunc<T>(val: T): T {
  return val;
}

export function* idGenerator() {
  yield 1;
}

export class EngineService {
  private status = 'stopped';
  public readonly version = 1;

  constructor(public serviceName: string) {}

  get isRunning(): boolean {
    return this.status === 'running';
  }

  set isRunning(val: boolean) {
    this.status = val ? 'running' : 'stopped';
  }

  async startEngine(opts: { timeout: number }): Promise<void> {
    this.status = 'running';
  }

  static createDefault(): EngineService {
    return new EngineService('default');
  }
}

export interface IServiceContract {
  serviceId: string;
  executeContract(): void;
}

export type ServiceMode = 'active' | 'passive';

export enum EngineState {
  Init = 'INIT',
  Running = 'RUNNING',
  Terminated = 'TERMINATED'
}

export { standardFunc as exportedAlias };
`,
      'utf8'
    );

    const res = await indexCodebase(store, tmpDir);
    expect(res.filesCount).toBeGreaterThanOrEqual(1);
    expect(res.symbolsCount).toBeGreaterThanOrEqual(15);

    const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr);
    const names = symbols.map(s => (s as any).title);
    const kinds = symbols.map(s => (s as any).kind);

    // 1. Constants and variables
    expect(names).toContain('API_PORT');
    expect(names).toContain('requestCounter');

    // 2. Destructuring
    expect(names).toContain('configA');
    expect(names).toContain('renamedB');
    expect(names).toContain('headItem');
    expect(names).toContain('tailItems');

    // 3. Arrow function and standard functions
    expect(names).toContain('handlerFunc');
    expect(names).toContain('standardFunc');
    expect(names).toContain('idGenerator');

    // 4. Class and its members
    expect(names).toContain('EngineService');
    expect(names).toContain('constructor');
    expect(names).toContain('isRunning');
    expect(names).toContain('startEngine');
    expect(names).toContain('createDefault');
    expect(names).toContain('status');
    expect(names).toContain('version');

    // Verify container relationships
    const startEngineSym = symbols.find(s => (s as any).title === 'startEngine');
    expect(startEngineSym).toBeDefined();
    expect((startEngineSym as any).containerName).toBe('EngineService');

    const classSym = symbols.find(s => (s as any).title === 'EngineService');
    expect(classSym).toBeDefined();

    // Verify Class contains Method relation
    const classMembers = await store.getOutgoing(classSym!.id, 'contains');
    expect(classMembers.length).toBeGreaterThanOrEqual(4);

    // 5. Interface and Type
    expect(names).toContain('IServiceContract');
    expect(names).toContain('serviceId');
    expect(names).toContain('executeContract');
    expect(names).toContain('ServiceMode');

    // 6. Enum and enum members
    expect(names).toContain('EngineState');
    expect(names).toContain('Init');
    expect(names).toContain('Running');
    expect(names).toContain('Terminated');

    // 7. Re-export alias
    expect(names).toContain('exportedAlias');
  });

  it('keeps AST always up to date using incremental file timestamp comparisons', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const fileA = path.join(srcDir, 'service-a.ts');
    const fileB = path.join(srcDir, 'service-b.ts');

    fs.writeFileSync(fileA, 'export function computeA() { return 1; }', 'utf8');
    fs.writeFileSync(fileB, 'export function computeB() { return 2; }', 'utf8');

    // Initial indexing
    const initialIndex = await indexCodebase(store, tmpDir);
    expect(initialIndex.filesCount).toBe(2);

    // 1. Unchanged codebase -> ensureAstFresh reports isStale: false and 0 updated files
    const check1 = await ensureAstFresh(store, tmpDir);
    expect(check1.isStale).toBe(false);
    expect(check1.updatedFiles.length).toBe(0);
    expect(check1.deletedFiles.length).toBe(0);

    // 2. Modify fileA on disk with a future timestamp to simulate real edit
    await new Promise(r => setTimeout(r, 20));
    fs.writeFileSync(
      fileA,
      'export function computeA() { return 1; }\nexport function newlyAddedFunc() { return 42; }',
      'utf8'
    );
    const futureTime = new Date(Date.now() + 5000);
    fs.utimesSync(fileA, futureTime, futureTime);

    // 3. ensureAstFresh should detect ONLY fileA is modified and re-index it incrementally
    const check2 = await ensureAstFresh(store, tmpDir);
    expect(check2.isStale).toBe(true);
    expect(check2.updatedFiles).toEqual(['src/service-a.ts']);
    expect(check2.deletedFiles.length).toBe(0);

    // Verify newly added symbol is present
    const symbolsAfterEdit = await store.listEntities<SymbolNode>(SymbolNode.dcr);
    expect(symbolsAfterEdit.some(s => (s as any).title === 'newlyAddedFunc')).toBe(true);

    // 4. Delete fileB on disk
    fs.unlinkSync(fileB);

    // 5. ensureAstFresh should detect deletion and prune fileB and its symbols
    const check3 = await ensureAstFresh(store, tmpDir);
    expect(check3.isStale).toBe(true);
    expect(check3.deletedFiles).toEqual(['src/service-b.ts']);

    const symbolsAfterDelete = await store.listEntities<SymbolNode>(SymbolNode.dcr);
    expect(symbolsAfterDelete.some(s => (s as any).title === 'computeB')).toBe(false);
  });

  it('exposes rich symbol search with exact, regex, kind filter, and container names in MCP tool', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'app.ts'),
      `
export class AppRouter {
  initRoutes() {}
}
export function initRoutes() {}
export const initTimeout = 5000;
`,
      'utf8'
    );

    const ctx = { store, projectRoot: tmpDir };

    // 1. Substring search matches all 3
    const allInit = await registry.execute('find_symbol', { name: 'init' }, ctx);
    expect(allInit.length).toBe(3);

    // 2. Exact match matches only exact title 'initRoutes' or container 'AppRouter.initRoutes'
    const exactMatch = await registry.execute('find_symbol', { name: 'initRoutes', exact: true }, ctx);
    expect(exactMatch.length).toBe(2);
    expect(exactMatch.some((s: any) => s.containerName === 'AppRouter')).toBe(true);

    // 3. Kind filter for 'method'
    const methodOnly = await registry.execute('find_symbol', { name: 'init', kind: 'method' }, ctx);
    expect(methodOnly.length).toBe(1);
    expect(methodOnly[0].name).toBe('initRoutes');
    expect(methodOnly[0].containerName).toBe('AppRouter');
    expect(methodOnly[0].kind).toBe('method');

    // 4. Regex match
    const regexMatch = await registry.execute('find_symbol', { name: '^init.*out$', regex: true }, ctx);
    expect(regexMatch.length).toBe(1);
    expect(regexMatch[0].name).toBe('initTimeout');
  });

  it('exposes graph search API (search_graph) for entity search, predicates, and traversal', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'moduleA.ts'),
      `
import { utilB } from './moduleB';
export function runA() {
  utilB();
}
`,
      'utf8'
    );

    fs.writeFileSync(
      path.join(srcDir, 'moduleB.ts'),
      `
export function utilB() { return 123; }
`,
      'utf8'
    );

    await indexCodebase(store, tmpDir);
    const ctx = { store, projectRoot: tmpDir };

    // 1. Entity search
    const entitySearch = await registry.execute('search_graph', { query: 'runA' }, ctx);
    expect(entitySearch.mode).toBe('entity_search');
    expect(entitySearch.count).toBeGreaterThanOrEqual(1);
    expect(entitySearch.results[0].title).toBe('runA');

    // 2. Predicate search (imports)
    const importsSearch = await registry.execute('search_graph', {
      sourceId: 'src/moduleA.ts',
      predicate: 'imports'
    }, ctx);
    expect(importsSearch.mode).toBe('predicate_search');
    expect(importsSearch.results.some((r: any) => r.targetId.includes('moduleB'))).toBe(true);

    // 3. Call sites (calls)
    const callsSearch = await registry.execute('search_graph', {
      sourceId: 'src/moduleA.ts',
      predicate: 'calls'
    }, ctx);
    expect(callsSearch.results.some((r: any) => r.targetId.includes('utilB'))).toBe(true);

    // 4. Graph traversal
    const traversal = await registry.execute('search_graph', {
      sourceId: 'src/moduleA.ts',
      maxDepth: 2
    }, ctx);
    expect(traversal.mode).toBe('traversal');
    expect(traversal.entitiesCount).toBeGreaterThanOrEqual(2);
  });

  it('supports symbol, graph, callers, and deps commands seamlessly in interactive shell', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'calc.ts'),
      `
import { logger } from './logger';
export class MathHelper {
  add(a: number, b: number) {
    logger();
    return a + b;
  }
}
`,
      'utf8'
    );

    await indexCodebase(store, tmpDir);

    const session: any = {
      store,
      projectRoot: tmpDir,
      actor: {
        execute: async () => ({ mode: 'dev', answer: 'fallback' })
      }
    };

    // 1. Shell symbol command
    const symRes = await processShellInput('symbol add', session);
    expect(symRes.output).toContain('MathHelper.add');
    expect(symRes.output).toContain('src/calc.ts');

    // 2. Shell graph command
    const graphRes = await processShellInput('graph MathHelper', session);
    expect(graphRes.output).toContain('MathHelper');

    // 3. Shell callers command
    const callersRes = await processShellInput('callers logger', session);
    expect(callersRes.output).toContain('logger');

    // 4. Shell deps command
    const depsRes = await processShellInput('deps src/calc.ts', session);
    expect(depsRes.output).toContain('logger');
  });
});
