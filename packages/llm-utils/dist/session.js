import { ContextCompressor } from './context/compression.js';
export class LLMSession {
    asker;
    context;
    toolkit;
    constructor(asker, toolkit = {}, initialContext) {
        this.asker = asker;
        this.toolkit = toolkit;
        this.context = initialContext ?? { history: [] };
    }
    /**
     * Prompts the LLM within the current session context.
     */
    async prompt(templateName, data) {
        // 1. Merge session context into data
        const enrichedData = {
            ...data,
            history: this.context.history,
            managedContext: this.context.managedContext
        };
        // 2. Call asker
        const result = await this.asker.prompt(templateName, this.toolkit, enrichedData);
        // 3. Update session history and condense if successful
        if (result.ok) {
            await this.updateHistory(data.inputText || 'User prompt', result.text);
        }
        return result;
    }
    async updateHistory(prompt, response) {
        this.context.history.push({ role: 'user', content: prompt });
        this.context.history.push({ role: 'ai', content: response });
        // Keep history manageable
        if (this.context.history.length > 20) {
            this.context.history = this.context.history.slice(-20);
        }
        // Continuous Condensation
        await this.condense(prompt, response);
    }
    async condense(lastPrompt, lastResponse) {
        const rawHistory = this.context.history.map((h) => `${h.role}: ${h.content}`).join('\n');
        this.context.managedContext = ContextCompressor.compress(rawHistory);
    }
    getContext() {
        return this.context;
    }
}
