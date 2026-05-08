/**
 * Responsibility: Provide a unified, mode-aware LLM orchestration layer.
 * Scope: Handles completions, routing, and usage tracking for both Shell and Skill.
 */

import { generateCompletion, discoverProviderState, summarizeCompletionUsage } from "./providers.ts";
import { routeTask } from "./router.ts";
import type { ExecutionContext, ExecutionMode } from "./execution-context.ts";

export interface LLMOptions {
  taskClass?: string;
  domain?: string;
  allowWeak?: boolean;
}

export class CoreLLM {
  constructor(private context: ExecutionContext) {}

  async generate(prompt: string, options: LLMOptions = {}) {
    const taskClass = options.taskClass ?? "logic";
    
    // Skill mode adds "Parent Agent" context to its prompts to notify sub-models
    const system = this.context.mode === ExecutionMode.Skill 
      ? "You are working as a sub-task tool for a Parent AI Agent. Be concise and prioritize machine-readable output or direct action."
      : undefined;

    const routed = await routeTask({
      root: this.context.projectRoot,
      taskClass,
      domain: options.domain,
      allowWeak: options.allowWeak
    });

    const recommendation = routed.recommended;
    if (!recommendation) {
      throw new Error(`No suitable LLM found for task class: ${taskClass}`);
    }

    return generateCompletion({
      prompt,
      system,
      providerId: recommendation.providerId,
      modelId: recommendation.modelId,
      apiKey: recommendation.apiKey,
      host: recommendation.host,
      baseUrl: recommendation.baseUrl
    });
  }

  async getProviderStatus() {
    return discoverProviderState({ root: this.context.projectRoot });
  }

  async getUsageSummary() {
     return summarizeCompletionUsage();
  }
}
