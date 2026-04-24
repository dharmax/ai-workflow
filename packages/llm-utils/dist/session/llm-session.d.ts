import { Asker } from '../asker.js';
import { GenerationResult, SessionContext } from '../types.js';
export declare class LLMSession {
    private asker;
    private toolkit;
    private context;
    constructor(asker: Asker, toolkit?: any, initialContext?: SessionContext);
    /**
     * High-fidelity interaction with Grounding Loop.
     */
    prompt(templateName: string, data: any): Promise<GenerationResult>;
    private runPreflightStep;
    getContext(): SessionContext;
}
