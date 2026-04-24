export interface CompressionOptions {
    maxWords?: number;
    preserveEntities?: boolean;
}
export declare class ContextCompressor {
    /**
     * Compresses natural language into a high-density format.
     * Logic ported from lean-ctx.mjs.
     */
    static compress(text: string, options?: CompressionOptions): string;
}
