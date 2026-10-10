import type { CompletenessLevel } from './artifact-policy.ts';
/**
 * Responsibility: Project and Global Configuration Management.
 * Scope: Reads and updates .ai-workflow/config.json with global user fallbacks.
 */

import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';

export type GatewayType = 'auto' | 'openrouter' | 'direct' | 'ollama';
export type EscalationPolicy = 'auto' | 'local_only' | 'prompt' | 'sota';

export interface ModelRadarConfig {
  enabled: boolean;
  probeIntervalDays: number;
  lastProbedAt?: string;
  maxCostPer1MInput?: number;
  maxCostPer1MOutput?: number;
}

export interface EscalationConfig {
  policy: EscalationPolicy;
  blastRadiusThreshold: number;
  testRetryThreshold: number;
}

export interface CloudCredentials {
  openrouterApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
}

export interface ProjectConfig {
  defaultCompleteness: CompletenessLevel;
  maxArtifacts: number;
  defaultAgentId: string;
  defaultLeaseMinutes: number;
  ollamaUrl: string;
  ollamaContextWindow: number;
  llmOutputTokens: number;
  model: string;
  autoSync: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  gateway: GatewayType;
  modelRadar: ModelRadarConfig;
  escalation: EscalationConfig;
  modelRoutes?: Record<string, string>;
  providerOptions?: Record<string, Record<string, unknown>>;
  openrouterApiKey?: string;
}

export const DEFAULT_CONFIG: ProjectConfig = {
  defaultCompleteness: 'functional',
  maxArtifacts: 24,
  defaultAgentId: 'human-operator',
  defaultLeaseMinutes: 30,
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaContextWindow: 32768,
  llmOutputTokens: 4096,
  model: process.env.AIWF_MODEL || 'qwen2.5-coder:7b',
  autoSync: true,
  logLevel: 'info',
  gateway: 'auto',
  modelRadar: {
    enabled: true,
    probeIntervalDays: 3,
    maxCostPer1MInput: 5.0,
    maxCostPer1MOutput: 15.0
  },
  escalation: {
    policy: 'auto',
    blastRadiusThreshold: 3,
    testRetryThreshold: 2
  },
  modelRoutes: {},
  providerOptions: {}
};

import os from 'node:os';

export type ConfigScope = 'project' | 'global';
const positiveInt = z.number().int().positive();
export const CONFIG_SETTINGS = {
  defaultCompleteness: { schema: z.enum(['poc', 'functional', 'advanced', 'production']), description: 'Default artifact completeness', type: 'string' },
  maxArtifacts: { schema: positiveInt, description: 'Maximum artifacts per operation', type: 'number' },
  defaultAgentId: { schema: z.string().min(1), description: 'Default leasing agent', type: 'string' },
  defaultLeaseMinutes: { schema: positiveInt, description: 'Ticket lease duration in minutes', type: 'number' },
  ollamaUrl: { schema: z.url(), description: 'Ollama server URL', type: 'string' },
  ollamaContextWindow: { schema: positiveInt, description: 'Ollama context window', type: 'number' },
  llmOutputTokens: { schema: positiveInt, description: 'Maximum model output tokens', type: 'number' },
  model: { schema: z.string().min(1), description: 'Default model', type: 'string' },
  autoSync: { schema: z.boolean(), description: 'Synchronize projections automatically', type: 'boolean' },
  logLevel: { schema: z.enum(['debug', 'info', 'warn', 'error']), description: 'Log verbosity', type: 'string' },
  gateway: { schema: z.enum(['auto', 'openrouter', 'direct', 'ollama']), description: 'Provider gateway', type: 'string' },
  modelRadar: { schema: z.object({ enabled: z.boolean().optional(), probeIntervalDays: positiveInt.optional(), lastProbedAt: z.string().optional(), maxCostPer1MInput: z.number().nonnegative().optional(), maxCostPer1MOutput: z.number().nonnegative().optional() }).strict(), description: 'Model radar options', type: 'object' },
  escalation: { schema: z.object({ policy: z.enum(['auto', 'local_only', 'prompt', 'sota']).optional(), blastRadiusThreshold: positiveInt.optional(), testRetryThreshold: z.number().int().nonnegative().optional() }).strict(), description: 'Escalation options', type: 'object' },
  modelRoutes: { schema: z.record(z.string(), z.string().min(1)), description: 'Task model routes', type: 'object' },
  providerOptions: { schema: z.record(z.string(), z.record(z.string(), z.unknown())), description: 'Provider request options', type: 'object' },
} as const;
export type SettingId = keyof typeof CONFIG_SETTINGS;
export const CONFIG_SCOPES: readonly ConfigScope[] = ['project', 'global'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const sensitiveKey = /^(.*api[-_]?key|access[-_]?token|token|password|secret|credentials?|authorization|keys)$/i;
export function redactConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactConfig);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[redacted]' : redactConfig(item)]));
}
function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecret);
  return isRecord(value) && Object.entries(value).some(([key, item]) => sensitiveKey.test(key) || containsSecret(item));
}
export function getGlobalConfigPath(): string {
  return getConfigPath(process.env.HOME || os.homedir());
}
/** Raw layers preserve unrelated fields; malformed files never become empty layers. */
export function readConfigOverrides(projectRoot: string, scope: ConfigScope = 'project'): Record<string, unknown> {
  const filePath = scope === 'global' ? getGlobalConfigPath() : getConfigPath(projectRoot);
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isRecord(raw)) throw new Error('expected a JSON object');
    return raw;
  } catch {
    throw new Error(`Cannot read configuration at ${filePath}; repair the file as a JSON object before continuing.`);
  }
}
function settingsFromRaw(raw: Record<string, unknown>, filePath: string): Partial<ProjectConfig> {
  const settings: Record<string, unknown> = {};
  for (const [key, metadata] of Object.entries(CONFIG_SETTINGS)) {
    if (raw[key] === undefined) continue;
    const parsed = metadata.schema.safeParse(raw[key]);
    if (!parsed.success) throw new Error(`Invalid setting ${key} in ${filePath}; expected ${metadata.type}.`);
    settings[key] = parsed.data;
  }
  return settings as Partial<ProjectConfig>;
}
export function parseConfigSetting(key: string, text: string): { key: SettingId; value: unknown } {
  if (!Object.hasOwn(CONFIG_SETTINGS, key)) throw new Error(`Unknown or sensitive setting: ${key}. Use config get to list settings.`);
  const metadata = CONFIG_SETTINGS[key as SettingId];
  let value: unknown = text;
  if (metadata.type !== 'string') {
    try { value = JSON.parse(text); } catch { throw new Error(`Invalid ${key}; expected ${metadata.type}.`); }
  }
  const parsed = metadata.schema.safeParse(value);
  if (!parsed.success || containsSecret(parsed.data)) throw new Error(`Invalid ${key}; expected ${metadata.type} without credentials. Use environment/global credential sources for secrets.`);
  return { key: key as SettingId, value: parsed.data };
}
function writeOverrides(filePath: string, raw: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(raw, null, 2) + '\n', {mode: 0o600});
    fs.renameSync(temporary, filePath);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
/** Mutate only the selected raw layer, never serialize resolved defaults. */
export function setConfigOverride(projectRoot: string, key: string, text: string, scope: ConfigScope = 'project'): ProjectConfig {
  const parsed = parseConfigSetting(key, text);
  loadConfig(projectRoot);
  const raw = readConfigOverrides(projectRoot, scope);
  settingsFromRaw(raw, scope === 'global' ? getGlobalConfigPath() : getConfigPath(projectRoot));
  raw[parsed.key] = parsed.value;
  // Explicit top-level settings supersede the legacy Ollama aliases.
  if (scope === 'global' && (key === 'model' || key === 'ollamaUrl') && isRecord(raw.providers) && isRecord(raw.providers.ollama)) {
    delete raw.providers.ollama[key === 'model' ? 'plannerModel' : 'host'];
  }
  writeOverrides(scope === 'global' ? getGlobalConfigPath() : getConfigPath(projectRoot), raw);
  return loadConfig(projectRoot);
}
export function resetConfigOverride(projectRoot: string, key: string, scope: ConfigScope = 'project'): ProjectConfig {
  if (!Object.hasOwn(CONFIG_SETTINGS, key)) throw new Error(`Unknown or sensitive setting: ${key}`);
  loadConfig(projectRoot);
  const raw = readConfigOverrides(projectRoot, scope);
  settingsFromRaw(raw, scope === 'global' ? getGlobalConfigPath() : getConfigPath(projectRoot));
  delete raw[key];
  if (scope === 'global' && (key === 'model' || key === 'ollamaUrl') && isRecord(raw.providers) && isRecord(raw.providers.ollama)) {
    delete raw.providers.ollama[key === 'model' ? 'plannerModel' : 'host'];
  }
  writeOverrides(scope === 'global' ? getGlobalConfigPath() : getConfigPath(projectRoot), raw);
  return loadConfig(projectRoot);
}
export function inspectConfig(projectRoot: string, key?: string): Array<{key: SettingId; value: unknown; source: string}> {
  if (key && !Object.hasOwn(CONFIG_SETTINGS, key)) throw new Error(`Unknown or sensitive setting: ${key}`);
  const config = loadConfig(projectRoot);
  const project = readConfigOverrides(projectRoot);
  const global = getGlobalConfig();
  return (key ? [key as SettingId] : Object.keys(CONFIG_SETTINGS) as SettingId[]).map(id => ({
    key: id, value: redactConfig(config[id]),
    source: Object.hasOwn(project, id) ? 'project' : Object.hasOwn(global, id) ? 'global' :
      ((id === 'model' && process.env.AIWF_MODEL) || (id === 'ollamaUrl' && (process.env.OLLAMA_HOST || process.env.OLLAMA_URL))) ? 'environment' : 'default',
  }));
}


export function resolveCloudCredentials(): CloudCredentials {
  const raw = readConfigOverrides(process.env.HOME || os.homedir(), 'global');
  const source = raw.keys || raw.credentials || raw.providers || {};
  if (!isRecord(source)) throw new Error(`Invalid credentials in ${getGlobalConfigPath()}; expected an object.`);
  const credential = (field: string, provider: string): string | undefined => {
    const nested = source[provider];
    const value = source[field] ?? (isRecord(nested) ? nested.apiKey : undefined) ?? raw[field];
    if (value !== undefined && typeof value !== 'string') throw new Error(`Invalid ${field} in ${getGlobalConfigPath()}; expected a string.`);
    return value as string | undefined;
  };
  return {
    openrouterApiKey: process.env.OPENROUTER_API_KEY || credential('openrouterApiKey', 'openrouter'),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || credential('anthropicApiKey', 'anthropic'),
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || credential('geminiApiKey', 'google'),
    openaiApiKey: process.env.OPENAI_API_KEY || credential('openaiApiKey', 'openai'),
  };
}

export function getGlobalConfig(): Partial<ProjectConfig> {
  const raw = readConfigOverrides(process.env.HOME || os.homedir(), 'global');
  const providers = isRecord(raw.providers) ? raw.providers : {};
  const ollama = isRecord(providers.ollama) ? providers.ollama : {};
  return settingsFromRaw({ ...raw,
    ...(ollama.host !== undefined ? {ollamaUrl: ollama.host} : {}),
    ...(ollama.plannerModel !== undefined ? {model: ollama.plannerModel} : {}),
  }, getGlobalConfigPath());
}

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.ai-workflow', 'config.json');
}

export function loadConfig(projectRoot: string): ProjectConfig {
  const global = getGlobalConfig();
  const project = settingsFromRaw(readConfigOverrides(projectRoot), getConfigPath(projectRoot));
  const base = { ...DEFAULT_CONFIG,
    model: process.env.AIWF_MODEL || DEFAULT_CONFIG.model,
    ollamaUrl: process.env.OLLAMA_HOST || process.env.OLLAMA_URL || DEFAULT_CONFIG.ollamaUrl,
  };
  return {
    ...base, ...global, ...project,
    modelRadar: {...base.modelRadar, ...global.modelRadar, ...project.modelRadar},
    escalation: {...base.escalation, ...global.escalation, ...project.escalation},
    modelRoutes: {...base.modelRoutes, ...global.modelRoutes, ...project.modelRoutes},
    providerOptions: {...base.providerOptions, ...global.providerOptions, ...project.providerOptions},
  };
}

export function saveConfig(projectRoot: string, config: Partial<ProjectConfig>): ProjectConfig {
  if (containsSecret(config)) throw new Error('Project configuration cannot contain credentials; use environment/global credential sources.');
  loadConfig(projectRoot);
  const raw = readConfigOverrides(projectRoot);
  settingsFromRaw(raw, getConfigPath(projectRoot));
  for (const [key, value] of Object.entries(config)) {
    if (!Object.hasOwn(CONFIG_SETTINGS, key)) throw new Error(`Unknown or sensitive setting: ${key}`);
    const parsed = CONFIG_SETTINGS[key as SettingId].schema.safeParse(value);
    if (!parsed.success) throw new Error(`Invalid setting ${key}; see config get for supported settings.`);
    raw[key] = parsed.data;
  }
  writeOverrides(getConfigPath(projectRoot), raw);
  return loadConfig(projectRoot);
}
