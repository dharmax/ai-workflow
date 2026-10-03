import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { ensureAstFresh, withAstSnapshot } from '../src/graph/indexer.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';

describe('truthful primitives', () => {
  let root: string;
  let store: WorkflowStore;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-truth-'));
    store = new WorkflowStore(root);
    initializeTools();
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', strict: true } }));
  });
  afterEach(async () => {
    await closeAllTsLspClients();
    await closeAllTs6RefactorClients();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns an entire long declaration, exact references, and replaces only that function through safe preview/apply', async () => {
    const declaration = `export function compute(value: number): number {\n${Array.from({ length: 65 }, (_, i) => `  // comment ${i} with } and {`).join('\n')}\n  return value + 1;\n}`;
    fs.writeFileSync(path.join(root, 'unit.ts'), `${declaration}\nexport function neighbor() { return 99; }\n`);
    fs.writeFileSync(path.join(root, 'caller.ts'), 'import { compute } from "./unit"; export const answer = compute(1);\n');
    const ctx = { store, projectRoot: root };
    const source = await registry.execute('get_symbol_source', { filePath: 'unit.ts', symbolName: 'compute' }, ctx);
    expect(source.exact).toBe(true);
    expect(source.code).toBe(declaration);
    const references = await registry.execute('get_exact_references', { filePath: 'unit.ts', symbolName: 'compute' }, ctx);
    expect(references.exact).toBe(true);
    expect(references.references.some((r: { uri: string }) => r.uri.endsWith('/caller.ts'))).toBe(true);
    const callers = await registry.execute('get_exact_callers', { filePath: 'unit.ts', symbolName: 'compute' }, ctx);
    expect(callers.callers.some((call: { from: { uri: string } }) => call.from.uri.endsWith('/caller.ts'))).toBe(true);
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const request = { action: 'replace_symbol' as const, target: { type: 'symbol' as const, filePath: 'unit.ts', symbolName: 'compute' }, replacement: 'export function compute(value: number): number { return value + 2; }' };
    const preview = await engine.previewChange(request);
    expect(preview.blocked).toBe(false);
    expect(fs.readFileSync(path.join(root, 'unit.ts'), 'utf8')).toContain('return value + 1');
    const applied = await engine.applyChange(request, preview.fingerprint);
    expect(applied.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, 'unit.ts'), 'utf8')).toBe(`${request.replacement}\nexport function neighbor() { return 99; }\n`);
    const module = await import(path.join(root, 'unit.ts'));
    expect(module.compute(4)).toBe(6);
    expect(module.neighbor()).toBe(99);
  });

  it('does not write unchanged external dependencies, including after restart, and reuses freshness only within a scope', async () => {
    const dep = path.join(root, 'dependency');
    fs.mkdirSync(dep);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { 'fixture-lib': 'file:./dependency' } }));
    fs.writeFileSync(path.join(dep, 'package.json'), JSON.stringify({ main: './index.ts' }));
    fs.writeFileSync(path.join(dep, 'index.ts'), 'export function helper() { return 1; }');
    await ensureAstFresh(store, root);
    store.close();
    store = new WorkflowStore(root);
    let writes = 0;
    const original = store.upsertEntity.bind(store);
    store.upsertEntity = (async (...args: Parameters<typeof original>) => { writes++; return original(...args); }) as typeof store.upsertEntity;
    await withAstSnapshot(async () => {
      const first = ensureAstFresh(store, root);
      expect(ensureAstFresh(store, root)).toBe(first);
      await first;
    });
    expect(writes).toBe(0);
    fs.writeFileSync(path.join(dep, 'index.ts'), 'export function helperChanged() { return 123; }');
    await ensureAstFresh(store, root);
    expect(writes).toBeGreaterThan(0);
  });
});
