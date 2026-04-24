import { ContextCompressor } from '../context/compressor.js';
export class LLMSession {
    asker;
    toolkit;
    context;
    constructor(asker, toolkit = {}, initialContext) {
        this.asker = asker;
        this.toolkit = toolkit;
        this.context = initialContext ?? { history: [] };
    }
    /**
     * High-fidelity interaction with Grounding Loop.
     */
    async prompt(templateName, data) {
        const promptEngine = this.asker.getPromptEngine();
        const { manifest } = await promptEngine.load(templateName);
        // 1. Pre-flight Grounding
        if (manifest.preflight) {
            for (const step of manifest.preflight) {
                await this.runPreflightStep(step, data);
            }
        }
        // 2. Continuous Condensation
        this.context.managedContext = ContextCompressor.densify(this.context.history);
        // 3. Main Turn
        const enrichedData = {
            ...data,
            ...this.toolkit,
            history: this.context.history,
            managedContext: this.context.managedContext
        };
        const result = await this.asker.prompt(templateName, this.toolkit, enrichedData);
        // 4. Update History
        if (result.ok) {
            this.context.history.push({ role: 'user', content: data.inputText || 'Prompt' });
            this.context.history.push({ role: 'ai', content: result.text });
            if (this.context.history.length > 20) {
                this.context.history = this.context.history.slice(-20);
            }
        }
        return result;
    }
    async runPreflightStep(step, data) {
        console.log(`[session] Running preflight grounding: ${step.type}`);
    }
    getContext() {
        return this.context;
    }
}
