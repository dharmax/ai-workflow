/**
 * Responsibility: Autonomous Cognitive Actor Engine & Dynamic Mode Switcher.
 * Scope: Built on @dharmax/llm-utils (LLMActor, model routing/advice), with deterministic
 * mode selection ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), bounded ReAct loop, pubsub telemetry,
 * and honest offline failure reporting.
 */

import { LLMActor, LLMSession, Asker, parseModelTarget, ToolExecutionError, InMemoryMetricsStore, type ActorIssue, type ActorStepRecord, type LlmMetricEvent } from '@dharmax/llm-utils';
import pubsub from '@dharmax/pubsub';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorkflowStore } from '../graph/store.ts';

export { pubsub };
import { registry, type ToolContext, type ToolDefinition } from '../tools/registry.ts';
import { ToolDiscovery, semanticsForTool, type DiscoveredTools } from '../tools/discovery.ts';
import { artifactCommand } from '../artifact-command.ts';
import { loadConfig } from '../config.ts';
import { modelRuntime } from '../model-runtime.ts';
import { ModelRadar } from './radar.ts';
import { analyzeBlastRadius } from '../tools/graph-queries.ts';

export type ShellMode = 'design' | 'dev' | 'triage' | 'product';

export interface ModeRoutingConfig {
  mode: ShellMode;
  taskClass: 'reasoning' | 'code' | 'fast' | 'creative';
  systemPrompt: string;
  defaultLocalModel: string;
  defaultCloudModel: string;
}


const AGENCY_INSTRUCTIONS = `Achieve the user's entire goal and address every requested part. Modes are preferences, not competence limits.
Use general knowledge for methodology; current-project facts require observed evidence. Inspect actual inputs and their format before processing them. Test fixtures/examples are not current project records. Respect recorded status and scope; completed work is not outstanding work. Truncated output is incomplete: retrieve relevant omitted sections before claiming absence or completeness.
Your bootstrap is run_command plus optional discover_tools. Follow governing project instructions in AGENTS.md when present. Commands run in the project root using Bash (cmd on Windows); Bun executes JavaScript/TypeScript. Use aiwf help to learn the canonical project interface. Consult an interface’s help or documentation before invoking it; library functions are not necessarily executable commands. Keep searches bounded and avoid dependency/build trees unless relevant. Specialized capabilities are conveniences; failed, irrelevant or disabled discovery cannot stop universal execution.
For project-level goals, critical paths, or ticket recommendation rules, acquire the governing project records (e.g. project.md, kanban.md, epics.md, or discovered domain tools) before inspecting auxiliary data. For read-only investigation, do not run shell commands merely to echo thoughts or intermediate notes.
If a capability is missing, compose commands or create/run a temporary helper; remove one-off helpers afterwards. Preserve project state for read-only requests. After an error, inspect failing inputs and repair the underlying assumption or choose another method.
Before finishing, check that observed evidence supports every requested conclusion and relevant eligibility/status constraints. State uncertainty when evidence is insufficient. A genuine blocker must name the concrete inaccessible, unsafe, unauthorized dependency or required user decision; tool limitations alone are not a blocker.`;

export const MODE_CONFIGS: Record<ShellMode, ModeRoutingConfig> = {
  design: {
    mode: 'design', taskClass: 'reasoning', defaultLocalModel: 'qwen2.5-coder:7b', defaultCloudModel: 'claude-3-7-sonnet',
    systemPrompt: AGENCY_INSTRUCTIONS + '\n[DESIGN] preference: architectural clarity, ADRs and modular boundaries when relevant. Favor extreme KISS.'
  },
  dev: {
    mode: 'dev', taskClass: 'code', defaultLocalModel: 'qwen2.5-coder:7b', defaultCloudModel: 'claude-3-5-sonnet',
    systemPrompt: AGENCY_INSTRUCTIONS + '\n[DEV] preference: code and implementation evidence when relevant. Inspect blast radius and verify tests for code changes.'
  },
  triage: {
    mode: 'triage', taskClass: 'fast', defaultLocalModel: 'qwen2.5-coder:7b', defaultCloudModel: 'gemini-2.5-flash-lite',
    systemPrompt: AGENCY_INSTRUCTIONS + '\n[TRIAGE] preference: failure diagnosis and test evidence when relevant, with bounded logs.'
  },
  product: {
    mode: 'product', taskClass: 'creative', defaultLocalModel: 'qwen2.5-coder:7b', defaultCloudModel: 'gemini-2.5-flash',
    systemPrompt: AGENCY_INSTRUCTIONS + '\n[PRODUCT] preference: Product Intent and work evidence when relevant. Do not automatically create implementation work during roadmap decomposition.'
  }
};

/**
 * Parses explicit shell mode syntax only. Natural-language mode selection belongs
 * to the Actor itself; mode is a preference rather than an entrance classifier.
 */
export function classifyIntentMode(text: string): ShellMode {
  const token = text.trim().split(/\s+/, 1)[0]?.toLowerCase()
  if (token === '/design') return 'design'
  if (token === '/triage') return 'triage'
  if (token === '/product') return 'product'
  return 'dev'
}

export interface ActorStepEvent {
  step: number;
  mode: ShellMode;
  thought?: string;
  toolCall?: { name: string; params: any };
  toolResult?: any;
  toolCalls?: ActorStepRecord['toolCalls'];
  toolResults?: ActorStepRecord['toolResults'];
  finalAnswer?: string;
}

export interface CapabilityDiscoveryEvent {
  mode: ShellMode;
  tools: string[];
  request?: string;
  query?: DiscoveredTools['query'];
  status?: 'started' | 'completed' | 'failed';
  bootstrap?: boolean;
  addedTools?: string[];
  elapsedMs?: number;
  error?: string;
}

export interface WorkflowActorOptions {
  store: WorkflowStore;
  projectRoot: string;
  asker?: Asker | null;
  mode?: ShellMode;
  maxSteps?: number;
  preferLocal?: boolean;
  offline?: boolean;
  timeoutMs?: number;
  radar?: ModelRadar;
  toolDiscovery?: Pick<ToolDiscovery, 'discover'> | null;
}

export class WorkflowActor {
  public mode: ShellMode;
  public readonly store: WorkflowStore;
  public readonly projectRoot: string;
  public readonly maxSteps: number;
  public readonly timeoutMs: number;
  public readonly metrics: InMemoryMetricsStore;
  public readonly radar: ModelRadar;
  private asker?: Asker;
  private session?: LLMSession;
  private preferLocal: boolean;
  private configuredProviders: string[] = [];
  private localProviders: string[] = [];
  private activeGateway: string = 'auto';
  private toolDiscovery?: Pick<ToolDiscovery, 'discover'>;
  private options: WorkflowActorOptions;

  constructor(options: WorkflowActorOptions) {
    this.options = { ...options };
    this.store = options.store;
    this.projectRoot = options.projectRoot;
    this.mode = options.mode || 'dev';
    this.maxSteps = options.maxSteps || 10;
    this.timeoutMs = options.timeoutMs || 60000;
    this.preferLocal = options.preferLocal ?? true;
    this.metrics = new InMemoryMetricsStore();
    this.radar = options.radar || new ModelRadar({ projectRoot: this.projectRoot });

    this.initRuntime();
  }

  private initRuntime(): void {
    const {config: cfg, providers} = modelRuntime(this.projectRoot);
    this.activeGateway = cfg.gateway || 'auto';

    this.configuredProviders = Object.keys(providers).filter((p) => providers[p]?.available);
    this.localProviders = this.configuredProviders.filter(p => providers[p]?.local);

    if (this.options.offline || this.options.asker === null) {
      this.asker = undefined;
    } else if (this.options.asker) {
      this.asker = this.options.asker;
    } else {
      try {
        const routes = {...cfg.modelRoutes};
        const fallbacks: Record<string, string[]> = {};
        for (const [mode, settings] of Object.entries(MODE_CONFIGS)) {
          const primary = routes[settings.taskClass] ?? routes[mode] ?? cfg.model;
          routes[settings.taskClass] = primary;
          const target = parseModelTarget(primary);
          // Gateway and origin are equivalent model targets, only when the
          // corresponding provider was configured by modelRuntime.
          const equivalent = target.providerId === 'openrouter'
            ? target.modelId
            : `openrouter/${target.providerId}/${target.modelId}`;
          const alternate = parseModelTarget(equivalent);
          const cloudOrigin = target.providerId === 'openrouter' ? alternate.providerId : target.providerId;
          fallbacks[settings.taskClass] = [
            ...(providers[cloudOrigin] && !providers[cloudOrigin]?.local && providers[alternate.providerId] ? [equivalent] : []),
            cfg.model,
            `ollama/${settings.defaultLocalModel}`,
          ];
        }
        this.asker = new Asker({
          providers,
          routes,
          fallbacks,
          preferLocal: this.preferLocal,
          defaultModel: cfg.model || MODE_CONFIGS[this.mode].defaultLocalModel
        });
      } catch {
        this.asker = undefined;
      }
    }
    if (this.asker) {
      this.session = new LLMSession(this.asker, { maxHistoryTurns: 20, maxHistoryChars: 12_000 });
      if (this.options.toolDiscovery === null) {
        this.toolDiscovery = undefined;
      } else if (this.options.toolDiscovery) {
        this.toolDiscovery = this.options.toolDiscovery;
      } else if (this.options.asker) {
        // Injected askers (tests/custom hosts) remain the single authority.
        this.toolDiscovery = new ToolDiscovery(registry, this.asker);
      } else {
        // Semantic discovery is intentionally local-first and must not inherit
        // project task routes that can force a cheap classifier onto cloud models.
        let discoveryAsker = this.asker;
        try {
          const configured = cfg.model.trim();
          const localModelId = configured.startsWith('ollama/')
            ? configured.slice('ollama/'.length)
            : configured.includes('/')
              ? MODE_CONFIGS[this.mode].defaultLocalModel
              : configured || MODE_CONFIGS[this.mode].defaultLocalModel;
          discoveryAsker = new Asker({
            providers: { ollama: providers.ollama },
            defaultModel: { providerId: 'ollama', modelId: localModelId },
            preferLocal: true
          });
        } catch {}
        this.toolDiscovery = new ToolDiscovery(
          registry,
          discoveryAsker,
          discoveryAsker === this.asker ? undefined : this.asker
        );
      }
    } else {
      this.session = undefined;
      this.toolDiscovery = undefined;
    }
  }

  public reloadConfig(): void {
    if (this.options.offline || this.options.asker !== undefined) {
      return;
    }
    this.initRuntime();
  }

  public getAsker(): Asker | undefined {
    return this.asker;
  }

  public getEffectiveRoute(modeOrTask: ShellMode | string = this.mode): { providerId: string; modelId: string; target: string } | undefined {
    if (!this.asker || typeof this.asker.getRouter !== 'function') return undefined;
    const task = (MODE_CONFIGS as any)[modeOrTask]?.taskClass ?? modeOrTask;
    const cfg = loadConfig(this.projectRoot);
    const policy = cfg.escalation?.policy || 'auto';
    const eligibleProviders = policy === 'local_only' ? this.localProviders : this.configuredProviders;
    const preferLocal = policy === 'local_only' ? true : (policy === 'sota' ? false : this.preferLocal);
    const resolved = this.asker.getRouter().resolve(task, eligibleProviders, preferLocal);
    if (!resolved) return undefined;
    return {
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      target: `${resolved.providerId}/${resolved.modelId}`
    };
  }

  public getLastExecutionMetrics(): LlmMetricEvent | undefined {
    const events = this.metrics.query({ kind: 'llm', limit: 1 });
    return (events[0] as LlmMetricEvent) || undefined;
  }

  setMode(mode: ShellMode): void {
    this.mode = mode;
  }

  getConfiguredProviders(): string[] {
    return [...this.configuredProviders];
  }

  getActiveGateway(): string {
    return this.activeGateway;
  }

  /**
   * Primary entrypoint: runs a bounded Think-Act-Observe loop on user instruction.
   * AIWF supplies task intent/locality; llm-utils owns model selection.
   */
  async execute(
    instruction: string,
    forcedMode?: ShellMode,
    execOptions?: { forceCloud?: boolean; forceModel?: string; executionAuthority?: ToolContext['executionAuthority']; signal?: AbortSignal; onStep?: (step: ActorStepRecord) => void | Promise<void>; onDiscovery?: (tools: string[], mode: ShellMode) => void }
  ): Promise<{
    mode: ShellMode;
    stepsCount: number;
    answer: string;
    events: ActorStepEvent[];
    offlineFallback?: boolean;
    failed?: boolean;
    issues?: ActorIssue[];
    haltReason?: string;
    stepBudget?: number;
    targetModel?: string;
    escalated?: boolean;
    escalationReason?: string;
    discoveredTools?: string[];
    discoveryEvents?: CapabilityDiscoveryEvent[];
  }> {
    const modeToken = instruction.trim().split(/\s+/, 1)[0]?.toLowerCase();
    const explicitMode: ShellMode | undefined =
      modeToken === '/design' ? 'design' :
      modeToken === '/dev' ? 'dev' :
      modeToken === '/triage' ? 'triage' :
      modeToken === '/product' ? 'product' :
      undefined;
    const rawText = instruction.replace(/^\/(design|dev|triage|product|auto)\s*/i, '');
    let activeMode = forcedMode || explicitMode || this.mode;

    const ctx: ToolContext = {
      store: this.store,
      projectRoot: this.projectRoot,
      executionAuthority: execOptions?.executionAuthority,
      signal: execOptions?.signal
    };

    const events: ActorStepEvent[] = [];
    const discoveryEvents: CapabilityDiscoveryEvent[] = [];
    const recordDiscovery = (event: CapabilityDiscoveryEvent) => {
      discoveryEvents.push(event);
      pubsub.trigger('aiwf', 'actor:discovery', event);
    };

    const delegation = artifactCommand(rawText.trim().split(/\s+/));
    if (delegation) {
      const tool = registry.get(delegation.tool);
      if (ctx.executionAuthority === 'read-only' && (!tool || !semanticsForTool(tool).effect?.every(effect => effect === 'read'))) {
        return this.executeFailure(activeMode, events, 'error', 'Read-only authority does not authorize this artifact operation.', []);
      }
      const result = await registry.execute(delegation.tool, delegation.args, ctx);
      const answer = JSON.stringify(result, null, 2);
      return { mode: activeMode, stepsCount: 1, answer, events: [{ step: 1, mode: activeMode, thought: 'Explicit artifact delegation', toolCall: { name: delegation.tool, params: delegation.args }, toolResult: result, finalAnswer: answer }] };
    }

    if (!this.asker) {
      return this.executeOfflineFallback(activeMode, 'No LLM provider is configured.');
    }

    this.mode = activeMode;
    const config = MODE_CONFIGS[activeMode];
    const bootstrap = registry.get('run_command');
    if (!bootstrap) return this.executeFailure(activeMode, events, 'error', 'Bootstrap run_command is not registered.', []);
    const selectedNames = new Set(['run_command', ...(this.toolDiscovery ? ['discover_tools'] : [])]);
    execOptions?.onDiscovery?.([...selectedNames], activeMode);
    const stepBudget = this.maxSteps;

    const cfg = loadConfig(this.projectRoot);
    const policy = cfg.escalation?.policy || 'auto';
    const hasCloud = this.configuredProviders.some((p) => p !== 'ollama');

    // Determine Cognitive Escalation
    let shouldEscalate = false;
    let escalationReason: string | undefined;

    if (hasCloud) {
      if (policy === 'sota' || execOptions?.forceCloud) {
        shouldEscalate = true;
        escalationReason = 'SOTA / forceCloud requested';
      }
    }

    // Explicit model choices remain authoritative. Otherwise llm-utils selects
    // from persisted advice using the semantic task class and locality preference.
    const explicitModel = execOptions?.forceModel;
    let preferLocalForRun = policy === 'local_only'
      ? true
      : shouldEscalate
        ? false
        : this.preferLocal;

    if (shouldEscalate) {
      pubsub.trigger('aiwf', 'actor:escalate', {
        mode: activeMode,
        targetModel: explicitModel,
        taskClass: config.taskClass,
        preferLocal: preferLocalForRun,
        reason: escalationReason
      });
    }

    try {
      if (ctx.executionAuthority === 'read-only') ctx.scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-scratch-'));
      const actor = new LLMActor(this.asker, {
        maxSteps: this.maxSteps,
        maxToolCatalogChars: 16_000,
        system: config.systemPrompt + `\nEnvironment observation: the project root is ${this.projectRoot}.` +
          (ctx.scratchRoot ? `\nExecution authority: read-only project filesystem; writable scratch directory ${ctx.scratchRoot}; TMPDIR points there.` : '')
      });

      const wrapTool = (tool: ToolDefinition) => ({
        name: tool.name,
        readOnly: semanticsForTool(tool).effect?.every(effect => effect === 'read') === true,
        isReadOnlyResult: tool.name === 'run_command' ? (result: {observationOnly?: boolean}) => result?.observationOnly === true : undefined,
        description: tool.description,
        parameters: tool.parameters as any,
        execute: async (params: any) => {
          pubsub.trigger('aiwf', 'actor:tool', { name: tool.name, params });
          if (ctx.executionAuthority === 'read-only' && tool.name !== 'run_command' && !semanticsForTool(tool).effect?.every(effect => effect === 'read')) {
            throw new ToolExecutionError('Read-only authority does not authorize this capability.', {authority: ctx.executionAuthority, deniedCapability: tool.name});
          }
          const result = await tool.execute(params, ctx);
          if (tool.name === 'run_command' && result.success === false) {
            throw new ToolExecutionError(result.error || `Command exited with status ${result.exitCode}`, result);
          }
          return result;
        }
      });

      const runTools = [wrapTool(bootstrap)];
      let recoveryAttempts = 0;
      recordDiscovery({mode: activeMode, query: {}, tools: [...selectedNames], bootstrap: true});

      const runOnce = (taskClass: 'reasoning' | 'code' | 'fast' | 'creative', preferLocal: boolean) =>
        this.session!.run(actor, rawText, {
          maxSteps: stepBudget,
          tools: runTools,
          onDiscoverTools: this.toolDiscovery ? async request => {
            const started = Date.now();
            recordDiscovery({mode: activeMode, request, status: 'started', tools: [...selectedNames]});
            try {
              if (recoveryAttempts >= 2) throw new Error('Bounded capability discovery exhausted after two attempts. Continue through run_command and existing evidence.');
              recoveryAttempts++;
              if (!this.toolDiscovery) throw new Error('Specialized discovery is disabled. Continue through run_command.');
              const timeoutMs = Math.min(this.timeoutMs, 5000);
              const deadline = new AbortController();
              const signal = AbortSignal.any([deadline.signal, ...(execOptions?.signal ? [execOptions.signal] : [])]);
              const timer = setTimeout(() => deadline.abort(new Error('Specialized discovery timed out; continue through run_command.')), timeoutMs);
              let rejectAbort: (() => void) | undefined;
              let found: DiscoveredTools;
              try {
                const aborted = new Promise<never>((_, reject) => {
                  rejectAbort = () => reject(signal.reason ?? new Error('Specialized discovery cancelled.'));
                  signal.addEventListener('abort', rejectAbort, {once: true});
                  if (signal.aborted) rejectAbort();
                });
                found = await Promise.race([this.toolDiscovery.discover(request, 5, {signal, timeoutMs}), aborted]);
              } finally {
                clearTimeout(timer);
                if (rejectAbort) signal.removeEventListener('abort', rejectAbort);
              }
              if (found.error) throw new Error(found.error);
              if (!found.tools.length) throw new Error('No applicable specialized capability discovered. Continue through run_command.');
              for (const tool of found.tools) selectedNames.add(tool.name);
              execOptions?.onDiscovery?.([...selectedNames], activeMode);
              recordDiscovery({mode: activeMode, request, query: found.query, status: 'completed', addedTools: found.tools.map(tool => tool.name), tools: [...selectedNames], elapsedMs: Date.now() - started});
              return found.tools.map(wrapTool);
            } catch (error) {
              recordDiscovery({mode: activeMode, request, status: 'failed', error: error instanceof Error ? error.message : String(error), tools: [...selectedNames], elapsedMs: Date.now() - started});
              throw error;
            }
          } : undefined,
          askOptions: {
            ...(explicitModel ? {model: explicitModel} : {task: taskClass}),
            preferLocal,
            ...(policy === 'local_only' ? {allowedProviders: this.localProviders} : {}),
            maxTokens: cfg.llmOutputTokens,
            timeoutMs: this.timeoutMs,
            metricsSink: this.metrics
          },
          signal: execOptions?.signal,
          onStep: async step => {
            const ev: ActorStepEvent = {
              step: step.step, mode: activeMode,
              toolCalls: step.toolCalls, toolResults: step.toolResults,
              toolCall: step.toolCalls[0] ? {name: step.toolCalls[0].toolName, params: step.toolCalls[0].parameters} : undefined,
              toolResult: step.toolResults[0]?.result,
              finalAnswer: step.finalAnswer
            };
            events.push(ev);
            pubsub.trigger('aiwf', 'actor:step', ev);
            await execOptions?.onStep?.(step);
          }
        });

      let currentTaskClass = config.taskClass;
      let result = await runOnce(currentTaskClass, preferLocalForRun);

      // Observable no-progress cognitive escalation (§6):
      // Triggered only by observable no-progress (halted without success, stall, or capability failure).
      // Explicit local_only policy, lack of cloud providers, or already-escalated runs inhibit escalation.
      const isNoProgress = !result.ok &&
        policy === 'auto' &&
        hasCloud &&
        !this.options.asker &&
        !shouldEscalate;
      if (isNoProgress) {
        shouldEscalate = true;
        escalationReason = result.error || (result.issues.find(i => i.kind === 'tool')?.message) || 'Observable no-progress: execution stalled on initial route';
        preferLocalForRun = false;
        currentTaskClass = 'reasoning';

        pubsub.trigger('aiwf', 'actor:escalate', {
          mode: activeMode,
          targetModel: explicitModel,
          taskClass: currentTaskClass,
          preferLocal: preferLocalForRun,
          reason: escalationReason
        });

        // Run escalated attempt
        result = await runOnce(currentTaskClass, preferLocalForRun);
      }

      const lastStep = result.steps?.[result.steps.length - 1];
      const finalAnswer = result.finalText || lastStep?.finalAnswer || (result.ok ? 'Instruction processed.' : 'Unable to complete instruction.');
      const lastLlm = this.getLastExecutionMetrics();
      const executedTarget = lastLlm ? `${lastLlm.providerId}/${lastLlm.modelId}` : undefined;
      const reportedTarget = explicitModel ?? executedTarget ?? this.getEffectiveRoute(activeMode)?.target;

      if (!result.ok) {
        return {
          ...this.executeFailure(activeMode, events, result.haltReason, result.error, result.issues),
          discoveryEvents, discoveredTools: [...selectedNames], targetModel: reportedTarget, escalated: shouldEscalate, escalationReason, stepBudget
        };
      }

      return {
        mode: activeMode,
        stepsCount: events.length,
        answer: finalAnswer,
        events,
        targetModel: reportedTarget,
        escalated: shouldEscalate,
        escalationReason,
        discoveryEvents, discoveredTools: [...selectedNames],
        issues: result.issues,
        haltReason: result.haltReason,
        stepBudget
      };
    } catch (err: any) {
      const lastLlm = this.getLastExecutionMetrics();
      const executedTarget = lastLlm ? `${lastLlm.providerId}/${lastLlm.modelId}` : undefined;
      const reportedTarget = explicitModel ?? executedTarget ?? this.getEffectiveRoute(activeMode)?.target;
      return {
        ...this.executeFailure(activeMode, events, 'error', err.message, []),
        discoveryEvents, discoveredTools: [...selectedNames], targetModel: reportedTarget, escalated: shouldEscalate, escalationReason, stepBudget
      };
    } finally {
      if (ctx.scratchRoot) fs.rmSync(ctx.scratchRoot, {recursive: true, force: true});
    }
  }

  private executeFailure(
    mode: ShellMode,
    events: ActorStepEvent[],
    haltReason: string,
    error?: string,
    issues: ActorIssue[] = []
  ): {
    mode: ShellMode;
    stepsCount: number;
    answer: string;
    events: ActorStepEvent[];
    failed: true;
    issues: ActorIssue[];
    haltReason: string;
  } {
    const summary = [...new Set(issues.map(issue =>
      `${issue.kind}${issue.source ? `/${issue.source}` : ''}: ${issue.message}`
    ))].slice(-6);
    const detail = error || 'Execution did not complete.';
    const issueText = summary.length ? ` Issues: ${summary.join(' | ')}` : '';
    return {
      mode,
      stepsCount: events.length,
      answer: `Execution stopped after ${events.length} step(s) (${haltReason}): ${detail}.${issueText}`,
      events,
      failed: true,
      haltReason,
      issues
    };
  }

  /**
   * Natural-language execution requires an LLM. Deterministic shell commands are
   * handled by the shell before this path, so failure must not invent intent.
   */
  private executeOfflineFallback(
    mode: ShellMode,
    reason?: string
  ): {
    mode: ShellMode;
    stepsCount: number;
    answer: string;
    events: ActorStepEvent[];
    offlineFallback: boolean;
  } {
    const detail = reason ? ` (${reason})` : '';
    const answer = `LLM unavailable${detail}. Natural-language execution was not attempted.`;
    return {
      mode,
      stepsCount: 0,
      answer,
      events: [],
      offlineFallback: true
    };
  }

}
