/**
 * Responsibility: OS Operations, Process Execution, and Environment Probe Facility.
 * Scope: Safe process execution, timeout bounds, and platform detection.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { registry, type ToolContext } from './registry.ts';
import { findProjectRoot } from '../graph/store.ts';

export function registerOsTools() {
  registry.register({
    name: 'run_command',
    description: 'Execute a system command in the project directory with bounded output and timeout.',
    category: 'os',
    parameters: z.object({
      command: z.string().describe('Shell command to execute'),
      cwd: z.string().optional().describe('Optional working directory relative to root'),
      timeoutMs: z.number().default(30000).describe('Timeout in milliseconds')
    }),
    execute: async ({ command, cwd, timeoutMs }, ctx: ToolContext) => {
      const workingDir = cwd ? path.resolve(ctx.projectRoot, cwd) : ctx.projectRoot;
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const flag = isWindows ? '/c' : '-c';

      try {
        const proc = Bun.spawn([shell, flag, command], {
          cwd: workingDir,
          stdout: 'pipe',
          stderr: 'pipe'
        });

        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, timeoutMs);

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        clearTimeout(timer);

        if (timedOut) {
          return {
            success: false,
            exitCode: -1,
            output: stdout.slice(0, 5000),
            error: `Command timed out after ${timeoutMs}ms`
          };
        }

        return {
          success: exitCode === 0,
          exitCode,
          output: stdout.slice(0, 10000),
          error: stderr ? stderr.slice(0, 5000) : undefined
        };
      } catch (err: any) {
        return {
          success: false,
          exitCode: 1,
          output: '',
          error: err.message
        };
      }
    }
  });

  registry.register({
    name: 'get_environment_info',
    description: 'Detect runtime environment, package manager, platform architecture, and toolchain.',
    category: 'os',
    parameters: z.object({}),
    execute: async (_, ctx: ToolContext) => {
      const root = ctx.projectRoot;
      const isBun = typeof Bun !== 'undefined';

      let packageManager = 'unknown';
      if (fs.existsSync(path.join(root, 'bun.lock')) || fs.existsSync(path.join(root, 'bun.lockb'))) packageManager = 'bun';
      else if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
      else if (fs.existsSync(path.join(root, 'yarn.lock'))) packageManager = 'yarn';
      else if (fs.existsSync(path.join(root, 'package-lock.json'))) packageManager = 'npm';
      else if (fs.existsSync(path.join(root, 'Cargo.lock'))) packageManager = 'cargo';
      else if (fs.existsSync(path.join(root, 'poetry.lock'))) packageManager = 'poetry';

      return {
        root,
        platform: `${process.platform} (${process.arch})`,
        runtime: isBun ? `Bun v${Bun.version}` : `Node ${process.version}`,
        packageManager,
        isGit: fs.existsSync(path.join(root, '.git')),
        hasAiWorkflowState: fs.existsSync(path.join(root, '.ai-workflow'))
      };
    }
  });

  registry.register({
    name: 'get_project_root',
    description: 'Resolve the canonical project root across subdirectories and monorepos.',
    category: 'os',
    parameters: z.object({
      startDir: z.string().optional().describe('Starting directory to probe from')
    }),
    execute: async ({ startDir }) => {
      return findProjectRoot(startDir || process.cwd());
    }
  });
}
