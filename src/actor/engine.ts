/**
 * Responsibility: Autonomous Cognitive Actor Engine & Dynamic Mode Switcher.
 * Scope: Built on @dharmax/llm-utils (LLMActor, ModelRouter, LlmMetrics), with deterministic
 * mode routing ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), bounded ReAct loop, pubsub telemetry,
 * and robust offline fallback.
 */

import { z } from 'zod';
import { LLMActor, Asker, ModelRouter, InMemoryMetricsStore } from '@dharmax/llm-utils';
import pubsub from '@dharmax/pubsub';
import type { WorkflowStore } from '../graph/store.ts';

export { pubsub };
import { registry, type ToolRegistry, type ToolContext } from '../tools/registry.ts';
import { bucketRouter } from '../tools/bucket-router.ts';
import { loadConfig, resolveCloudCredentials } from '../config.ts';
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
Your objective is roadmap clarity, Epics, User Stories, acceptance criteria, and Kanban lane hygiene.
Use ticket_* tools to prioritize, groom backlog, lease work, and ensure deliverables meet user intent.`
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

    const cfg = loadConfig(this.projectRoot);
    const creds = resolveCloudCredentials();
    const providers: Record<string, any> = {};

    // 1. Local Ollama Provider
    const ollamaHost = cfg.ollamaUrl || 'http://localhost:11434';
    providers.ollama = {
      id: 'ollama',
      host: ollamaHost,
      available: true,
      local: true
    };

    const gateway = cfg.gateway || 'auto';
    this.activeGateway = gateway;

    // 2. OpenRouter Gateway (universal multi-model endpoint)
    if ((gateway === 'auto' || gateway === 'openrouter') && creds.openrouterApiKey) {
      providers.openrouter = {
        id: 'openrouter',
        apiKey: creds.openrouterApiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        available: true
      };
    }

    // 3. Direct Cloud Providers
    if (gateway === 'auto' || gateway === 'direct') {
      if (creds.anthropicApiKey) {
        providers.anthropic = {
          id: 'anthropic',
          apiKey: creds.anthropicApiKey,
          available: true
        };
      }
      if (creds.geminiApiKey) {
        providers.google = {
          id: 'google',
          apiKey: creds.geminiApiKey,
          available: true
        };
      }
      if (creds.openaiApiKey) {
        providers.openai = {
          id: 'openai',
          apiKey: creds.openaiApiKey,
          available: true
        };
      }
    }

    this.configuredProviders = Object.keys(providers).filter((p) => providers[p]?.available);

    if (options.offline || options.asker === null) {
      this.asker = undefined;
    } else if (options.asker) {
      this.asker = options.asker;
    } else {
      try {
        const model = cfg.model || MODE_CONFIGS[this.mode].defaultLocalModel;
        this.asker = new Asker({
          providers,
          preferLocal: this.preferLocal,
          defaultModel: `ollama/${model}`
        });
      } catch {
        this.asker = undefined;
      }
    }
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
   * Dynamically evaluates complexity, blast radius, and ModelRadar for cognitive escalation.
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

    // Fallback if no LLM provider is connected or available
    if (!this.asker) {
      return await this.executeOfflineFallback(rawText, activeMode, ctx);
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

    // Determine target model
    let targetModel: string;
    if (execOptions?.forceModel) {
      targetModel = execOptions.forceModel;
    } else if (cfg.modelRoutes?.[activeMode]) {
      targetModel = cfg.modelRoutes[activeMode];
    } else if (shouldEscalate) {
      const rec = this.radar.getRecommendations()[activeMode];
      if (this.configuredProviders.includes('openrouter')) {
        targetModel = `openrouter/${rec}`;
      } else if (this.configuredProviders.includes('anthropic')) {
        targetModel = `anthropic/${config.defaultCloudModel}`;
      } else if (this.configuredProviders.includes('google')) {
        targetModel = `google/${config.defaultCloudModel}`;
      } else if (this.configuredProviders.includes('openai')) {
        targetModel = `openai/gpt-4o`;
      } else {
        targetModel = `ollama/${cfg.model || config.defaultLocalModel}`;
      }
    } else {
      targetModel = `ollama/${cfg.model || config.defaultLocalModel}`;
    }

    if (shouldEscalate) {
      pubsub.trigger('aiwf', 'actor:escalate', {
        mode: activeMode,
        targetModel,
        reason: escalationReason
      });
    }

    try {
      const candidateTools = bucketRouter.getCandidateTools(rawText, registry);
      const actor = new LLMActor(this.asker, {
        maxSteps: this.maxSteps,
        system: config.systemPrompt
      });

      // Mount selected candidate tools
      for (const t of candidateTools) {
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

      const result = await actor.run(rawText, {
        maxSteps: this.maxSteps,
        askOptions: {
          model: targetModel
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
        return await this.executeOfflineFallback(rawText, activeMode, ctx, result.error);
      }

      return {
        mode: activeMode,
        stepsCount: events.length,
        answer: finalAnswer,
        events,
        targetModel,
        escalated: shouldEscalate,
        escalationReason
      };
    } catch (err: any) {
      // Graceful degradation on model connection error or timeout
      return await this.executeOfflineFallback(rawText, activeMode, ctx, err.message);
    }
  }

  /**
   * Deterministic grounded offline handler: provides real context and recommendations
   * when LLM is offline or times out.
   */
  private async executeOfflineFallback(
    text: string,
    mode: ShellMode,
    ctx: ToolContext,
    reason?: string
  ): Promise<{
    mode: ShellMode;
    stepsCount: number;
    answer: string;
    events: ActorStepEvent[];
    offlineFallback: boolean;
  }> {
    const bucket = bucketRouter.resolveBucket(text);
    const candidates = bucketRouter.getCandidateTools(text, registry);
    const candidateNames = candidates.map(c => c.name).join(', ');

    let summary = `[Mode: ${mode.toUpperCase()}] Offline Fast-Path\n`;
    if (reason) summary += `Notice: LLM provider unavailable (${reason}).\n`;
    summary += `Target Domain: ${bucket}\n`;
    summary += `Recommended Capabilities: ${candidateNames}\n`;

    // Execute the top candidate tool deterministically if safe/read-only
    let autoResult: any = null;
    const topTool = candidates[0];
    if (topTool && ['list_tickets', 'recommend_next_task', 'get_git_status', 'get_environment_info'].includes(topTool.name)) {
      try {
        autoResult = await topTool.execute({}, ctx);
        summary += `\nDirect Observation from ${topTool.name}:\n` + JSON.stringify(autoResult, null, 2);
      } catch {}
    }

    return {
      mode,
      stepsCount: autoResult ? 1 : 0,
      answer: summary,
      events: [
        {
          step: 1,
          mode,
          thought: `Offline grounded execution using ${topTool?.name || 'fast-path'}`,
          toolCall: topTool ? { name: topTool.name, params: {} } : undefined,
          toolResult: autoResult,
          finalAnswer: summary
        }
      ],
      offlineFallback: true
    };
  }
}
