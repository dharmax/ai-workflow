/**
 * Responsibility: Public tools for bounded workspace reads and previewed changes.
 * Scope: Exposes `read_workspace_file`, `preview_change` and `apply_change` in registry under category 'change'.
 */

import fs from 'node:fs';
import path from 'node:path';
import { workspacePath } from '../change/workspace-path.ts';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { CausalChangeEngine } from '../change/engine.ts';
import type { ChangeRequest } from '../change/types.ts';
import { ProductMutationSchema } from '../product/mutation.ts';

const ChangeTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('entity'),
    entityId: z.string().describe('Semantika graph entity ID (e.g. SymbolNode or FileNode ID)')
  }),
  z.object({
    type: z.literal('symbol'),
    filePath: z.string().describe('Relative path to source file containing symbol'),
    symbolName: z.string().describe('Exact name of function, class, method, or interface'),
    containerName: z.string().optional().describe('Optional parent container name (e.g. Class name)')
  }),
  z.object({
    type: z.literal('position'),
    filePath: z.string().describe('Relative path to source file'),
    line: z.number().describe('0-based line number'),
    character: z.number().describe('0-based character offset')
  }),
  z.object({
    type: z.literal('range'),
    filePath: z.string().describe('Relative path to source file'),
    startLine: z.number().describe('0-based start line'),
    startCharacter: z.number().describe('0-based start character offset'),
    endLine: z.number().describe('0-based end line'),
    endCharacter: z.number().describe('0-based end character offset')
  }),
  z.object({
    type: z.literal('file'),
    filePath: z.string().describe('Relative path to file')
  })
]).meta({ id: 'ChangeTarget' });

export const CodeChangeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('replace_text'), filePath: z.string().min(1), oldText: z.string().min(1).describe('Literal text already present exactly once in the existing file. To insert, use an existing anchor, not the missing text. Example: insert a JSON dependency by replacing the existing "dependencies": { prefix with that same prefix plus the new entry.'), newText: z.string().describe('Replacement for oldText. To insert, include the original anchor plus the added text here.') }),
  z.object({ action: z.literal('create_file'), filePath: z.string().min(1), content: z.string(), productContextEntityId: z.string().optional() }),
  z.object({ action: z.literal('replace_symbol'), target: ChangeTargetSchema, replacement: z.string().min(1), productContextEntityId: z.string().optional() }),
  z.object({
    action: z.literal('rename_symbol'),
    target: ChangeTargetSchema,
    newName: z.string().min(1).describe('New symbol identifier name'),
    productContextEntityId: z.string().optional().describe('Optional Feature, Story, or Epic ID for causal grounding')
  }),
  z.object({
    action: z.literal('rename_file'),
    oldPath: z.string().min(1).describe('Source file path'),
    newPath: z.string().min(1).describe('Destination file path'),
    productContextEntityId: z.string().optional().describe('Optional Feature, Story, or Epic ID for causal grounding')
  }),
  z.object({
    action: z.literal('source_action'),
    filePath: z.string().min(1).describe('Relative path to source file'),
    actionKind: z.enum([
      'source.organizeImports',
      'source.removeUnusedImports',
      'source.sortImports',
      'source.fixAll',
      'quickfix'
    ]),
    productContextEntityId: z.string().optional().describe('Optional Feature, Story, or Epic ID for causal grounding')
  }),
  z.object({
    action: z.literal('refactor'),
    target: ChangeTargetSchema,
    refactorKind: z.string().describe('Refactoring intent (e.g. extract, inline, move)'),
    actionName: z.string().optional().describe('Optional exact action name (e.g. "Extract to function in module scope")'),
    arguments: z.record(z.string(), z.any()).optional().describe('Optional refactoring parameters (e.g. targetFile for Move to file)'),
    productContextEntityId: z.string().optional().describe('Optional Feature, Story, or Epic ID for causal grounding')
  })
]);

export const ChangeRequestSchema = z.discriminatedUnion('action', [
  ...CodeChangeRequestSchema.options,
  z.object({ action: z.literal('product_change'), mutations: z.array(ProductMutationSchema).min(1) })
]);

export function registerChangeTools() {
  registry.register({
    name: 'read_workspace_file',
    description: 'Read an existing regular workspace file, up to 64 KiB, without shell execution.',
    category: 'change',
    parameters: z.object({ filePath: z.string().min(1) }),
    execute: async ({ filePath }, ctx: ToolContext) => {
      if (path.isAbsolute(filePath)) throw new Error('Workspace path must be relative.');
      const relative = workspacePath(ctx.projectRoot, filePath);
      const absolute = path.resolve(ctx.projectRoot, relative);
      const descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      try {
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile()) throw new Error('Workspace target must be an existing regular file.');
        if (stat.size > 65536) throw new Error('Workspace file exceeds the 64 KiB read limit.');
        const content = Buffer.alloc(65537);
        let length = 0, bytes = 0;
        do { bytes = fs.readSync(descriptor, content, length, content.length - length, null); length += bytes; } while (bytes && length < content.length);
        if (length > 65536) throw new Error('Workspace file exceeds the 64 KiB read limit.');
        return { filePath: relative, content: content.subarray(0, length).toString('utf8') };
      } finally { fs.closeSync(descriptor); }
    }
  });
  registry.register({
    name: 'preview_change',
    description: 'Preview code or Product Intent mutations with zero write side effects.',
    category: 'change',
    parameters: ChangeRequestSchema,
    execute: async (request: any, ctx: ToolContext) => {
      const engine = new CausalChangeEngine({
        store: ctx.store,
        projectRoot: ctx.projectRoot
      });
      return await engine.previewChange(request as ChangeRequest);
    }
  });

  registry.register({
    name: 'apply_change',
    description: 'Safely commit a previewed change mutation to disk using its verified preview fingerprint.',
    category: 'change',
    parameters: z.object({
      request: ChangeRequestSchema,
      fingerprint: z.string().min(1).describe('SHA-256 fingerprint generated by preview_change')
    }),
    execute: async ({ request, fingerprint }, ctx: ToolContext) => {
      const engine = new CausalChangeEngine({
        store: ctx.store,
        projectRoot: ctx.projectRoot
      });
      return await engine.applyChange(request as ChangeRequest, fingerprint);
    }
  });
}
