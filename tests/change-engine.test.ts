import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Epic, Feature, UserStory, Ticket, SymbolNode } from '../src/model/ontology.ts';
import { indexSingleFile, ensureAstFresh } from '../src/graph/indexer.ts';
import { closeAllTsLspClients, TsLspClient } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { initializeTools, registry } from '../src/tools/index.ts';

describe('AIWF-NATIVE-CODE-CHANGE', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-code-change-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ai-workflow', 'state'), { recursive: true });
    store = new WorkflowStore(tmpDir);

    // tsconfig for clean LSP operations
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        target: 'ESNext',
        moduleResolution: 'bundler',
        strict: true
      }
    }, null, 2));
  });

  afterEach(async () => {
    await closeAllTsLspClients();
    await closeAllTs6RefactorClients();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Fixture A: Exact Symbol Rename & Causal Anchor Continuity', () => {
    it('previews with zero disk mutation, updates all imports/calls, and migrates Ticket modifies anchor', async () => {
      const aFile = path.join(tmpDir, 'a.ts');
      const bFile = path.join(tmpDir, 'b.ts');
      const testFile = path.join(tmpDir, 'service.test.ts');

      fs.writeFileSync(aFile, 'export function parseData(raw: string): number {\n  return parseInt(raw, 10);\n}\n');
      fs.writeFileSync(bFile, 'import { parseData } from "./a";\n\nexport function run() {\n  return parseData("42");\n}\n');
      fs.writeFileSync(testFile, 'import { parseData } from "./a";\n\nconsole.log(parseData("100"));\n');

      await indexSingleFile(store, aFile, 'a.ts', tmpDir);
      await indexSingleFile(store, bFile, 'b.ts', tmpDir);
      await indexSingleFile(store, testFile, 'service.test.ts', tmpDir);

      // Create Product Hierarchy: Feature -> Story -> Ticket -> parseData
      const feature = await store.upsertEntity<Feature>(Feature.dcr, {
        id: 'FEAT-PARSER',
        title: 'Input Parser Subsystem',
        status: 'accepted'
      });
      const story = await store.upsertEntity<UserStory>(UserStory.dcr, {
        id: 'STORY-PARSE',
        title: 'Parse string to integer safely',
        status: 'accepted'
      });
      await store.relate(feature, 'contains', story);

      const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-PARSER-REFACTOR',
        title: 'Rename parseData to parseSafeInt',
        lane: 'In Progress'
      });
      await store.relate(ticket, 'addresses', story);

      const oldSymbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: 'a.ts', title: 'parseData' });
      expect(oldSymbols.length).toBe(1);
      const oldSymbolAnchor = oldSymbols[0];
      await store.relate(ticket, 'modifies', oldSymbolAnchor);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });

      // 1. PREVIEW CHANGE
      const preview = await engine.previewChange({
        action: 'rename_symbol',
        target: { type: 'symbol', filePath: 'a.ts', symbolName: 'parseData' },
        newName: 'parseSafeInt',
        productContextEntityId: 'STORY-PARSE'
      });

      expect(preview.blocked).toBe(false);
      expect(preview.affectedFiles.length).toBe(3); // a.ts, b.ts, service.test.ts
      expect(preview.fingerprint).toBeDefined();
      expect(preview.productImpact).toBeDefined();
      expect(preview.productImpact?.entityId).toBe('STORY-PARSE');

      // Verify ZERO disk mutation occurred during preview
      expect(fs.readFileSync(aFile, 'utf8')).toContain('parseData');
      expect(fs.readFileSync(bFile, 'utf8')).toContain('parseData');

      // 2. APPLY CHANGE
      const applyRes = await engine.applyChange({
        action: 'rename_symbol',
        target: { type: 'symbol', filePath: 'a.ts', symbolName: 'parseData' },
        newName: 'parseSafeInt',
        productContextEntityId: 'STORY-PARSE'
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);
      expect(applyRes.filesTouched.length).toBe(3);
      expect(applyRes.verification.passed).toBe(true);
      // applyChange checked its own edit/graph invariants, not compiler diagnostics or project tests.
      expect(applyRes.verification.diagnosticsOk).toBeUndefined()
      expect(applyRes.verification.typecheckOk).toBeUndefined()
      expect(applyRes.verification.testsOk).toBeUndefined()

      // Verify disk files were cleanly rewritten by TS7 LSP
      expect(fs.readFileSync(aFile, 'utf8')).toContain('export function parseSafeInt');
      expect(fs.readFileSync(bFile, 'utf8')).toContain('import { parseSafeInt } from "./a";');
      expect(fs.readFileSync(bFile, 'utf8')).toContain('return parseSafeInt("42");');
      expect(fs.readFileSync(testFile, 'utf8')).toContain('import { parseSafeInt } from "./a";');

      // 3. Verify durable anchor migration: Ticket --modifies--> parseSafeInt
      const newSymbols = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: 'a.ts', title: 'parseSafeInt' });
      expect(newSymbols.length).toBe(1);
      const newAnchor = newSymbols[0];
      expect(newAnchor.title).toBe('parseSafeInt');

      const incomingModifies = await store.getIncoming(newAnchor.id, 'modifies');
      expect(incomingModifies.length).toBe(1);
      expect(incomingModifies[0].sourceId).toBe(ticket.id);

      // Old anchor relation should no longer exist
      const staleIncoming = await store.getIncoming(oldSymbolAnchor.id, 'modifies');
      expect(staleIncoming.length).toBe(0);
    });
  });

  describe('Fixture B: Stale Preview Fingerprint Protection', () => {
    it('rejects applyChange when a file is modified on disk after preview was generated', async () => {
      const srcFile = path.join(tmpDir, 'counter.ts');
      fs.writeFileSync(srcFile, 'export let count = 0;\nexport function increment() { count++; }\n');
      await indexSingleFile(store, srcFile, 'counter.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const preview = await engine.previewChange({
        action: 'rename_symbol',
        target: { type: 'symbol', filePath: 'counter.ts', symbolName: 'count' },
        newName: 'totalCount'
      });

      expect(preview.blocked).toBe(false);

      // Interleaved manual edit on disk!
      fs.writeFileSync(srcFile, '// Comment added\nexport let count = 1;\nexport function increment() { count++; }\n');

      // Applying with prior preview fingerprint MUST throw / reject before any mutation
      await expect(
        engine.applyChange({
          action: 'rename_symbol',
          target: { type: 'symbol', filePath: 'counter.ts', symbolName: 'count' },
          newName: 'totalCount'
        }, preview.fingerprint)
      ).rejects.toThrow(/modified since preview/i);

      // A new engine has no retained preview: the full fingerprint check still rejects.
      const freshEngine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const failure = await freshEngine.applyChange(preview.request, preview.fingerprint)
        .then(() => null, error => error as Error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure!.message).toMatch(/Stale change preview|modified since preview/i);
      expect(fs.readFileSync(srcFile, 'utf8')).toBe('// Comment added\nexport let count = 1;\nexport function increment() { count++; }\n');
    });
  });

  describe('Fixture C: Native File Rename (workspace/willRenameFiles)', () => {
    it('renames file and automatically updates static imports across the workspace', async () => {
      const utilFile = path.join(tmpDir, 'util.ts');
      const mainFile = path.join(tmpDir, 'main.ts');

      fs.writeFileSync(utilFile, 'export const GREETING = "Hello World";\n');
      fs.writeFileSync(mainFile, 'import { GREETING } from "./util";\nconsole.log(GREETING);\n');

      await indexSingleFile(store, utilFile, 'util.ts', tmpDir);
      await indexSingleFile(store, mainFile, 'main.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const newPath = 'core/util.ts';

      const preview = await engine.previewChange({
        action: 'rename_file',
        oldPath: 'util.ts',
        newPath
      });

      expect(preview.blocked).toBe(false);
      expect(preview.affectedFiles).toContain('util.ts');

      const applyRes = await engine.applyChange({
        action: 'rename_file',
        oldPath: 'util.ts',
        newPath
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);

      // util.ts was moved to core/util.ts
      expect(fs.existsSync(path.join(tmpDir, 'util.ts'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'core', 'util.ts'))).toBe(true);

      // main.ts import was updated to ./core/util
      const updatedMain = fs.readFileSync(mainFile, 'utf8');
      expect(updatedMain).toContain('./core/util');
    });
  });

  describe('Fixture D: Unsupported Rich Refactor Probe', () => {
    it('safely blocks unsupported native refactors and returns explicit unsupported notice without guessing', async () => {
      const srcFile = path.join(tmpDir, 'calc.ts');
      fs.writeFileSync(srcFile, 'export function compute() { const x = 10 + 20; return x; }\n');
      await indexSingleFile(store, srcFile, 'calc.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const preview = await engine.previewChange({
        action: 'refactor',
        target: { type: 'symbol', filePath: 'calc.ts', symbolName: 'compute' },
        refactorKind: 'unsupported_magic_transform'
      });

      expect(preview.blocked).toBe(true);
      expect(preview.blockReason).toContain('Unsupported refactor');
      expect(fs.readFileSync(srcFile, 'utf8')).toContain('const x = 10 + 20');
    });
  });

  describe('Fixture E: Tool Registry Integration (preview_change & apply_change)', () => {
    it('executes preview_change and apply_change via registered domain tools', async () => {
      initializeTools();

      const fooFile = path.join(tmpDir, 'foo.ts');
      fs.writeFileSync(fooFile, 'export function calculateValue(): number { return 100; }\n');
      await indexSingleFile(store, fooFile, 'foo.ts', tmpDir);

      const ctx = { store, projectRoot: tmpDir, executionAuthority: 'project-write' as const };

      // Tool call: preview_change
      const preview: any = await registry.execute('preview_change', {
        action: 'rename_symbol',
        target: { type: 'symbol', filePath: 'foo.ts', symbolName: 'calculateValue' },
        newName: 'getVal'
      }, ctx);

      expect(preview.blocked).toBe(false);
      expect(preview.fingerprint).toBeDefined();

      // An external source write requires a Ticket. The internal engine remains usable by its owning domain.
      const request = {
        action: 'rename_symbol' as const,
        target: {type: 'symbol' as const, filePath: 'foo.ts', symbolName: 'calculateValue'},
        newName: 'getVal'
      };
      await expect(registry.execute('apply_change', {request, fingerprint: preview.fingerprint}, ctx))
        .rejects.toThrow('ticketId');
      const applyResult = await new CausalChangeEngine({store, projectRoot:tmpDir}).applyChange(request, preview.fingerprint);
      expect(applyResult.ok).toBe(true);
      expect(fs.readFileSync(fooFile, 'utf8')).toContain('export function getVal');
    });
  });
});

describe('Public CLI file move with external imports', () => {
  let root: string;
  const cli = path.resolve(import.meta.dir, '../src/cli.ts');
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-cli-external-move-'));
    fs.mkdirSync(path.join(root, 'node_modules/external-lib'), {recursive: true});
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({dependencies: {'external-lib': 'file:./node_modules/external-lib'}}));
    fs.writeFileSync(path.join(root, 'node_modules/external-lib/package.json'), JSON.stringify({name: 'external-lib', main: 'index.ts'}));
    fs.writeFileSync(path.join(root, 'node_modules/external-lib/index.ts'), 'export const value = 42;\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions: {module: 'ESNext', moduleResolution: 'bundler', target: 'ESNext'}}));
    fs.writeFileSync(path.join(root, 'a.ts'), 'import {value} from "external-lib";\nexport const answer = value;\n');
    fs.writeFileSync(path.join(root, 'b.ts'), 'export {answer} from "./a";\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.ai-workflow/\n');
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture']]) {
      expect(Bun.spawnSync(['git', ...args], {cwd: root}).success).toBe(true);
    }
    const store = new WorkflowStore(root);
    try {
      initializeTools();
      await ensureAstFresh(store, root);
      const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {id: 'CLI-MOVE', title: 'Move external importer', body: '', lane: 'Todo', acceptanceCriteria: ['Preserve external imports and public exports']});
      await store.relate(ticket, 'modifies', (await store.getEntity('a.ts', 'FileNode'))!);
      await registry.execute('claim_ticket', {ticketId: 'CLI-MOVE', agentId: 'operator'}, {store, projectRoot: root, executionAuthority: 'project-write'});
      expect((await store.getOutgoing('a.ts', 'imports')).some(edge => edge.targetType === 'ModuleNode')).toBe(true);
    } finally { store.close(); }
  });
  afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

  it('moves through preview/apply CLI processes, persists effects and preserves public exports', async () => {
    const run = async (args: string[]) => {
      const child = Bun.spawn(['bun', cli, ...args], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect({code, stderr}).toEqual({code: 0, stderr: ''});
      return JSON.parse(stdout);
    };
    for (const [oldPath, newPath] of [['a.ts', 'nested/moved.ts']]) {
      const request = {action: 'rename_file', oldPath, newPath};
      const p = await run(['source', 'change', 'preview', JSON.stringify(request), '--ticket', 'CLI-MOVE', '--agent', 'operator']);
      expect(p.blocked).toBe(false);
      expect(fs.existsSync(path.join(root, oldPath!))).toBe(true);
      const result = await run(['source', 'change', 'apply', JSON.stringify(request), '--ticket', 'CLI-MOVE', '--agent', 'operator', '--fingerprint', p.fingerprint]);
      expect(result.ok).toBe(true);
      expect(result.verification.passed).toBe(true);
      expect(result.filesRenamed).toEqual([{from: oldPath, to: newPath}]);
      expect(fs.existsSync(path.join(root, oldPath!))).toBe(false);
      expect(fs.readFileSync(path.join(root, newPath!), 'utf8')).toContain('from "external-lib"');
      const store = new WorkflowStore(root);
      try {
        const target = (await store.getEntity(newPath!, 'FileNode'))!;
        expect(target).not.toBeNull();
        expect(await store.getOutgoing(oldPath!, 'imports')).toEqual([]);
        expect((await store.getOutgoing(newPath!, 'imports')).some(edge => edge.targetType === 'ModuleNode')).toBe(true);
        const ticket = (await store.getEntity<Ticket>('CLI-MOVE', Ticket.dcr))!;
        expect((await store.getOutgoing(ticket.id, 'modifies')).map(edge => edge.targetId)).toContain(target.id);
        const scope = (ticket as Ticket & {metadata: {governedScope: {effects: Array<{fingerprint: string; after: Record<string, string>}>}}}).metadata.governedScope;
        expect(scope.effects.at(-1)?.fingerprint).toBe(p.fingerprint);
        expect(scope.effects.at(-1)?.after[oldPath!]).toBe('missing');
      } finally { store.close(); }
    }
    expect(fs.readFileSync(path.join(root, 'b.ts'), 'utf8')).toContain('./nested/moved');
    expect((await import(path.join(root, 'b.ts'))).answer).toBe(42);
  }, 30000);
});

describe('Governed LSP operation scope', () => {
  let root: string, store: WorkflowStore;
  const ctx = () => ({store, projectRoot: root, executionAuthority: 'project-write' as const});
  const preview = (request: import('../src/change/types.ts').ChangeRequest, agentId = 'operator') =>
    registry.execute('preview_change', {...request, ticketId: 'LSP', agentId}, ctx());
  const apply = (request: import('../src/change/types.ts').ChangeRequest, fingerprint: string, agentId = 'operator') =>
    registry.execute('apply_change', {request, fingerprint, ticketId: 'LSP', agentId}, ctx());
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-lsp-scope-'));
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions: {module: 'ESNext', moduleResolution: 'bundler', target: 'ESNext'}}));
    fs.writeFileSync(path.join(root, 'a.ts'), 'export function calculate(value: number) {\n  const doubled = value * 2;\n  return doubled + 1;\n}\n');
    fs.writeFileSync(path.join(root, 'b.ts'), 'import { calculate } from "./a";\nexport const answer = calculate(20);\n');
    Bun.spawnSync(['git', 'init', '-q'], {cwd: root});
    Bun.spawnSync(['git', 'add', '.'], {cwd: root});
    Bun.spawnSync(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], {cwd: root});
    store = new WorkflowStore(root); initializeTools();
    await ensureAstFresh(store, root);
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {id: 'LSP', title: 'Refactor calculate', lane: 'Todo', acceptanceCriteria: ['Preserve behavior']});
    await store.relate(ticket, 'modifies', (await store.getEntity('a.ts', 'FileNode'))!);
    await registry.execute('claim_ticket', {ticketId: 'LSP', agentId: 'operator'}, ctx());
  });
  afterEach(async () => {await closeAllTsLspClients(); await closeAllTs6RefactorClients(); store.close(); fs.rmSync(root, {recursive: true, force: true});});

  for (const request of [
    {action: 'rename_file', oldPath: 'a.ts', newPath: 'nested/moved.ts'},
    {action: 'rename_symbol', target: {type: 'symbol', filePath: 'a.ts', symbolName: 'calculate'}, newName: 'compute'},
    {action: 'refactor', target: {type: 'symbol', filePath: 'a.ts', symbolName: 'calculate'}, refactorKind: 'refactor.move.newFile', actionName: 'Move to a new file'},
    {action: 'refactor', target: {type: 'range', filePath: 'a.ts', startLine: 1, startCharacter: 2, endLine: 2, endCharacter: 21}, refactorKind: 'extract', actionName: 'Extract to function in module scope'}
  ] satisfies import('../src/change/types.ts').ChangeRequest[]) it(`authorizes ${request.action} ${'refactorKind' in request ? request.refactorKind : ''} once and applies exact LSP effects`, async () => {
    const before = fs.readFileSync(path.join(root, 'b.ts'), 'utf8');
    const p = await preview(request); expect(p.blocked).toBe(false);
    expect(fs.readFileSync(path.join(root, 'b.ts'), 'utf8')).toBe(before);
    if (request.action !== 'refactor' || request.refactorKind.includes('move')) expect(p.affectedFiles).toContain('b.ts');
    const result = await apply(request, p.fingerprint); expect(result.ok).toBe(true);
    expect(result.filesTouched.every((file: string) => p.affectedFiles.includes(file))).toBe(true);
    if (request.action === 'rename_file') {
      expect(fs.existsSync(path.join(root, 'a.ts'))).toBe(false);
      expect(fs.readFileSync(path.join(root, 'b.ts'), 'utf8')).toContain('./nested/moved');
    }
    if (request.action === 'rename_symbol') expect(fs.readFileSync(path.join(root, 'b.ts'), 'utf8')).toContain('compute(20)');
  });

  it('rejects unauthorized operations and manual edits outside authored scope', async () => {
    for (const request of [
      {action: 'rename_file', oldPath: 'b.ts', newPath: 'other.ts'},
      {action: 'rename_symbol', target: {type: 'symbol', filePath: 'b.ts', symbolName: 'answer'}, newName: 'result'},
      {action: 'replace_text', filePath: 'b.ts', oldText: '20', newText: '21'},
      {action: 'source_change', changes: [{action: 'replace_text', filePath: 'a.ts', oldText: '2', newText: '3'}, {action: 'replace_text', filePath: 'b.ts', oldText: '20', newText: '21'}]}
    ] satisfies import('../src/change/types.ts').ChangeRequest[]) {
      let failure: unknown;
      try {await preview(request);} catch (error) {failure = error;}
      expect(String(failure)).toContain('Scope expansion');
    }
  });

  it('retains lease, dirty generated-file and stale preview protection', async () => {
    const request = {action: 'rename_file' as const, oldPath: 'a.ts', newPath: 'moved.ts'};
    let failure: unknown;
    try {await preview(request, 'intruder');} catch (error) {failure = error;}
    expect(String(failure)).toContain('lease');
    const p = await preview(request);
    fs.appendFileSync(path.join(root, 'b.ts'), '// user work\n');
    failure = undefined;
    try {await apply(request, p.fingerprint);} catch (error) {failure = error;}
    expect(String(failure)).toContain('Stale');
    failure = undefined;
    try {await preview(request);} catch (error) {failure = error;}
    expect(String(failure)).toContain('Dirty target');
    expect(fs.existsSync(path.join(root, 'a.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'moved.ts'))).toBe(false);
  });

  it('keeps authored and out-of-scope module relations behind exclusive governance admission', async () => {
    const {ModuleNode} = await import('../src/model/ontology.ts');
    const module = await store.upsertEntity(ModuleNode.dcr, {id: 'mod:dependency', title: 'dependency', path: 'dependency', status: 'implemented'});
    const file = (await store.getEntity('a.ts', 'FileNode'))!;
    for (const state of ['authored', 'derived']) {
      await store.relate(file, 'imports', module, {state});
      const admission = await store.admitGovernance('governed');
      try {
        let failure: unknown;
        try {
          await store.withGovernedIndexing(admission, state === 'authored' ? ['a.ts'] : ['b.ts'],
            () => store.unrelate(file.id, 'imports', module.id));
        } catch (error) {failure = error;}
        expect(String(failure)).toContain('Governance admission conflict');
        expect((await store.getOutgoing(file.id, 'imports')).some(edge => edge.targetId === module.id)).toBe(true);
      } finally {await store.releaseGovernance(admission);}
      await store.unrelate(file.id, 'imports', module.id);
    }
  });

  it('reports post-write failures as partial application with the nested cause', async () => {
    const request = {action: 'rename_file' as const, oldPath: 'a.ts', newPath: 'moved.ts'};
    const p = await preview(request);
    const original = store.withGovernedIndexing;
    store.withGovernedIndexing = async () => {throw new Error('Index cleanup failed', {cause: new Error('injected persistence failure')});};
    let failure: unknown;
    try {await apply(request, p.fingerprint);} catch (error) {failure = error;}
    finally {store.withGovernedIndexing = original;}
    expect(String(failure)).toContain('PARTIALLY APPLIED: filesystem changes committed');
    expect(String(failure)).toContain('Index cleanup failed Caused by: injected persistence failure');
    expect(String(failure)).toContain('Do not reapply');
    expect(fs.existsSync(path.join(root, 'a.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'moved.ts'))).toBe(true);
  });

  it('rejects escaped and protected destinations', async () => {
    for (const newPath of ['../escape.ts', '.git/moved.ts', '.ai-workflow/moved.ts']) {
      try {const p = await preview({action: 'rename_file', oldPath: 'a.ts', newPath}); expect(p.blocked).toBe(true);}
      catch (error) {expect(String(error)).toMatch(/workspace|canonical workflow/);}
    }
    expect(fs.existsSync(path.join(root, 'a.ts'))).toBe(true);
  });
});
