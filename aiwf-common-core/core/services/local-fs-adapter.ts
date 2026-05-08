import { loadPromptTemplate } from '../lib/filesystem.ts';

/**
 * Bridges local filesystem prompt storage with llm-utils.
 */
export class LocalFileSystemAdapter {
  async readTemplate(name) {
    const { content } = await loadPromptTemplate(name);
    return content;
  }
}
