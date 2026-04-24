import { ProviderAdapter, GenerateOptions, GenerationResult, ProviderId } from '../types.js';
export declare class OllamaProvider implements ProviderAdapter {
    id: ProviderId;
    generate(options: GenerateOptions): Promise<GenerationResult>;
}
