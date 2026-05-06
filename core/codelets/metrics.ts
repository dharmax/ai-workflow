/**
 * Responsibility: Get project performance metrics.
 */
import { getProjectMetrics } from "../services/sync.ts";


export async function run(_args: any, hub: any) {
  return getProjectMetrics({ projectRoot: hub.context.projectRoot });
}
