/**
 * Responsibility: Construct AIWF's configured providers and model service.
 * Scope: Project configuration, model getters and native llm-utils routing/Asker construction.
 */

import { Asker, ModelRouter, parseModelTarget, type ModelTarget, type ProviderConfig } from "@dharmax/llm-utils"
import { loadConfig, resolveCloudCredentials, type ProjectConfig } from "./config.ts"

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

    constructor(projectRoot: string) {
        this.runtime = modelRuntime(projectRoot)
        const { config, providers } = this.runtime
        const routes = { ...config.modelRoutes }
        if (!routes.local && providers[this.defaultModel.providerId]?.local) routes.local = config.model
        this.router = new ModelRouter({ providers, routes, defaultModel: config.model })
    }

    get defaultModel(): ModelTarget {
        return parseModelTarget(this.runtime.config.model)
    }

    get localModel(): ModelTarget | undefined {
        return this.resolveModel("local", true)
    }

    get cloudModel(): ModelTarget | undefined {
        return this.resolveModel("reasoning", false)
    }

    public resolveModel(task: string, local?: boolean): ModelTarget | undefined {
        const { providers } = this.runtime
        const eligible = Object.keys(providers).filter(
            (id) => providers[id]?.available && (local === undefined || !!providers[id]?.local === local),
        )
        if (!eligible.length) return undefined
        const target = this.router.resolve(task, eligible, local)
        return eligible.includes(target.providerId) ? target : undefined
    }

    public createAsker(taskAliases: Record<string, string> = {}, preferLocal = false): Asker {
        const { config, providers } = this.runtime
        const routes = { ...config.modelRoutes }
        const fallbacks: Record<string, string[]> = {}
        const local = this.localModel
        for (const [alias, task] of Object.entries(taskAliases)) {
            const primary = routes[task] ?? routes[alias] ?? config.model
            routes[task] = primary
            fallbacks[task] = [
                ...this.gatewayFallback(primary),
                config.model,
                ...(local ? [`${local.providerId}/${local.modelId}`] : []),
            ]
        }
        return new Asker({ providers, routes, fallbacks, preferLocal, defaultModel: this.defaultModel })
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

export function createDefaultAsker(projectRoot: string = process.cwd()): Asker | undefined {
    try {
        return new ModelService(projectRoot).createAsker()
    } catch (error) {
        throw new Error("Provider runtime construction failed; check model/provider configuration.", {cause: error})
    }
}
