import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initializeTools, type ToolContext, bucketRouter } from '../src/tools/index.ts';
import { WorkflowStore } from '../src/graph/store.ts';

describe('Codelet Compiler, Promotion & Two-Tier Routing', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ctx: ToolContext;
  const registry = initializeTools();

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
    const res = await registry.execute('compile_codelet', {
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

    const runRes = await registry.execute('run_codelet', {
      codeletId: res.id,
      args: { a: 100, b: 50 }
    }, ctx);

    expect(runRes.executed).toBe(true);
    expect(runRes.result).toBe(150);
  });

  it('should reject invalid syntax and failing verification tests in compile_codelet', async () => {
    // 1. Syntax error in codelet
    const syntaxFail = await registry.execute('compile_codelet', {
      name: 'broken_syntax',
      description: 'Contains broken javascript syntax',
      sourceCode: 'return const = ;'
    }, ctx);

    expect(syntaxFail.verified).toBe(false);
    expect(syntaxFail.verificationError).toBeDefined();

    // 2. Assertion failure in test harness
    const assertFail = await registry.execute('compile_codelet', {
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
    expect(registry.execute('promote_codelet', {
      codeletId: assertFail.id
    }, ctx)).rejects.toThrow('Cannot promote unverified codelet');

    // 4. Attempting to promote or run a non-existent codelet must throw an error
    expect(registry.execute('promote_codelet', {
      codeletId: 'codelet-does_not_exist'
    }, ctx)).rejects.toThrow('not found');

    expect(registry.execute('run_codelet', {
      codeletId: 'codelet-does_not_exist'
    }, ctx)).rejects.toThrow('not found');
  });

  it('should promote a verified codelet dynamically into ToolRegistry and execute it', async () => {
    const compileRes = await registry.execute('compile_codelet', {
      name: 'format_currency',
      description: 'Format a number to USD string',
      sourceCode: 'return "$" + Number(args.amount).toFixed(2);',
      testSourceCode: `
        const res = await fn({ amount: 49.9 }, {}, {});
        assert(res === "$49.90", "Expected $49.90");
      `
    }, ctx);

    expect(compileRes.verified).toBe(true);

    const promoRes = await registry.execute('promote_codelet', {
      codeletId: compileRes.id
    }, ctx);

    expect(promoRes.promoted).toBe(true);
    expect(promoRes.toolName).toBe('custom_format_currency');

    // Tool should now be in the live registry!
    const tool = registry.get('custom_format_currency');
    expect(tool).toBeDefined();

    const executed = await registry.execute('custom_format_currency', { amount: 123.45 }, ctx);
    expect(executed).toBe('$123.45');
  });

  it('should deterministically patch file blocks and handle negative matching errors', async () => {
    const testFile = path.join(tempDir, 'service.ts');
    const initialContent = `
export function computeRate(tier: string): number {
  if (tier === 'basic') return 10;
  return 20;
}
`;
    fs.writeFileSync(testFile, initialContent, 'utf8');

    // 1. Successful patch
    const patchRes = await registry.execute('apply_block_patch', {
      filePath: 'service.ts',
      targetContent: "if (tier === 'basic') return 10;\n  return 20;",
      replacementContent: "if (tier === 'basic') return 15;\n  if (tier === 'pro') return 30;\n  return 50;"
    }, ctx);

    expect(patchRes.success).toBe(true);

    const updated = fs.readFileSync(testFile, 'utf8');
    expect(updated).toContain("return 15;");
    expect(updated).toContain("return 30;");

    // 2. Mismatched patch target: must return success: false and leave file content completely unchanged
    const mismatchRes = await registry.execute('apply_block_patch', {
      filePath: 'service.ts',
      targetContent: "non_existent_code_block_that_does_not_exist();",
      replacementContent: "something_else();"
    }, ctx);

    expect(mismatchRes.success).toBe(false);
    expect(mismatchRes.message).toContain('Failed to apply patch');
    expect(fs.readFileSync(testFile, 'utf8')).toBe(updated);

    // 3. Patching non-existent file must throw
    expect(registry.execute('apply_block_patch', {
      filePath: 'missing-file.ts',
      targetContent: 'foo',
      replacementContent: 'bar'
    }, ctx)).rejects.toThrow('Target file does not exist');
  });

  it('should support batch patches across multiple blocks and files', async () => {
    const fileA = path.join(tempDir, 'fileA.ts');
    const fileB = path.join(tempDir, 'fileB.ts');
    fs.writeFileSync(fileA, 'const a = 1;\nconst b = 2;\n');
    fs.writeFileSync(fileB, 'const c = 3;\n');

    const batchRes = await registry.execute('apply_block_patch', {
      patches: [
        { file: 'fileA.ts', search: 'const a = 1;', replace: 'const a = 100;' },
        { file: 'fileB.ts', search: 'const c = 3;', replace: 'const c = 300;' }
      ]
    }, ctx);

    expect(batchRes.success).toBe(true);
    expect(batchRes.filesModified).toBe(2);
    expect(fs.readFileSync(fileA, 'utf8')).toContain('const a = 100;');
    expect(fs.readFileSync(fileB, 'utf8')).toContain('const c = 300;');
  });

  it('should route intents to appropriate buckets in TwoTierRouter', () => {
    const ticketBucket = bucketRouter.resolveBucket('claim ticket TKT-101 for agent alpha');
    expect(ticketBucket).toBe('ticket');

    const astBucket = bucketRouter.resolveBucket('what is the blast radius of src/graph/store.ts?');
    expect(astBucket).toBe('graph');

    const gitBucket = bucketRouter.resolveBucket('show me uncommitted git diff');
    expect(gitBucket).toBe('git');

    const compBucket = bucketRouter.resolveBucket('synthesize a codelet to parse json');
    expect(compBucket).toBe('compiler');

    const testBucket = bucketRouter.resolveBucket('triage test failures in test suite');
    expect(testBucket).toBe('test');

    const candidates = bucketRouter.getCandidateTools('claim lease on ticket TKT-002', registry);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(c => c.name.includes('ticket'))).toBe(true);
  });
});
