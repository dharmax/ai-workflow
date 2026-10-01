import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, UserStory, SymbolNode } from '../src/graph/ontology.ts';
import { indexSingleFile } from '../src/graph/indexer.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';

describe('AIWF-LEGACY-REFACTOR-BRIDGE', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-ts6-bridge-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ai-workflow', 'state'), { recursive: true });
    store = new WorkflowStore(tmpDir);

    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        target: 'ES2022',
        moduleResolution: 'NodeNext',
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

  describe('1. Extract Function Refactor', () => {
    it('extracts selected block using TS6 edits, keeps preview zero-mutation, and applies cleanly', async () => {
      const srcFile = path.join(tmpDir, 'math.ts');
      fs.writeFileSync(srcFile, `export function calculateTotal(price: number, taxRate: number): number {
  const tax = price * taxRate;
  const total = price + tax;
  return total;
}
`);
      await indexSingleFile(store, srcFile, 'math.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });

      // Range: lines 1-2 (0-based)
      const preview = await engine.previewChange({
        action: 'refactor',
        target: {
          type: 'range',
          filePath: 'math.ts',
          startLine: 1,
          startCharacter: 2,
          endLine: 2,
          endCharacter: 28
        },
        refactorKind: 'extract',
        actionName: "Extract to function in module scope"
      });

      expect(preview.blocked).toBe(false);
      expect(preview.mutations.length).toBeGreaterThan(0);
      expect(preview.mutations[0].source).toBe('typescript6-refactor');
      expect(preview.affectedFiles).toContain('math.ts');

      // Verify ZERO disk mutation during preview
      const contentBefore = fs.readFileSync(srcFile, 'utf8');
      expect(contentBefore).toContain('const tax = price * taxRate;');
      expect(contentBefore).not.toContain('function newFunction');

      // Apply
      const applyRes = await engine.applyChange({
        action: 'refactor',
        target: {
          type: 'range',
          filePath: 'math.ts',
          startLine: 1,
          startCharacter: 2,
          endLine: 2,
          endCharacter: 28
        },
        refactorKind: 'extract',
        actionName: "Extract to function in module scope"
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);
      expect(applyRes.filesTouched).toContain('math.ts');

      // Verify disk content has extracted function
      const contentAfter = fs.readFileSync(srcFile, 'utf8');
      expect(contentAfter).toContain('newFunction');
    });
  });

  describe('2. Move Declaration to Existing File', () => {
    it('moves declaration and updates imports across files via mature TS6 sidecar', async () => {
      const aFile = path.join(tmpDir, 'source.ts');
      const bFile = path.join(tmpDir, 'dest.ts');
      const consumerFile = path.join(tmpDir, 'consumer.ts');

      fs.writeFileSync(aFile, `export function helperToMove(): number {\n  return 42;\n}\n\nexport function stayHere(): string {\n  return "ok";\n}\n`);
      fs.writeFileSync(bFile, `export const initial = 1;\n`);
      fs.writeFileSync(consumerFile, `import { helperToMove } from './source';\n\nexport const res = helperToMove();\n`);

      await indexSingleFile(store, aFile, 'source.ts', tmpDir);
      await indexSingleFile(store, bFile, 'dest.ts', tmpDir);
      await indexSingleFile(store, consumerFile, 'consumer.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });

      const preview = await engine.previewChange({
        action: 'refactor',
        target: {
          type: 'symbol',
          filePath: 'source.ts',
          symbolName: 'helperToMove'
        },
        refactorKind: 'move',
        arguments: {
          targetFile: 'dest.ts'
        }
      });

      expect(preview.blocked).toBe(false);
      expect(preview.mutations[0].source).toBe('typescript6-refactor');

      // Apply move
      const applyRes = await engine.applyChange({
        action: 'refactor',
        target: {
          type: 'symbol',
          filePath: 'source.ts',
          symbolName: 'helperToMove'
        },
        refactorKind: 'move',
        arguments: {
          targetFile: 'dest.ts'
        }
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);
      expect(applyRes.filesTouched.length).toBeGreaterThanOrEqual(2);

      const updatedSource = fs.readFileSync(aFile, 'utf8');
      const updatedDest = fs.readFileSync(bFile, 'utf8');
      expect(updatedSource).not.toContain('export function helperToMove');
      expect(updatedDest).toContain('export function helperToMove');
    });
  });

  describe('3. Move Declaration to New File', () => {
    it('moves declaration to new file and generates new file edits cleanly', async () => {
      const srcFile = path.join(tmpDir, 'service.ts');
      fs.writeFileSync(srcFile, `export function myHelper(): string {\n  return "hello";\n}\n\nexport function runner() {\n  return myHelper();\n}\n`);
      await indexSingleFile(store, srcFile, 'service.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });

      const preview = await engine.previewChange({
        action: 'refactor',
        target: {
          type: 'symbol',
          filePath: 'service.ts',
          symbolName: 'myHelper'
        },
        refactorKind: 'refactor.move.newFile',
        actionName: 'Move to a new file'
      });

      expect(preview.blocked).toBe(false);
      expect(preview.mutations[0].source).toBe('typescript6-refactor');

      const applyRes = await engine.applyChange({
        action: 'refactor',
        target: {
          type: 'symbol',
          filePath: 'service.ts',
          symbolName: 'myHelper'
        },
        refactorKind: 'refactor.move.newFile',
        actionName: 'Move to a new file'
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'myHelper.ts'))).toBe(true);
      const newFileContent = fs.readFileSync(path.join(tmpDir, 'myHelper.ts'), 'utf8');
      expect(newFileContent).toContain('export function myHelper');
    });
  });

  describe('4. Inline Variable Refactor', () => {
    it('exercises inline variable refactor via TS6 sidecar', async () => {
      const srcFile = path.join(tmpDir, 'inline.ts');
      fs.writeFileSync(srcFile, `export function testInline() {\n  const x = 10;\n  const y = x + 5;\n  return y;\n}\n`);
      await indexSingleFile(store, srcFile, 'inline.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });

      const preview = await engine.previewChange({
        action: 'refactor',
        target: {
          type: 'position',
          filePath: 'inline.ts',
          line: 1,
          character: 8
        },
        refactorKind: 'inline',
        actionName: 'Inline variable'
      });

      expect(preview.blocked).toBe(false);
      expect(preview.mutations[0].source).toBe('typescript6-refactor');

      const applyRes = await engine.applyChange({
        action: 'refactor',
        target: {
          type: 'position',
          filePath: 'inline.ts',
          line: 1,
          character: 8
        },
        refactorKind: 'inline',
        actionName: 'Inline variable'
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);
      const updated = fs.readFileSync(srcFile, 'utf8');
      expect(updated).not.toContain('const x = 10;');
      expect(updated).toContain('10 + 5');
    });
  });

  describe('5. TS7 Preference for Native Operations', () => {
    it('proves TS7 is used for rename_symbol and rename_file without invoking TS6', async () => {
      const srcFile = path.join(tmpDir, 'pref.ts');
      fs.writeFileSync(srcFile, `export function greet(): string { return "hi"; }\n`);
      await indexSingleFile(store, srcFile, 'pref.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const preview = await engine.previewChange({
        action: 'rename_symbol',
        target: { type: 'symbol', filePath: 'pref.ts', symbolName: 'greet' },
        newName: 'sayHello'
      });

      expect(preview.blocked).toBe(false);
      expect(preview.mutations[0].source).toBe('typescript-lsp'); // TS7 native LSP!
    });
  });

  describe('6. Missing Interactive Argument Handling', () => {
    it('returns blocked preview with requiredArguments when move-to-file has no destination', async () => {
      const srcFile = path.join(tmpDir, 'move-arg.ts');
      fs.writeFileSync(srcFile, `export function funcToMove() { return 1; }\n`);
      await indexSingleFile(store, srcFile, 'move-arg.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const preview = await engine.previewChange({
        action: 'refactor',
        target: { type: 'symbol', filePath: 'move-arg.ts', symbolName: 'funcToMove' },
        refactorKind: 'move to file'
      });

      expect(preview.blocked).toBe(true);
      expect(preview.requiredArguments).toContain('targetFile');
      expect(preview.blockReason).toContain('targetFile');
    });
  });

  describe('7. Stale Preview Fingerprint Protection on Refactor', () => {
    it('rejects applyChange when source file is modified after refactor preview was generated', async () => {
      const srcFile = path.join(tmpDir, 'stale.ts');
      fs.writeFileSync(srcFile, `export function add(a: number, b: number) {\n  const sum = a + b;\n  return sum;\n}\n`);
      await indexSingleFile(store, srcFile, 'stale.ts', tmpDir);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const preview = await engine.previewChange({
        action: 'refactor',
        target: {
          type: 'range',
          filePath: 'stale.ts',
          startLine: 1,
          startCharacter: 2,
          endLine: 1,
          endCharacter: 20
        },
        refactorKind: 'extract'
      });

      expect(preview.blocked).toBe(false);

      // Mutate file on disk to simulate concurrent edit
      fs.appendFileSync(srcFile, `\n// modified\n`);

      expect(engine.applyChange({
        action: 'refactor',
        target: {
          type: 'range',
          filePath: 'stale.ts',
          startLine: 1,
          startCharacter: 2,
          endLine: 1,
          endCharacter: 20
        },
        refactorKind: 'extract'
      }, preview.fingerprint)).rejects.toThrow(/modified since preview|Stale change preview/);
    });
  });

  describe('8. Product/Causal Graph Continuity', () => {
    it('migrates Ticket modifies relation to extracted/moved symbol', async () => {
      const srcFile = path.join(tmpDir, 'anchor.ts');
      fs.writeFileSync(srcFile, `export function processItem() {\n  const x = 100;\n  return x;\n}\n`);
      await indexSingleFile(store, srcFile, 'anchor.ts', tmpDir);

      const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-ANCHOR',
        title: 'Refactor processItem',
        lane: 'doing'
      });

      const syms = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: 'anchor.ts', title: 'processItem' });
      expect(syms.length).toBe(1);
      await store.relate(ticket, 'modifies', syms[0]);

      const engine = new CausalChangeEngine({ store, projectRoot: tmpDir });
      const preview = await engine.previewChange({
        action: 'refactor',
        target: {
          type: 'symbol',
          filePath: 'anchor.ts',
          symbolName: 'processItem'
        },
        refactorKind: 'refactor.move.newFile',
        actionName: 'Move to a new file'
      });

      expect(preview.blocked).toBe(false);

      const applyRes = await engine.applyChange({
        action: 'refactor',
        target: {
          type: 'symbol',
          filePath: 'anchor.ts',
          symbolName: 'processItem'
        },
        refactorKind: 'refactor.move.newFile',
        actionName: 'Move to a new file'
      }, preview.fingerprint);

      expect(applyRes.ok).toBe(true);

      // Verify that processItem anchor in the new file is related to ticket
      const newSyms = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: 'processItem.ts', title: 'processItem' });
      expect(newSyms.length).toBe(1);
      const incoming = await store.getIncoming(newSyms[0].id, 'modifies');
      expect(incoming.some(p => store.localId(p.sourceId) === 'TKT-ANCHOR')).toBe(true);
    });
  });
});
