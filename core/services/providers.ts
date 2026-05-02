/**
 * Responsibility: Bridge provider discovery and completion calls.
 * Scope: Preserve ai-workflow's config, routing, quota, and mock-provider contracts while delegating adapter execution where useful.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CompletionEngine, GoogleAdapter, OpenAIAdapter, AnthropicAdapter, OllamaProvider, RouterHeuristics } from "@dharmax/llm-utils";
import { openWorkflowStore } from "../db/sqlite-store.ts";
import { sha1 } from "../lib/hash.ts";
import { getGlobalConfigPath, getProjectConfigPath, isConfigWriteAccessError, readConfig, readConfigSafe, writeConfigValue } from "../../cli/lib/config-store.ts";
import { loadKnowledge } from "./knowledge.ts";
import { leanCtxInstallHint, probeLeanCtx } from "./lean-ctx.ts";

const execFileAsync = promisify(execFile);
const OLLAMA_DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ollamaDiscoveryCache = new Map();
const registeredAdapters = new Map();

for (const adapter of [new GoogleAdapter(), new OpenAIAdapter(), new AnthropicAdapter(), new OllamaProvider()]) {
  CompletionEngine.registerAdapter(adapter);
  registeredAdapters.set(adapter.id, adapter);
}

export function registerProvider(id: string, adapter: any) {
  const providerId = String(id ?? adapter?.id ?? "").trim();
  if (!providerId) {
    throw new Error("provider id is required");
  }
  const normalized = { id: providerId, ...adapter };
  registeredAdapters.set(providerId, normalized);
  CompletionEngine.registerAdapter(normalized);
  return true;
}

export async function discoverProviderState({ root = process.cwd(), forceRefresh = false, cacheTtlMs = OLLAMA_DISCOVERY_CACHE_TTL_MS } = {}) {
  const [projectConfigState, globalConfigState] = await Promise.all([
    readConfigSafe(getProjectConfigPath(root)),
    readConfigSafe(getGlobalConfigPath())
  ]);
  const projectConfig = projectConfigState.config;
  const globalConfig = globalConfigState.config;
  const knowledge = await loadKnowledge({ root, projectConfig, globalConfig });
  const leanCtx = await probeLeanCtx();
  const configWarnings = [projectConfigState.warning, globalConfigState.warning].filter(Boolean);
  if (!leanCtx.installed) {
    configWarnings.push(leanCtxInstallHint());
  }

  const configuredProviders = mergeProviderConfig(globalConfig.providers, projectConfig.providers);
  const ollamaConfig = resolveOllamaConfig({ projectConfig, globalConfig });
  const ollamaHosts = resolveOllamaHosts(ollamaConfig);
  const configuredOllamaModels = normalizeConfiguredModels("ollama", ollamaConfig, []);
  const cacheKey = sha1(JSON.stringify({ root, ollamaConfig, hosts: ollamaHosts, configuredOllamaModels }));
  const cached: any = forceRefresh ? null : ollamaDiscoveryCache.get(cacheKey);
  const ollama = cached && Date.now() - cached.cachedAt < cacheTtlMs
    ? cached.value
    : await discoverOllama({ config: ollamaConfig, hosts: ollamaHosts, reference: knowledge.modelReference, cachedModels: configuredOllamaModels });
  if (!cached || forceRefresh) {
    ollamaDiscoveryCache.set(cacheKey, { cachedAt: Date.now(), value: ollama });
  }

  let metricsSummary = null;
  try {
    const store = await openWorkflowStore({ projectRoot: root });
    metricsSummary = store.getMetricsSummary();
    store.close();
  } catch {
    metricsSummary = null;
  }

  const providerIds = new Set([
    ...Object.keys(knowledge.models ?? {}),
    ...Object.keys(configuredProviders),
    ...registeredAdapters.keys()
  ]);
  providerIds.delete("ollama");

  const providers: any = {};
  for (const providerId of providerIds) {
    const config = configuredProviders[providerId] ?? {};
    const adapter = registeredAdapters.get(providerId);
    const customAdapter = Boolean(adapter?.generate) && !["openai", "google", "anthropic", "ollama"].includes(providerId);
    const apiKey = config.apiKey ?? getEnvKey(providerId);
    const models = normalizeConfiguredModels(providerId, config, adapter?.models ?? knowledge.models?.[providerId] ?? []);
    providers[providerId] = {
      available: config.enabled !== false && (models.length > 0 || customAdapter) && Boolean(apiKey || config.enabled || customAdapter || adapter?.available),
      local: Boolean(adapter?.local) && providerId !== "ollama",
      configured: Boolean(configuredProviders[providerId]),
      apiKey: apiKey ?? null,
      baseUrl: config.baseUrl ?? null,
      quota: normalizeProviderQuota(config.quota),
      paidAllowed: config.paidAllowed !== false,
      models: models.length ? models : normalizeConfiguredModels(providerId, {}, [{ id: "default", quality: "medium", costTier: 3 }])
    };
  }

  providers.ollama = {
    available: ollamaConfig.enabled !== false && ollama.installed && ollama.models.length > 0,
    installed: ollama.installed,
    local: true,
    configured: Boolean(ollamaConfig.host || ollamaConfig.endpoints?.length || configuredOllamaModels.length),
    host: ollama.host,
    endpoints: ollama.hosts?.filter((host: string) => host && host !== ollama.host) ?? [],
    hardwareClass: ollamaConfig.hardwareClass,
    plannerModel: ollamaConfig.plannerModel,
    plannerMaxQuality: ollamaConfig.plannerMaxQuality,
    maxModelSizeB: ollamaConfig.maxModelSizeB,
    models: ollama.models.map((model: any) => {
      const id = typeof model === "string" ? model : model.id;
      const sizeB = typeof model === "object" && model.sizeB != null ? model.sizeB : estimateOllamaModelSizeB(id);
      const profile = profileModel(id, sizeB, knowledge.modelReference);
      return {
        id,
        host: typeof model === "object" && model.host ? normalizeOllamaHost(model.host) : ollama.host,
        quality: profile.quality,
        costTier: 1,
        sizeB,
        capabilities: profile.capabilities,
        strengths: profile.strengths
      };
    }),
    details: ollama.details
  };

  return {
    root,
    knowledge,
    metricsSummary,
    leanCtx,
    configWarnings,
    routingPolicy: {
      capabilityMapping: knowledge.capabilityMapping,
      preferLocalFor: ["data", "summarization", "extraction", "note-normalization", "strategy", "artifact-evaluation"],
      minimumQuality: knowledge.minimumQuality,
      quotaStrategy: "prefer-free-remote",
      contextCompression: leanCtx.installed ? "lean-ctx" : "fallback",
      ...(globalConfig.routing ?? {}),
      ...(projectConfig.routing ?? {})
    },
    providers
  };
}

export async function refreshProviderRegistry({ root = process.cwd(), scope = "project", forceRefresh = true, ignoreWriteErrors = false } = {}) {
  const providerState = await discoverProviderState({ root, forceRefresh });
  const configPath = scope === "global" ? getGlobalConfigPath() : getProjectConfigPath(root);
  const refreshed = [];
  let warning = null;

  const ollama = providerState.providers.ollama;
  if (ollama) {
    refreshed.push({ providerId: "ollama", modelCount: ollama.models.length, host: ollama.host });
    try {
      await writeConfigValue(configPath, "providers.ollama.host", JSON.stringify(ollama.host));
      await writeConfigValue(configPath, "providers.ollama.models", JSON.stringify(ollama.models.map((model: any) => ({ id: model.id, sizeB: model.sizeB }))));
    } catch (error: any) {
      if (!ignoreWriteErrors && !isConfigWriteAccessError(error)) {
        throw error;
      }
      warning = `Could not update ${configPath}: ${error?.message ?? error}`;
    }
  }

  return { scope, configPath, refreshed, providerState, warning };
}

export async function refreshProviderQuotaState({ root = process.cwd(), providerId = "all", scope = "global", now = new Date() } = {}) {
  const configPath = scope === "global" ? getGlobalConfigPath() : getProjectConfigPath(root);
  const config = await readConfig(configPath);
  const providers = config.providers ?? {};
  const providerIds = providerId === "all" ? Object.keys(providers) : [providerId];
  const refreshed = [];

  for (const id of providerIds) {
    const provider = providers[id];
    if (!provider) continue;
    const result = refreshQuotaWindow(provider.quota, now);
    if (result.changed) {
      await writeConfigValue(configPath, `providers.${id}.quota`, JSON.stringify(result.quota));
    }
    refreshed.push({ providerId: id, changed: result.changed, quota: normalizeProviderQuota(result.changed ? result.quota : provider.quota) });
  }

  return { scope, configPath, refreshed };
}

export async function generateCompletion(options: any = {}) {
  const providerId = String(options.providerId ?? "").trim();
  const modelId = String(options.modelId ?? options.model ?? "").trim();
  if (!providerId || !modelId) {
    throw new Error("providerId and modelId are required");
  }

  const result = await CompletionEngine.generate(
    options.prompt,
    { id: modelId, providerId },
    {
      ...(options.config ?? {}),
      apiKey: options.config?.apiKey ?? options.apiKey,
      baseUrl: options.config?.baseUrl ?? options.baseUrl,
      host: options.config?.host ?? options.host
    },
    {
      system: options.system,
      format: options.format ?? options.config?.format,
      signal: options.signal,
      contentParts: options.contentParts,
      generationOptions: options.generationOptions
    }
  );

  return normalizeCompletionResult(result, { providerId, modelId });
}

export async function probeOllama({ host }: { host?: string } = {}) {
  const resolvedHost = normalizeOllamaHost(host ?? (process.env.OLLAMA_HOST || "http://127.0.0.1:11434"));
  try {
    const response = await fetch(`${resolvedHost}/api/tags`);
    if (!response.ok) {
      throw new Error(`ollama tags request failed with ${response.status}`);
    }
    const payload: any = await response.json();
    const models = Array.isArray(payload.models)
      ? payload.models.map((model: any) => ({
        id: model?.name ?? model?.model ?? "",
        sizeB: model?.size ? Number((model.size / (1024 ** 3)).toFixed(1)) : null
      })).filter((model: any) => model.id)
      : [];
    return { installed: true, models, details: JSON.stringify({ host: resolvedHost, modelCount: models.length }), host: resolvedHost };
  } catch (error: any) {
    if (host) {
      return { installed: false, models: [], details: error?.message ?? String(error), host: resolvedHost };
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync("ollama", ["list"], {
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, OLLAMA_HOST: resolvedHost }
    });
    const models = `${stdout}${stderr}`.trim().split(/\r?\n/).slice(1).map((line: string) => {
      const id = line.trim().split(/\s+/)[0];
      return id ? { id, sizeB: estimateOllamaModelSizeB(id) } : null;
    }).filter(Boolean);
    return { installed: true, models, details: `${stdout}${stderr}`.trim(), host: resolvedHost };
  } catch (error: any) {
    return { installed: false, models: [], details: error?.message ?? String(error), host: resolvedHost };
  }
}

export function resolveOllamaConfig({ projectConfig = {}, globalConfig = {} }: any = {}) {
  const globalOllama = globalConfig.providers?.ollama ?? {};
  const projectOllama = projectConfig.providers?.ollama ?? {};
  const merged = { ...globalOllama, ...projectOllama };
  const host = normalizeOllamaHost(projectOllama.host ?? globalOllama.host ?? (process.env.OLLAMA_HOST || "http://127.0.0.1:11434"));
  return {
    ...merged,
    host,
    endpoints: normalizeOllamaEndpointList([
      ...(Array.isArray(globalOllama.endpoints) ? globalOllama.endpoints : []),
      ...(Array.isArray(projectOllama.endpoints) ? projectOllama.endpoints : [])
    ]).filter((endpoint: string) => endpoint && endpoint !== host),
    hardwareClass: normalizeHardwareClass(merged.hardwareClass),
    plannerModel: merged.plannerModel ? String(merged.plannerModel).trim() : null,
    plannerMaxQuality: normalizeQuality(merged.plannerMaxQuality) ?? null,
    maxModelSizeB: normalizeModelSize(merged.maxModelSizeB)
  };
}

export function summarizeCompletionUsage(usages: any[] = []) {
  let promptTokens = 0;
  let completionTokens = 0;
  let available = false;
  for (const usage of usages) {
    if (!usage) continue;
    const p = Number(usage.promptTokens ?? usage.prompt_tokens ?? 0);
    const c = Number(usage.completionTokens ?? usage.completion_tokens ?? 0);
    if (Number.isFinite(p)) promptTokens += p;
    if (Number.isFinite(c)) completionTokens += c;
    available = available || usage.available === true || p > 0 || c > 0;
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    available,
    reason: available ? null : "No provider token usage was reported."
  };
}

async function discoverOllama({ config, hosts, reference, cachedModels }: any) {
  if (config.enabled === false) {
    return { installed: false, models: cachedModels, details: "disabled by config", host: config.host, hosts };
  }
  const results: any[] = [];
  for (const host of hosts) {
    const result = await probeOllama({ host });
    results.push(result);
  }
  const installed = results.filter((result) => result.installed);
  const modelsByIdHost = new Map();
  for (const result of installed) {
    for (const model of result.models) {
      modelsByIdHost.set(`${model.id}@${result.host}`, { ...model, host: result.host });
    }
  }
  if (!modelsByIdHost.size && cachedModels.length) {
    for (const model of cachedModels) {
      const profile = profileModel(model.id, model.sizeB, reference);
      modelsByIdHost.set(`${model.id}@${config.host}`, { ...model, ...profile, host: config.host });
    }
  }
  const primary = installed[0] ?? results[0] ?? { host: config.host, details: "not checked" };
  return {
    installed: installed.length > 0,
    models: [...modelsByIdHost.values()],
    details: JSON.stringify({ hostCount: hosts.length, installedHostCount: installed.length, modelCount: modelsByIdHost.size }),
    host: primary.host ?? config.host,
    hosts
  };
}

function resolveOllamaHosts(config: any) {
  return [config.host, ...(config.endpoints ?? [])].map(normalizeOllamaHost).filter(Boolean).filter((host, index, list) => list.indexOf(host) === index);
}

function normalizeOllamaHost(host: string | null) {
  const value = String(host ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  return `http://${value}`.replace(/\/+$/, "");
}

function normalizeOllamaEndpointList(values: any[]) {
  return values.map(normalizeOllamaHost).filter(Boolean).filter((host, index, list) => list.indexOf(host) === index);
}

function mergeProviderConfig(globalProviders: any = {}, projectProviders: any = {}) {
  const ids = new Set([...Object.keys(globalProviders ?? {}), ...Object.keys(projectProviders ?? {})]);
  const merged: any = {};
  for (const id of ids) {
    merged[id] = { ...(globalProviders?.[id] ?? {}), ...(projectProviders?.[id] ?? {}) };
  }
  return merged;
}

function normalizeConfiguredModels(providerId: string, config: any = {}, fallback = []) {
  const source = Array.isArray(config.models) ? config.models : fallback;
  return source.map((entry: any) => {
    const model = typeof entry === "string" ? { id: entry } : { ...entry };
    const mockProvider = /^mock(?:[-_:]|$)/.test(providerId);
    
    // Utilize @dharmax/llm-utils heuristics for capability inference
    const sizeB = normalizeModelSize(model.sizeB) ?? estimateOllamaModelSizeB(model.id);
    const inferredQuality = (mockProvider || /gpt-4|claude|opus|sonnet|pro/.test(model.id.toLowerCase())) ? "high" : "medium";
    const capabilities = RouterHeuristics.inferCapabilities(model.id, sizeB, model.quality ?? inferredQuality as any);

    return {
      quality: inferredQuality,
      costTier: providerId === "ollama" || mockProvider ? 1 : 3,
      capabilities,
      ...model,
      quality: model.quality ?? (mockProvider ? "high" : inferredQuality),
      capabilities: model.capabilities ?? (mockProvider ? { logic: 5, strategy: 5, prose: 5, creative: 3, visual: 5, data: 5 } : capabilities),
      id: String(model.id ?? "").trim()
    };
  }).filter((model: any) => model.id);
}

function profileModel(id: string, sizeB: number | null = null, reference: any[] = []) {
  const lower = String(id ?? "").toLowerCase();
  const ref = Array.isArray(reference) ? reference.find((item) => lower.includes(String(item.id ?? item.name ?? "").toLowerCase())) : null;
  if (ref) {
    return {
      quality: ref.quality ?? "medium",
      capabilities: ref.capabilities ?? RouterHeuristics.inferCapabilities(id, sizeB, ref.quality ?? "medium"),
      strengths: ref.strengths ?? []
    };
  }
  
  const numericSize = normalizeModelSize(sizeB) ?? estimateOllamaModelSizeB(id);
  const quality = (numericSize >= 20 || /gpt-4|claude|opus|sonnet|pro/.test(lower)) ? "high" : "medium";
  return {
    quality,
    capabilities: RouterHeuristics.inferCapabilities(id, numericSize, quality as any),
    strengths: []
  };
}

function estimateOllamaModelSizeB(id: string | null) {
  const match = String(id ?? "").match(/(\d+(?:\.\d+)?)b/i);
  return match ? Number(match[1]) : null;
}

function normalizeProviderQuota(quota: any = null) {
  if (!quota || typeof quota !== "object") {
    return { freeUsdRemaining: null, monthlyFreeUsd: null, resetAt: null };
  }
  return {
    freeUsdRemaining: normalizeNullableNumber(quota.freeUsdRemaining),
    monthlyFreeUsd: normalizeNullableNumber(quota.monthlyFreeUsd),
    resetAt: quota.resetAt ? String(quota.resetAt) : null
  };
}

function normalizeNullableNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function refreshQuotaWindow(quota: any, now: Date) {
  const normalized = normalizeProviderQuota(quota);
  if (!normalized.resetAt || normalized.monthlyFreeUsd === null) {
    return { changed: false, quota: normalized };
  }
  const resetAt = new Date(`${normalized.resetAt}T00:00:00Z`);
  if (Number.isNaN(resetAt.getTime()) || resetAt > now) {
    return { changed: false, quota: normalized };
  }
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    changed: true,
    quota: {
      ...normalized,
      freeUsdRemaining: normalized.monthlyFreeUsd,
      resetAt: next.toISOString().slice(0, 10)
    }
  };
}

function normalizeHardwareClass(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function normalizeQuality(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : null;
}

function normalizeModelSize(value: any) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getEnvKey(providerId: string) {
  switch (providerId) {
    case "openai":
      return process.env.OPENAI_API_KEY ?? null;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY ?? null;
    case "google":
      return process.env.GOOGLE_API_KEY ?? null;
    case "gemini":
      return process.env.GEMINI_API_KEY ?? null;
    default:
      return null;
  }
}

function normalizeCompletionResult(result: any = {}, { providerId, modelId }: any) {
  const text = result.response ?? result.text ?? "";
  const usage = normalizeUsage(result.usage ?? result.raw?.usage ?? result.raw?.usageMetadata ?? result);
  return {
    ...result,
    ok: result.ok !== false,
    providerId: result.providerId ?? providerId,
    modelId: result.modelId ?? result.model?.modelId ?? modelId,
    model: result.model ?? { providerId, modelId },
    response: text,
    text,
    usage
  };
}

function normalizeUsage(usage: any = {}) {
  const promptTokens = Number(usage.promptTokens ?? usage.prompt_tokens ?? usage.prompt_eval_count ?? usage.input_tokens ?? usage.promptTokenCount ?? 0);
  const completionTokens = Number(usage.completionTokens ?? usage.completion_tokens ?? usage.eval_count ?? usage.output_tokens ?? usage.candidatesTokenCount ?? 0);
  const totalTokens = Number(usage.totalTokens ?? usage.total_tokens ?? usage.totalTokenCount ?? (promptTokens + completionTokens));
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
    available: usage.available === true || promptTokens > 0 || completionTokens > 0 || totalTokens > 0
  };
}
