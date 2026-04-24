/**
 * High-density context compression logic ported from lean-ctx.mjs
 */
export declare class ContextCompressor {
    static compress(text: string, maxWords?: number): string;
    /**
     * More sophisticated compression that preserves entity relationships.
     * This is where the 'Superb Architect' logic resides.
     */
    static densify(history: any[]): string;
}
