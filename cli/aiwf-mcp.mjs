#!/usr/bin/env node

import { existsSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(__dirname, "..");
const distEntry = path.resolve(repoRoot, "aiwf-mcp", "dist", "aiwf-mcp.mjs");
const sourceEntry = path.resolve(repoRoot, "aiwf-mcp", "server.ts");
const tsxCli = path.resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const args = existsSync(distEntry)
  ? [distEntry, ...process.argv.slice(2)]
  : [tsxCli, sourceEntry, ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
