/**
 * @file sqlite-adapter.ts
 * @brief Bun SQLite adapter exposing the synchronous subset used by ai-workflow.
 */

import { Database } from "bun:sqlite";

export class DatabaseSync {
  private db: Database;

  constructor(filename: string, options: { readOnly?: boolean } = {}) {
    this.db = new Database(filename, options.readOnly
      ? { readonly: true }
      : { create: true, readwrite: true });
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  prepare(sql: string) {
    return new StatementSync(this.db.prepare(sql));
  }

  close() {
    this.db.close();
  }
}

class StatementSync {
  constructor(private statement: any) {}

  run(...params: any[]) {
    return this.statement.run(...params);
  }

  get(...params: any[]) {
    return this.statement.get(...params);
  }

  all(...params: any[]) {
    return this.statement.all(...params);
  }
}
