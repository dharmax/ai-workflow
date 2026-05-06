/**
 * Responsibility: Execute AI-driven smart codelets with delegated reasoning.
 * Scope: Handles prompting, multi-provider attempts, and metrics recording.
 */

import { addManualNote } from "../services/sync.ts";
import { routeTask } from "../services/router.ts";
import { generateCompletion } from "../services/providers.ts";
import { buildSmartCodeletRunContext } from "../services/codelet-runtime.ts";
import type { ServiceHub } from "../services/service-hub.ts";

export interface SmartCodeletOptions {
  codeletId?: string;
  ticket?: string;
  file?: string;
  goal?: string;
  provider?: string;
  model?: string;
}

export async function run(options: SmartCodeletOptions, hub: typeof ServiceHub) {
  const root = hub.context.projectRoot;
  const codeletId = options.codeletId || "codelet-observer";

  const runtimeContext = await buildSmartCodeletRunContext({
    projectRoot: root,
    codeletId,
    ticketId: options.ticket,
    filePath: options.file,
    goal: options.goal
  });

  const meta = runtimeContext.codelet;
  const route = await routeTask({
    root,
    taskClass: meta.taskClass ?? "task-decomposition",
    preferLocal: true,
    allowWeak: true
  });

  // Simplified execution for Smart Codelet
  const prompt = buildPrompt({
    codeletId,
    meta,
    root,
    projectSummary: runtimeContext.projectSummary,
    target: runtimeContext.target,
    promptContext: runtimeContext.promptContext
  });

  const completion = await hub.llm.generate(prompt, { taskClass: meta.taskClass });
  const result = parseStructuredResponse(completion.response);

  return {
    codelet: { id: codeletId, summary: meta.summary },
    result
  };
}

function buildPrompt({ codeletId, meta, root, projectSummary, target, promptContext }: any) {
  return [
    `Codelet id: ${codeletId}`,
    `Focus: ${meta.intent}`,
    `Purpose: ${meta.summary}`,
    "",
    "Context:",
    promptContext,
    "",
    "Goal:",
    target.goal || "none",
    "",
    "Return JSON only: { summary, observations[], suggested_actions[] }"
  ].join("\n");
}

function parseStructuredResponse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { summary: text };
  }
}
