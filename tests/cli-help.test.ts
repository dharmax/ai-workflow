import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('CLI help has no operation side effects', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-help-')); });
  afterEach(() => { fs.rmSync(root, {recursive: true, force: true}); });

  for (const args of [['next', '--help'], ['init', '--help'], ['resolve', 'T', '--help'], ['claim', 'T', '-h']]) {
    it(`shows canonical help before executing ${args.join(' ')}`, () => {
      const result = Bun.spawnSync([process.execPath, path.resolve(import.meta.dir, '../src/cli.ts'), ...args], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
      expect(result.success).toBe(true);
      expect(result.stdout.toString()).toContain('Usage: aiwf <command> [options]');
      expect(result.stdout.toString()).not.toContain('Recommended Task:');
      expect(fs.readdirSync(root)).toEqual([]);
    });
  }
});
