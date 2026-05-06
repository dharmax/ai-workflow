/**
 * Responsibility: Execute dogfooding scenarios for operator surfaces.
 */
import path from "node:path";
import { listOperatorSurfaceIds } from "../lib/operator-surfaces.ts";
import { runDogfood } from "../lib/dogfood-utils.ts";


export interface DogfoodOptions {
  root?: string;
  surface?: string[];
  profile?: string;
  timeoutMs?: number;
}

export async function run(options: DogfoodOptions, hub: any) {
  const root = path.resolve(String(options.root ?? hub.context.projectRoot));
  const requestedSurfaces = options.surface ?? listOperatorSurfaceIds();
  const profile = options.profile ?? "bootstrap";
  const timeoutMs = options.timeoutMs ?? 45000;

  return runDogfood({
    root,
    surfaces: requestedSurfaces,
    profile,
    timeoutMs,
    writeReport: true,
    silent: true
  });
}
