import { ProviderAdapter, GenerateOptions, GenerationResult, ProviderId } from '../types.js';
export declare class OpenAIAdapter implements ProviderAdapter {
    id: ProviderId;
    generate(options: GenerateOptions): Promise<GenerationResult>;
}
