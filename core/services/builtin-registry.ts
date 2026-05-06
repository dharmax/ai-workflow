/**
 * Responsibility: Map codelet IDs to internal function implementations.
 * Scope: Provides high-speed, in-process execution for core toolkit features.
 */

import * as sync from "../codelets/sync.ts";
import * as summary from "../codelets/project-summary.ts";
import * as kanban from "../codelets/kanban.ts";
import { ServiceHub } from "./service-hub.ts";

export type CodeletRunner = (args: any, hub: ServiceHub) => Promise<any>;

const REGISTRY: Record<string, CodeletRunner> = {
  "sync": sync.run,
  "project-summary": summary.run,
  "summary": summary.run,
  "kanban": kanban.run
};

export function getBuiltinCodelet(id: string): CodeletRunner | null {
  return REGISTRY[id] ?? null;
}
