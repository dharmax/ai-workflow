/**
 * Responsibility: JIT Codelet Compilation, Execution, Promotion, and AST Block Patching Facility.
 * Scope: Codelet synthesis via @dharmax/text-compiler, verification test execution, promotion to ToolRegistry,
 * and deterministic file patching via @dharmax/block-patcher.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { applyPatch } from '@dharmax/block-patcher';
import { createCallableFunction } from '@dharmax/text-compiler';

export interface CodeletRecord {
  id: string;
  name: string;
  description: string;
  sourceCode: string;
  testSourceCode?: string;
  verified: boolean;
  createdAt: string;
}

export function registerCompilerTools() {
  registry.register({
    name: 'compile_codelet',
    description: 'Synthesize an atomic, tested ESM codelet and persist to .ai-workflow/codelets.',
    category: 'compiler',
    parameters: z.object({
      name: z.string().describe('Identifier name for the codelet (e.g. parse_csv, sanitize_email)'),
      description: z.string().describe('Clear purpose and capability of the codelet'),
      sourceCode: z.string().describe('Pure JavaScript function body operating on (args, ctx, tk)'),
      testSourceCode: z.string().optional().describe('Optional verification test body asserting function behavior')
    }),
    execute: async ({ name, description, sourceCode, testSourceCode }, ctx: ToolContext) => {
      const codeletsDir = path.join(ctx.projectRoot, '.ai-workflow', 'codelets');
      fs.mkdirSync(codeletsDir, { recursive: true });

      const id = `codelet-${name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      let verified = false;
      let verificationError: string | null = null;

      // 1. Run verification test harness if provided
      try {
        // Strict JS syntax check
        new Function('args', 'ctx', 'tk', `return (async () => { ${sourceCode} })();`);

        const callable = createCallableFunction(sourceCode);
        if (testSourceCode) {
          const testFn = new Function('fn', 'assert', `
            return (async () => {
              ${testSourceCode}
            })();
          `);
          const assert = (condition: boolean, msg: string) => {
            if (!condition) throw new Error(msg || 'Assertion failed in codelet test');
          };
          await testFn(callable, assert);
        } else {
          // Smoke test execution with empty args
          await (callable as any)({}, ctx);
        }
        verified = true;
      } catch (err: any) {
        verified = false;
        verificationError = err.message;
      }

      const record: CodeletRecord = {
        id,
        name,
        description,
        sourceCode,
        testSourceCode,
        verified,
        createdAt: new Date().toISOString()
      };

      const filePath = path.join(codeletsDir, `${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');

      return {
        id,
        name,
        verified,
        verificationError,
        filePath
      };
    }
  });

  registry.register({
    name: 'run_codelet',
    description: 'Execute a stored codelet by ID with supplied arguments.',
    category: 'compiler',
    parameters: z.object({
      codeletId: z.string().describe('Identifier of the stored codelet (e.g. codelet-parse_csv)'),
      args: z.record(z.string(), z.any()).default({}).describe('Arguments object passed to the codelet function')
    }),
    execute: async ({ codeletId, args }, ctx: ToolContext) => {
      const filePath = path.join(ctx.projectRoot, '.ai-workflow', 'codelets', `${codeletId}.json`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Codelet '${codeletId}' not found at ${filePath}`);
      }

      const record: CodeletRecord = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const callable = createCallableFunction(record.sourceCode);
      const result = await (callable as any)(args, ctx);

      return {
        codeletId,
        executed: true,
        result
      };
    }
  });

  registry.register({
    name: 'apply_block_patch',
    description: 'Deterministically replace an AST code block in a file using @dharmax/block-patcher.',
    category: 'compiler',
    parameters: z.object({
      filePath: z.string().optional().describe('Relative path to the target file'),
      targetContent: z.string().optional().describe('Exact block of code to find and replace'),
      replacementContent: z.string().optional().describe('Replacement block of code'),
      patches: z.array(z.object({
        file: z.string(),
        search: z.string(),
        replace: z.string()
      })).optional().describe('Batch patch specifications')
    }),
    execute: async ({ filePath, targetContent, replacementContent, patches }, ctx: ToolContext) => {
      const allPatches = patches ? [...patches] : [];
      if (filePath && targetContent !== undefined && replacementContent !== undefined) {
        allPatches.push({ file: filePath, search: targetContent, replace: replacementContent });
      }

      if (allPatches.length === 0) {
        throw new Error('Either (filePath, targetContent, replacementContent) or patches array must be provided.');
      }

      // Group patches by file
      const byFile = new Map<string, Array<{ file: string; search: string; replace: string }>>();
      for (const p of allPatches) {
        const list = byFile.get(p.file) || [];
        list.push(p);
        byFile.set(p.file, list);
      }

      let totalBytesModified = 0;
      const summaries: any[] = [];

      for (const [file, filePatches] of byFile.entries()) {
        const fullPath = path.resolve(ctx.projectRoot, file);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Target file does not exist: ${file}`);
        }

        const originalContent = fs.readFileSync(fullPath, 'utf8');
        const patchResult = applyPatch(originalContent, filePatches);

        if (!patchResult.allApplied) {
          return {
            success: false,
            filePath: file,
            message: `Failed to apply patch to ${file}: targetContent could not be uniquely matched.`
          };
        }

        fs.writeFileSync(fullPath, patchResult.content, 'utf8');
        totalBytesModified += (patchResult.content.length - originalContent.length);
        summaries.push(...patchResult.summary);
      }

      return {
        success: true,
        filePath: filePath || allPatches[0].file,
        bytesModified: totalBytesModified,
        filesModified: byFile.size,
        summary: summaries
      };
    }
  });

  registry.register({
    name: 'promote_codelet',
    description: 'Promote a verified codelet into the live ToolRegistry as a custom tool accessible by agents and MCP.',
    category: 'compiler',
    parameters: z.object({
      codeletId: z.string().describe('Identifier of the stored codelet to promote')
    }),
    execute: async ({ codeletId }, ctx: ToolContext) => {
      const filePath = path.join(ctx.projectRoot, '.ai-workflow', 'codelets', `${codeletId}.json`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Codelet '${codeletId}' not found at ${filePath}`);
      }

      const record: CodeletRecord = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!record.verified) {
        throw new Error(`Cannot promote unverified codelet '${codeletId}'. Ensure tests pass first.`);
      }

      const toolName = `custom_${record.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      const callable = createCallableFunction(record.sourceCode);

      registry.register({
        name: toolName,
        description: `[Custom Codelet]: ${record.description}`,
        category: 'compiler',
        parameters: z.record(z.string(), z.any()).default({}),
        execute: async (params, toolCtx) => {
          return await (callable as any)(params, toolCtx);
        }
      });

      return {
        promoted: true,
        toolName,
        codeletId: record.id
      };
    }
  });
}
