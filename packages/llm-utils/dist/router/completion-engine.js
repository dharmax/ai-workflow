import { OllamaProvider } from '../io/ollama-adapter.js';
import { OpenAIAdapter } from '../io/openai-adapter.js';
import { GoogleAdapter } from '../io/google-adapter.js';
import { AnthropicAdapter } from '../io/anthropic-adapter.js';
export class CompletionEngine {
    static adapters = new Map([
        ['ollama', new OllamaProvider()],
        ['openai', new OpenAIAdapter()],
        ['google', new GoogleAdapter()],
        ['anthropic', new AnthropicAdapter()]
    ]);
    /**
     * Registers a custom provider adapter.
     */
    static registerAdapter(adapter) {
        this.adapters.set(adapter.id, adapter);
    }
    /**
     * Executes a completion request against a specific provider.
     */
    static async generate(prompt, model, config, options = {}) {
        const adapter = this.adapters.get(model.providerId);
        if (!adapter) {
            return {
                text: '',
                ok: false,
                error: `Unsupported provider for completion: ${model.providerId}`,
                model: { providerId: model.providerId, modelId: model.id }
            };
        }
        const generateOptions = {
            modelId: model.id,
            prompt,
            system: options.system,
            config,
            format: options.format,
            signal: options.signal
        };
        try {
            return await adapter.generate(generateOptions);
        }
        catch (error) {
            console.error(`[completion-engine] Fatal adapter error for ${model.providerId}:`, error.message);
            return {
                text: '',
                ok: false,
                error: `Fatal adapter error: ${error.message}`,
                model: { providerId: model.providerId, modelId: model.id }
            };
        }
    }
}
