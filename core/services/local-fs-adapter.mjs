import { FileSystemAdapter } from '@dharmax/llm-utils';
import { loadPromptTemplate } from '../lib/filesystem.mjs';

/**
 * Bridges local filesystem prompt storage with llm-utils.
 */
export class LocalFileSystemAdapter implements FileSystemAdapter {
  async readTemplate(name: string): Promise<string> {
    const { content } = await loadPromptTemplate(name);
    // Since llm-utils' PromptManager handles its own manifest parsing, 
    // we should ideally provide the raw content.
    // However, loadPromptTemplate already parses it.
    // For now, we return content, but a truly "Gold" extraction would 
    // allow reading the raw .md file.
    return content;
  }
}
