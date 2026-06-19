/**
 * Responsibility: Execute AI-driven smart codelets with delegated reasoning.
 * Scope: Handles prompting, multi-provider attempts, and metrics recording.
 */

import { routeTask } from "../services/router.ts";
import { buildSmartCodeletRunContext } from "../services/codelet-runtime.ts";
import { existsSync } from "node:fs";
import path from "node:path";


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
    const validationError = validateOutput(result, meta.outputSchema) ?? validateGradedOutput(result, meta.graderId, { projectRoot: root });
    if (!validationError) {
      break;
    }
    lastError = validationError;
    validationErrors.push(validationError);
    prompt = `${prompt}\n\nPrevious response was invalid: ${validationError}. ${buildReturnInstruction(meta.outputSchema)}`;
  }
  if (lastError && (validateOutput(result, meta.outputSchema) ?? validateGradedOutput(result, meta.graderId, { projectRoot: root }))) {
    const fallback = buildDeterministicFallback({ meta, runtimeContext, lastError });
    const fallbackError = fallback
      ? (validateOutput(fallback, meta.outputSchema) ?? validateGradedOutput(fallback, meta.graderId))
      : "no deterministic fallback available";
    if (fallbackError) {
      throw new Error(`smart codelet output validation failed: ${lastError}`);
    }
    result = fallback;
    validationErrors.push(`deterministic fallback used after validation failure: ${lastError}`);
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
    buildQualityInstruction(meta.graderId),
    buildGraderShapeInstruction(meta.graderId),
    "",
    buildReturnInstruction(meta.outputSchema)
  ].join("\n");
}

function buildQualityInstruction(graderId: any) {
  const id = String(graderId ?? "");
  if (!id) {
    return "Quality contract: ground claims in the supplied workflow context and say when evidence is missing.";
  }
  if (id.includes("debug-code")) {
    return "Quality contract: every observation and suspected root cause must include concrete evidence such as a file, symbol, command, test, or graph item.";
  }
  if (id.includes("assess-code")) {
    return "Quality contract: findings must include concrete evidence; GoE and graph gaps must distinguish verified gaps from unknowns.";
  }
  if (id.includes("code-generation")) {
    return "Quality contract: produce a concrete patch plan with target files, generated code intent, guardrail checks, and verification steps; do not claim files were written unless the tool policy permits mutation.";
  }
  if (id.includes("guideline-enforcement")) {
    return "Quality contract: map active guardrails to pass/fail/unknown status, required actions, and shell/plugin/codelet surfaces affected.";
  }
  return "Quality contract: ground claims in the supplied workflow context and say when evidence is missing.";
}

function buildGraderShapeInstruction(graderId: any) {
  const id = String(graderId ?? "");
  if (id.includes("guideline-enforcement")) {
    return [
      "Validated shape: enforced_guardrails must be an array of objects, not strings.",
      "Each enforced_guardrails item must include guardrail, status, and evidence.",
      "Use status values pass, fail, or unknown; evidence should name a guardrail, file, command, ticket, graph item, or trace source.",
      "required_actions and verification_steps must be arrays."
    ].join(" ");
  }
  if (id.includes("code-generation")) {
    return [
      "Validated shape: files_to_change, patch_plan, guardrail_checks, and verification_steps must be non-empty arrays.",
      "files_to_change entries must be existing repo paths, new:<path> for new files, or unknown:<reason> when context is insufficient.",
      "Each patch_plan item should name the intended code change and why it is safe under the active guardrails."
    ].join(" ");
  }
  return "";
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

function validateGradedOutput(payload: any, graderId: any, options: any = {}) {
  const id = String(graderId ?? "");
  if (!id || !payload || typeof payload !== "object") {
    return null;
  }
  if (id.includes("debug-code")) {
    return requireEvidence(payload.observations, "observations") ?? requireEvidence(payload.suspected_root_causes, "suspected_root_causes");
  }
  if (id.includes("assess-code")) {
    return requireEvidence(payload.findings, "findings");
  }
  if (id.includes("code-generation")) {
    if (!Array.isArray(payload.files_to_change) || payload.files_to_change.length === 0) {
      return "code-generation requires at least one files_to_change item";
    }
    const invalidFile = payload.files_to_change.findIndex((item: any) => {
      const value = String(item ?? "").trim();
      if (!value) return true;
      if (/^(new|unknown):/i.test(value)) return false;
      return !existsSync(path.resolve(options.projectRoot ?? process.cwd(), value));
    });
    if (invalidFile >= 0) {
      return `files_to_change[${invalidFile}] must be an existing repo path, new:<path>, or unknown:<reason>`;
    }
    if (!Array.isArray(payload.patch_plan) || payload.patch_plan.length === 0) {
      return "code-generation requires patch_plan";
    }
    if (!Array.isArray(payload.guardrail_checks) || payload.guardrail_checks.length === 0) {
      return "code-generation requires guardrail_checks";
    }
    if (!Array.isArray(payload.verification_steps) || payload.verification_steps.length === 0) {
      return "code-generation requires verification_steps";
    }
  }
  if (id.includes("guideline-enforcement")) {
    if (!Array.isArray(payload.enforced_guardrails) || payload.enforced_guardrails.length === 0) {
      return "guideline-enforcement requires enforced_guardrails";
    }
    const weakGuardrail = payload.enforced_guardrails.findIndex((item: any) => {
      if (!item || typeof item !== "object") return true;
      return !("guardrail" in item) || !("status" in item) || !("evidence" in item);
    });
    if (weakGuardrail >= 0) {
      return `enforced_guardrails[${weakGuardrail}] requires guardrail, status, and evidence`;
    }
    if (!Array.isArray(payload.required_actions)) {
      return "guideline-enforcement requires required_actions";
    }
    if (!Array.isArray(payload.verification_steps) || payload.verification_steps.length === 0) {
      return "guideline-enforcement requires verification_steps";
    }
  }
  return null;
}

function buildDeterministicFallback({ meta, runtimeContext, lastError }: any) {
  const graderId = String(meta?.graderId ?? "");
  if (graderId.includes("guideline-enforcement")) {
    const guardrails = Array.isArray(runtimeContext?.surgicalContext?.activeGuardrails)
      ? runtimeContext.surgicalContext.activeGuardrails
      : [];
    const enforced = (guardrails.length ? guardrails : [{ id: "active-guardrails", title: "No active guardrails were selected for this context." }])
      .slice(0, 8)
      .map((guardrail: any) => ({
        guardrail: String(guardrail?.id ?? guardrail?.title ?? guardrail?.source ?? "active-guardrail"),
        status: guardrails.length ? "unknown" : "unknown",
        evidence: guardrails.length
          ? `selected active guardrail from workflow context: ${String(guardrail?.title ?? guardrail?.text ?? guardrail?.id ?? "unnamed guardrail").slice(0, 180)}`
          : "context pack contained no selected active guardrails"
      }));
    return {
      summary: `LLM output failed validation (${lastError}); returned deterministic guardrail checklist from the context pack.`,
      enforced_guardrails: enforced,
      violations: [],
      required_actions: [
        "Run the relevant targeted tests before claiming enforcement is complete.",
        "Treat unknown guardrail statuses as blockers until verified against code, tests, or workflow audit evidence."
      ],
      verification_steps: [
        "ai-workflow extract guidelines coding architecture enforcement --json",
      "bun run build --filter aiwf-shell",
        "ai-workflow dogfood --surface shell,workflow,provider,init --profile bootstrap --json",
        "ai-workflow audit workflow --json"
      ],
      degraded: true
    };
  }
  if (graderId.includes("code-generation")) {
    const files = [
      runtimeContext?.target?.filePath,
      ...(Array.isArray(runtimeContext?.surgicalContext?.files) ? runtimeContext.surgicalContext.files.map((file: any) => file?.path) : [])
    ].filter(Boolean);
    return {
      summary: `LLM output failed validation (${lastError}); returned deterministic code-generation plan scaffold from workflow context.`,
      files_to_change: files.length ? [...new Set(files)].slice(0, 6) : ["unknown: provide --file or a ticket with linked implementation evidence"],
      patch_plan: [
        "Identify the smallest module-boundary-compliant patch from the ticket, file, or graph evidence.",
        "Apply the patch only through an execute-ticket or explicit mutation path; this codelet is read-only.",
        "Keep shell/plugin behavior grounded in DB-backed workflow state and active guardrails."
      ],
      guardrail_checks: [
        "Do not mutate without an explicit workflow ticket or mutation-enabled shell path.",
        "Preserve aiwf-common-core as workflow truth and keep shell/plugin surfaces as adapters.",
        "Run targeted tests plus workflow dogfood/audit before declaring operator-surface work complete."
      ],
      verification_steps: [
      "bun run build --filter aiwf-shell",
      "bun test tests/shell.test.ts",
        "ai-workflow dogfood --surface shell,workflow,provider,init --profile bootstrap --json",
        "ai-workflow audit workflow --json"
      ],
      degraded: true
    };
  }
  return null;
}

function requireEvidence(items: any, field: string) {
  if (!Array.isArray(items) || items.length === 0) {
    return `${field} requires at least one item`;
  }
  const missing = items.findIndex((item) => {
    if (typeof item === "string") {
      return !/\b(file|test|command|symbol|graph|ticket|route|doctor|sync|audit|dogfood|evidence)\b/i.test(item);
    }
    if (!item || typeof item !== "object") {
      return true;
    }
    return !("evidence" in item) && !("file" in item) && !("path" in item) && !("command" in item) && !("symbol" in item);
  });
  return missing >= 0 ? `${field}[${missing}] missing evidence` : null;
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
