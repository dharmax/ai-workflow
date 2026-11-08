/** Prepare one source operation without writes; no Product mutation authorization lives here. */
import fs from 'node:fs';
import path from 'node:path';
import type {WorkflowStore} from '../../graph/store.ts';
import type {TsLspClient} from '../../change/ts-lsp.ts';
import type {Ts6RefactorClient} from '../../change/ts6-refactor.ts';
import {resolveCodeTarget} from '../../change/target-resolver.ts';
import {getExactSymbolSource} from '../../change/symbol-source.ts';
import {workspacePath} from '../../change/workspace-path.ts';
import {blockedChangePreview} from '../../change/fingerprint.ts';
import {normalizeWorkspaceEdit} from './edits.ts';
import {prepareRefactor} from './refactor-preview.ts';
import type {ProductImpact} from '../../product/impact.ts';
import type {ChangeMutation, ChangePreview, ChangeRequest, LspRange, ResolvedCodeTarget, WorkspaceEditLike} from '../../change/types.ts';

export interface SourcePreviewContext {
  store: WorkflowStore;
  projectRoot: string;
  lspClient: TsLspClient;
  ts6Client: Ts6RefactorClient;
}
export type DirectSourceRequest = Exclude<ChangeRequest, {action: 'product_change' | 'source_change'}>;
export interface PreparedSourceOperation {
  mutation: Extract<ChangeMutation, {kind: 'workspace_edit'}>;
  summary: string;
  resolvedTarget?: ResolvedCodeTarget;
}
type Result = PreparedSourceOperation | ChangePreview;

function prepareDeleteFile(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'delete_file'}>, impact?: ProductImpact, warnings: string[] = []): Result {
  try {
    const relative = workspacePath(ctx.projectRoot, request.filePath);
    if (!fs.lstatSync(path.resolve(ctx.projectRoot, relative)).isFile()) throw Error('Deletion target must be an existing regular file.');
    return {
      mutation: {kind: 'workspace_edit', source: 'workspace-text', edit: {
        documentChanges: [{kind: 'delete', uri: ctx.lspClient.toUri(relative)}]
      }},
      summary: `Delete '${relative}'.`
    };
  } catch (error) {return blockedChangePreview(request, String(error), warnings, impact);}
}

function prepareTextReplacement(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'replace_text'}>, impact?: ProductImpact, warnings: string[] = []): Result {
  try {
    if (path.isAbsolute(request.filePath)) throw new Error('Workspace path must be relative.');
    const relative = workspacePath(ctx.projectRoot, request.filePath);
    const absolute = path.resolve(ctx.projectRoot, relative);
    if (!fs.statSync(absolute).isFile()) throw new Error('Replacement target must be an existing regular file.');
    const content = fs.readFileSync(absolute, 'utf8');
    const start = content.indexOf(request.oldText);
    if (!request.oldText || start < 0 || content.indexOf(request.oldText, start + 1) >= 0)
      throw new Error('oldText must occur exactly once.');
    const position = (offset: number) => {
      const lines = content.slice(0, offset).split('\n');
      return {line: lines.length - 1, character: lines[lines.length - 1]!.length};
    };
    return {
      mutation: {kind: 'workspace_edit', source: 'workspace-text', edit: {changes: {
        [ctx.lspClient.toUri(relative)]: [{range: {start: position(start), end: position(start + request.oldText.length)}, newText: request.newText}]
      }}},
      summary: `Replace unique text in '${relative}'.`
    };
  } catch (error) {return blockedChangePreview(request, String(error), warnings, impact);}
}

function prepareFileCreation(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'create_file'}>, impact?: ProductImpact, warnings: string[] = []): Result {
  try {
    const relative = workspacePath(ctx.projectRoot, request.filePath);
    if (fs.existsSync(path.resolve(ctx.projectRoot, relative))) throw new Error(`Creation target '${relative}' already exists.`);
    return {
      mutation: {kind: 'workspace_edit', source: 'typescript-lsp', edit: {changes: {
        [ctx.lspClient.toUri(relative)]: [{
          range: {start: {line: 0, character: 0}, end: {line: 0, character: 0}}, newText: request.content
        }]
      }}},
      summary: `Create '${relative}' without overwriting existing work.`
    };
  } catch (error) {return blockedChangePreview(request, String(error), warnings, impact);}
}

async function prepareSymbolReplacement(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'replace_symbol'}>, impact?: ProductImpact, warnings: string[] = []): Promise<Result> {
  try {
    const target = await resolveCodeTarget(request.target, ctx.store, ctx.lspClient, ctx.projectRoot);
    const qualified = target.containerName ? `${target.containerName}.${target.symbolName}` : target.symbolName;
    const exact = await getExactSymbolSource(ctx.projectRoot, target.filePath, qualified, ctx.lspClient);
    // LSP SymbolKind: Method=6, Function=12.
    if (exact.kind !== 6 && exact.kind !== 12) throw new Error('Replacement supports only known functions/methods.');
    target.range = exact.range;
    return {
      mutation: {kind: 'workspace_edit', source: 'typescript-lsp', edit: {changes: {
        [target.uri]: [{range: exact.range, newText: request.replacement}]
      }}},
      resolvedTarget: target,
      summary: `Replace '${qualified}' using its exact TypeScript declaration range.`
    };
  } catch (error) {return blockedChangePreview(request, String(error), warnings, impact);}
}

async function prepareSymbolRename(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'rename_symbol'}>, impact?: ProductImpact, warnings: string[] = []): Promise<Result> {
  let target;
  try {target = await resolveCodeTarget(request.target, ctx.store, ctx.lspClient, ctx.projectRoot);}
  catch (error: any) {return blockedChangePreview(request, error.message, warnings, impact);}
  const prepared = await ctx.lspClient.prepareRename(target.filePath, target.position);
  if (!prepared)
    return blockedChangePreview(request,
      `Symbol '${target.symbolName}' cannot be renamed at this location (prepareRename rejected).`, warnings, impact);
  const edit = await ctx.lspClient.rename(target.filePath, target.position, request.newName);
  const normalized = normalizeWorkspaceEdit(edit, ctx.lspClient, ctx.projectRoot);
  return {
    mutation: {kind: 'workspace_edit', source: 'typescript-lsp', edit},
    resolvedTarget: target,
    summary: `Rename symbol '${target.symbolName}' -> '${request.newName}' in ${normalized.fileEdits.size} file(s).`
  };
}

async function prepareFileRename(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'rename_file'}>, impact?: ProductImpact, warnings: string[] = []): Promise<Result> {
  const oldRel = path.isAbsolute(request.oldPath) ? path.relative(ctx.projectRoot, request.oldPath) : request.oldPath;
  const newRel = path.isAbsolute(request.newPath) ? path.relative(ctx.projectRoot, request.newPath) : request.newPath;
  if (!fs.existsSync(path.resolve(ctx.projectRoot, oldRel)))
    return blockedChangePreview(request, `Source file '${oldRel}' does not exist.`, warnings, impact);
  if (fs.existsSync(path.resolve(ctx.projectRoot, newRel)))
    return blockedChangePreview(request, `Destination file '${newRel}' already exists.`, warnings, impact);
  const willRenameEdit = await ctx.lspClient.willRenameFiles([{oldPath: oldRel, newPath: newRel}]);
  const combined: WorkspaceEditLike = {
    ...willRenameEdit,
    documentChanges: [
      ...(willRenameEdit.documentChanges || []),
      {kind: 'rename', oldUri: ctx.lspClient.toUri(oldRel), newUri: ctx.lspClient.toUri(newRel)}
    ]
  };
  const normalized = normalizeWorkspaceEdit(combined, ctx.lspClient, ctx.projectRoot);
  const affected = new Set([...normalized.fileEdits.keys(), oldRel]);
  return {
    mutation: {kind: 'workspace_edit', source: 'typescript-lsp', edit: combined},
    summary: `Rename file '${oldRel}' -> '${newRel}' and update references across ${affected.size} file(s).`
  };
}

async function prepareSourceAction(ctx: SourcePreviewContext, request: Extract<ChangeRequest, {action: 'source_action'}>, impact?: ProductImpact, warnings: string[] = []): Promise<Result> {
  const rel = path.isAbsolute(request.filePath) ? path.relative(ctx.projectRoot, request.filePath) : request.filePath;
  if (!fs.existsSync(path.resolve(ctx.projectRoot, rel)))
    return blockedChangePreview(request, `File '${rel}' does not exist.`, warnings, impact);
  const fullRange: LspRange = {start: {line: 0, character: 0}, end: {line: 100000, character: 0}};
  const actions = await ctx.lspClient.getCodeActions(rel, fullRange, [request.actionKind]);
  const matching = actions.find(a => a.kind === request.actionKind || a.title.toLowerCase().includes(request.actionKind.toLowerCase()));
  if (!matching?.edit)
    return blockedChangePreview(request, `Native TS7 LSP does not currently advertise a usable edit for source action '${request.actionKind}'.`, warnings, impact);
  normalizeWorkspaceEdit(matching.edit, ctx.lspClient, ctx.projectRoot);
  return {
    mutation: {kind: 'workspace_edit', source: 'typescript-lsp', edit: matching.edit},
    summary: `Apply source action '${request.actionKind}' (${matching.title}) in '${rel}'.`
  };
}

/** Dispatch only. Implementations stay in named cohesive operations above or refactor-preview.ts. */
export function prepareSourceOperation(ctx: SourcePreviewContext, request: DirectSourceRequest, impact?: ProductImpact, warnings: string[] = []): Promise<Result> | Result {
  switch (request.action) {
    case 'delete_file': return prepareDeleteFile(ctx, request, impact, warnings);
    case 'replace_text': return prepareTextReplacement(ctx, request, impact, warnings);
    case 'create_file': return prepareFileCreation(ctx, request, impact, warnings);
    case 'replace_symbol': return prepareSymbolReplacement(ctx, request, impact, warnings);
    case 'rename_symbol': return prepareSymbolRename(ctx, request, impact, warnings);
    case 'rename_file': return prepareFileRename(ctx, request, impact, warnings);
    case 'source_action': return prepareSourceAction(ctx, request, impact, warnings);
    case 'refactor': return prepareRefactor(ctx, request, impact, warnings);
  }
}
