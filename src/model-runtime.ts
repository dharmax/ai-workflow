import { Asker, type ProviderConfig } from '@dharmax/llm-utils'
import { loadConfig, resolveCloudCredentials, type ProjectConfig } from './config.ts'

export interface ModelRuntime {
  config: ProjectConfig
  providers: Record<string, ProviderConfig>
}

/** One source of truth for AIWF provider/model construction. */
export function modelRuntime(projectRoot: string): ModelRuntime {
  const config = loadConfig(projectRoot)
  const credentials = resolveCloudCredentials()
  const providers: Record<string, ProviderConfig> = {}

  const ollamaHost = config.ollamaUrl
  providers.ollama = {
    id: 'ollama',
    host: ollamaHost,
    available: true,
    local: true,
    contextWindow: config.ollamaContextWindow,
    maxTokens: config.llmOutputTokens,
    providerOptions: config.providerOptions?.ollama,
  }

  const gateway = config.gateway || 'auto'
  const openrouterApiKey = credentials.openrouterApiKey
  if ((gateway === 'auto' || gateway === 'openrouter') && openrouterApiKey) {
    providers.openrouter = {
      id: 'openrouter',
      local: false,
      apiKey: openrouterApiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      available: true,
      maxTokens: config.llmOutputTokens,
      providerOptions: config.providerOptions?.openrouter,
    }
  }

  if (gateway === 'auto' || gateway === 'direct') {
    if (credentials.openaiApiKey) providers.openai = {id: 'openai', local: false, apiKey: credentials.openaiApiKey, available: true, maxTokens: config.llmOutputTokens, providerOptions: config.providerOptions?.openai}
    if (credentials.anthropicApiKey) providers.anthropic = {id: 'anthropic', local: false, apiKey: credentials.anthropicApiKey, available: true, maxTokens: config.llmOutputTokens, providerOptions: config.providerOptions?.anthropic}
    if (credentials.geminiApiKey) providers.google = {id: 'google', local: false, apiKey: credentials.geminiApiKey, available: true, maxTokens: config.llmOutputTokens, providerOptions: config.providerOptions?.google}
  }

  return {config, providers}
}

export function createDefaultAsker(projectRoot: string = process.cwd()): Asker | undefined {
  const {config, providers} = modelRuntime(projectRoot)
  if (!Object.keys(providers).length) return undefined
  try {
    return new Asker({providers, routes: config.modelRoutes, defaultModel: config.model})
  } catch (error) {
    throw new Error('Provider runtime construction failed; check model/provider configuration.', {cause: error})
  }
}
