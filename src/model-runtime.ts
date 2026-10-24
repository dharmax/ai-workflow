/**
 * Responsibility: Construct AIWF's configured providers and model service.
 * Scope: Project configuration, model getters and native llm-utils routing/Asker construction.
 */

import { Asker, ModelRouter, ModelAdviceResearchSchema, parseModelTarget, readModelAdvice, refreshModelAdvice, type ModelAdviceSnapshot, type ModelTarget, type ProviderConfig } from "@dharmax/llm-utils"
import { inspectConfig, loadConfig, resolveCloudCredentials, type ProjectConfig } from "./config.ts"

export interface ModelRuntime {
    config: ProjectConfig
    providers: Record<string, ProviderConfig>
}

/** One source of truth for AIWF provider/model construction. */
export function modelRuntime(projectRoot: string): ModelRuntime {
    const config = loadConfig(projectRoot)
    const credentials = resolveCloudCredentials()
    const providers: Record<string, ProviderConfig> = { ollama: localProvider(config) }
    const gateway = config.gateway || "auto"
    if ((gateway === "auto" || gateway === "openrouter") && credentials.openrouterApiKey) {
        providers.openrouter = gatewayProvider(config, credentials.openrouterApiKey)
    }
    switch (gateway) {
        case "auto":
        case "direct":
            Object.assign(providers, directProviders(config, credentials))
            break
    }
    return { config, providers }
}

function localProvider(config: ProjectConfig): ProviderConfig {
    return {
        id: "ollama",
        host: config.ollamaUrl,
        available: true,
        local: true,
        contextWindow: config.ollamaContextWindow,
        maxTokens: config.llmOutputTokens,
        providerOptions: config.providerOptions?.ollama,
    }
}

function gatewayProvider(config: ProjectConfig, apiKey: string): ProviderConfig {
    return {
        id: "openrouter",
        local: false,
        apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        available: true,
        maxTokens: config.llmOutputTokens,
        providerOptions: config.providerOptions?.openrouter,
    }
}

function directProviders(
    config: ProjectConfig,
    credentials: ReturnType<typeof resolveCloudCredentials>,
): Record<string, ProviderConfig> {
    const keys = {
        openai: credentials.openaiApiKey,
        anthropic: credentials.anthropicApiKey,
        google: credentials.geminiApiKey,
    }
    const providers: Record<string, ProviderConfig> = {}
    for (const [id, apiKey] of Object.entries(keys)) {
        if (apiKey)
            providers[id] = {
                id,
                local: false,
                apiKey,
                available: true,
                maxTokens: config.llmOutputTokens,
                providerOptions: config.providerOptions?.[id],
            }
    }
    return providers
}

export class ModelService {
    public readonly runtime: ModelRuntime
    private readonly router: ModelRouter
    private readonly advice = readModelAdvice()
    private readonly configuredModel: boolean

    constructor(projectRoot: string) {
        this.runtime = modelRuntime(projectRoot)
        this.configuredModel = inspectConfig(projectRoot, "model")[0]?.source !== "default"
        const { config, providers } = this.runtime
        const routes = { ...config.modelRoutes }
        if (this.configuredModel)
            for (const task of Object.keys(MODEL_WORKLOADS)) routes[task] ??= config.model
        if (!routes.local && providers[this.defaultModel.providerId]?.local) routes.local = config.model
        this.router = new ModelRouter({ providers, routes, defaultModel: config.model, adviceSnapshot: this.advice, advicePath: false })
    }

    get defaultModel(): ModelTarget {
        return parseModelTarget(this.runtime.config.model)
    }

    get localModel(): ModelTarget | undefined {
        const { config, providers } = this.runtime
        const target = parseModelTarget(config.modelRoutes?.local ?? config.model)
        const provider = providers[target.providerId]
        return provider?.available && provider.local ? target : undefined
    }

    get cloudModel(): ModelTarget | undefined {
        return this.resolveModel("reasoning", false)
    }

    public resolveModel(task: string, local?: boolean): ModelTarget | undefined {
        const { config, providers } = this.runtime
        if (local === true && !this.localModel) {
            const configured = config.modelRoutes?.[task]
            if (!configured) return undefined
            task = configured
        }
        const eligible = Object.keys(providers).filter(
            (id) => providers[id]?.available && (local === undefined || !!providers[id]?.local === local),
        )
        if (!eligible.length) return undefined
        const target = this.router.resolve(task, eligible, local)
        return eligible.includes(target.providerId) ? target : undefined
    }

    public createAsker(taskAliases: Record<string, string> = {}, preferLocal = false, failedVerificationModels: ReadonlySet<string> = new Set()): Asker {
        const { config, providers } = this.runtime
        const routes = { ...config.modelRoutes }
        const fallbacks: Record<string, string[]> = {}
        const local = this.localModel
        for (const [alias, task] of Object.entries(taskAliases)) {
            const primary = routes[task] ?? routes[alias]
                ?? (this.configuredModel ? config.model : undefined)
            if (!primary) continue
            routes[task] = primary
            fallbacks[task] = [
                ...this.gatewayFallback(primary),
                config.model,
                ...(local ? [`${local.providerId}/${local.modelId}`] : []),
            ]
        }
        if (this.configuredModel)
            for (const task of Object.keys(MODEL_WORKLOADS)) routes[task] ??= config.model
        return new Asker({ providers, preferLocal, router: new ModelRouter({
            providers, routes, fallbacks, preferLocal, defaultModel: this.defaultModel,
            adviceSnapshot: qualifiedVerificationAdvice(this.advice, failedVerificationModels), advicePath: false,
        }) })
    }

    private gatewayFallback(primary: string): string[] {
        const { providers } = this.runtime
        const target = parseModelTarget(primary)
        const equivalent =
            target.providerId === "openrouter" ? target.modelId : `openrouter/${target.providerId}/${target.modelId}`
        const alternate = parseModelTarget(equivalent)
        const origin = target.providerId === "openrouter" ? alternate.providerId : target.providerId
        return providers[origin] && !providers[origin]?.local && providers[alternate.providerId] ? [equivalent] : []
    }
}

function qualifiedVerificationAdvice(advice: ModelAdviceSnapshot | undefined, failed: ReadonlySet<string>): ModelAdviceSnapshot | undefined {
    if (!advice?.workloads.verification || !failed.size) return advice
    const {verification, ...workloads} = advice.workloads
    const choices = [verification.primary, ...verification.fallbacks]
        .filter(choice => !failed.has(`${choice.target.providerId}/${choice.target.modelId}`))
    return {...advice, workloads: choices.length
        ? {...workloads, verification: {...verification, primary: choices[0]!, fallbacks: choices.slice(1)}}
        : workloads}
}

export function createDefaultAsker(projectRoot: string = process.cwd()): Asker | undefined {
    try {
        return new ModelService(projectRoot).createAsker()
    } catch (error) {
        throw new Error("Provider runtime construction failed; check model/provider configuration.", {cause: error})
    }
}

/** Native llm-utils workload keys also used by the Actor's mode aliases. */
const MODEL_WORKLOADS = {
    fast: 'Lightweight source and capability discovery; low latency and tool-use reliability.',
    code: 'Engineering implementation and correction; tool use, accurate source changes and tests.',
    reasoning: 'Architecture and requirements reasoning; complex constraints and long context.',
    creative: 'Product intent clarification and proposal synthesis.',
    summarization: 'Digest evidence analysis and reconciliation; grounded long-context synthesis.',
    verification: 'Independent verification of implementation and evidence; seek diverse failure modes, not author self-approval.',
}

/** Explicit operation only. Local reasoning over fresh provider facts never authorizes paid inference or pulls. */
export async function refreshDefaultModelAdvice(projectRoot: string): Promise<ModelAdviceSnapshot> {
    const models = new ModelService(projectRoot)
    const {providers, config} = models.runtime
    const local = models.localModel
    if (!local) throw new Error('Model advice research requires a configured local model; paid research is not authorized.')
    const asker = new Asker({providers, defaultModel: local, advicePath: false})
    return refreshModelAdvice({
        id: `${local.providerId}/${local.modelId} with live provider catalogue evidence`,
        async research({prompt, environment}) {
            const catalogue = environment.providers.find(p => p.id === 'openrouter')
            if (!catalogue?.models?.length)
                throw new Error('OpenRouter live catalogue unavailable; previous model advice preserved.')
            const installed = environment.providers.find(p => p.id === local.providerId)
            if (!installed?.available || !installed.models?.some(m => m.id === local.modelId))
                throw new Error('Configured local research model is unavailable; no model will be pulled.')
            const result = await asker.ask(prompt + '\nUse only exact provider/model pairs from available providers and their observed model lists for every primary and fallback. A public catalogue on an unavailable provider is market evidence, not routing eligibility. Put uninstalled candidates only in recommendedPulls. Use the observed catalogue as current market evidence. Cite https://openrouter.ai/api/v1/models for OpenRouter facts. Never claim web browsing or measured benchmarks. Treat latency, reliability, reasoning overhead and retry estimates as uncertain unless observed. Independent verification needs independence from the author; routing alone cannot establish it.', {
                model: local, allowedProviders: [local.providerId], maxRetries: 0,
                schema: ModelAdviceResearchSchema, timeoutMs: 60000,
            })
            if (!result.ok || !result.data) throw new Error(result.failure?.message ?? 'Model advice research failed')
            const advice = result.data
            for (const workload of Object.values(advice.workloads)) {
                for (const choice of [workload.primary, ...workload.fallbacks]) {
                    const provider = environment.providers.find(p => p.id === choice.target.providerId)
                    const model = provider?.models?.find(m => m.id === choice.target.modelId)
                    if (!provider?.available || !model || choice.availability !== (provider.local ? 'installed' : 'accessible'))
                        throw new Error(`Research recommended an unavailable or unobserved model: ${choice.target.providerId}/${choice.target.modelId}`)
                    choice.contextWindow = model.contextWindow
                    choice.capabilities = model.supportedParameters
                    choice.economics = {...choice.economics, inputPer1M: model.inputPer1M,
                        outputPer1M: model.outputPer1M, cachedInputPer1M: model.cachedInputPer1M}
                    if (provider.id === 'openrouter') {
                        if (model.inputPer1M === undefined || model.outputPer1M === undefined)
                            throw new Error(`OpenRouter pricing unavailable for ${model.id}`)
                        choice.evidence = [...new Set([...(choice.evidence ?? []), 'https://openrouter.ai/api/v1/models'])]
                    }
                }
            }
            return advice
        },
    }, MODEL_WORKLOADS, {providers: {openrouter: {id: 'openrouter', available: false}, ...providers}, ollamaHost: config.ollamaUrl,
        constraints: ['Preserve explicit developer choices, configured routes, gateway restrictions and local-only policy.',
            'Optimize expected cost per completed task including output tokens, reasoning overhead, latency and retries.',
            'No pulls or paid research. Installed local candidates and observed provider catalogues are evidence; subscription/API entitlement and inference reliability remain unproven.']})
}
