import { InteractionProvider, InteractionTurn, GenerationResult, ProviderConfig, ProviderId } from '../types.js';
export declare class OpenAIProvider implements InteractionProvider {
    id: ProviderId;
    generate(turn: InteractionTurn, config: ProviderConfig): Promise<GenerationResult>;
}
