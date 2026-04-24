import { CompletionEngine } from './router/completion-engine.js';
import { ModelRouter } from './router/model-router.js';
export class Asker {
    contextManager;
    promptEngine;
    providerConfigs;
    taskTypes;
    modelFitMatrix = new Map();
    constructor(providers, taskTypes, contextManager, promptEngine) {
        this.contextManager = contextManager;
        this.promptEngine = promptEngine;
        this.providerConfigs = new Map(providers.map(p => [p.id, p]));
        this.taskTypes = new Map(taskTypes.map(t => [t.id, t]));
    }
    getPromptEngine() {
        return this.promptEngine;
    }
    /**
     * Refreshes model-to-task mappings using Gold heuristics.
     */
    async refreshMapping(availableModels) {
        const availableProviders = new Set(Array.from(this.providerConfigs.values())
            .filter(p => p.enabled !== false && (p.id === 'ollama' || !!p.apiKey))
            .map(p => p.id));
        for (const task of this.taskTypes.values()) {
            const candidates = ModelRouter.scoreModels(Array.from(this.providerConfigs.values()), task, availableModels.filter(m => availableProviders.has(m.providerId)));
            this.modelFitMatrix.set(task.id, candidates);
        }
    }
    /**
     * High-level templated prompt execution.
     */
    async prompt(templateName, toolkit, data) {
        const { content, manifest } = await this.promptEngine.load(templateName);
        // Resolve context grounding from manifest
        const variables = { ...data, ...toolkit };
        if (manifest.inject) {
            for (const item of manifest.inject) {
                if (item.type === 'context_blocks') {
                    const blocks = await this.contextManager.getRelevantBlocks(data.inputText || '', item.categories);
                    variables[item.key] = blocks.map(b => `### ${b.title}\n${b.body}`).join('\n\n');
                }
            }
        }
        const finalPrompt = this.promptEngine.render(content, variables);
        const taskType = data.taskType || manifest.taskType || 'default';
        return this.ask(finalPrompt, taskType, { system: manifest.system });
    }
    /**
     * Simple turn execution.
     */
    async ask(prompt, taskTypeId, options = {}) {
        const candidates = this.modelFitMatrix.get(taskTypeId) || [];
        const model = ModelRouter.route(candidates);
        if (!model) {
            throw new Error(`No model routed for task: ${taskTypeId}`);
        }
        const config = this.providerConfigs.get(model.providerId);
        if (!config)
            throw new Error(`Config missing for provider: ${model.providerId}`);
        const turn = {
            ...options,
            prompt,
            modelId: model.id,
            providerId: model.providerId
        };
        return CompletionEngine.generate(prompt, model, config, {
            system: options.system,
            format: options.format,
            signal: options.signal
        });
    }
}
