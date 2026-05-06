/**
 * Responsibility: Execute project synchronization.
 * Scope: Headless codelet for re-indexing and projection updates.
 */

import type { ServiceHub } from "../services/service-hub.ts";

export async function run(args: any, hub: ServiceHub) {
  const writeProjections = Boolean(args["write-projections"] || args.writeProjections);
  return hub.facade.sync(writeProjections);
}
