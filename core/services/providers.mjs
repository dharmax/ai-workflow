/**
 * Responsibility: Provide a bridge to the @dharmax/llm-utils provider logic.
 * Scope: Discovery, Completion, and Metrics.
 */

import { CompletionEngine, ProviderDiscovery } from '@dharmax/llm-utils';
import { openWorkflowStore } from "../db/sqlite-store.mjs";
import { getGlobalConfigPath, getProjectConfigPath, readConfigSafe } from "../../cli/lib/config-store.mjs";
import { loadKnowledge } from "./knowledge.mjs";

export async function discoverProviderState({ root = process.cwd() } = {}) {
  const [projectConfigState, globalConfigState] = await Promise.all([
    readConfigSafe(getProjectConfigPath(root)),
    readConfigSafe(getGlobalConfigPath())
  ]);
  const knowledge = await loadKnowledge({ root, projectConfig: projectConfigState.config, globalConfig: globalConfigState.config });
  
  // item: Move to llm-utils ProviderDiscovery
  return ProviderDiscovery.discover({ projectConfig: projectConfigState.config, globalConfig: globalConfigState.config }, knowledge);
}

export async function generateCompletion(options) {
  // item: Move to llm-utils CompletionEngine
  return CompletionEngine.generate(options.prompt, { id: options.modelId, providerId: options.providerId }, options.config, options);
}

export async function generateWithOllama(options) {
  // item: Backward compatibility for shell logic
  return generateCompletion({ ...options, providerId: 'ollama', modelId: options.model });
}

export async function probeOllama(args) {
  return ProviderDiscovery.probeOllama(args?.host);
}

export async function refreshProviderQuotaState(args) {
  return ProviderDiscovery.refreshQuotaState(args);
}

export function resolveOllamaConfig(args) {
  // item: Logic ported to ProviderDiscovery inside package
  return {}; 
}

export function refreshProviderRegistry() {
  // item: Providers are now managed dynamically by llm-utils Asker
  return true;
}

export function summarizeCompletionUsage(usages = []) {
  // item: Logic moved to llm-utils ContextCompressor/Metrics
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}
