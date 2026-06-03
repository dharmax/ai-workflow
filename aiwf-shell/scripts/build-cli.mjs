#!/usr/bin/env node

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outfile = path.join(repoRoot, "dist", "ai-workflow.mjs");

await buildNodeBin(path.join(repoRoot, "cli", "ai-workflow.ts"), outfile);
await buildNodeBin(path.join(repoRoot, "scripts", "init-project.ts"), path.join(repoRoot, "dist", "init-project.mjs"));

async function buildNodeBin(entryPoint, outPath) {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: outPath
  });

  const built = await readFile(outPath, "utf8");
  const normalized = built.replace(/^(#!\/usr\/bin\/env node\n)+/, "#!/usr/bin/env node\n");
  await writeFile(outPath, normalized, "utf8");
}
