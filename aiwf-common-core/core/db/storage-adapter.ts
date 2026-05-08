import { withWorkflowStore } from '../services/sync.ts';

/**
 * Superb bridge for SQLite storage.
 */
export class SqliteStorageBackend {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  async load() {
    return withWorkflowStore(this.projectRoot, async (store) => {
      const blocks = store.listGuidelineBlocks();
      return blocks.map(b => ({
        id: b.id,
        body: b.body
      }));
    });
  }

  async store(block) {
    return withWorkflowStore(this.projectRoot, async (store) => {
      await store.upsertGuidelineBlock(block);
    });
  }
}
