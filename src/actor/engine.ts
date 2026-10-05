/**
 * Responsibility: Autonomous Cognitive Actor Engine & Dynamic Mode Switcher.
 * Scope: Built on @dharmax/llm-utils (LLMActor, model routing/advice), with deterministic
 * mode selection ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), bounded ReAct loop, pubsub telemetry,
 * and honest offline failure reporting.
 */

import { LLMActor, LLMSession, Asker, InMemoryMetricsStore } from '@dharmax/llm-utils';
import pubsub from '@dharmax/pubsub';
import type { WorkflowStore } from '../graph/store.ts';

export { pubsub };
import { registry, type ToolContext } from '../tools/registry.ts';
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

export const MODE_CONFIGS: Record<ShellMode, ModeRoutingConfig> = {
  design: {
    mode: 'design',
    taskClass: 'reasoning',
    defaultLocalModel: 'qwen2.5-coder:7b',
    defaultCloudModel: 'claude-3-7-sonnet',
    systemPrompt: `You are an expert Software Architect in [DESIGN] mode.
Your objective is architectural clarity, ADR decision making, modular boundaries, and scalable contracts.
Favor extreme KISS principles. Avoid premature monolithic bloat.
Use ast_* and plan_* tools to inspect existing architecture and propose decisions.`
  },
  dev: {
    mode: 'dev',
    taskClass: 'code',
    defaultLocalModel: 'qwen2.5-coder:7b',
    defaultCloudModel: 'claude-3-5-sonnet',
    systemPrompt: `You are an expert Implementation Engineer in [DEV] mode.
Your objective is writing high-quality code, compiling verified codelets, and surgically patching files.
Always inspect the blast radius and pair with unit tests.
Use compiler_* and git_* tools to safely implement changes.`
  },
  triage: {
    mode: 'triage',
    taskClass: 'fast',
    defaultLocalModel: 'qwen2.5-coder:7b',
    defaultCloudModel: 'gemini-2.5-flash-lite',
    systemPrompt: `You are a Quality & Triage Engineer in [TRIAGE] mode.
Your objective is rapid failure analysis, test suite diagnostics, and preventing regressions.
Use test_* tools to pair targets, triage failing tests, and capture error traces without massive log waste.`
  },
  product: {
    mode: 'product',
    taskClass: 'creative',
    defaultLocalModel: 'qwen2.5-coder:7b',
    defaultCloudModel: 'gemini-2.5-flash',
    systemPrompt: `You are a Technical Product Manager in [PRODUCT] mode.
Your objective is roadmap clarity, Epics, Features, User Stories, acceptance criteria, and Kanban lane hygiene.
When creating or structuring an Epic, always follow the causal flow:
1. Use propose_epic_structure to propose reuse/creation of stable Features and meaningful User Stories (zero graph mutation).
2. Surface and review unresolved questions.
3. Use apply_epic_structure to persist the accepted proposal.
4. Use get_product_coverage to inspect structural and causal coverage.
DO NOT automatically generate tickets or implementation tasks during product roadmap decomposition.`
  }
};

/**
 * Classifies prompt into one of the four operational modes in <1ms (0 tokens).
 */
export function classifyIntentMode(text: string): ShellMode {
  const trimmed = text.trim().toLowerCase();

  // 1. Explicit mode directives
  if (trimmed.startsWith('/design')) return 'design';
  if (trimmed.startsWith('/dev')) return 'dev';
  if (trimmed.startsWith('/triage')) return 'triage';
  if (trimmed.startsWith('/product')) return 'product';

  // 2. Keyword heuristics
  if (/\b(design|architecture|architect|rfc|adr|trade-?offs?|refactor|should we|modular)\b/.test(trimmed)) {
    return 'design';
  }
  if (/\b(test|fail|failing|triage|broken|playwright|regression|bug|error|crash|stack trace)\b/.test(trimmed)) {
    return 'triage';
  }
  if (/\b(epic|story|user story|feature|roadmap|acceptance criteria|product|backlog|priority)\b/.test(trimmed)) {
    return 'product';
  }

  // Default to dev for code implementation
  return 'dev';
}

export interface ActorStepEvent {
  step: number;
  mode: ShellMode;
  thought?: string;
  toolCall?: { name: string; params: any };
  toolResult?: any;
  finalAnswer?: string;
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
  private activeGateway: string = 'auto';

  constructor(options: WorkflowActorOptions) {
    this.store = options.store;
    this.projectRoot = options.projectRoot;
    this.mode = options.mode || 'dev';
    this.maxSteps = options.maxSteps || 10;
    this.timeoutMs = options.timeoutMs || 60000;
    this.preferLocal = options.preferLocal ?? true;
    this.metrics = new InMemoryMetricsStore();
    this.radar = options.radar || new ModelRadar({ projectRoot: this.projectRoot });

    const {config: cfg, providers} = modelRuntime(this.projectRoot);
    this.activeGateway = cfg.gateway || 'auto';

    this.configuredProviders = Object.keys(providers).filter((p) => providers[p]?.available);

    if (options.offline || options.asker === null) {
      this.asker = undefined;
    } else if (options.asker) {
      this.asker = options.asker;
    } else {
      try {
        this.asker = new Asker({
          providers,
          routes: cfg.modelRoutes,
          preferLocal: this.preferLocal,
          defaultModel: cfg.model || MODE_CONFIGS[this.mode].defaultLocalModel
        });
      } catch {
        this.asker = undefined;
      }
    }
    if (this.asker) this.session = new LLMSession(this.asker);
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
    execOptions?: { forceCloud?: boolean; forceModel?: string }
  ): Promise<{
    mode: ShellMode;
    stepsCount: number;
    answer: string;
    events: ActorStepEvent[];
    offlineFallback?: boolean;
    targetModel?: string;
    escalated?: boolean;
    escalationReason?: string;
  }> {
    const rawText = instruction.replace(/^\/(design|dev|triage|product|auto)\s*/i, '');
    const activeMode = forcedMode || (instruction.startsWith('/') ? classifyIntentMode(instruction) : classifyIntentMode(rawText));
    this.mode = activeMode;
    const config = MODE_CONFIGS[activeMode];

    const ctx: ToolContext = {
      store: this.store,
      projectRoot: this.projectRoot
    };

    const events: ActorStepEvent[] = [];

    const delegation = artifactCommand(rawText.trim().split(/\s+/));
    if (delegation) {
      const result = await registry.execute(delegation.tool, delegation.args, ctx);
      const answer = JSON.stringify(result, null, 2);
      return { mode: activeMode, stepsCount: 1, answer, events: [{ step: 1, mode: activeMode, thought: 'Explicit artifact delegation', toolCall: { name: delegation.tool, params: delegation.args }, toolResult: result, finalAnswer: answer }] };
    }

    if (!this.asker) {
      return this.executeOfflineFallback(activeMode, 'No LLM provider is configured.');
    }

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
      } else if (policy === 'auto') {
        // Design mode heuristic: architecture & ADR synthesis requires deep reasoning
        if (activeMode === 'design') {
          shouldEscalate = true;
          escalationReason = 'Design mode requires frontier reasoning';
        }
        // Blast radius heuristic: multi-file mutations require strong reasoning
        const fileMatch = rawText.match(/([a-zA-Z0-9_\-\.\/]+\.(?:ts|js|tsx|jsx|json))/);
        if (fileMatch) {
          try {
            const blast = await analyzeBlastRadius(this.store, fileMatch[1], this.projectRoot);
            if (blast.affectedFiles.length >= (cfg.escalation?.blastRadiusThreshold ?? 3)) {
              shouldEscalate = true;
              escalationReason = `Blast radius (${blast.affectedFiles.length} files) >= threshold (${cfg.escalation?.blastRadiusThreshold ?? 3})`;
            }
          } catch {}
        }
      }
    }

    // Explicit model choices remain authoritative. Otherwise llm-utils selects
    // from persisted advice using the semantic task class and locality preference.
    const explicitModel = execOptions?.forceModel ?? cfg.modelRoutes?.[activeMode];
    const preferLocalForRun = policy === 'local_only'
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
      const actor = new LLMActor(this.asker, {
        maxSteps: this.maxSteps,
        system: config.systemPrompt
      });

      // Natural-language intent is interpreted by the LLM against the real capability surface.
      // Explicit shell commands are handled deterministically before reaching this path.
      for (const t of registry.getAll()) {
        actor.registerTool({
          name: t.name,
          description: t.description,
          parameters: t.parameters as any,
          execute: async (params) => {
            pubsub.trigger('aiwf', 'actor:tool', { name: t.name, params });
            return await t.execute(params, ctx);
          }
        });
      }

      const result = await this.session!.run(actor, rawText, {
        maxSteps: this.maxSteps,
        askOptions: {
          ...(explicitModel ? {model: explicitModel} : {task: config.taskClass}),
          preferLocal: preferLocalForRun,
          maxTokens: cfg.llmOutputTokens
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      // Record steps telemetry
      if (result.steps && Array.isArray(result.steps)) {
        for (let i = 0; i < result.steps.length; i++) {
          const s = result.steps[i];
          const firstCall = s.toolCalls?.[0];
          const firstResult = s.toolResults?.[0];
          const ev: ActorStepEvent = {
            step: i + 1,
            mode: activeMode,
            thought: s.thought,
            toolCall: firstCall ? { name: firstCall.toolName, params: firstCall.parameters } : undefined,
            toolResult: firstResult?.result,
            finalAnswer: s.finalAnswer
          };
          events.push(ev);
          pubsub.trigger('aiwf', 'actor:step', ev);
        }
      }

      const lastStep = result.steps?.[result.steps.length - 1];
      const finalAnswer = result.finalText || lastStep?.finalAnswer || (result.ok ? 'Instruction processed.' : 'Unable to complete instruction.');

      if (!result.ok && (!result.finalText && !lastStep?.finalAnswer)) {
        return this.executeOfflineFallback(activeMode, result.error);
      }

      return {
        mode: activeMode,
        stepsCount: events.length,
        answer: finalAnswer,
        events,
        targetModel: explicitModel,
        escalated: shouldEscalate,
        escalationReason
      };
    } catch (err: any) {
      return this.executeOfflineFallback(activeMode, err.message);
    }
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
