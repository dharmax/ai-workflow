import { spawn } from "node:child_process";
import { getToolkitRoot } from "./toolkit-root.ts";

export function resolveTsxCliPath(toolkitRoot = getToolkitRoot()) {
  return resolveBunBin();
}

export function spawnTsx(args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: any;
  toolkitRoot?: string;
}) {
  return spawn(resolveBunBin(), args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio
  });
}

function resolveBunBin() {
  return process.env.BUN_INSTALL
    ? `${process.env.BUN_INSTALL}/bin/bun`
    : "bun";
}
