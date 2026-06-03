#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "node:fs/promises";

export async function runLocateTrappedLogic(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf("--root");
  const root = path.resolve(rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd());
  const files: string[] = [];
  for await (const file of glob("aiwf-common-core/core/**/*.ts", { cwd: root, exclude: ["**/node_modules/**"] })) {
    files.push(file);
  }
  const findings: Array<{ file: string; line: number; text: string }> = [];
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/console\.log|process\.stdout\.write/.test(line)) {
        findings.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  const payload = { root, findings, count: findings.length };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runLocateTrappedLogic();
}
