import { withWorkflowStore } from '../services/sync.mjs';

/**
 * Superb bridge for SQLite context storage.
 */
export class SqliteContextStore {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  async loadContext(id) {
    return withWorkflowStore(this.projectRoot, async (store) => {
      return store.getContext(id);
    });
  }

  async storeContext(id, data) {
    return withWorkflowStore(this.projectRoot, async (store) => {
      await store.upsertContext(id, data);
    });
  }
}
