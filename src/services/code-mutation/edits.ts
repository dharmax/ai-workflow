/**
 * Responsibility: Validate, normalize and apply source edits.
 * Scope: LSP UTF-16 text ranges and workspace file operations; request-wide aggregation follows in Stage 1C.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {TsLspClient} from '../typescript/ts-lsp.ts';
import type {LspPosition, LspTextEdit, WorkspaceEditLike} from '../typescript/types.ts';
import {workspacePath} from '../../helpers/workspace-path.ts';

type OffsetEdit = {start: number; end: number; text: string};

/** Validate all positions against the same original UTF-16 document, before editing. */
function validatedTextEdits(content: string, edits: readonly LspTextEdit[]): OffsetEdit[] {
  const lines = content.split('\n');
  const starts = [0];
  for (let i = 1; i < lines.length; i++) starts.push(starts[i - 1]! + lines[i - 1]!.length + 1);

  const offset = (pos: LspPosition): number => {
    if (!pos || !Number.isSafeInteger(pos.line) || pos.line < 0 || pos.line >= lines.length ||
      !Number.isSafeInteger(pos.character) || pos.character < 0 || pos.character > lines[pos.line]!.length)
      throw Error(`Invalid or out-of-bounds UTF-16 edit position ${JSON.stringify(pos)}; document lines=${lines.length}, last line UTF-16 length=${lines.at(-1)?.length ?? 0}.`);
    return starts[pos.line]! + pos.character;
  };
  const ranges = edits.map(edit => {
    if (typeof edit?.newText !== 'string' || !edit.range)
      throw Error('Invalid text edit.');
    const start = offset(edit.range.start), end = offset(edit.range.end);
    if (start > end) throw Error('Reversed text edit range.');
    return {start, end, text: edit.newText};
  });

  // Zero-width insertions may share a position. Insertions inside a replaced span may not.
  const ascending = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  let coveredEnd = -1;
  for (const range of ascending) {
    if (range.start < coveredEnd) throw Error('Overlapping text edits.');
    coveredEnd = Math.max(coveredEnd, range.end);
  }
  return ranges;
}

/** Apply edits in reverse source order, preserving the previous stable same-position behavior. */
export function applyTextEdits(content: string, edits: LspTextEdit[]): string {
  if (!edits.length) return content;
  const validated = validatedTextEdits(content, edits);
  // Stable sorting retains original order for same-offset insertions.
  const descending = validated.sort((a, b) => b.start - a.start);
  let result = content;
  for (const edit of descending)
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}

/** Normalize one WorkspaceEdit, rejecting unsupported or internally conflicting operations. */
export function normalizeWorkspaceEdit(
  edit: WorkspaceEditLike,
  lspClient: TsLspClient,
  projectRoot: string
): {
  fileEdits: Map<string, LspTextEdit[]>;
  fileRenames: Array<{from: string; to: string}>;
  fileDeletes: string[];
} {
  const fileEdits = new Map<string, LspTextEdit[]>();
  const fileRenames: Array<{from: string; to: string}> = [];
  const fileDeletes: string[] = [];
  const fileCreates = new Set<string>();

  const relative = (uriOrPath: string): string => {
    const file = uriOrPath.startsWith('file://') ? lspClient.fromUri(uriOrPath) : uriOrPath;
    return workspacePath(projectRoot, path.isAbsolute(file) ? path.relative(projectRoot, file) : file);
  };
  const addEdits = (file: string, edits: LspTextEdit[]) => {
    const list = fileEdits.get(file) ?? [];
    list.push(...edits);
    fileEdits.set(file, list);
  };
  const stat = (file: string) => fs.lstatSync(path.resolve(projectRoot, file), {throwIfNoEntry: false});

  for (const [uriOrPath, edits] of Object.entries(edit.changes ?? {}))
    addEdits(relative(uriOrPath), edits);

  for (const operation of edit.documentChanges ?? []) {
    if ('kind' in operation) {
      if (operation.kind === 'create') {
        const file = relative(operation.uri);
        if (operation.options?.overwrite || operation.options?.ignoreIfExists)
          throw Error('Workspace creation with overwrite/ignoreIfExists is unsupported.');
        if (fileCreates.has(file) || stat(file))
          throw Error(`Workspace creation would overwrite or duplicate '${file}'.`);
        fileCreates.add(file);
        if (!fileEdits.has(file)) fileEdits.set(file, []);
      } else if (operation.kind === 'delete') {
        const file = relative(operation.uri);
        if (operation.options?.recursive || operation.options?.ignoreIfNotExists || !stat(file)?.isFile())
          throw Error('Deletion requires an existing regular file; recursive/optional deletion is forbidden.');
        fileDeletes.push(file);
      } else if (operation.kind === 'rename') {
        const from = relative(operation.oldUri), to = relative(operation.newUri);
        if (operation.options?.overwrite || operation.options?.ignoreIfExists)
          throw Error('Workspace rename with overwrite/ignoreIfExists is unsupported.');
        if (from === to || stat(to) || (stat(from) && !stat(from)?.isFile()))
          throw Error('Workspace rename requires distinct paths and a free destination.');
        fileRenames.push({from, to});
      } else {
        throw Error('Unsupported WorkspaceEdit file operation.');
      }
    } else if ('textDocument' in operation) {
      addEdits(relative(operation.textDocument.uri), operation.edits);
    } else {
      throw Error('Unsupported WorkspaceEdit document change.');
    }
  }

  const renameEndpoints = new Set<string>();
  for (const {from, to} of fileRenames) {
    if (renameEndpoints.has(from) || renameEndpoints.has(to))
      throw Error('Conflicting workspace renames.');
    renameEndpoints.add(from);
    renameEndpoints.add(to);
    if (fileEdits.has(to))
      throw Error('Editing a rename destination in the same workspace edit is unsupported; refusing partial effects.');
  }

  if (new Set(fileDeletes).size !== fileDeletes.length ||
    fileDeletes.some(file => fileEdits.has(file) || renameEndpoints.has(file)) ||
    [...fileCreates].some(file => fileDeletes.includes(file) || renameEndpoints.has(file)))
    throw Error('Conflicting workspace file operations; refusing partial effects.');

  for (const [file, edits] of fileEdits) {
    const source = stat(file);
    if (source && !source.isFile())
      throw Error(`Editing non-regular workspace target '${file}' is forbidden.`);
    // New source files start empty; creating them is still only authorized by the caller.
    const original = source ? fs.readFileSync(path.resolve(projectRoot, file), 'utf8') : '';
    try {
      validatedTextEdits(original, edits);
    } catch (cause) {
      const ranges = edits.slice(0, 8).map(item => item.range);
      throw new Error(`Invalid WorkspaceEdit in '${file}' (${source ? 'existing' : 'missing'}, UTF-16 length=${original.length}, ranges=${JSON.stringify(ranges)}): ${String(cause)}`, {cause});
    }
  }
  return {fileEdits, fileRenames, fileDeletes};
}


/** A single validated effect set for preview, fingerprinting and guarded apply.
 * individual retains original WorkspaceEdit grouping for legacy fingerprint compatibility.
 */
export function normalizeWorkspaceEdits(edits: readonly WorkspaceEditLike[], lspClient: TsLspClient, projectRoot: string) {
  const individual = edits.map(edit => normalizeWorkspaceEdit(edit, lspClient, projectRoot));
  const fileEdits = new Map<string, LspTextEdit[]>();
  const fileRenames: Array<{from: string; to: string}> = [];
  const fileDeletes: string[] = [];
  const creates = new Set<string>();
  const missingEdits = new Set<string>();

  for (let i = 0; i < individual.length; i++) {
    const group = individual[i]!;
    for (const operation of edits[i]!.documentChanges ?? []) {
      if ('kind' in operation && operation.kind === 'create') {
        const file = workspacePath(projectRoot, lspClient.fromUri(operation.uri));
        if (creates.has(file)) throw Error('Conflicting workspace creations.');
        creates.add(file);
      }
    }
    for (const [file, changes] of group.fileEdits) {
      if (!fs.lstatSync(path.resolve(projectRoot, file), {throwIfNoEntry: false})) {
        if (missingEdits.has(file)) throw Error('Conflicting edits of a missing workspace file.');
        missingEdits.add(file);
      }
      fileEdits.set(file, [...(fileEdits.get(file) ?? []), ...changes]);
    }
    fileRenames.push(...group.fileRenames);
    fileDeletes.push(...group.fileDeletes);
  }

  const renameEndpoints = new Set<string>();
  for (const rename of fileRenames) {
    if (renameEndpoints.has(rename.from) || renameEndpoints.has(rename.to) ||
      creates.has(rename.from) || creates.has(rename.to) ||
      !fs.lstatSync(path.resolve(projectRoot, rename.from), {throwIfNoEntry: false})?.isFile())
      throw Error('Conflicting workspace renames.');
    renameEndpoints.add(rename.from);
    renameEndpoints.add(rename.to);
    if (fileEdits.has(rename.to)) throw Error('Conflicting rename destination edits.');
  }
  if (new Set(fileDeletes).size !== fileDeletes.length ||
    fileDeletes.some(file => fileEdits.has(file) || renameEndpoints.has(file) || creates.has(file)) ||
    [...creates].some(file => renameEndpoints.has(file)))
    throw Error('Conflicting workspace file operations.');

  // Validate the combined ranges, not merely each original WorkspaceEdit.
  for (const [file, changes] of fileEdits) {
    if (!changes.length && !creates.has(file) &&
      !fs.lstatSync(path.resolve(projectRoot, file), {throwIfNoEntry: false}))
      throw Error('Empty edit cannot implicitly create a workspace file.');
    const source = fs.lstatSync(path.resolve(projectRoot, file), {throwIfNoEntry: false});
    applyTextEdits(source ? fs.readFileSync(path.resolve(projectRoot, file), 'utf8') : '', changes);
  }
  const affectedFiles = [...new Set([...fileEdits.keys(), ...fileDeletes,
    ...fileRenames.flatMap(rename => [rename.from, rename.to])])].sort();
  return {individual, fileEdits, fileRenames, fileDeletes, affectedFiles};
}

export type WorkspaceEditPlan = ReturnType<typeof normalizeWorkspaceEdits>;
