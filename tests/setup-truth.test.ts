import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configureMcp} from '../src/setup.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {runDiagnostics} from '../src/doctor.ts';

describe('truthful setup', () => {
  let home: string;
  let store: WorkflowStore | undefined;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-setup-truth-')); });
  afterEach(() => { store?.close(); store = undefined; fs.rmSync(home, {recursive: true, force: true}); });
  it('inspects without writes, verifies changes and leaves repeated setup byte-for-byte stable', () => {
    fs.mkdirSync(path.join(home, '.codex'));
    fs.mkdirSync(path.join(home, '.cursor'));
    const cursor = path.join(home, '.cursor', 'mcp.json');
    fs.writeFileSync(cursor, JSON.stringify({other: 'retained', mcpServers: {other: {command: 'other'}}}));
    const options = {homeDir: home, binaryPath: '/tmp/aiwf-test-binary'};
    const inspected = configureMcp({...options, check: true});
    expect(inspected.steps.find(s => s.id === 'Cursor')?.state).toBe('needed');
    expect(fs.existsSync(path.join(home, '.codex', 'config.toml'))).toBe(false);
    expect(fs.existsSync(`${cursor}.bak`)).toBe(false);
    expect(configureMcp(options).steps.find(s => s.id === 'Cursor')?.state).toBe('changed');
    const files = fs.readdirSync(home, {recursive: true}).map(String).filter(name => fs.statSync(path.join(home, name)).isFile());
    const before = files.map(name => ({name, content: fs.readFileSync(path.join(home, name), 'utf8'), mtime: fs.statSync(path.join(home, name)).mtimeMs}));
    const repeated = configureMcp(options);
    expect(repeated.steps.filter(s => s.state === 'changed' || s.state === 'failed')).toEqual([]);
    for (const file of before) {
      expect(fs.readFileSync(path.join(home, file.name), 'utf8')).toBe(file.content);
      expect(fs.statSync(path.join(home, file.name)).mtimeMs).toBe(file.mtime);
    }
    const json = JSON.parse(fs.readFileSync(cursor, 'utf8'));
    expect(json.other).toBe('retained');
    expect(json.mcpServers.other.command).toBe('other');
  });
  it('skips absent hosts without creating their directories', () => {
    const result = configureMcp({homeDir: home, check: true});
    expect(result.steps.filter(s => !s.id.startsWith('Skill:') && s.id !== 'MCP schemas').every(s => s.state === 'skipped')).toBe(true);
    expect(fs.readdirSync(home)).toEqual([]);
    configureMcp({homeDir: home});
    expect(fs.readdirSync(home)).toEqual([]);
  });
  it('reports malformed JSON and TOML without replacing the detected files', () => {
    fs.mkdirSync(path.join(home, '.cursor'));
    fs.mkdirSync(path.join(home, '.codex'));
    const cursor = path.join(home, '.cursor', 'mcp.json');
    const codex = path.join(home, '.codex', 'config.toml');
    fs.writeFileSync(cursor, '{broken');
    fs.writeFileSync(codex, 'broken = [');
    const result = configureMcp({homeDir: home});
    expect(result.steps.find(s => s.id === 'Cursor')?.state).toBe('failed');
    expect(result.steps.find(s => s.id === 'OpenAI Codex')?.state).toBe('failed');
    expect(fs.readFileSync(cursor, 'utf8')).toBe('{broken');
    expect(fs.readFileSync(codex, 'utf8')).toBe('broken = [');
  });
  it('reports filesystem write failure instead of success', () => {
    fs.mkdirSync(path.join(home, '.codex'));
    fs.writeFileSync(path.join(home, '.codex', 'rules'), 'not a directory');
    const result = configureMcp({homeDir: home});
    expect(result.steps.find(s => s.id === 'OpenAI Codex')?.state).toBe('failed');
    expect(result.hostsUpdated).not.toContain('OpenAI Codex');
  });
  it('doctor reports malformed effective configuration as an error', async () => {
    fs.mkdirSync(path.join(home, '.ai-workflow'));
    fs.writeFileSync(path.join(home, '.ai-workflow', 'config.json'), '{bad');
    store = new WorkflowStore(home);
    const result = await runDiagnostics(store, home);
    expect(result.healthy).toBe(false);
    expect(result.checks[0]).toMatchObject({category: 'Configuration', status: 'error'});
    expect(result.checks[0]?.message).toContain('config.json');
  });
});
