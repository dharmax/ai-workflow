import { withWorkflowStore } from './sync.mjs';

/**
 * Superb bridge for SQLite storage.
 * Standard JS implementation for ai-workflow ESM.
 */
export class SqliteStorageBackend {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  async query(text, categories) {
    return withWorkflowStore(this.projectRoot, async (store) => {
      const raw = await store.listGuidelineBlocks({ categories });
      return raw.map(b => ({
        id: b.id,
        category: b.category,
        tags: b.tags || [],
        title: b.title,
        body: b.body
      }));
    });
  }

  async store(block) {
    return withWorkflowStore(this.projectRoot, async (store) => {
      await store.upsertGuidelineBlock(block);
    });
  }

  async list() {
    return withWorkflowStore(this.projectRoot, async (store) => {
      const raw = await store.listGuidelineBlocks();
      return raw.map(b => ({
        id: b.id,
        category: b.category,
        tags: b.tags || [],
        title: b.title,
        body: b.body
      }));
    });
  }

  async delete(id) {
    // Logic for block deletion
  }
}
