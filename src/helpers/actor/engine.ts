/**
 * Responsibility: Autonomous Cognitive Actor Engine.
 * Scope: Native llm-utils workload inference, model routing and bounded Actor execution,
 * with pubsub telemetry and honest offline failure reporting.
 */

import {
    LayaSystemOne,
    type SystemOne,
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
import {z} from "zod"
import pubsub from "@dharmax/pubsub"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { WorkflowStore } from "../../graph/store.ts"
import { commandRegistry, CommandRegistry, type ToolContext, type ToolDefinition } from "../../tools/registry.ts"
import { ToolDiscovery, semanticsForTool, type DiscoveredTools } from "../../tools/discovery.ts"
import { lexCommand, isExplicitCommand, artifactCommand } from "../../artifact-command.ts"
import { loadConfig } from "../../services/config-service.ts"
import { ModelService, MODEL_WORKLOADS } from "../../services/model-service.ts"
import { renderActorSystem } from "./prompts.ts"
import { getPublicMcpTools } from "../../tools/surface.ts"

export { pubsub }

export const IntelligenceSchema = z.enum(["automatic", "normal", "high", "critical"])
export type Intelligence = z.infer<typeof IntelligenceSchema>

export interface ActorStepEvent {
    step: number
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
    systemOne?: SystemOne
    maxSteps?: number
    preferLocal?: boolean
    offline?: boolean
    timeoutMs?: number
    toolDiscovery?: Pick<ToolDiscovery, "discover"> | null
}

export interface WorkflowExecutionOptions {
    intelligence?: Intelligence
    codeMutationAllowed?: boolean
    forceModel?: string
    executionAuthority?: ToolContext["executionAuthority"]
    signal?: AbortSignal
    onStep?: (step: ActorStepRecord) => void | Promise<void>
    onDiscovery?: (tools: string[]) => void
}

export interface WorkflowExecutionResult {
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
    task: string
    ctx: ToolContext
    options: WorkflowExecutionOptions
    events: ActorStepEvent[]
    discoveryEvents: CapabilityDiscoveryEvent[]
    selectedNames: Set<string>
    escalated: boolean
    escalationReason?: string
}

export class WorkflowActor {
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
        this._asker = this.options.asker ?? models.createAsker(this.preferLocal)
        this.session = new LLMSession(this._asker, { maxHistoryTurns: 20, maxHistoryChars: 12_000 })
        this.toolDiscovery =
            this.options.toolDiscovery !== undefined
                ? (this.options.toolDiscovery ?? undefined)
                : this.createDiscovery(models)
    }

    private createDiscovery(models: ModelService): ToolDiscovery | undefined {
        const tools = new CommandRegistry()
        for (const tool of getPublicMcpTools(commandRegistry)) tools.register(tool)
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
        task = "reasoning",
    ): {
        providerId: string
        modelId: string
        target: string
    } | undefined {
        if (!this._asker || typeof this._asker.getRouter !== "function") return undefined
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
        options: WorkflowExecutionOptions = {},
    ): Promise<WorkflowExecutionResult> {
        const text = instruction.trim()
        const intelligence = IntelligenceSchema.parse(options.intelligence ?? "automatic")
        options = {...options, intelligence}
        const ctx: ToolContext = {
            store: this.store,
            projectRoot: this.projectRoot,
            executionAuthority: options.executionAuthority ?? 'read-only',
            codeMutationAllowed: options.codeMutationAllowed === true,
            signal: options.signal,
        }
        const delegation = await artifactCommand(isExplicitCommand(text) ? lexCommand(text) : text.trim().split(/\s+/))
        if (delegation) return this.executeDelegation(delegation, ctx)
        if (!this._asker) return this.executeOfflineFallback("No LLM provider is configured.")
        const assessment = await (this.options.systemOne ?? new LayaSystemOne()).assess(
            {query: text}, {task: {type: "choice", instructions: "Select the workload for this operation. This is model routing advice only.", criteria: MODEL_WORKLOADS}},
        ).catch(() => null)
        const inferred = assessment?.answers.task?.choice
        const state: ExecutionState = {
            task: inferred && Object.hasOwn(MODEL_WORKLOADS, inferred) ? inferred : "reasoning",
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
        delegation: NonNullable<Awaited<ReturnType<typeof artifactCommand>>>,
        ctx: ToolContext,
    ): Promise<WorkflowExecutionResult> {
        try {
            if (ctx.signal?.aborted) throw new ToolAbortError("Execution aborted by signal.")
            const command = commandRegistry.getCommands().find(command =>
                command.topic + (command.subtopic ? ":" + command.subtopic : "") + " " + command.action === delegation.tool)
            if (!command) {
                const tool = commandRegistry.get(delegation.tool)
                if (!tool) throw new Error(`Tool '${delegation.tool}' not found in commandRegistry.`)
                this.assertExecutionAllowed(tool, ctx)
            }
            const result = await commandRegistry.execute(delegation.tool, delegation.args, ctx)
            const answer = JSON.stringify(result, null, 2)
            const event: ActorStepEvent = {
                step: 1,
                thought: "Explicit artifact delegation",
                toolCall: { name: delegation.tool, params: delegation.args },
                toolResult: result,
                finalAnswer: answer,
            }
            return { stepsCount: 1, answer, events: [event] }
        } catch (error) {
            return this.executeFailure([], this.failureReason(error, ctx.signal), this.errorMessage(error))
        }
    }

    private async executeInstruction(text: string, state: ExecutionState): Promise<WorkflowExecutionResult> {
        const bootstrap = commandRegistry.get("run_command")
        if (!bootstrap) return this.executeFailure([], "error", "Bootstrap run_command is not registered.")
        state.options.onDiscovery?.([...state.selectedNames])
        const config = loadConfig(this.projectRoot)
        const policy = config.escalation?.policy || "auto"
        if (this.hasCloudProvider() && policy !== "local_only" && (policy === "sota" || state.options.intelligence === "critical")) {
            this.recordEscalation(state, state.task, "Critical intelligence / SOTA requested")
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

    private createActor({ ctx }: ExecutionState): LLMActor {
        return new LLMActor(this._asker!, {
            maxSteps: this.maxSteps,
            system: renderActorSystem(this.projectRoot, ctx.scratchRoot, ctx.codeMutationAllowed === true),
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
                    : { task: state.task }),
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
            routingContext: {query: text, requirements: state.options.intelligence === "automatic" ? [] : [`Intelligence preference: ${state.options.intelligence}. ${state.options.intelligence === "normal" ? "Balance quality, cost and latency." : "Prioritize reasoning quality and accuracy."}`]}}}
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

    private recordEscalation(state: ExecutionState, taskClass: string, reason: string): void {
        state.escalated = true
        state.escalationReason = reason
        pubsub.trigger("aiwf", "actor:escalate", {
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
        const tools = found.tools.filter(tool => getPublicMcpTools(commandRegistry).some(publicTool=>publicTool.name===tool.name))
        if (!tools.length)
            throw new Error("No applicable specialized capability discovered. Continue through run_command.")
        for (const tool of tools) state.selectedNames.add(tool.name)
        state.options.onDiscovery?.([...state.selectedNames])
        this.recordDiscovery(state, {
            request,
            query: found.query,
            status: "completed",
            addedTools: tools.map((tool) => tool.name),
            elapsedMs: Date.now() - started,
        })
        return tools.map((tool) => this.wrapTool(tool, state.ctx))
    }

    private recordDiscovery(state: ExecutionState, detail: Omit<CapabilityDiscoveryEvent, "tools">): void {
        const event = { ...detail, tools: [...state.selectedNames] }
        state.discoveryEvents.push(event)
        pubsub.trigger("aiwf", "actor:discovery", event)
    }

    private async recordStep(state: ExecutionState, step: ActorStepRecord): Promise<void> {
        const firstCall = step.toolCalls[0]
        const event: ActorStepEvent = {
            step: step.step,
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
            return this.executeFailure(state.events, result.haltReason, result.error, result.issues)
        const lastStep = result.steps?.[result.steps.length - 1]
        return {
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
            targetModel: state.options.forceModel ?? executedTarget ?? this.resolveRoute(state.task)?.target,
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
    private executeOfflineFallback(reason?: string): WorkflowExecutionResult {
        const detail = reason ? ` (${reason})` : ""
        const answer = `LLM unavailable${detail}. Natural-language execution was not attempted.`
        return {
            stepsCount: 0,
            answer,
            events: [],
            offlineFallback: true,
        }
    }
}
