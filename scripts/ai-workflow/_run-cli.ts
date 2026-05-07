#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const cliPath = path.resolve(repoRoot, "cli", "ai-workflow.ts");

export function runCli(args: string[], argv = process.argv.slice(2)) {
  const child = spawn("tsx", [cliPath, ...args, ...argv], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}
