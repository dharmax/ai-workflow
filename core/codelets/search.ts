/**
 * Responsibility: Search indexed workflow entities for a free-text query.
 */

import { searchProject } from "../services/sync.ts";

export async function run(options: { query?: string; limit?: number }, hub: any) {
  const query = String(options.query ?? "").trim();
  if (!query) {
    throw new Error("query is required");
  }

  return searchProject({
    projectRoot: hub.context.projectRoot,
    query,
    limit: Number(options.limit ?? 20)
  });
}
