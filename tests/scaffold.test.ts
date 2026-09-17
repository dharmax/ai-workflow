import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, type ToolContext } from '../src/tools/index.ts';
import { SymbolNode } from '../src/graph/ontology.ts';

describe('Greenfield Code Scaffolding (aiwf scaffold)', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;
  const registry = initializeTools();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-scaffold-test-'));
    store = new WorkflowStore(tempDir);
    ctx = { store, projectRoot: tempDir };
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('scaffolds a new typed module paired with a test suite and indexes it', async () => {
    const res = await registry.execute('scaffold_file', {
      targetPath: 'src/services/payment-processor.ts',
      description: 'Handles online payments and refunds'
    }, ctx);

    expect(res.success).toBe(true);
    expect(res.symbol).toBe('PaymentProcessor');
    expect(res.createdFile).toBe('src/services/payment-processor.ts');
    expect(res.createdTest).toBe('tests/payment-processor.test.ts');

    // 1. Verify source file
    const srcFile = path.join(tempDir, 'src/services/payment-processor.ts');
    expect(fs.existsSync(srcFile)).toBe(true);
    const srcContent = fs.readFileSync(srcFile, 'utf8');
    expect(srcContent).toContain('export class PaymentProcessor');
    expect(srcContent).toContain('export interface PaymentProcessorOptions');
    expect(srcContent).toContain('Handles online payments and refunds');

    // 2. Verify paired test file
    const testFile = path.join(tempDir, 'tests/payment-processor.test.ts');
    expect(fs.existsSync(testFile)).toBe(true);
    const testContent = fs.readFileSync(testFile, 'utf8');
    expect(testContent).toContain("import { PaymentProcessor } from '../src/services/payment-processor.ts';");
    expect(testContent).toContain("describe('PaymentProcessor'");

    // 3. Verify graph indexing
    const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr);
    const names = symbols.map(s => (s as any).title);
    expect(names).toContain('PaymentProcessor');
    expect(names).toContain('PaymentProcessorOptions');
  });

  it('rejects scaffolding over an existing file', async () => {
    const srcFile = path.join(tempDir, 'src/utils.ts');
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, 'export const x = 1;');

    expect(registry.execute('scaffold_file', {
      targetPath: 'src/utils.ts'
    }, ctx)).rejects.toThrow('Target file already exists');
  });
});
