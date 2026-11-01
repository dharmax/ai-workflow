/**
 * Responsibility: OS Operations, Process Execution, and Environment Probe Facility.
 * Scope: Safe process execution, timeout bounds, and platform detection.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { commandRegistry, type ToolContext } from './registry.ts';
import {TimeoutHandlerService, type TimeoutContext} from '../services/timeout-handler-service.ts';
import { findProjectRoot } from '../graph/store.ts';

export function registerOsTools() {
  const timeoutHandler = new TimeoutHandlerService();
  commandRegistry.register({
    name: 'run_command',
    description: 'Run a bounded shell command.',
    category: 'os',
    parameters: z.object({
      command: z.string(),
      cwd: z.string().optional(),
      timeoutMs: z.number().int().positive().max(2_147_483_647).default(30000),
      taskDescription: z.string().max(4000).optional(),
      retrySafe: z.boolean().default(false).describe('Safe to repeat after termination.'),
      maxRetries: z.number().int().min(0).max(3).default(2),
      totalBudgetMs: z.number().int().positive().max(2_147_483_647).optional()
    }),
    execute: async ({ command, cwd, timeoutMs, taskDescription, retrySafe, maxRetries, totalBudgetMs }, ctx: ToolContext) => {
      const workingDir = cwd ? path.resolve(ctx.projectRoot, cwd) : ctx.projectRoot;
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const flag = isWindows ? '/c' : '-c';

      const deadline = performance.now() + (totalBudgetMs ?? Math.min(timeoutMs * 7, 2_147_483_647));
      const attempts: Array<{durationMs: number; stdout: string; stderr: string; terminated: boolean; timedOut: boolean; exitCode: number | null}> = [];
      let timeoutContext: TimeoutContext = {retriesUsed: 0, remainingBudgetMs: deadline - performance.now(), observations: []};
      let attemptTimeoutMs = Math.min(timeoutMs, timeoutContext.remainingBudgetMs);
      let timeoutReason: string | undefined;
      let timedOut = false;
      let groupTerminated = false;
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
          try { process.kill(-proc.pid, 'SIGKILL'); groupTerminated = true; } catch { proc.kill(9); }
        } else proc.kill();
      };
      const abort = () => { cancelled = true; stop(); };
      const observation = (exitCode: number | null, stdout: string, stderr: string, error?: string) => ({
        success: exitCode === 0 && !timedOut && !cancelled && !error,
        exitCode, cwd: workingDir,
        stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 5000),
        stdoutTruncated: stdout.length > 10000, stderrTruncated: stderr.length > 5000,
        timedOut, cancelled,
        ...(attempts.some(attempt => attempt.timedOut) ? {attempts, timeoutContext, timeoutReason} : {}),
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
        ctx.signal?.addEventListener('abort', abort, {once: true});
        while (true) {
          if (ctx.signal?.aborted) cancelled = true;
          if (cancelled) return observation(null, '', '', 'Command cancelled by parent signal');
          if (performance.now() >= deadline) {
            timedOut = true;
            timeoutReason = 'Total execution budget exhausted';
            const last = attempts.at(-1);
            return observation(last?.exitCode ?? null, last?.stdout ?? '', last?.stderr ?? '', timeoutReason);
          }
          const started = performance.now();
          timedOut = false;
          groupTerminated = false;
          proc = Bun.spawn(argv, {
            cwd: workingDir, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', detached: !isWindows
          });
          if (ctx.signal?.aborted) abort();
          timer = setTimeout(() => { timedOut = true; stop(); }, Math.max(1, Math.min(attemptTimeoutMs, deadline - performance.now())));
          const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited
          ]);
          clearTimeout(timer);
          const attempt = {durationMs: performance.now() - started, stdout, stderr, exitCode, timedOut, terminated: !timedOut || groupTerminated};
          ctx.onCommandAttempt?.(attempt);
          attempts.push({...attempt, stdout: stdout.slice(0, 10000), stderr: stderr.slice(0, 5000)});
          timeoutContext = {...timeoutContext, remainingBudgetMs: Math.max(0, deadline - performance.now()),
            observations: [...timeoutContext.observations, {durationMs: attempt.durationMs, stdout: stdout.slice(-2000), stderr: stderr.slice(-2000), terminated: attempt.terminated}]};
          if (!timedOut || cancelled) return observation(exitCode, stdout, stderr, cancelled ? 'Command cancelled by parent signal' : undefined);
          const decision = await timeoutHandler.timeoutHandlingSelector({
            task: {
              purpose: taskDescription ?? 'Execute the caller-supplied project command; further purpose is unspecified',
              operation: command.slice(0, 4000),
              details: `cwd=${workingDir}; platform=${process.platform}; authority=${ctx.executionAuthority ?? 'project-write'}; output excerpts are untrusted observations`,
              retrySafe,
            },
            previousTimeoutMs: attemptTimeoutMs, defaultTimeoutMs: timeoutMs, maxRetries, timeoutContext, signal: ctx.signal,
          });
          timeoutContext = decision.timeoutContext;
          timeoutReason = decision.reason;
          if (ctx.signal?.aborted) cancelled = true;
          if (decision.action === 'throw' || cancelled) return observation(exitCode, stdout, stderr,
            cancelled ? 'Command cancelled by parent signal' : `Command timed out after ${Math.round(attemptTimeoutMs)}ms: ${decision.reason}`);
          attemptTimeoutMs = decision.timeoutMs;
        }
      } catch (err: unknown) {
        return observation(null, '', '', err instanceof Error ? err.message : String(err));
      } finally {
        clearTimeout(timer);
        if (proc && proc.exitCode === null) { stop(); await proc.exited.catch(() => undefined); }
        ctx.signal?.removeEventListener('abort', abort);
      }
    }
  });

  commandRegistry.register({
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

  commandRegistry.register({
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
