/**
 * Responsibility: Resolve project status for a selector.
 */
import { resolveProjectStatus } from "../services/status.ts";


export async function run(selector: string, options: any, hub: any) {
  return resolveProjectStatus({
    projectRoot: hub.context.projectRoot,
    selector,
    type: options.type ?? null,
    includeRelated: options.includeRelated ?? false,
    rawQuestion: false,
    relatedLimit: options.includeRelated ? 24 : 12
  });
}
