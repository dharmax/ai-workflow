import path from "node:path";
import { spawn } from "node:child_process";
import { getToolkitRoot, getWorkspaceRoot } from "./toolkit-root.ts";

export function resolveTsxCliPath(toolkitRoot = getToolkitRoot()) {
  const workspaceRoot = getWorkspaceRoot(toolkitRoot);
  return path.resolve(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");
}

export function spawnTsx(args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: any;
  toolkitRoot?: string;
}) {
  return spawn(process.execPath, [resolveTsxCliPath(options.toolkitRoot), ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio
  });
}
