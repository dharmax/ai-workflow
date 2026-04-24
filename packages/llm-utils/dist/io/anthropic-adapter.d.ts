import { ProviderAdapter, GenerateOptions, GenerationResult, ProviderId } from '../types.js';
export declare class AnthropicAdapter implements ProviderAdapter {
    id: ProviderId;
    generate(options: GenerateOptions): Promise<GenerationResult>;
}
