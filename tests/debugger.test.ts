import { describe, test, expect, beforeAll } from 'bun:test';
import path from 'node:path';
import { WorkflowStore, findProjectRoot } from '../src/graph/store.ts';
import { parseLocations, extractLineSnippet, diagnoseTarget } from '../src/tools/debugger.ts';
import { initializeTools, registry } from '../src/tools/index.ts';

describe('AIWF Debugger and Triage Facility', () => {
  const root = findProjectRoot().root;
  let store: WorkflowStore;

  beforeAll(() => {
    store = new WorkflowStore(root);
    initializeTools();
  });

  test('parseLocations extracts file:line:col from direct format', () => {
    const res = parseLocations('src/cli.ts:42:10', root);
    expect(res).toHaveLength(1);
    expect(res[0].filePath).toBe('src/cli.ts');
    expect(res[0].line).toBe(42);
    expect(res[0].col).toBe(10);
  });

  test('parseLocations extracts frames from raw stack trace and filters node_modules', () => {
    const rawTrace = `
Error: Test assertion failure
    at runTest (/home/dharmax/work/ai-workflow/src/cli.ts:120:5)
    at Object.<anonymous> (/home/dharmax/work/ai-workflow/node_modules/bun/test.js:10:2)
    at processTicksAndRejections (src/tools/debugger.ts:45:12)
`;
    const res = parseLocations(rawTrace, root);
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(res.some(r => r.filePath === 'src/cli.ts' && r.line === 120)).toBe(true);
    expect(res.some(r => r.filePath === 'src/tools/debugger.ts' && r.line === 45)).toBe(true);
    expect(res.some(r => r.filePath.includes('node_modules'))).toBe(false);
  });

  test('extractLineSnippet slices target line with pointer', () => {
    const snippet = extractLineSnippet('src/tools/debugger.ts', 10, root, 2);
    expect(snippet).toContain('➜');
    expect(snippet).toContain('WorkflowStore');
  });

  test('extractLineSnippet handles non-existent file gracefully', () => {
    const snippet = extractLineSnippet('non/existent/file.ts', 10, root);
    expect(snippet).toContain('[File not found');
  });

  test('diagnoseTarget resolves location and blast radius', async () => {
    const report = await diagnoseTarget(store, 'src/tools/debugger.ts:20', root);
    expect(report.resolvedKind).toBe('location');
    expect(report.locations.length).toBeGreaterThan(0);
    expect(report.locations[0].filePath).toBe('src/tools/debugger.ts');
    expect(report.locations[0].snippet).toContain('➜');
    expect(report.blastRadius).toBeDefined();
  });

  test('debug_target tool is registered and executable in registry', async () => {
    const res = await registry.execute('debug_target', { target: 'src/tools/debugger.ts:10' }, { store, projectRoot: root });
    expect(res).toBeDefined();
    expect(res.target).toBe('src/tools/debugger.ts:10');
    expect(res.locations.length).toBe(1);
    expect(res.locations[0].line).toBe(10);
  });
});
