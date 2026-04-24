import { ContextStore, ContextBlock } from '@dharmax/llm-utils';
import { withWorkflowStore } from './sync.mjs';

/**
 * High-fidelity SQLite implementation of the ContextStore.
 * This bridges ai-workflow's DB-first logic with the generic llm-utils package.
 */
export class SqliteContextStore implements ContextStore {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async query(text: string, categories: string[]): Promise<ContextBlock[]> {
    return withWorkflowStore(this.projectRoot, async (store) => {
      // Port logic from getRelevantGuidelineBlocks in guidelines.mjs
      const rawBlocks = await store.listGuidelineBlocks({ categories });
      return rawBlocks.map(b => ({
        id: b.id,
        category: b.category,
        tags: b.tags || [],
        title: b.title,
        body: b.body
      }));
    });
  }

  async add(block: ContextBlock): Promise<void> {
    return withWorkflowStore(this.projectRoot, async (store) => {
      await store.upsertGuidelineBlock(block);
    });
  }

  async list(): Promise<ContextBlock[]> {
    return withWorkflowStore(this.projectRoot, async (store) => {
      const rawBlocks = await store.listGuidelineBlocks();
      return rawBlocks.map(b => ({
        id: b.id,
        category: b.category,
        tags: b.tags || [],
        title: b.title,
        body: b.body
      }));
    });
  }
}
