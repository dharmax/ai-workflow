/** Request contracts shared by Ticket resolution and the public change adapter. No tool/runtime imports. */
import {z} from 'zod';
import {ProductMutationSchema, ProductRevisionSchema} from '../product/mutation.ts';

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

const SourceFileChangeSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('replace_text'), filePath: z.string().min(1), oldText: z.string().min(1), newText: z.string()}),
  z.object({action: z.literal('create_file'), filePath: z.string().min(1), content: z.string()}),
  z.object({action: z.literal('delete_file'), filePath: z.string().min(1)})
]);

export const CodeChangeRequestSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('source_change'), changes: z.array(SourceFileChangeSchema).min(1).max(64)}),
  SourceFileChangeSchema.options[2],
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
  z.object({ action: z.literal('product_change'), mutations: z.array(ProductMutationSchema).min(1), basis: z.array(ProductRevisionSchema).optional(), originalRequest: z.string().optional() })
]);

