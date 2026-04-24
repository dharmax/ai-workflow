import { ProviderConfig, TaskType, GenerationResult, ModelInfo, InteractionTurn } from './types.js';
import { PromptEngine } from './prompts/prompt-engine.js';
import { ContextManager } from './context/context-manager.js';
export declare class Asker {
    private contextManager;
    private promptEngine;
    private providerConfigs;
    private taskTypes;
    private modelFitMatrix;
    constructor(providers: ProviderConfig[], taskTypes: TaskType[], contextManager: ContextManager, promptEngine: PromptEngine);
    getPromptEngine(): PromptEngine;
    /**
     * Refreshes model-to-task mappings using Gold heuristics.
     */
    refreshMapping(availableModels: ModelInfo[]): Promise<void>;
    /**
     * High-level templated prompt execution.
     */
    prompt(templateName: string, toolkit: any, data: any): Promise<GenerationResult>;
    /**
     * Simple turn execution.
     */
    ask(prompt: string, taskTypeId: string, options?: Partial<InteractionTurn>): Promise<GenerationResult>;
}
