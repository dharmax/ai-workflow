/**
 * Responsibility: Source edit application and workspace-edit normalization.
 * Scope: Behavioral extraction from CausalChangeEngine; validation changes occur in Stage 1B.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {TsLspClient} from '../../change/ts-lsp.ts';
import type {LspPosition, LspTextEdit, WorkspaceEditLike} from '../../change/types.ts';
import {workspacePath} from '../../change/workspace-path.ts';

/**
 * Applies a list of LspTextEdits to file text in memory (0-based line/col).
 * Applies edits in reverse order so line/column offsets remain stable.
 */
export function applyTextEdits(content: string, edits: LspTextEdit[]): string {
  if (edits.length === 0) return content;

  const lines = content.split('\n');

  // Convert position to char offset
  function posToOffset(pos: LspPosition): number {
    let offset = 0;
    for (let i = 0; i < Math.min(pos.line, lines.length); i++) {
      offset += lines[i].length + 1; // +1 for \n
    }
    if (pos.line < lines.length) {
      offset += Math.min(pos.character, lines[pos.line].length);
    }
    return offset;
  }

  // Sort edits descending by start offset
  const sortedEdits = [...edits].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line;
    }
    return b.range.start.character - a.range.start.character;
  });

  let result = content;
  for (const edit of sortedEdits) {
    const startOff = posToOffset(edit.range.start);
    const endOff = posToOffset(edit.range.end);
    result = result.slice(0, startOff) + edit.newText + result.slice(endOff);
  }

  return result;
}

/**
 * Normalizes all edits from a WorkspaceEdit into a standard map:
 * relPath -> LspTextEdit[]
 * plus any file renames: Array<{ from: string; to: string }>
 */
export function normalizeWorkspaceEdit(
  edit: WorkspaceEditLike,
  lspClient: TsLspClient,
  projectRoot: string
): {
  fileEdits: Map<string, LspTextEdit[]>;
  fileRenames: Array<{ from: string; to: string }>;
  fileDeletes: string[];
} {
  const fileEdits = new Map<string, LspTextEdit[]>();
  const fileRenames: Array<{ from: string; to: string }> = [];
  const fileDeletes: string[] = [];

  // 1. Direct changes map { [uri]: edits }
  if (edit.changes) {
    for (const [uriOrPath, edits] of Object.entries(edit.changes)) {
      const absPath = uriOrPath.startsWith('file://') ? lspClient.fromUri(uriOrPath) : uriOrPath;
      const relPath = path.isAbsolute(absPath) ? path.relative(projectRoot, absPath) : absPath;
      const existing = fileEdits.get(relPath) || [];
      existing.push(...edits);
      fileEdits.set(relPath, existing);
    }
  }

  // 2. documentChanges array
  if (edit.documentChanges) {
    for (const docChange of edit.documentChanges) {
      if ('kind' in docChange && docChange.kind === 'rename') {
        const fromAbs = lspClient.fromUri(docChange.oldUri);
        const toAbs = lspClient.fromUri(docChange.newUri);
        fileRenames.push({
          from: path.relative(projectRoot, fromAbs),
          to: path.relative(projectRoot, toAbs)
        });
      } else if ('kind' in docChange) {
        if (docChange.kind === 'delete') {
          const relative = workspacePath(projectRoot, lspClient.fromUri(docChange.uri));
          if (docChange.options?.recursive || !fs.lstatSync(path.resolve(projectRoot, relative)).isFile())
            throw Error('Deletion requires an existing regular file; recursive deletion is forbidden.');
          fileDeletes.push(relative);
          continue;
        }
        const relative = path.relative(projectRoot, lspClient.fromUri(docChange.uri));
        if (fs.existsSync(path.resolve(projectRoot, relative))) throw Error(`Workspace creation would overwrite '${relative}'.`);
        if (!fileEdits.has(relative)) fileEdits.set(relative, []);
      } else if ('textDocument' in docChange) {
        const absPath = lspClient.fromUri(docChange.textDocument.uri);
        const relPath = path.relative(projectRoot, absPath);
        const existing = fileEdits.get(relPath) || [];
        existing.push(...docChange.edits);
        fileEdits.set(relPath, existing);
      }
    }
  }

  if (fileRenames.some(rename => fileEdits.has(rename.to)))
    throw Error('Editing a rename destination in the same workspace edit is unsupported; refusing partial effects.');
  for (const file of [...fileEdits.keys(), ...fileDeletes, ...fileRenames.flatMap(rename => [rename.from, rename.to])])
    workspacePath(projectRoot, file);
  if (new Set(fileDeletes).size !== fileDeletes.length || fileDeletes.some(file => fileEdits.has(file) || fileRenames.some(rename => rename.from === file || rename.to === file)))
    throw Error('Conflicting workspace deletion; refusing partial effects.');
  return { fileEdits, fileRenames, fileDeletes };
}

