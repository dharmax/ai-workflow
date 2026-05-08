#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "node:fs/promises";

export async function runMapDependencies(argv = process.argv.slice(2)) {
  const rootIndex = argv.indexOf("--root");
  const root = path.resolve(rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd());
  const files = [];
  for await (const file of glob("{cli,core}/**/*.ts", { cwd: root, exclude: ["**/node_modules/**"] })) {
    files.push(file);
  }
  const edges = [];
  for (const file of files) {
    const source = await readFile(path.join(root, file), "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const spec = match[1];
      const fromZone = file.startsWith("cli/") ? "cli" : file.startsWith("aiwf-common-core/core/") ? "core" : "other";
      const toZone = spec.includes("/core/") || spec.startsWith("../../core/") || spec.startsWith("../core/") ? "core"
        : spec.includes("/cli/") || spec.startsWith("../../cli/") || spec.startsWith("../cli/") ? "cli"
        : "other";
      if (fromZone !== "other" && toZone !== "other") {
        edges.push({ file, fromZone, toZone, spec });
      }
    }
  }
  const payload = {
    root,
    edges,
    crossBoundary: edges.filter((edge) => edge.fromZone !== edge.toZone)
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMapDependencies();
}
