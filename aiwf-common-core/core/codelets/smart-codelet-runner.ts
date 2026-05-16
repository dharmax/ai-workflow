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
  const codeletId = String(options.codeletId ?? options.codelet ?? process.env.AIWF_CODELET_ID ?? "codelet-observer").trim() || "codelet-observer";

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
  const startedAt = Date.now();
  const validationErrors = [];
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let attemptCount = 0;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    attemptCount = attempt + 1;
    completion = await llm.generate(prompt, { taskClass: meta.taskClass });
    accumulateTokenUsage(usage, completion?.usage);
    result = parseStructuredResponse(completion.response);
    const validationError = validateOutput(result, meta.outputSchema);
    if (!validationError) {
      break;
    }
    lastError = validationError;
    validationErrors.push(validationError);
    prompt = `${prompt}\n\nPrevious response was invalid: ${validationError}. ${buildReturnInstruction(meta.outputSchema)}`;
  }
  if (lastError && validateOutput(result, meta.outputSchema)) {
    throw new Error(`smart codelet output validation failed: ${lastError}`);
  }

  return {
    codelet: { id: codeletId, summary: meta.summary },
    diagnostics: {
      attempts: attemptCount,
      validationRetries: validationErrors.length,
      validationErrors,
      latencyMs: Date.now() - startedAt,
      usage,
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
    buildReturnInstruction(meta.outputSchema)
  ].join("\n");
}

function buildReturnInstruction(outputSchema: any) {
  if (!outputSchema || typeof outputSchema !== "object") {
    return "Return JSON only: { summary, observations[], suggested_actions[] }";
  }
  const required = Array.isArray(outputSchema.required) ? outputSchema.required : [];
  const properties = outputSchema.properties && typeof outputSchema.properties === "object" ? outputSchema.properties : {};
  const fields = required.length ? required : Object.keys(properties);
  const fieldHints = fields.map((field) => `${field}:${schemaTypeHint(properties[field])}`);
  return [
    "Return JSON only.",
    fields.length ? `Required fields: ${fields.join(", ")}.` : null,
    fieldHints.length ? `Field types: ${fieldHints.join(", ")}.` : null,
    "Do not include markdown fences or explanatory text outside the JSON object."
  ].filter(Boolean).join(" ");
}

function schemaTypeHint(schema: any) {
  if (!schema || typeof schema !== "object") {
    return "any";
  }
  if (schema.type === "array") {
    const itemType = schema.items && typeof schema.items === "object" ? schema.items.type : null;
    return itemType ? `${itemType}[]` : "array";
  }
  return schema.type ?? "any";
}

function parseStructuredResponse(text: string) {
  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate);
  } catch {
    return { summary: text };
  }
}

function extractJsonCandidate(text: string) {
  const value = String(text ?? "").trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const objectStart = value.indexOf("{");
  const objectEnd = value.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return value.slice(objectStart, objectEnd + 1);
  }
  return value;
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

function accumulateTokenUsage(target: any, usage: any) {
  if (!usage || typeof usage !== "object") {
    return;
  }
  target.promptTokens += Number(usage.promptTokens ?? usage.prompt_tokens ?? 0);
  target.completionTokens += Number(usage.completionTokens ?? usage.completion_tokens ?? 0);
  target.totalTokens += Number(usage.totalTokens ?? usage.total_tokens ?? 0);
}
