import { createWorkflowCoreFacade } from "../services/workflow-facade.ts";

/**
 * Superb bridge for SQLite context storage.
 */
export class SqliteContextStore {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.core = createWorkflowCoreFacade({ projectRoot });
  }

  async loadContext(id) {
    return this.core.withStore(async (store) => {
      return store.getContext(id);
    });
  }

  async storeContext(id, data) {
    return this.core.withStore(async (store) => {
      await store.upsertContext(id, data);
    });
  }
}
