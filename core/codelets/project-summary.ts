/**
 * Responsibility: Provide project high-level summary.
 */
import { getProjectSummary } from "../services/sync.ts";


export async function run(_args: any, hub: any) {
  return getProjectSummary({ projectRoot: hub.context.projectRoot });
}
