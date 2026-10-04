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

  const ollamaHost = process.env.OLLAMA_HOST || config.ollamaUrl || 'http://localhost:11434'
  providers.ollama = {
    id: 'ollama',
    host: ollamaHost,
    available: true,
    local: true,
    contextWindow: config.ollamaContextWindow,
    providerOptions: config.providerOptions?.ollama,
  }

  const gateway = config.gateway || 'auto'
  const openrouterApiKey = config.openrouterApiKey || credentials.openrouterApiKey
  if ((gateway === 'auto' || gateway === 'openrouter') && openrouterApiKey) {
    providers.openrouter = {
      id: 'openrouter',
      apiKey: openrouterApiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      available: true,
      providerOptions: config.providerOptions?.openrouter,
    }
  }

  if (gateway === 'auto' || gateway === 'direct') {
    if (credentials.openaiApiKey) providers.openai = {id: 'openai', apiKey: credentials.openaiApiKey, available: true, providerOptions: config.providerOptions?.openai}
    if (credentials.anthropicApiKey) providers.anthropic = {id: 'anthropic', apiKey: credentials.anthropicApiKey, available: true, providerOptions: config.providerOptions?.anthropic}
    if (credentials.geminiApiKey) providers.google = {id: 'google', apiKey: credentials.geminiApiKey, available: true, providerOptions: config.providerOptions?.google}
  }

  return {config, providers}
}

export function createDefaultAsker(projectRoot: string = process.cwd()): Asker | undefined {
  const {config, providers} = modelRuntime(projectRoot)
  try {
    return new Asker({
      providers,
      routes: config.modelRoutes,
      defaultModel: config.model,
    })
  } catch {
    return undefined
  }
}
