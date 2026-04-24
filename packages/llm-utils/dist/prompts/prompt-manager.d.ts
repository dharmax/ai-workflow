import { PromptTemplate } from '../types.js';
export interface PromptVariables {
    [key: string]: string | number | boolean | any;
}
/**
 * Abstract interface for template loading.
 */
export interface FileSystemAdapter {
    readTemplate(name: string): Promise<string>;
}
export declare class PromptManager {
    private fs;
    constructor(fs: FileSystemAdapter);
    /**
     * Loads and parses a template.
     */
    load(name: string): Promise<PromptTemplate>;
    /**
     * Parses a raw markdown template, extracting JSON frontmatter and stripping comments.
     * Logic ported from filesystem.mjs.
     */
    parse(raw: string): PromptTemplate;
    /**
     * Renders a template by injecting variables into {{placeholders}}.
     * Logic ported from filesystem.mjs.
     */
    render(content: string, variables?: PromptVariables): string;
}
