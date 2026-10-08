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
      cwd: z.string().optional().describe('Omit or use "." for the project root. Relative paths resolve from it; absolute paths refer to the filesystem ("/" is the filesystem root).'),
      timeoutMs: z.number().int().positive().default(30000).describe('Timeout in milliseconds')
    }),
    execute: async ({ command, cwd, timeoutMs }, ctx: ToolContext) => {
      const workingDir = cwd ? path.resolve(ctx.projectRoot, cwd) : ctx.projectRoot;
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const flag = isWindows ? '/c' : '-c';

      let timedOut = false;
      let cancelled = ctx.signal?.aborted === true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
      let scratchBefore: string | undefined;
      const scratchSnapshot = (): string | undefined => {
        if (!ctx.scratchRoot) return undefined;
        try {
          const entries = [''];
          for (let i = 0; i < entries.length; i++) {
            const entry = path.join(ctx.scratchRoot, entries[i]!);
            if (!fs.lstatSync(entry).isDirectory()) continue;
            const directory = fs.opendirSync(entry);
            try {
              let child;
              while ((child = directory.readSync())) {
                if (entries.length >= 512) return undefined;
                entries.push(path.join(entries[i]!, child.name));
              }
            } finally { directory.closeSync(); }
          }
          return JSON.stringify(entries.sort().map(name => {
            const stat = fs.lstatSync(path.join(ctx.scratchRoot!, name), {bigint: true});
            return [name, String(stat.ino), String(stat.mode), String(stat.size), String(stat.mtimeNs), String(stat.ctimeNs)];
          }));
        } catch { return undefined; }
      };
      const stop = () => {
        if (!proc) return;
        // A detached POSIX shell owns its descendants; close inherited pipes too.
        if (!isWindows) {
          try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill(9); }
        } else proc.kill();
      };
      const abort = () => { cancelled = true; stop(); };
      const observation = (exitCode: number | null, stdout: string, stderr: string, error?: string) => ({
        success: exitCode === 0 && !timedOut && !cancelled && !error,
        exitCode, cwd: workingDir,
        stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 5000),
        stdoutTruncated: stdout.length > 10000, stderrTruncated: stderr.length > 5000,
        timedOut, cancelled,
        authority: ctx.executionAuthority ?? 'project-write',
        scratchRoot: ctx.scratchRoot,
        observationOnly: ctx.executionAuthority === 'read-only' && scratchBefore !== undefined && scratchSnapshot() === scratchBefore,
        output: stdout.slice(0, 10000),
        error: error || (stderr ? stderr.slice(0, 5000) : undefined)
      });
      if (cancelled) return observation(null, '', '', 'Command cancelled before execution');
      try {
        let argv = [shell, flag, command];
        if (ctx.executionAuthority === 'read-only') {
          const sandbox = process.platform === 'linux' ? Bun.which('bwrap') : null;
          if (!sandbox || !ctx.scratchRoot) return observation(null, '', '', 'Read-only execution requires Linux bubblewrap and a host-provided scratch directory; execution denied.');
          const source = fs.realpathSync(ctx.projectRoot), scratch = fs.realpathSync(ctx.scratchRoot);
          const overlaps = (parent: string, child: string) => {
            const relative = path.relative(parent, child);
            return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
          };
          if (overlaps(source, scratch) || overlaps(scratch, source)) return observation(null, '', '', 'Scratch and project directories must not overlap; execution denied.');
          scratchBefore = scratchSnapshot();
          argv = [sandbox, '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--unshare-pid', '--die-with-parent',
            '--bind', scratch, scratch, '--setenv', 'TMPDIR', scratch, '--setenv', 'XDG_CACHE_HOME', path.join(scratch, 'cache'), ...argv];
        }
        proc = Bun.spawn(argv, {
          cwd: workingDir, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached: !isWindows
        });
        ctx.signal?.addEventListener('abort', abort, {once: true});
        if (ctx.signal?.aborted) abort();
        timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited
        ]);
        return observation(exitCode, stdout, stderr,
          cancelled ? 'Command cancelled by parent signal' : timedOut ? `Command timed out after ${timeoutMs}ms` : undefined);
      } catch (err: unknown) {
        return observation(null, '', '', err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', abort);
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
