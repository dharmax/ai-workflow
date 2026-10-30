import {expect, it} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

it('every model TypeScript file starts with a responsibility and scope header', () => {
  const directory = path.resolve(import.meta.dir, '../src/model');
  const files = new Bun.Glob('**/*.ts').scanSync({cwd: directory});
  const header = /^\/\*\*\r?\n \* Responsibility: [^\r\n]+\r?\n \* Scope: [^\r\n]+\r?\n \*\//;
  const missing = [...files].filter(file => !header.test(fs.readFileSync(path.join(directory, file), 'utf8')));
  expect(missing.sort()).toEqual([]);
});
