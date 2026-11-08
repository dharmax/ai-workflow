/**
 * Responsibility: Characterize exact supported WorkspaceEdit behavior before Code Mutation Service extraction.
 * Scope: Pure text edits and edit normalization; no LSP launch or source commits.
 */
import {describe, it, expect, beforeEach, afterEach} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {applyTextEdits, normalizeWorkspaceEdit} from '../src/change/engine.ts';

const range = (line: number, start: number, end: number) =>
  ({start: {line, character: start}, end: {line, character: end}});

describe('Code Mutation Stage 1A: existing edit contracts', () => {
  let root: string;
  const lsp = {fromUri: (uri: string) => fileURLToPath(uri)} as Parameters<typeof normalizeWorkspaceEdit>[1];
  const uri = (file: string) => pathToFileURL(path.join(root, file)).href;

  beforeEach(() => {root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-change-edits-'));});
  afterEach(() => {fs.rmSync(root, {recursive: true, force: true});});

  it('uses UTF-16 positions and preserves CRLF under multi-line edits', () => {
    const before = 'a😀bc\r\nsecond\r\n';
    expect(applyTextEdits(before, [
      {range: range(0, 3, 4), newText: 'B'},
      {range: range(1, 0, 6), newText: 'NEXT'}
    ])).toBe('a😀Bc\r\nNEXT\r\n');
  });

  it('preserves the current stable same-offset insertion order', () => {
    const zero = range(0, 1, 1);
    expect(applyTextEdits('ab', [
      {range: zero, newText: 'X'}, {range: zero, newText: 'Y'}
    ])).toBe('aYXb');
  });

  it('merges changes and documentChanges while recording file operations', () => {
    fs.writeFileSync(path.join(root, 'remove.ts'), 'old');
    const edit = {
      changes: {[uri('one.ts')]: [{range: range(0, 0, 0), newText: 'one'}]},
      documentChanges: [
        {textDocument: {uri: uri('one.ts'), version: null}, edits: [{range: range(0, 0, 0), newText: 'again'}]},
        {kind: 'create' as const, uri: uri('created.ts')},
        {kind: 'rename' as const, oldUri: uri('old.ts'), newUri: uri('moved.ts')},
        {kind: 'delete' as const, uri: uri('remove.ts')}
      ]
    };
    const result = normalizeWorkspaceEdit(edit, lsp, root);
    expect([...result.fileEdits]).toEqual([
      ['one.ts', [{range: range(0, 0, 0), newText: 'one'}, {range: range(0, 0, 0), newText: 'again'}]],
      ['created.ts', []]
    ]);
    expect(result.fileRenames).toEqual([{from: 'old.ts', to: 'moved.ts'}]);
    expect(result.fileDeletes).toEqual(['remove.ts']);
    expect(fs.existsSync(path.join(root, 'created.ts'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'remove.ts'), 'utf8')).toBe('old');
  });

  it('rejects lexical and symlink escapes without touching outside files', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-change-outside-'));
    try {
      fs.symlinkSync(outside, path.join(root, 'escape'));
      expect(() => normalizeWorkspaceEdit({changes: {'../outside.ts': []}}, lsp, root)).toThrow('escapes');
      expect(() => normalizeWorkspaceEdit({changes: {'escape/secret.ts': []}}, lsp, root)).toThrow('symlink');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {fs.rmSync(outside, {recursive: true, force: true});}
  });
});
