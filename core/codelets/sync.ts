/**
 * Responsibility: Execute project synchronization.
 * Scope: Headless codelet for re-indexing and projection updates.
 */

import type { ServiceHub } from "../services/service-hub.ts";

export interface SyncOptions {
  writeProjections?: boolean;
}

export async function run(options: SyncOptions, hub: typeof ServiceHub) {
  return hub.sync(options);
}
