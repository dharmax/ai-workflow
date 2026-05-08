/**
 * Responsibility: Resolve project status for a selector.
 */
import { resolveProjectStatus } from "../services/status.ts";


export async function run(options: any, hub: any) {
  const selector = String(options?.selector ?? "").trim();
  return resolveProjectStatus({
    projectRoot: options?.projectRoot ?? hub.context.projectRoot,
    selector,
    type: options?.type ?? null,
    includeRelated: options?.includeRelated ?? false,
    rawQuestion: options?.rawQuestion ?? false,
    relatedLimit: options?.relatedLimit ?? (options?.includeRelated ? 24 : 12)
  });
}
