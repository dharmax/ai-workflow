import { Asker } from './asker.js';
import { GenerationResult, SessionContext } from './types.js';
export declare class LLMSession {
    private asker;
    private context;
    private toolkit;
    constructor(asker: Asker, toolkit?: any, initialContext?: SessionContext);
    /**
     * Prompts the LLM within the current session context.
     */
    prompt(templateName: string, data: any): Promise<GenerationResult>;
    private updateHistory;
    private condense;
    getContext(): SessionContext;
}
