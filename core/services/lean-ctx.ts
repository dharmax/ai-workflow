/**
 * @file lean-ctx.js
 * @brief Auto-generated header for lean-ctx.js. Needs detailed responsibility and scope.
 */

import { SystemProbe } from "@dharmax/llm-utils";

export async function probeLeanCtx() {
  const status = await SystemProbe.getStatus();
  return status.leanCtx;
}

export function leanCtxInstallHint() {
  return SystemProbe.leanCtxInstallHint();
}

export function leanCtxSetupHint() {
  return SystemProbe.leanCtxSetupHint();
}
