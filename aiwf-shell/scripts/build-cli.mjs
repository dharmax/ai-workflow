#!/usr/bin/env node

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outfile = path.join(repoRoot, "dist", "ai-workflow.mjs");

await build({
  entryPoints: [path.join(repoRoot, "cli", "ai-workflow.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile
});

const built = await readFile(outfile, "utf8");
const normalized = built.replace(/^(#!\/usr\/bin\/env node\n)+/, "#!/usr/bin/env node\n");
await writeFile(outfile, normalized, "utf8");
