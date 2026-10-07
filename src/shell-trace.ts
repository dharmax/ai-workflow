import fs from 'node:fs';
import path from 'node:path';
import type {ShellSession} from './shell.ts';
import type {WorkflowActor, ShellMode} from './actor/engine.ts';

export interface ShellTrace {
  instruction: string;
  mode: ShellMode;
  initialTools?: string[];
  discoveryElapsedMs?: number;
  tools?: string[];
  result?: Omit<Awaited<ReturnType<WorkflowActor['execute']>>, 'events'>;
  error?: string;
}

export function shellTracePath(session: ShellSession): string {
  return path.join(session.projectRoot, '.ai-workflow', 'state', 'last-shell-trace.txt');
}

/** The viewport owns step evidence; this adds the shell's run context and termination. */
export function formatShellTrace(session: ShellSession): string {
  if (!session.trace) {
    const saved = shellTracePath(session);
    return fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : 'No shell execution trace recorded yet.';
  }
  const {instruction, mode, tools, result, error} = session.trace;
  const run = session.viewport!.getRun();
  return [
    'AIWF shell execution trace',
    `Request: ${instruction}`,
    `Mode: ${mode.toUpperCase()}`,
    `Status: ${run.status} · ${run.elapsedMs} ms · ${session.viewport!.getSteps().length} steps`,
    `Step budget: ${result?.stepBudget ?? session.actor.maxSteps}`,
    session.trace.discoveryElapsedMs !== undefined ? `Discovery completed at +${session.trace.discoveryElapsedMs} ms` : '',
    session.trace.initialTools ? `Initially discovered tools: ${session.trace.initialTools.length ? session.trace.initialTools.join(', ') : '(none)'}` : '',
    `Available tools: ${tools ? tools.length ? tools.join(', ') : '(none)' : '(discovery did not complete)'}`,
    `Model: ${result?.targetModel ?? 'runtime-selected (model ID not reported)'}`,
    result?.escalationReason ? `Escalation: ${result.escalationReason}` : '',
    `Termination: ${result?.haltReason ?? (error ? 'error' : result?.offlineFallback ? 'LLM unavailable' : run.status)}`,
    error ? `Error: ${error}` : '',
    ...(result?.issues ?? []).map(issue => `Issue${issue.step ? ` at step ${issue.step}` : ''}: ${issue.kind}${issue.source ? `/${issue.source}` : ''}: ${issue.message}`),
    session.viewport!.formatBoxedTrace(),
    result ? `Final response:\n${result.answer}` : '',
  ].filter(Boolean).join('\n').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

export function saveShellTrace(session: ShellSession): void {
  const file = shellTracePath(session);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file + '.tmp', formatShellTrace(session), {mode: 0o600});
  fs.renameSync(file + '.tmp', file);
}

export async function openShellTrace(session: ShellSession): Promise<string> {
  const trace = formatShellTrace(session);
  if (!session.renderer || trace === 'No shell execution trace recorded yet.') return trace;
  try {
    const result = await session.renderer.view({
      id: 'shell-trace', title: 'AIWF execution trace', mode: 'readonly',
      fields: {trace: {type: 'text', label: 'Last execution', value: trace, multiline: true, mode: 'readonly'}}
    });
    return result.status === 'unavailable' ? trace : '';
  } catch (error) {
    return `Trace window unavailable: ${error instanceof Error ? error.message : String(error)}\n${trace}`;
  }
}
