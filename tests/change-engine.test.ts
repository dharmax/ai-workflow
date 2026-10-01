import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Epic, Feature, UserStory, Ticket, SymbolNode } from '../src/graph/ontology.ts';
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
      expect(
        engine.applyChange({
          action: 'rename_symbol',
          target: { type: 'symbol', filePath: 'counter.ts', symbolName: 'count' },
          newName: 'totalCount'
        }, preview.fingerprint)
      ).rejects.toThrow(/modified since preview/i);
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

      const ctx = { store, projectRoot: tmpDir };

      // Tool call: preview_change
      const preview: any = await registry.execute('preview_change', {
        action: 'rename_symbol',
        target: { type: 'symbol', filePath: 'foo.ts', symbolName: 'calculateValue' },
        newName: 'getVal'
      }, ctx);

      expect(preview.blocked).toBe(false);
      expect(preview.fingerprint).toBeDefined();

      // Tool call: apply_change
      const applyResult: any = await registry.execute('apply_change', {
        request: {
          action: 'rename_symbol',
          target: { type: 'symbol', filePath: 'foo.ts', symbolName: 'calculateValue' },
          newName: 'getVal'
        },
        fingerprint: preview.fingerprint
      }, ctx);

      expect(applyResult.ok).toBe(true);
      expect(fs.readFileSync(fooFile, 'utf8')).toContain('export function getVal');
    });
  });
});
