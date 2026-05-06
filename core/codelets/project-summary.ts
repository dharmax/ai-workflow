/**
 * Responsibility: Provide project high-level summary.
 * Scope: Headless codelet for status overview.
 */

import type { ServiceHub } from "../services/service-hub.ts";

export async function run(_args: any, hub: typeof ServiceHub) {
  return hub.getProjectSummary();
}
