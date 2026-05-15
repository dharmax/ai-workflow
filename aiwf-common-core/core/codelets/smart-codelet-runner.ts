/**
 * Responsibility: Execute AI-driven smart codelets with delegated reasoning.
 * Scope: Handles prompting, multi-provider attempts, and metrics recording.
 */

import { routeTask } from "../services/router.ts";
import { buildSmartCodeletRunContext } from "../services/codelet-runtime.ts";


export interface SmartCodeletOptions {
  codeletId?: string;
  ticket?: string;
  file?: string;
  goal?: string;
  provider?: string;
  model?: string;
}

export async function run(options: SmartCodeletOptions, hub: any) {
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
  const retries = Math.max(1, Number(meta.maxRetries ?? 1));
  validateInput(runtimeContext.target, meta.inputSchema);
  let prompt = buildPrompt({
    codeletId,
    meta,
    root,
    projectSummary: runtimeContext.projectSummary,
    target: runtimeContext.target,
    promptContext: runtimeContext.promptContext
  });
  const llm = hub.resolve("llm");
  let result = null;
  let lastError = null;
  let completion = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    completion = await llm.generate(prompt, { taskClass: meta.taskClass });
    result = parseStructuredResponse(completion.response);
    const validationError = validateOutput(result, meta.outputSchema);
    if (!validationError) {
      break;
    }
    lastError = validationError;
    prompt = `${prompt}\n\nPrevious response was invalid: ${validationError}. Return corrected JSON only.`;
  }
  if (lastError && validateOutput(result, meta.outputSchema)) {
    throw new Error(`smart codelet output validation failed: ${lastError}`);
  }

  return {
    codelet: { id: codeletId, summary: meta.summary },
    diagnostics: {
      attempts: retries,
      providerId: completion?.providerId ?? null,
      modelId: completion?.modelId ?? null
    },
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

function validateInput(target: any, schema: any) {
  const error = validateAgainstSchema(target, schema);
  if (error) {
    throw new Error(`smart codelet input validation failed: ${error}`);
  }
}

function validateOutput(payload: any, schema: any) {
  return validateAgainstSchema(payload, schema);
}

function validateAgainstSchema(payload: any, schema: any) {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  if (schema.type === "object" && payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const key of schema.required ?? []) {
      if (!(key in payload)) {
        return `missing required field '${key}'`;
      }
    }
  }
  return null;
}
