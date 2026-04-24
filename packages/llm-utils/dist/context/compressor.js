/**
 * High-density context compression logic ported from lean-ctx.mjs
 */
export class ContextCompressor {
    static compress(text, maxWords = 300) {
        if (!text)
            return '';
        // 1. Remove semantic noise and boilerplate
        let result = text
            .replace(/as an AI language model/gi, '')
            .replace(/I am an AI assistant/gi, '')
            .replace(/In this context/gi, '')
            .replace(/\n\s*\n/g, '\n'); // Normalize whitespace
        // 2. High-density truncation (Naive but effective for v1)
        const words = result.split(/\s+/);
        if (words.length <= maxWords)
            return result.trim();
        return words.slice(0, maxWords).join(' ') + '\n... [compressed for density]';
    }
    /**
     * More sophisticated compression that preserves entity relationships.
     * This is where the 'Superb Architect' logic resides.
     */
    static densify(history) {
        // Port logic from lean-ctx.mjs: summarizeHistory
        return history.map(h => `[${h.role.toUpperCase()}] ${this.compress(h.content, 50)}`).join('\n');
    }
}
