import type { CompletenessLevel } from './artifact-policy.ts';
/**
 * Responsibility: Project and Global Configuration Management.
 * Scope: Reads and updates .ai-workflow/config.json with global user fallbacks.
 */

import path from 'node:path';
import fs from 'node:fs';

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

export function resolveCloudCredentials(): CloudCredentials {
  const globalPath = path.join(os.homedir(), '.ai-workflow', 'config.json');
  let globalKeys: Record<string, any> = {};
  if (fs.existsSync(globalPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
      globalKeys = raw.keys || raw.credentials || raw.providers || {};
    } catch {}
  }

  return {
    openrouterApiKey: process.env.OPENROUTER_API_KEY || globalKeys.openrouterApiKey || globalKeys.openrouter?.apiKey,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || globalKeys.anthropicApiKey || globalKeys.anthropic?.apiKey,
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || globalKeys.geminiApiKey || globalKeys.google?.apiKey,
    openaiApiKey: process.env.OPENAI_API_KEY || globalKeys.openaiApiKey || globalKeys.openai?.apiKey
  };
}

export function getGlobalConfig(): Partial<ProjectConfig> {
  const globalPath = path.join(os.homedir(), '.ai-workflow', 'config.json');
  if (fs.existsSync(globalPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalPath, 'utf8'));
      const ollamaHost = raw.providers?.ollama?.host || raw.ollamaUrl;
      const model = raw.providers?.ollama?.plannerModel || raw.model;
      return {
        ...(ollamaHost ? { ollamaUrl: ollamaHost } : {}),
        ...(model ? { model } : {}),
        ...(Number.isInteger(raw.llmOutputTokens) && raw.llmOutputTokens > 0 ? { llmOutputTokens: raw.llmOutputTokens } : {}),
        ...(Number.isInteger(raw.ollamaContextWindow) && raw.ollamaContextWindow > 0 ? { ollamaContextWindow: raw.ollamaContextWindow } : {}),
        ...(raw.modelRoutes && typeof raw.modelRoutes === 'object' ? { modelRoutes: raw.modelRoutes } : {}),
        ...(raw.providerOptions && typeof raw.providerOptions === 'object' ? { providerOptions: raw.providerOptions } : {})
      };
    } catch {
      return {};
    }
  }
  return {};
}

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.ai-workflow', 'config.json');
}

export function loadConfig(projectRoot: string): ProjectConfig {
  const globalCfg = getGlobalConfig();
  const baseConfig: ProjectConfig = {
    ...DEFAULT_CONFIG,
    ollamaUrl: process.env.OLLAMA_HOST || process.env.OLLAMA_URL || globalCfg.ollamaUrl || DEFAULT_CONFIG.ollamaUrl,
    ...globalCfg
  };
  const cfgPath = getConfigPath(projectRoot);
  if (fs.existsSync(cfgPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return {
        ...baseConfig,
        ...raw,
        modelRadar: { ...baseConfig.modelRadar, ...(raw.modelRadar || {}) },
        escalation: { ...baseConfig.escalation, ...(raw.escalation || {}) },
        modelRoutes: { ...baseConfig.modelRoutes, ...(raw.modelRoutes || {}) },
        providerOptions: { ...baseConfig.providerOptions, ...(raw.providerOptions || {}) }
      };
    } catch {
      return baseConfig;
    }
  }
  return baseConfig;
}

export function saveConfig(projectRoot: string, config: Partial<ProjectConfig>): ProjectConfig {
  const cfgPath = getConfigPath(projectRoot);
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  const existing = loadConfig(projectRoot);
  const updated: ProjectConfig = { ...existing, ...config };
  fs.writeFileSync(cfgPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
