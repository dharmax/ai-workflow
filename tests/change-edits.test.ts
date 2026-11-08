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
import {normalizeWorkspaceEdits} from '../src/services/code-mutation/edits.ts';

const range = (line: number, start: number, end: number) =>
  ({start: {line, character: start}, end: {line, character: end}});

describe('Code Mutation Stages 1A/1B: edit contracts', () => {
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

  it('rejects nonfinite, negative, fractional and out-of-bounds UTF-16 positions', () => {
    for (const position of [
      {line: -1, character: 0}, {line: 1.5, character: 0},
      {line: Number.NaN, character: 0}, {line: Number.POSITIVE_INFINITY, character: 0},
      {line: 1, character: 0}, {line: 0, character: -1},
      {line: 0, character: 1.5}, {line: 0, character: Number.POSITIVE_INFINITY},
      {line: 0, character: 4}
    ]) {
      expect(() => applyTextEdits('a😀', [
        {range: {start: position, end: position}, newText: 'X'}
      ])).toThrow();
    }
    expect(applyTextEdits('a😀', [{range: range(0, 3, 3), newText: 'X'}])).toBe('a😀X');
  });

  it('rejects reversed and overlapping ranges but permits adjacent edits and boundary insertions', () => {
    const edit = (start: number, end: number, newText: string) =>
      ({range: range(0, start, end), newText});
    expect(() => applyTextEdits('abcdef', [edit(4, 2, 'X')])).toThrow();
    expect(() => applyTextEdits('abcdef', [edit(1, 4, 'X'), edit(2, 5, 'Y')])).toThrow();
    expect(() => applyTextEdits('abcdef', [edit(1, 4, 'X'), edit(2, 2, 'Y')])).toThrow();
    expect(() => applyTextEdits('abcdef', [edit(1, 4, 'X'), edit(1, 4, 'X')])).toThrow();
    expect(applyTextEdits('abcdef', [edit(1, 3, 'X'), edit(3, 5, 'Y')])).toBe('aXYf');
    expect(applyTextEdits('abcdef', [edit(1, 3, 'X'), edit(3, 3, '!')])).toBe('aX!def');
  });

  it('rejects invalid WorkspaceEdit ranges during normalization, not only apply', () => {
    fs.writeFileSync(path.join(root, 'unit.ts'), 'abc');
    const invalid = {changes: {[uri('unit.ts')]: [{range: range(0, 0, 99), newText: 'X'}]}};
    expect(() => normalizeWorkspaceEdit(invalid, lsp, root)).toThrow();
    expect(fs.readFileSync(path.join(root, 'unit.ts'), 'utf8')).toBe('abc');
  });

  it('rejects conflicting create, delete and rename operations before writes', () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'old');
    fs.writeFileSync(path.join(root, 'other.ts'), 'other');
    const create = (file: string) => ({kind: 'create' as const, uri: uri(file)});
    const del = (file: string) => ({kind: 'delete' as const, uri: uri(file)});
    const rename = (from: string, to: string) =>
      ({kind: 'rename' as const, oldUri: uri(from), newUri: uri(to)});
    for (const documentChanges of [
      [create('new.ts'), create('new.ts')],
      [del('a.ts'), del('a.ts')],
      [rename('a.ts', 'new.ts'), rename('a.ts', 'new2.ts')],
      [rename('a.ts', 'new.ts'), rename('other.ts', 'new.ts')],
      [rename('a.ts', 'a.ts')],
      [rename('a.ts', 'other.ts')],
      [create('new.ts'), del('new.ts')],
      [create('new.ts'), rename('a.ts', 'new.ts')],
      [rename('a.ts', 'new.ts'), rename('new.ts', 'new2.ts')],
      [rename('a.ts', 'new.ts'), del('a.ts')]
    ]) expect(() => normalizeWorkspaceEdit({documentChanges}, lsp, root)).toThrow();
    expect(fs.readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(root, 'other.ts'), 'utf8')).toBe('other');
    expect(fs.existsSync(path.join(root, 'new.ts'))).toBe(false);
  });

  it('rejects unrecognized or unsupported file operations and dangling symlink targets', () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'old');
    const unknown = {documentChanges: [{kind: 'copy', uri: uri('new.ts')}]};
    expect(() => normalizeWorkspaceEdit(unknown as unknown as Parameters<typeof normalizeWorkspaceEdit>[0], lsp, root)).toThrow();
    expect(() => normalizeWorkspaceEdit({documentChanges: [
      {kind: 'create', uri: uri('new.ts'), options: {overwrite: true}}
    ]}, lsp, root)).toThrow();
    expect(() => normalizeWorkspaceEdit({documentChanges: [
      {kind: 'rename', oldUri: uri('a.ts'), newUri: uri('new.ts'), options: {overwrite: true}}
    ]}, lsp, root)).toThrow();
    fs.symlinkSync(path.join(root, 'missing-target'), path.join(root, 'dangling.ts'));
    expect(() => normalizeWorkspaceEdit({changes: {'dangling.ts': []}}, lsp, root)).toThrow();
    expect(fs.lstatSync(path.join(root, 'dangling.ts')).isSymbolicLink()).toBe(true);
  });

  it('rejects protected metadata paths and dangling intermediate symlinks', () => {
    for (const file of ['.git/config', '.ai-workflow/decisions.md'])
      expect(() => normalizeWorkspaceEdit({changes: {[file]: []}}, lsp, root)).toThrow();
    const outside = path.join(os.tmpdir(), 'aiwf-absent-target-' + path.basename(root));
    fs.symlinkSync(outside, path.join(root, 'dangling-dir'));
    expect(() => normalizeWorkspaceEdit({changes: {'dangling-dir/new.ts': []}}, lsp, root)).toThrow();
    expect(fs.existsSync(outside)).toBe(false);
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

  it('rejects overlaps and file-operation conflicts spanning separate WorkspaceEdits', () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'abcdef');
    fs.writeFileSync(path.join(root, 'b.ts'), 'other');
    const a = (start: number, end: number, text: string) =>
      ({changes: {[uri('a.ts')]: [{range: range(0, start, end), newText: text}]}});
    const rename = (from: string, to: string) =>
      ({documentChanges: [{kind: 'rename' as const, oldUri: uri(from), newUri: uri(to)}]});
    const del = (file: string) =>
      ({documentChanges: [{kind: 'delete' as const, uri: uri(file)}]});
    const create = (file: string) =>
      ({documentChanges: [{kind: 'create' as const, uri: uri(file)}]});

    expect(() => normalizeWorkspaceEdits([a(1, 4, 'X'), a(2, 5, 'Y')], lsp, root)).toThrow(/Overlapping/);
    expect(() => normalizeWorkspaceEdits([del('a.ts'), a(0, 1, 'X')], lsp, root)).toThrow(/Conflicting/);
    expect(() => normalizeWorkspaceEdits([del('a.ts'), del('a.ts')], lsp, root)).toThrow(/Conflicting/);
    expect(() => normalizeWorkspaceEdits([rename('a.ts', 'moved.ts'), rename('b.ts', 'moved.ts')], lsp, root)).toThrow(/Conflicting/);
    expect(() => normalizeWorkspaceEdits([create('new.ts'), create('new.ts')], lsp, root)).toThrow(/Conflicting/);
    expect(() => normalizeWorkspaceEdits([create('new.ts'), rename('a.ts', 'new.ts')], lsp, root)).toThrow(/Conflicting/);
    expect(() => normalizeWorkspaceEdits([
      {changes: {[uri('new.ts')]: [{range: range(0, 0, 0), newText: 'A'}]}},
      {changes: {[uri('new.ts')]: [{range: range(0, 0, 0), newText: 'B'}]}}
    ], lsp, root)).toThrow(/Conflicting/);
    expect(fs.readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe('abcdef');
    expect(fs.readFileSync(path.join(root, 'b.ts'), 'utf8')).toBe('other');
    expect(fs.existsSync(path.join(root, 'new.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'moved.ts'))).toBe(false);
  });

  it('unifies valid disjoint edits and both rename endpoints without changing order', () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'abcdef');
    fs.writeFileSync(path.join(root, 'b.ts'), 'other');
    const edits = [
      {changes: {[uri('a.ts')]: [{range: range(0, 1, 3), newText: 'X'}]}},
      {changes: {[uri('a.ts')]: [{range: range(0, 3, 5), newText: 'Y'}]}},
      {documentChanges: [{kind: 'rename' as const, oldUri: uri('b.ts'), newUri: uri('moved.ts')}]}
    ];
    const plan = normalizeWorkspaceEdits(edits, lsp, root);
    expect(plan.affectedFiles).toEqual(['a.ts', 'b.ts', 'moved.ts']);
    expect(plan.fileRenames).toEqual([{from: 'b.ts', to: 'moved.ts'}]);
    expect(plan.individual).toHaveLength(3);
    expect(applyTextEdits('abcdef', plan.fileEdits.get('a.ts')!)).toBe('aXYf');
    expect(fs.readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe('abcdef');
  });
});
