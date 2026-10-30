import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initializeTools, type ToolContext } from '../src/tools/index.ts';
import { WorkflowStore } from '../src/graph/store.ts';

describe('Codelet Compiler, Promotion & Two-Tier Routing', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;
  const commandRegistry = initializeTools();

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-compiler-test-'));
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

  it('should compile an atomic codelet and run its verification harness', async () => {
    const res = await commandRegistry.execute('compile_codelet', {
      name: 'add_numbers',
      description: 'Add two numbers together',
      sourceCode: 'return (args.a || 0) + (args.b || 0);',
      testSourceCode: `
        const res = await fn({ a: 10, b: 25 }, {}, {});
        assert(res === 35, "Expected 10 + 25 = 35");
      `
    }, ctx);

    expect(res.id).toBe('codelet-add_numbers');
    expect(res.verified).toBe(true);
    expect(fs.existsSync(res.filePath)).toBe(true);

    const runRes = await commandRegistry.execute('run_codelet', {
      codeletId: res.id,
      args: { a: 100, b: 50 }
    }, ctx);

    expect(runRes.executed).toBe(true);
    expect(runRes.result).toBe(150);
  });

  it('should reject invalid syntax and failing verification tests in compile_codelet', async () => {
    // 1. Syntax error in codelet
    const syntaxFail = await commandRegistry.execute('compile_codelet', {
      name: 'broken_syntax',
      description: 'Contains broken javascript syntax',
      sourceCode: 'return const = ;'
    }, ctx);

    expect(syntaxFail.verified).toBe(false);
    expect(syntaxFail.verificationError).toBeDefined();

    // 2. Assertion failure in test harness
    const assertFail = await commandRegistry.execute('compile_codelet', {
      name: 'failed_math',
      description: 'Returns wrong answer',
      sourceCode: 'return 100;',
      testSourceCode: `
        const res = await fn({}, {}, {});
        assert(res === 999, "Expected 999 but got " + res);
      `
    }, ctx);

    expect(assertFail.verified).toBe(false);
    expect(assertFail.verificationError).toContain('Expected 999');

    // 3. Attempting to promote an unverified codelet must throw an error
    expect(commandRegistry.execute('promote_codelet', {
      codeletId: assertFail.id
    }, ctx)).rejects.toThrow('Cannot promote unverified codelet');

    // 4. Attempting to promote or run a non-existent codelet must throw an error
    expect(commandRegistry.execute('promote_codelet', {
      codeletId: 'codelet-does_not_exist'
    }, ctx)).rejects.toThrow('not found');

    expect(commandRegistry.execute('run_codelet', {
      codeletId: 'codelet-does_not_exist'
    }, ctx)).rejects.toThrow('not found');
  });

  it('should promote a verified codelet dynamically into CommandRegistry and execute it', async () => {
    const compileRes = await commandRegistry.execute('compile_codelet', {
      name: 'format_currency',
      description: 'Format a number to USD string',
      sourceCode: 'return "$" + Number(args.amount).toFixed(2);',
      testSourceCode: `
        const res = await fn({ amount: 49.9 }, {}, {});
        assert(res === "$49.90", "Expected $49.90");
      `
    }, ctx);

    expect(compileRes.verified).toBe(true);

    const promoRes = await commandRegistry.execute('promote_codelet', {
      codeletId: compileRes.id
    }, ctx);

    expect(promoRes.promoted).toBe(true);
    expect(promoRes.toolName).toBe('custom_format_currency');

    // Tool should now be in the live commandRegistry!
    const tool = commandRegistry.get('custom_format_currency');
    expect(tool).toBeDefined();

    const executed = await commandRegistry.execute('custom_format_currency', { amount: 123.45 }, ctx);
    expect(executed).toBe('$123.45');
  });

  it('retired raw patch tool refuses individual and batch writes without partial effects', async () => {
    const fileA = path.join(tempDir, 'fileA.ts'), fileB = path.join(tempDir, 'fileB.ts');
    fs.writeFileSync(fileA, 'const a = 1;\n');
    fs.writeFileSync(fileB, 'const b = 2;\n');
    await expect(commandRegistry.execute('apply_block_patch', {
      filePath: 'fileA.ts', targetContent: 'const a = 1;', replacementContent: 'const a = 3;'
    }, ctx)).rejects.toThrow('retired');
    await expect(commandRegistry.execute('apply_block_patch', {patches: [
      {file: 'fileA.ts', search: 'const a = 1;', replace: 'const a = 3;'},
      {file: 'fileB.ts', search: 'const b = 2;', replace: 'const b = 4;'}
    ]}, ctx)).rejects.toThrow('retired');
    expect(fs.readFileSync(fileA,'utf8')).toBe('const a = 1;\n');
    expect(fs.readFileSync(fileB,'utf8')).toBe('const b = 2;\n');
  });

});
