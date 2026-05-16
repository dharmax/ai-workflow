import path from "node:path";
import { existsSync } from "node:fs";
import { addManualNote, getCodelet } from "aiwf-common-core/services/sync";
import { buildSmartCodeletRunContext } from "aiwf-common-core/services/codelet-runtime";
import { generateCompletion } from "aiwf-common-core/services/providers";
import { routeTask } from "aiwf-common-core/services/router";
import { parseArgs } from "aiwf-common-core/lib/cli";

export async function runSmartCodelet(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const root = path.resolve(String(args.root ?? process.cwd()));
  const codeletId = String(env.AIWF_CODELET_ID ?? args.codelet ?? "codelet-observer").trim();
  const providerId = args.provider ? String(args.provider) : null;
  const modelId = args.model ? String(args.model) : null;
  const context = await buildSmartCodeletRunContext({
    projectRoot: root,
    codeletId,
    ticketId: args.ticket ? String(args.ticket) : null,
    filePath: args.file ? String(args.file) : null,
    goal: args.goal ? String(args.goal) : null
  });
  const metadata = await getCodelet({ projectRoot: root, codeletId });
  const metadataMaxRetries = Number(metadata?.data?.maxRetries ?? metadata?.maxRetries);
  const route = await routeTask({
    root,
    taskClass: context.codelet.taskClass || "task-decomposition",
    allowWeak: true,
    preferLocal: true
  });
  const routed = applyRouteOverride(route, providerId, modelId);
  const attempts = [];
  const candidates = buildRouteCandidates(routed);
  if (!candidates.length) {
    throw new Error("Smart codelet execution failed: no viable routed provider/model candidates.");
  }
  const basePrompt = [
    `Codelet id: ${codeletId}`,
    `Focus: ${context.codelet.intent}`,
    `Purpose: ${context.codelet.summary}`,
    "",
    "Context:",
    context.promptContext,
    "",
    "Goal:",
    context.target.goal || "none",
    "",
    `Context policy: ${formatPolicy(context.codelet.contextPolicy)}`,
    `Tool policy: ${formatPolicy(context.codelet.toolPolicy)}`,
    `Can mutate: ${context.codelet.canMutate ? "yes" : "no"}`,
    context.codelet.graderId ? `Grader: ${context.codelet.graderId}` : null,
    context.codelet.outputSchema ? `Output schema: ${JSON.stringify(context.codelet.outputSchema)}` : null,
    buildQualityInstruction(context.codelet.graderId),
    buildGraderShapeInstruction(context.codelet.graderId),
    buildReturnInstruction(context.codelet.outputSchema)
  ].filter(Boolean).join("\n");
  validatePayload(context.target, context.codelet.inputSchema, "input");
  const maxRetries = Math.max(
    1,
    Number.isFinite(metadataMaxRetries) ? metadataMaxRetries : Number(context.codelet.maxRetries ?? 1)
  );

  for (const candidate of candidates) {
    try {
      const prompt = buildAttemptPrompt(basePrompt, null);
      const attemptResult = await runValidatedAttempt({
        prompt,
        candidate,
        routed,
        outputSchema: context.codelet.outputSchema,
        graderId: context.codelet.graderId,
        maxRetries,
        context: { ...context, projectRoot: root }
      });
      const result = attemptResult.result;
      const payload = {
        codelet: {
          id: codeletId,
          summary: context.codelet.summary
        },
        route: sanitizeRoute(routed),
        diagnostics: summarizeAttempts(attempts, candidate.providerId, attemptResult),
        result
      };
      await persistSmartCodeletNotes(root, codeletId, result);
      return payload;
    } catch (error: any) {
      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        error: error?.message ?? String(error)
      });
    }
  }

  throw new Error(attempts[0]?.error ?? "Smart codelet execution failed.");
}

function applyRouteOverride(route, providerId, modelId) {
  if (!providerId || !modelId) {
    return route;
  }

  return {
    ...route,
    recommended: {
      ...(route.providers?.[providerId] ?? {}),
      providerId,
      modelId,
      reason: `operator override ${providerId}/${modelId}`
    },
    fallbackChain: []
  };
}

function buildRouteCandidates(route) {
  const items = [];
  const seen = new Set();
  const pushCandidate = (candidate) => {
    const providerId = String(candidate?.providerId ?? "").trim();
    const modelId = String(candidate?.modelId ?? "").trim();
    if (!providerId || !modelId) {
      return;
    }
    const key = `${providerId}\u0000${modelId}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push({ providerId, modelId });
  };
  if (route.recommended?.providerId && route.recommended?.modelId) {
    pushCandidate({
      providerId: route.recommended.providerId,
      modelId: route.recommended.modelId
    });
  }
  for (const item of route.fallbackChain ?? []) {
    pushCandidate(item);
  }
  return items;
}

function formatPolicy(policy) {
  if (!policy) {
    return "default";
  }
  if (typeof policy === "string") {
    return policy;
  }
  return JSON.stringify(policy);
}

function sanitizeRoute(route) {
  const providers = {};
  for (const [providerId, provider] of Object.entries(route.providers ?? {})) {
    providers[providerId] = {
      ...provider,
      apiKey: provider?.apiKey ? "[redacted]" : null
    };
  }
  return {
    ...route,
    providers
  };
}

function summarizeAttempts(attempts, successfulProviderId, attemptResult = {}) {
  return {
    failedAttempts: attempts.length,
    successfulProviderId,
    attemptCount: attemptResult.attemptCount ?? 1,
    validationRetries: Math.max(0, Number(attemptResult.attemptCount ?? 1) - 1),
    usage: attemptResult.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    latencyMs: Number(attemptResult.latencyMs ?? 0),
    validationErrors: attemptResult.validationErrors ?? []
  };
}

function safeJson(text) {
  const candidate = extractJsonCandidate(text);
  try {
    return JSON.parse(candidate);
  } catch {
    return { summary: String(text ?? "") };
  }
}

function extractJsonCandidate(text) {
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

async function persistSmartCodeletNotes(root, codeletId, result) {
  const lines = [
    ...(Array.isArray(result.candidate_codelets)
      ? result.candidate_codelets.map((item) => `${item.id}: ${item.reason ?? ""}`.trim())
      : []),
    ...(Array.isArray(result.docs_to_update)
      ? result.docs_to_update.map((item) => `doc: ${item}`)
      : [])
  ].filter(Boolean);

  if (!lines.length) {
    return;
  }

  await addManualNote({
    projectRoot: root,
    note: {
      noteType: "NOTE",
      filePath: null,
      line: null,
      body: lines.join("; "),
      provenance: `tool-dev-${codeletId}`
    }
  });
}

async function runValidatedAttempt({ prompt, candidate, routed, outputSchema, graderId, maxRetries, context }) {
  let workingPrompt = prompt;
  let lastError = null;
  let completion = null;
  let result = null;
  const tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const validationErrors = [];
  const startedAt = Date.now();

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    completion = await generateCompletion({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      prompt: workingPrompt,
      config: routed.providers?.[candidate.providerId] ?? {}
    });
    result = safeJson(completion.response);
    accumulateTokenUsage(tokenUsage, completion.usage);
    const validationError = validatePayload(result, outputSchema, "output") ?? validateGradedOutput(result, graderId, { projectRoot: context?.projectRoot ?? process.cwd() });
    if (!validationError) {
      return {
        result,
        usage: tokenUsage,
        latencyMs: Date.now() - startedAt,
        attemptCount: attempt + 1,
        validationErrors
      };
    }
    lastError = validationError;
    validationErrors.push(validationError);
    workingPrompt = buildAttemptPrompt(prompt, validationError, outputSchema);
  }

  const fallback = buildDeterministicFallback({ graderId, context, lastError });
  const fallbackError = fallback
    ? (validatePayload(fallback, outputSchema, "output") ?? validateGradedOutput(fallback, graderId, { projectRoot: context?.projectRoot ?? process.cwd() }))
    : "no deterministic fallback available";
  if (!fallbackError) {
    validationErrors.push(`deterministic fallback used after validation failure: ${lastError}`);
    return {
      result: fallback,
      usage: tokenUsage,
      latencyMs: Date.now() - startedAt,
      attemptCount: maxRetries,
      validationErrors
    };
  }

  throw new Error(lastError ?? "Smart codelet output validation failed.");
}

function buildAttemptPrompt(basePrompt, validationError, outputSchema = null) {
  if (!validationError) {
    return basePrompt;
  }
  return `${basePrompt}\n\nPrevious response was invalid: ${validationError}. ${buildReturnInstruction(outputSchema)}`;
}

function buildQualityInstruction(graderId) {
  const id = String(graderId ?? "");
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

function buildGraderShapeInstruction(graderId) {
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

function buildReturnInstruction(outputSchema) {
  if (!outputSchema || typeof outputSchema !== "object") {
    return "Return JSON only: { summary, observations[], candidate_codelets[], suggested_actions[], docs_to_update[], needs_human_review }";
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

function schemaTypeHint(schema) {
  if (!schema || typeof schema !== "object") {
    return "any";
  }
  if (schema.type === "array") {
    const itemType = schema.items && typeof schema.items === "object" ? schema.items.type : null;
    return itemType ? `${itemType}[]` : "array";
  }
  return schema.type ?? "any";
}

function validatePayload(payload, schema, phase) {
  if (!schema || typeof schema !== "object") {
    return null;
  }
  if (schema.type === "object" && payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const key of schema.required ?? []) {
      if (!(key in payload)) {
        return `${phase} missing required field '${key}'`;
      }
    }
  }
  return null;
}

function validateGradedOutput(payload, graderId, options = {}) {
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
    const invalidFile = payload.files_to_change.findIndex((item) => {
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
    const weakGuardrail = payload.enforced_guardrails.findIndex((item) => {
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

function buildDeterministicFallback({ graderId, context, lastError }) {
  const id = String(graderId ?? "");
  if (id.includes("guideline-enforcement")) {
    const guardrails = Array.isArray(context?.surgicalContext?.activeGuardrails)
      ? context.surgicalContext.activeGuardrails
      : [];
    const enforced = (guardrails.length ? guardrails : [{ id: "active-guardrails", title: "No active guardrails were selected for this context." }])
      .slice(0, 8)
      .map((guardrail) => ({
        guardrail: String(guardrail?.id ?? guardrail?.title ?? guardrail?.source ?? "active-guardrail"),
        status: "unknown",
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
        "npm run build --workspace aiwf-shell",
        "ai-workflow dogfood --surface shell,workflow,provider,init --profile bootstrap --json",
        "ai-workflow audit workflow --json"
      ],
      degraded: true
    };
  }
  if (id.includes("code-generation")) {
    const files = [
      context?.target?.filePath,
      ...(Array.isArray(context?.surgicalContext?.files) ? context.surgicalContext.files.map((file) => file?.path) : [])
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
        "npm run build --workspace aiwf-shell",
        "node ./node_modules/tsx/dist/cli.mjs --test tests/shell.test.ts",
        "ai-workflow dogfood --surface shell,workflow,provider,init --profile bootstrap --json",
        "ai-workflow audit workflow --json"
      ],
      degraded: true
    };
  }
  return null;
}

function requireEvidence(items, field) {
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

function accumulateTokenUsage(target, usage) {
  if (!usage || typeof usage !== "object") {
    return;
  }
  target.promptTokens += Number(usage.promptTokens ?? usage.prompt_tokens ?? 0);
  target.completionTokens += Number(usage.completionTokens ?? usage.completion_tokens ?? 0);
  target.totalTokens += Number(usage.totalTokens ?? usage.total_tokens ?? 0);
}
