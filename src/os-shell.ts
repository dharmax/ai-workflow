/**
 * Responsibility: Execute OS-level shell commands using Bun.spawn with timeout and output capture.
 * Scope: Project root and system process execution for ai-workflow shell and agent primitives.
 */

export interface OsCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface OsCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  durationMs: number;
  timedOut: boolean;
  success: boolean;
}

export async function executeOsCommand(
  command: string,
  options: OsCommandOptions = {}
): Promise<OsCommandResult> {
  const startTime = performance.now();
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs ?? 30000;
  let timedOut = false;

  try {
    const proc = Bun.spawn(['bash', '-c', command], {
      cwd,
      env: { ...process.env, ...options.env },
      stdout: 'pipe',
      stderr: 'pipe'
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill();
      } catch {
        // Ignore kill errors
      }
    }, timeoutMs);

    const [stdoutText, stderrText] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ]);

    const exitCode = await proc.exited;
    clearTimeout(timeoutTimer);

    const durationMs = performance.now() - startTime;
    const stdout = stdoutText.trim();
    const stderr = stderrText.trim();
    const output = [stdout, stderr].filter(Boolean).join('\n');

    return {
      command,
      exitCode,
      stdout,
      stderr,
      output,
      durationMs,
      timedOut,
      success: exitCode === 0 && !timedOut
    };
  } catch (err: any) {
    const durationMs = performance.now() - startTime;
    const errMsg = err?.message || String(err);
    return {
      command,
      exitCode: 1,
      stdout: '',
      stderr: errMsg,
      output: errMsg,
      durationMs,
      timedOut,
      success: false
    };
  }
}
