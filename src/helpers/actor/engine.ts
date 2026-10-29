/**
 * Responsibility: Autonomous Cognitive Actor Engine & Dynamic Mode Switcher.
 * Scope: Built on @dharmax/llm-utils (LLMActor, model routing/advice), with deterministic
 * mode selection ([DESIGN], [DEV], [TRIAGE], [PRODUCT]), bounded ReAct loop, pubsub telemetry,
 * and honest offline failure reporting.
 */

import {
    LLMActor,
    LLMSession,
    Asker,
    ToolExecutionError,
    InMemoryMetricsStore,
    ToolAbortError,
    type ActorIssue,
    type ActorStepRecord,
    type ActorRunOptions,
    type ActorRunResult,
    type LlmMetricEvent,
    type ToolDefinition as ActorTool,
} from "@dharmax/llm-utils"
import pubsub from "@dharmax/pubsub"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { WorkflowStore } from "../../graph/store.ts"
import { registry, ToolRegistry, type ToolContext, type ToolDefinition } from "../../tools/registry.ts"
import { ToolDiscovery, semanticsForTool, type DiscoveredTools } from "../../tools/discovery.ts"
import { lexCommand, isExplicitCommand, artifactCommand } from "../../artifact-command.ts"
import { loadConfig } from "../../config.ts"
import { ModelService } from "../../model-runtime.ts"
import { renderActorSystem } from "./prompts.ts"
import { getPublicMcpTools, PUBLIC_MCP_TOOL_NAMES } from "../../tools/surface.ts"

export { pubsub }

export type ShellMode = "design" | "dev" | "triage" | "product"

export interface ModeRoutingConfig {
    mode: ShellMode
    taskClass: "reasoning" | "code" | "fast" | "creative"
}

export const MODE_CONFIGS: Record<ShellMode, ModeRoutingConfig> = {
    design: { mode: "design", taskClass: "reasoning" },
    dev: { mode: "dev", taskClass: "code" },
    triage: { mode: "triage", taskClass: "fast" },
    product: { mode: "product", taskClass: "creative" },
}

/**
 * Parses explicit shell mode syntax only. Natural-language mode selection belongs
 * to the Actor itself; mode is a preference rather than an entrance classifier.
 */
export function classifyIntentMode(text: string, fallback: ShellMode = "dev"): ShellMode {
    const mode = text.trim().match(/^\/(\S+)/)?.[1]?.toLowerCase()
    return Object.values(MODE_CONFIGS).find(config => config.mode === mode)?.mode ?? fallback
}

export interface ActorStepEvent {
    step: number
    mode: ShellMode
    thought?: string
    toolCall?: {
        name: string
        params: Record<string, unknown>
    }
    toolResult?: unknown
    toolCalls?: ActorStepRecord["toolCalls"]
    toolResults?: ActorStepRecord["toolResults"]
    finalAnswer?: string
}

export interface CapabilityDiscoveryEvent {
    mode: ShellMode
    tools: string[]
    request?: string
    query?: DiscoveredTools["query"]
    status?: "started" | "completed" | "failed"
    bootstrap?: boolean
    addedTools?: string[]
    elapsedMs?: number
    error?: string
}

export interface WorkflowActorOptions {
    store: WorkflowStore
    projectRoot: string
    asker?: Asker | null
    mode?: ShellMode
    maxSteps?: number
    preferLocal?: boolean
    offline?: boolean
    timeoutMs?: number
    toolDiscovery?: Pick<ToolDiscovery, "discover"> | null
}

export interface WorkflowExecutionOptions {
    forceCloud?: boolean
    forceModel?: string
    executionAuthority?: ToolContext["executionAuthority"]
    signal?: AbortSignal
    onStep?: (step: ActorStepRecord) => void | Promise<void>
    onDiscovery?: (tools: string[], mode: ShellMode) => void
}

export interface WorkflowExecutionResult {
    mode: ShellMode
    stepsCount: number
    answer: string
    events: ActorStepEvent[]
    offlineFallback?: boolean
    failed?: boolean
    issues?: ActorIssue[]
    haltReason?: string
    stepBudget?: number
    targetModel?: string
    escalated?: boolean
    escalationReason?: string
    discoveredTools?: string[]
    discoveryEvents?: CapabilityDiscoveryEvent[]
}

interface ExecutionState {
    mode: ShellMode
    ctx: ToolContext
    options: WorkflowExecutionOptions
    events: ActorStepEvent[]
    discoveryEvents: CapabilityDiscoveryEvent[]
    selectedNames: Set<string>
    escalated: boolean
    escalationReason?: string
}

export class WorkflowActor {
    public mode: ShellMode
    public readonly store: WorkflowStore
    public readonly projectRoot: string
    public readonly maxSteps: number
    public readonly timeoutMs: number
    public readonly metrics: InMemoryMetricsStore
    private _asker?: Asker
    private session?: LLMSession
    private readonly preferLocal: boolean
    private _configuredProviders: string[] = []
    private localProviders: string[] = []
    private _activeGateway: string = "auto"
    private toolDiscovery?: Pick<ToolDiscovery, "discover">
    private readonly options: WorkflowActorOptions

    constructor(options: WorkflowActorOptions) {
        this.options = { ...options }
        this.store = options.store
        this.projectRoot = options.projectRoot
        this.mode = options.mode || "dev"
        this.maxSteps = options.maxSteps ?? 10
        this.timeoutMs = options.timeoutMs ?? 60000
        this.preferLocal = options.preferLocal ?? true
        this.metrics = new InMemoryMetricsStore()

        this.initRuntime()
    }

    private initRuntime(): void {
        const models = new ModelService(this.projectRoot)
        const { config, providers } = models.runtime
        this._activeGateway = config.gateway
        this._configuredProviders = Object.keys(providers).filter((p) => providers[p]?.available)
        this.localProviders = this._configuredProviders.filter((p) => providers[p]?.local)
        if (this.options.offline || this.options.asker === null) {
            this._asker = undefined
            this.session = undefined
            this.toolDiscovery = undefined
            return
        }
        const tasks = Object.fromEntries(
            Object.entries(MODE_CONFIGS).map(([mode, settings]) => [mode, settings.taskClass]),
        )
        this._asker = this.options.asker ?? models.createAsker(tasks, this.preferLocal)
        this.session = new LLMSession(this._asker, { maxHistoryTurns: 20, maxHistoryChars: 12_000 })
        this.toolDiscovery =
            this.options.toolDiscovery !== undefined
                ? (this.options.toolDiscovery ?? undefined)
                : this.createDiscovery(models)
    }

    private createDiscovery(models: ModelService): ToolDiscovery | undefined {
        const tools = new ToolRegistry()
        for (const tool of getPublicMcpTools(registry)) tools.register(tool)
        if (this.options.asker) return new ToolDiscovery(tools, this.options.asker)
        const local = models.localModel
        if (!local) return undefined
        const discoveryAsker = new Asker({
            providers: { [local.providerId]: models.runtime.providers[local.providerId] },
            defaultModel: local,
            preferLocal: true,
        })
        return new ToolDiscovery(tools, discoveryAsker, this._asker)
    }

    private locality(policy: string, escalated = false): boolean {
        return policy === "local_only" || (policy !== "sota" && !escalated && this.preferLocal)
    }

    public reloadConfig(): void {
        if (this.options.offline || this.options.asker !== undefined) {
            return
        }
        this.initRuntime()
    }

    get asker(): Asker | undefined {
        return this._asker
    }

    public resolveRoute(
        modeOrTask: ShellMode | string = this.mode,
    ): {
        providerId: string
        modelId: string
        target: string
    } | undefined {
        if (!this._asker || typeof this._asker.getRouter !== "function") return undefined
        const task = Object.hasOwn(MODE_CONFIGS, modeOrTask)
            ? MODE_CONFIGS[modeOrTask as ShellMode].taskClass
            : modeOrTask
        const cfg = loadConfig(this.projectRoot)
        const policy = cfg.escalation?.policy || "auto"
        const eligibleProviders = policy === "local_only" ? this.localProviders : this._configuredProviders
        const preferLocal = this.locality(policy)
        const resolved = this._asker.getRouter().resolve(task, eligibleProviders, preferLocal)
        if (!resolved) return undefined
        return {
            providerId: resolved.providerId,
            modelId: resolved.modelId,
            target: `${resolved.providerId}/${resolved.modelId}`,
        }
    }

    get lastExecutionMetrics(): LlmMetricEvent | undefined {
        const events = this.metrics.query({ kind: "llm", limit: 1 })
        const event = events[0]
        return event?.kind === "llm" ? event : undefined
    }

    get configuredProviders(): string[] {
        return [...this._configuredProviders]
    }

    get activeGateway(): string {
        return this._activeGateway
    }

    /** llm-utils owns reasoning and model selection; this host supplies authority and observations. */
    async execute(
        instruction: string,
        forcedMode?: ShellMode,
        options: WorkflowExecutionOptions = {},
    ): Promise<WorkflowExecutionResult> {
        const mode = forcedMode ?? classifyIntentMode(instruction, this.mode)
        const text = instruction.trim().replace(/^\/(design|dev|triage|product|auto)(?=\s|$)\s*/i, "")
        const ctx: ToolContext = {
            store: this.store,
            projectRoot: this.projectRoot,
            executionAuthority: options.executionAuthority ?? 'read-only',
            signal: options.signal,
        }
        const delegation = /^\/(design|dev|triage|product|auto)(?=\s|$)/i.test(instruction.trim()) ? null
            : await artifactCommand(isExplicitCommand(text) ? lexCommand(text) : text.trim().split(/\s+/))
        if (delegation) return this.executeDelegation(mode, delegation, ctx)
        if (!this._asker) return this.executeOfflineFallback(mode, "No LLM provider is configured.")
        this.mode = mode
        const state: ExecutionState = {
            mode,
            ctx,
            options,
            events: [],
            discoveryEvents: [],
            selectedNames: new Set(["run_command", ...(this.toolDiscovery ? ["discover_tools"] : [])]),
            escalated: false,
        }
        return this.executeInstruction(text, state)
    }

    private async executeDelegation(
        mode: ShellMode,
        delegation: NonNullable<Awaited<ReturnType<typeof artifactCommand>>>,
        ctx: ToolContext,
    ): Promise<WorkflowExecutionResult> {
        try {
            const tool = registry.get(delegation.tool)
            if (!tool) throw new Error(`Tool '${delegation.tool}' not found in registry.`)
            this.assertExecutionAllowed(tool, ctx)
            const result = await registry.execute(delegation.tool, delegation.args, ctx)
            const answer = JSON.stringify(result, null, 2)
            const event: ActorStepEvent = {
                step: 1,
                mode,
                thought: "Explicit artifact delegation",
                toolCall: { name: delegation.tool, params: delegation.args },
                toolResult: result,
                finalAnswer: answer,
            }
            return { mode, stepsCount: 1, answer, events: [event] }
        } catch (error) {
            return this.executeFailure(mode, [], this.failureReason(error, ctx.signal), this.errorMessage(error))
        }
    }

    private async executeInstruction(text: string, state: ExecutionState): Promise<WorkflowExecutionResult> {
        const bootstrap = registry.get("run_command")
        if (!bootstrap) return this.executeFailure(state.mode, [], "error", "Bootstrap run_command is not registered.")
        state.options.onDiscovery?.([...state.selectedNames], state.mode)
        const config = loadConfig(this.projectRoot)
        const policy = config.escalation?.policy || "auto"
        if (this.hasCloudProvider() && policy !== "local_only" && (policy === "sota" || state.options.forceCloud)) {
            this.recordEscalation(state, MODE_CONFIGS[state.mode].taskClass, "SOTA / forceCloud requested")
        }
        try {
            state.ctx.scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aiwf-scratch-"))
            const actor = this.createActor(state)
            const options = this.runOptions(state, bootstrap, config)
            this.recordDiscovery(state, { query: {}, bootstrap: true })
            const result = await this.runAttempts(actor, text, options, state, policy)
            return { ...this.executionResult(result, state), ...this.executionDetails(state) }
        } catch (error) {
            return {
                ...this.executeFailure(
                    state.mode,
                    state.events,
                    this.failureReason(error, state.ctx.signal),
                    this.errorMessage(error),
                ),
                ...this.executionDetails(state),
            }
        } finally {
            if (state.ctx.scratchRoot) fs.rmSync(state.ctx.scratchRoot, { recursive: true, force: true })
        }
    }

    private createActor({ mode, ctx }: ExecutionState): LLMActor {
        return new LLMActor(this._asker!, {
            maxSteps: this.maxSteps,
            system: renderActorSystem(mode, this.projectRoot, ctx.scratchRoot),
        })
    }

    private runOptions(
        state: ExecutionState,
        bootstrap: ToolDefinition,
        config: ReturnType<typeof loadConfig>,
    ): ActorRunOptions {
        const policy = config.escalation?.policy || "auto"
        return {
            maxSteps: this.maxSteps,
            tools: [this.wrapTool(bootstrap, state.ctx)],
            onDiscoverTools: this.discoveryHandler(state),
            askOptions: {
                ...(state.options.forceModel
                    ? { model: state.options.forceModel }
                    : { task: MODE_CONFIGS[state.mode].taskClass }),
                preferLocal: this.locality(policy, state.escalated),
                ...(policy === "local_only" ? { allowedProviders: this.localProviders } : {}),
                maxTokens: config.llmOutputTokens,
                timeoutMs: this.timeoutMs,
                metricsSink: this.metrics,
            },
            signal: state.options.signal,
            onStep: (step) => this.recordStep(state, step),
        }
    }

    private async runAttempts(
        actor: LLMActor,
        text: string,
        options: ActorRunOptions,
        state: ExecutionState,
        policy: string,
    ): Promise<ActorRunResult> {
        const routedOptions = {...options, askOptions: {...options.askOptions,
            routingContext: {query: text, role: state.mode}}}
        const result = await this.session!.run(actor, text, routedOptions)
        if (!this.canEscalate(result, state, policy)) return result
        const reason =
            result.error ||
            result.issues.find((issue) => issue.kind === "tool")?.message ||
            "Observable no-progress: execution stalled on initial route"
        this.recordEscalation(state, "reasoning", reason)
        return this.session!.run(actor, text, {
            ...routedOptions,
            onDiscoverTools: this.discoveryHandler(state),
            askOptions: { ...routedOptions.askOptions, task: "reasoning", preferLocal: false },
        })
    }

    private hasCloudProvider(): boolean {
        return this._configuredProviders.some((provider) => !this.localProviders.includes(provider))
    }

    private canEscalate(result: ActorRunResult, state: ExecutionState, policy: string): boolean {
        return (
            !result.ok &&
            policy === "auto" &&
            this.hasCloudProvider() &&
            result.haltReason !== "aborted" &&
            !state.options.signal?.aborted &&
            !state.options.forceModel &&
            !this.options.asker &&
            !state.escalated
        )
    }

    private recordEscalation(state: ExecutionState, taskClass: ModeRoutingConfig["taskClass"], reason: string): void {
        state.escalated = true
        state.escalationReason = reason
        pubsub.trigger("aiwf", "actor:escalate", {
            mode: state.mode,
            targetModel: state.options.forceModel,
            taskClass,
            preferLocal: false,
            reason,
        })
    }

    private discoveryHandler(state: ExecutionState): ActorRunOptions["onDiscoverTools"] {
        if (!this.toolDiscovery) return undefined
        let attempts = 0
        return async (request) => {
            const started = Date.now()
            this.recordDiscovery(state, { request, status: "started" })
            try {
                if (attempts >= 2)
                    throw new Error(
                        "Bounded capability discovery exhausted after two attempts. Continue through run_command and existing evidence.",
                    )
                attempts++
                return await this.recoverTools(state, request, started)
            } catch (error) {
                this.recordDiscovery(state, {
                    request,
                    status: "failed",
                    error: this.errorMessage(error),
                    elapsedMs: Date.now() - started,
                })
                throw error
            }
        }
    }

    private async recoverTools(
        state: ExecutionState,
        request: string,
        started: number,
    ): Promise<ActorTool<unknown, unknown>[]> {
        if (!this.toolDiscovery) throw new Error("Specialized discovery is disabled. Continue through run_command.")
        const found = await this.discoverTools(request, state.options.signal)
        if (found.error) throw new Error(found.error)
        const tools = found.tools.filter(tool => PUBLIC_MCP_TOOL_NAMES.has(tool.name))
        if (!tools.length)
            throw new Error("No applicable specialized capability discovered. Continue through run_command.")
        for (const tool of tools) state.selectedNames.add(tool.name)
        state.options.onDiscovery?.([...state.selectedNames], state.mode)
        this.recordDiscovery(state, {
            request,
            query: found.query,
            status: "completed",
            addedTools: tools.map((tool) => tool.name),
            elapsedMs: Date.now() - started,
        })
        return tools.map((tool) => this.wrapTool(tool, state.ctx))
    }

    private recordDiscovery(state: ExecutionState, detail: Omit<CapabilityDiscoveryEvent, "mode" | "tools">): void {
        const event = { ...detail, mode: state.mode, tools: [...state.selectedNames] }
        state.discoveryEvents.push(event)
        pubsub.trigger("aiwf", "actor:discovery", event)
    }

    private async recordStep(state: ExecutionState, step: ActorStepRecord): Promise<void> {
        const firstCall = step.toolCalls[0]
        const event: ActorStepEvent = {
            step: step.step,
            mode: state.mode,
            toolCalls: step.toolCalls,
            toolResults: step.toolResults,
            toolCall: firstCall ? { name: firstCall.toolName, params: firstCall.parameters } : undefined,
            toolResult: step.toolResults[0]?.result,
            finalAnswer: step.finalAnswer,
        }
        state.events.push(event)
        pubsub.trigger("aiwf", "actor:step", event)
        await state.options.onStep?.(step)
    }

    private executionResult(result: ActorRunResult, state: ExecutionState): WorkflowExecutionResult {
        if (!result.ok)
            return this.executeFailure(state.mode, state.events, result.haltReason, result.error, result.issues)
        const lastStep = result.steps?.[result.steps.length - 1]
        return {
            mode: state.mode,
            stepsCount: state.events.length,
            answer: result.finalText || lastStep?.finalAnswer || "Instruction processed.",
            events: state.events,
            issues: result.issues,
            haltReason: result.haltReason,
        }
    }

    private executionDetails(state: ExecutionState) {
        const lastLlm = this.lastExecutionMetrics
        const executedTarget = lastLlm ? `${lastLlm.providerId}/${lastLlm.modelId}` : undefined
        return {
            discoveryEvents: state.discoveryEvents,
            discoveredTools: [...state.selectedNames],
            targetModel: state.options.forceModel ?? executedTarget ?? this.resolveRoute(state.mode)?.target,
            escalated: state.escalated,
            escalationReason: state.escalationReason,
            stepBudget: this.maxSteps,
        }
    }

    private failureReason(error: unknown, signal?: AbortSignal): string {
        return signal?.aborted || error instanceof ToolAbortError ? "aborted" : "error"
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private async discoverTools(request: string, callerSignal?: AbortSignal): Promise<DiscoveredTools> {
        const timeoutMs = Math.min(this.timeoutMs, 5000)
        const deadline = new AbortController()
        const signal = AbortSignal.any([deadline.signal, ...(callerSignal ? [callerSignal] : [])])
        const timer = setTimeout(
            () => deadline.abort(new Error("Specialized discovery timed out; continue through run_command.")),
            timeoutMs,
        )
        let rejectAbort: (() => void) | undefined
        try {
            const aborted = new Promise<never>((_, reject) => {
                rejectAbort = () => reject(signal.reason ?? new Error("Specialized discovery cancelled."))
                signal.addEventListener("abort", rejectAbort, { once: true })
                if (signal.aborted) rejectAbort()
            })
            return await Promise.race([this.toolDiscovery!.discover(request, 5, { signal, timeoutMs }), aborted])
        } finally {
            clearTimeout(timer)
            if (rejectAbort) signal.removeEventListener("abort", rejectAbort)
        }
    }

    private assertExecutionAllowed(tool: ToolDefinition, ctx: ToolContext): void {
        if (ctx.signal?.aborted) throw new ToolAbortError("Execution aborted by signal.")
        if (
            ctx.executionAuthority === "read-only" &&
            tool.name !== "run_command" &&
            !semanticsForTool(tool).effect?.every((effect) => effect === "read")
        ) {
            throw new ToolExecutionError("Read-only authority does not authorize this capability.", {
                authority: ctx.executionAuthority,
                deniedCapability: tool.name,
            })
        }
    }

    private async executeTool(
        tool: ToolDefinition<unknown, unknown>,
        params: unknown,
        ctx: ToolContext,
    ): Promise<unknown> {
        if (tool.name === "run_command") ctx = { ...ctx, executionAuthority: "read-only" }
        this.assertExecutionAllowed(tool, ctx)
        pubsub.trigger("aiwf", "actor:tool", { name: tool.name, params })
        const result = await ctx.store.withExecutionContext(ctx.executionAuthority ?? 'read-only', ctx.signal,
            () => Promise.resolve(tool.execute(params, ctx)))
        if (
            tool.name === "run_command" &&
            result &&
            typeof result === "object" &&
            "success" in result &&
            result.success === false
        ) {
            throw new ToolExecutionError(
                "error" in result && typeof result.error === "string" ? result.error : "Command failed.",
                result,
            )
        }
        return result
    }

    private wrapTool(tool: ToolDefinition<unknown, unknown>, ctx: ToolContext): ActorTool<unknown, unknown> {
        return {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            readOnly: semanticsForTool(tool).effect?.every((effect) => effect === "read") === true,
            isReadOnlyResult:
                tool.name === "run_command"
                    ? (result) =>
                          !!result &&
                          typeof result === "object" &&
                          "observationOnly" in result &&
                          result.observationOnly === true
                    : undefined,
            execute: (params) => this.executeTool(tool, params, ctx),
        }
    }

    private executeFailure(
        mode: ShellMode,
        events: ActorStepEvent[],
        haltReason: string,
        error?: string,
        issues: ActorIssue[] = [],
    ): WorkflowExecutionResult {
        const summary = [
            ...new Set(
                issues.map((issue) => `${issue.kind}${issue.source ? `/${issue.source}` : ""}: ${issue.message}`),
            ),
        ].slice(-6)
        const detail = error || "Execution did not complete."
        const issueText = summary.length ? ` Issues: ${summary.join(" | ")}` : ""
        return {
            mode,
            stepsCount: events.length,
            answer: `Execution stopped after ${events.length} step(s) (${haltReason}): ${detail}.${issueText}`,
            events,
            failed: true,
            haltReason,
            issues,
        }
    }

    /**
     * Natural-language execution requires an LLM. Deterministic shell commands are
     * handled by the shell before this path, so failure must not invent intent.
     */
    private executeOfflineFallback(mode: ShellMode, reason?: string): WorkflowExecutionResult {
        const detail = reason ? ` (${reason})` : ""
        const answer = `LLM unavailable${detail}. Natural-language execution was not attempted.`
        return {
            mode,
            stepsCount: 0,
            answer,
            events: [],
            offlineFallback: true,
        }
    }
}
