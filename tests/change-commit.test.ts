/**
 * Responsibility: Characterize inert source materialization and guarded filesystem commit.
 * Scope: Stage 3B; no graph, LSP process or Product mutation authority.
 */
import {it, expect, beforeEach, afterEach} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {computeFileSha256} from '../src/change/fingerprint.ts';
import {prepareSourceCommit, commitSourceFiles} from '../src/services/code-mutation/source-commit.ts';

let root: string;
const lsp = {fromUri: fileURLToPath} as Parameters<typeof prepareSourceCommit>[1];
const uri = (file: string) => pathToFileURL(path.join(root, file)).href;
const range = (start: number, end: number) =>
  ({start: {line: 0, character: start}, end: {line: 0, character: end}});

beforeEach(() => {root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-change-commit-'));});
afterEach(() => {fs.rmSync(root, {recursive: true, force: true});});

it('materializes edits, creation, deletion and rename without any disk writes, then commits exact effects', () => {
  fs.writeFileSync(path.join(root, 'edited.ts'), 'old');
  fs.writeFileSync(path.join(root, 'renamed.ts'), 'rename source');
  fs.writeFileSync(path.join(root, 'deleted.ts'), 'remove this');
  const preview = {
    affectedFiles: ['created.ts', 'deleted.ts', 'edited.ts', 'moved.ts', 'renamed.ts'],
    originalHashes: {
      'edited.ts': computeFileSha256('old'),
      'renamed.ts': computeFileSha256('rename source'),
      'deleted.ts': computeFileSha256('remove this'),
      'created.ts': 'missing',
      'moved.ts': 'missing'
    },
    mutations: [{kind: 'workspace_edit' as const, source: 'workspace-text' as const, edit: {
      changes: {
        [uri('edited.ts')]: [{range: range(0, 3), newText: 'new'}],
        [uri('created.ts')]: [{range: range(0, 0), newText: 'created'}]
      },
      documentChanges: [
        {kind: 'rename' as const, oldUri: uri('renamed.ts'), newUri: uri('moved.ts')},
        {kind: 'delete' as const, uri: uri('deleted.ts')}
      ]
    }}]
  };
  const plan = prepareSourceCommit(root, lsp, preview);
  expect(plan.expectedAfter).toEqual({
    'edited.ts': computeFileSha256('new'),
    'created.ts': computeFileSha256('created'),
    'moved.ts': computeFileSha256('rename source'),
    'deleted.ts': 'missing',
    'renamed.ts': 'missing'
  });
  expect(fs.readFileSync(path.join(root, 'edited.ts'), 'utf8')).toBe('old');
  expect(fs.existsSync(path.join(root, 'created.ts'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'moved.ts'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'deleted.ts'), 'utf8')).toBe('remove this');
  const committed = commitSourceFiles(root, plan, preview.originalHashes);
  expect(committed).toEqual([{from: 'renamed.ts', to: 'moved.ts'}]);
  expect(fs.readFileSync(path.join(root, 'edited.ts'), 'utf8')).toBe('new');
  expect(fs.readFileSync(path.join(root, 'created.ts'), 'utf8')).toBe('created');
  expect(fs.readFileSync(path.join(root, 'moved.ts'), 'utf8')).toBe('rename source');
  expect(fs.existsSync(path.join(root, 'deleted.ts'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'renamed.ts'))).toBe(false);
});

it('rejects stale files before materialization and late destination races inside the synchronous commit', () => {
  fs.writeFileSync(path.join(root, 'a.ts'), 'source');
  const preview = {
    affectedFiles: ['a.ts', 'late.ts'],
    originalHashes: {'a.ts': computeFileSha256('source'), 'late.ts': 'missing'},
    mutations: [{kind: 'workspace_edit' as const, source: 'typescript-lsp' as const,
      edit: {documentChanges: [{kind: 'rename' as const, oldUri: uri('a.ts'), newUri: uri('late.ts')}]}}]
  };
  const plan = prepareSourceCommit(root, lsp, preview);
  fs.writeFileSync(path.join(root, 'late.ts'), 'external');
  expect(() => commitSourceFiles(root, plan, preview.originalHashes)).toThrow(/changed before guarded commit/);
  expect(fs.readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe('source');
  expect(fs.readFileSync(path.join(root, 'late.ts'), 'utf8')).toBe('external');
  fs.unlinkSync(path.join(root, 'late.ts'));
  fs.writeFileSync(path.join(root, 'a.ts'), 'changed');
  expect(() => prepareSourceCommit(root, lsp, preview)).toThrow(/modified since preview/);
});
