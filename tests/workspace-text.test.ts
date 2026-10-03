import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';

describe('Consuela ordinary workspace targets', () => {
  let root: string, store: WorkflowStore, engine: CausalChangeEngine;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-text-'));
    store = new WorkflowStore(root); engine = new CausalChangeEngine({ store, projectRoot: root }); initializeTools();
  });
  afterEach(async () => { await closeAllTsLspClients(); await closeAllTs6RefactorClients(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });

  for (const [filePath, before, oldText, newText, after] of [
    ['package.json', '{"scripts":{"test":"echo pending"}}\n', 'echo pending', 'bun test', '{"scripts":{"test":"bun test"}}\n'],
    ['settings.conf', 'enabled=false\r\nmode=safe\r\n', 'false\r\nmode=safe', 'true\r\nmode=strict', 'enabled=true\r\nmode=strict\r\n'],
    ['README.md', '# 🐕 Consuela\n\nRun `old`.\n', '`old`', '`bun test`', '# 🐕 Consuela\n\nRun `bun test`.\n']
  ]) it(`previews and safely applies a deterministic edit to ${filePath}`, async () => {
    fs.writeFileSync(path.join(root, filePath), before);
    const request = { action: 'replace_text' as const, filePath, oldText, newText };
    const preview = await registry.execute('preview_change', request, { store, projectRoot: root });
    expect(preview.blocked).toBe(false); expect(preview.originalHashes[filePath]).toMatch(/^[a-f0-9]{64}$/);
    expect((await engine.previewChange(request)).fingerprint).toBe(preview.fingerprint);
    expect(fs.readFileSync(path.join(root, filePath), 'utf8')).toBe(before);
    expect(await registry.execute('read_workspace_file', { filePath }, { store, projectRoot: root })).toEqual({ filePath, content: before });
    const result = await registry.execute('apply_change', { request, fingerprint: preview.fingerprint }, { store, projectRoot: root });
    expect(result.ok && result.verification.passed).toBe(true); expect(fs.readFileSync(path.join(root, filePath), 'utf8')).toBe(after);
  });

  it('rejects missing, ambiguous, empty, nonexistent, directory and escaped replacement targets', async () => {
    fs.writeFileSync(path.join(root, 'config.txt'), 'aaa');
    for (const [filePath, oldText] of [['config.txt', 'missing'], ['config.txt', 'aa'], ['config.txt', ''], ['absent', 'a'], ['.ai-workflow', 'a'], ['../outside', 'a'], [path.join(root, 'config.txt'), 'a']]) {
      expect((await engine.previewChange({ action: 'replace_text', filePath, oldText, newText: 'x' })).blocked).toBe(true);
    }
    expect(fs.readFileSync(path.join(root, 'config.txt'), 'utf8')).toBe('aaa');
  });

  it('rejects stale content even when oldText still uniquely matches', async () => {
    fs.writeFileSync(path.join(root, 'config.txt'), 'old\n');
    const request = { action: 'replace_text' as const, filePath: 'config.txt', oldText: 'old', newText: 'new' };
    const preview = await engine.previewChange(request);
    fs.appendFileSync(path.join(root, 'config.txt'), 'user work\n');
    await expect(engine.applyChange(request, preview.fingerprint)).rejects.toThrow(/fingerprint|modified/i);
    expect(fs.readFileSync(path.join(root, 'config.txt'), 'utf8')).toBe('old\nuser work\n');
  });

  it('bounds reads and rejects missing files, directories, absolute paths and lexical/symlink escapes', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret'), 'outside'); fs.symlinkSync(path.join(outside, 'secret'), path.join(root, 'escape'));
      fs.writeFileSync(path.join(root, 'large'), 'x'.repeat(65537)); fs.writeFileSync(path.join(root, 'limit'), 'x'.repeat(65536));
      for (const filePath of ['missing', '.ai-workflow', '../outside', 'escape', 'large', path.join(root, 'limit')]) {
        await expect(registry.execute('read_workspace_file', { filePath }, { store, projectRoot: root })).rejects.toThrow();
      }
      expect((await registry.execute('read_workspace_file', { filePath: 'limit' }, { store, projectRoot: root })).content.length).toBe(65536);
      expect((await engine.previewChange({ action: 'replace_text', filePath: 'escape', oldText: 'outside', newText: 'changed' })).blocked).toBe(true);
      expect(fs.readFileSync(path.join(outside, 'secret'), 'utf8')).toBe('outside');
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  });
});
