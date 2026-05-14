import { createWorkflowCoreFacade } from "../services/workflow-facade.ts";

/**
 * Superb bridge for SQLite storage.
 */
export class SqliteStorageBackend {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.core = createWorkflowCoreFacade({ projectRoot });
  }

  async load() {
    return this.core.withStore(async (store) => {
      const blocks = store.listGuidelineBlocks();
      return blocks.map(b => ({
        id: b.id,
        body: b.body
      }));
    });
  }

  async store(block) {
    return this.core.withStore(async (store) => {
      await store.upsertGuidelineBlock(block);
    });
  }
}
