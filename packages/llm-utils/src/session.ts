import { Asker } from './asker.js';
import { GenerationResult, SessionContext } from './types.js';
import { ContextCompressor } from './context/compression.js';

export class LLMSession {
  private asker: Asker;
  private context: SessionContext;
  private toolkit: any;

  constructor(asker: Asker, toolkit: any = {}, initialContext?: SessionContext) {
    this.asker = asker;
    this.toolkit = toolkit;
    this.context = initialContext ?? { history: [] };
  }

  /**
   * Prompts the LLM within the current session context.
   */
  async prompt(templateName: string, data: any): Promise<GenerationResult> {
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

  private async updateHistory(prompt: string, response: string) {
    this.context.history.push({ role: 'user', content: prompt });
    this.context.history.push({ role: 'ai', content: response });

    // Keep history manageable
    if (this.context.history.length > 20) {
      this.context.history = this.context.history.slice(-20);
    }

    // Continuous Condensation
    await this.condense(prompt, response);
  }

  private async condense(lastPrompt: string, lastResponse: string) {
    const rawHistory = this.context.history.map((h: any) => `${h.role}: ${h.content}`).join('\n');
    this.context.managedContext = ContextCompressor.compress(rawHistory);
  }

  getContext(): SessionContext {
    return this.context;
  }
}
