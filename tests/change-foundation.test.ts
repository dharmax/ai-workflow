import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, SymbolNode } from '../src/graph/ontology.ts';
import { indexSingleFile, ensureAstFresh } from '../src/graph/indexer.ts';
import {
  resolveTypeScriptRuntime,
  checkHostTypeScriptCompatibility,
  ensureHostTypeScript7,
  isCompatibleTsVersion
} from '../src/typescript-runtime.ts';
import { TsLspClient, getTsLspClient, closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { resolveCodeTarget } from '../src/change/target-resolver.ts';

describe('AIWF-CHANGE-FOUNDATION', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-change-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ai-workflow', 'state'), { recursive: true });
    store = new WorkflowStore(tmpDir);
  });

  afterEach(async () => {
    await closeAllTsLspClients();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('1. Stable Code Anchors (Reconciliation Without ID Churn)', () => {
    it('preserves Symbol ID and Ticket relations when code lines move due to edits above it', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const testFile = path.join(srcDir, 'service.ts');
      const relPath = 'src/service.ts';

      // Initial version: function calculateTotal at line 1
      fs.writeFileSync(testFile, 'export function calculateTotal(price: number): number {\n  return price * 1.17;\n}\n');
      await indexSingleFile(store, testFile, relPath, tmpDir);

      const symbolsBefore = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: relPath, title: 'calculateTotal' });
      expect(symbolsBefore.length).toBe(1);
      const symbolEntity = symbolsBefore[0];
      const initialSymbolId = symbolEntity.id;
      expect(symbolEntity.line).toBe(1);

      // Create a ticket that modifies this symbol
      const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {
        id: 'TKT-TEST-001',
        title: 'Add tax exemption to calculateTotal',
        lane: 'In Progress'
      });
      await store.relate(ticket, 'modifies', symbolEntity);

      // Verify relation exists
      const initialRelations = await store.getIncoming(initialSymbolId, 'modifies');
      expect(initialRelations.length).toBe(1);
      expect(initialRelations[0].sourceId).toBe(ticket.id);

      // Edit file: add 5 comment lines above calculateTotal
      const updatedCode = [
        '// Line 1: Header comment',
        '// Line 2: Author info',
        '// Line 3: License',
        '// Line 4: Change log',
        '// Line 5: Empty space',
        '',
        'export function calculateTotal(price: number): number {',
        '  return price * 1.17;',
        '}',
        ''
      ].join('\n');
      fs.writeFileSync(testFile, updatedCode);

      // Re-index the modified file
      await indexSingleFile(store, testFile, relPath, tmpDir);

      // Symbol entity MUST have the exact same ID, but updated line metadata
      const symbolsAfter = await store.listEntities<SymbolNode>(SymbolNode.dcr, { filePath: relPath, title: 'calculateTotal' });
      expect(symbolsAfter.length).toBe(1);
      const updatedSymbol = symbolsAfter[0];

      expect(updatedSymbol.id).toBe(initialSymbolId);
      expect(updatedSymbol.line).toBe(7);

      // Causal relation (Ticket --modifies--> Symbol) MUST survive intact
      const relationsAfter = await store.getIncoming(initialSymbolId, 'modifies');
      expect(relationsAfter.length).toBe(1);
      expect(relationsAfter[0].sourceId).toBe(ticket.id);
    });
  });

  describe('2. TypeScript Runtime Resolver & Setup Infrastructure', () => {
    it('correctly validates 7.x version strings and rejects older versions', () => {
      expect(isCompatibleTsVersion('7.0.2')).toBe(true);
      expect(isCompatibleTsVersion('7.1.0-beta')).toBe(true);
      expect(isCompatibleTsVersion('6.0.3')).toBe(false);
      expect(isCompatibleTsVersion('5.9.1')).toBe(false);
      expect(isCompatibleTsVersion('invalid')).toBe(false);
    });

    it('prefers project-local TS7 over packaged and host TS7', async () => {
      const mockProjectTsc = path.join(tmpDir, 'node_modules', '.bin', 'tsc');
      fs.mkdirSync(path.dirname(mockProjectTsc), { recursive: true });
      fs.writeFileSync(mockProjectTsc, '#!/bin/sh\nexit 0\n');

      const seams = {
        fsExists: (p: string) => p === mockProjectTsc,
        execCommand: async (cmd: string[]) => {
          if (cmd.includes('-v')) return { exitCode: 0, stdout: 'Version 7.0.2\n', stderr: '' };
          if (cmd.includes('--lsp')) return { exitCode: 2, stdout: 'Usage of lsp:\n  -stdio\n', stderr: '' };
          return { exitCode: 0, stdout: '', stderr: '' };
        }
      };

      const res = await resolveTypeScriptRuntime(tmpDir, seams);
      expect(res.isCompatible).toBe(true);
      expect(res.source).toBe('project');
      expect(res.executablePath).toBe(mockProjectTsc);
      expect(res.version).toBe('7.0.2');
      expect(res.lspReady).toBe(true);
    });

    it('falls back to packaged TS7 when project TypeScript is incompatible', async () => {
      const mockProjectTsc = path.join(tmpDir, 'node_modules', '.bin', 'tsc');
      const mockPackagedTsc = '/mock/aiwf/node_modules/.bin/tsc';

      const seams = {
        packagedTsDir: '/mock/aiwf',
        fsExists: (p: string) => p === mockProjectTsc || p === mockPackagedTsc,
        execCommand: async (cmd: string[]) => {
          if (cmd[0] === mockProjectTsc) {
            return { exitCode: 0, stdout: 'Version 5.8.0\n', stderr: '' }; // Project pinned to old TS5
          }
          if (cmd[0] === mockPackagedTsc) {
            return { exitCode: 0, stdout: 'Version 7.0.2\n', stderr: '' };
          }
          if (cmd.includes('--lsp')) return { exitCode: 2, stdout: 'Usage of lsp:\n  -stdio\n', stderr: '' };
          return { exitCode: 0, stdout: '', stderr: '' };
        }
      };

      const res = await resolveTypeScriptRuntime(tmpDir, seams);
      expect(res.isCompatible).toBe(true);
      expect(res.source).toBe('packaged');
      expect(res.executablePath).toBe(mockPackagedTsc);
      expect(res.version).toBe('7.0.2');
    });

    it('provisions host TypeScript 7 globally via Bun when no host TS7 exists', async () => {
      let bunAddCalled = false;
      let hostTscExists = false;
      const fakeGlobalTsc = '/mock/home/.bun/bin/tsc';

      const seams = {
        homeDir: '/mock/home',
        pathEnv: '/usr/bin:/bin',
        fsExists: (p: string) => hostTscExists && p === fakeGlobalTsc,
        execCommand: async (cmd: string[]) => {
          if (cmd.join(' ').includes('bun add -g typescript@^7')) {
            bunAddCalled = true;
            hostTscExists = true;
            return { exitCode: 0, stdout: 'installed typescript@7.0.2\n', stderr: '' };
          }
          if (cmd.includes('-v')) return { exitCode: 0, stdout: 'Version 7.0.2\n', stderr: '' };
          return { exitCode: 0, stdout: '', stderr: '' };
        }
      };

      const provRes = await ensureHostTypeScript7(seams);
      expect(bunAddCalled).toBe(true);
      expect(provRes.provisioned).toBe(true);
      expect(provRes.version).toBe('7.0.2');
      expect(provRes.executablePath).toBe(fakeGlobalTsc);
    });

    it('returns an explicit error when no compatible TypeScript 7 can be found or provisioned', async () => {
      const seams = {
        fsExists: () => false,
        execCommand: async () => ({ exitCode: 1, stdout: '', stderr: 'command not found' })
      };

      const res = await resolveTypeScriptRuntime(tmpDir, seams);
      expect(res.isCompatible).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('3. Native TS7 LSP Client & Process Lifecycle', () => {
    it('starts tsc --lsp, initializes, caches capabilities, and reuses instance', async () => {
      const client = new TsLspClient({ projectRoot: process.cwd() });
      await client.ensureStarted();

      const caps = client.getCapabilities();
      expect(caps).toBeDefined();
      expect(caps?.renameProvider).toBeDefined();
      expect(caps?.referencesProvider).toBe(true);
      expect(caps?.definitionProvider).toBe(true);
      expect(caps?.serverInfo?.name).toBe('typescript-go');

      // Re-invoking ensureStarted reuses active connection
      await client.ensureStarted();
      expect(client.getCapabilities()).toBe(caps);

      await client.close();
    });

    it('resolves exact definitions and references across TS files', async () => {
      // Create small TS project inside temp dir
      const aPath = path.join(tmpDir, 'a.ts');
      const bPath = path.join(tmpDir, 'b.ts');
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');

      fs.writeFileSync(tsconfigPath, JSON.stringify({
        compilerOptions: { module: 'ESNext', target: 'ESNext', moduleResolution: 'bundler' }
      }, null, 2));

      fs.writeFileSync(aPath, 'export function computeSum(a: number, b: number): number {\n  return a + b;\n}\n');
      fs.writeFileSync(bPath, 'import { computeSum } from "./a";\nconst res = computeSum(10, 20);\n');

      const client = new TsLspClient({ projectRoot: tmpDir });
      await client.ensureStarted();

      // Definition from call site in b.ts (line 1, character 15 is computeSum)
      const defs = await client.getDefinition('b.ts', { line: 1, character: 15 });
      expect(defs.length).toBeGreaterThan(0);
      expect(defs[0].uri).toContain('a.ts');
      expect(defs[0].range.start.line).toBe(0);

      // References for computeSum in a.ts (line 0, character 16)
      const refs = await client.getReferences('a.ts', { line: 0, character: 16 });
      expect(refs.length).toBeGreaterThanOrEqual(2); // declaration in a.ts + call in b.ts
      const refUris = refs.map(r => r.uri);
      expect(refUris.some(u => u.includes('a.ts'))).toBe(true);
      expect(refUris.some(u => u.includes('b.ts'))).toBe(true);

      // Prepare rename
      const prep = await client.prepareRename('a.ts', { line: 0, character: 16 });
      expect(prep).toBeDefined();

      await client.close();
    });
  });

  describe('4. Target Resolution & Ambiguity Handling', () => {
    it('resolves exact target from graph entity ID without ambiguity', async () => {
      const srcFile = path.join(tmpDir, 'math.ts');
      fs.writeFileSync(srcFile, 'export function multiply(x: number, y: number): number { return x * y; }\n');
      await indexSingleFile(store, srcFile, 'math.ts', tmpDir);

      const client = new TsLspClient({ projectRoot: tmpDir });
      const target = await resolveCodeTarget({ type: 'symbol', filePath: 'math.ts', symbolName: 'multiply' }, store, client, tmpDir);

      expect(target.filePath).toBe('math.ts');
      expect(target.symbolName).toBe('multiply');
      expect(target.position.line).toBe(0);
      expect(target.graphEntityId).toBeDefined();

      await client.close();
    });

    it('rejects ambiguous same-name symbols when target context is insufficient', async () => {
      const fileA = path.join(tmpDir, 'alpha.ts');
      const fileB = path.join(tmpDir, 'beta.ts');
      fs.writeFileSync(fileA, 'export function helper(): void {}\n');
      fs.writeFileSync(fileB, 'export function helper(): void {}\n');
      await indexSingleFile(store, fileA, 'alpha.ts', tmpDir);
      await indexSingleFile(store, fileB, 'beta.ts', tmpDir);

      const client = new TsLspClient({ projectRoot: tmpDir });

      // Querying 'helper' without filePath must fail fast with ambiguity error
      expect(
        resolveCodeTarget({ type: 'symbol', filePath: '', symbolName: 'helper' }, store, client, tmpDir)
      ).rejects.toThrow(/Ambiguous symbol 'helper'/);

      await client.close();
    });
  });
});
