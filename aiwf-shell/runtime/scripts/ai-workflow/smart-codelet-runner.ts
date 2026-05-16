import path from "node:path";
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
        maxRetries
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

async function runValidatedAttempt({ prompt, candidate, routed, outputSchema, maxRetries }) {
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
    const validationError = validatePayload(result, outputSchema, "output");
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

  throw new Error(lastError ?? "Smart codelet output validation failed.");
}

function buildAttemptPrompt(basePrompt, validationError, outputSchema = null) {
  if (!validationError) {
    return basePrompt;
  }
  return `${basePrompt}\n\nPrevious response was invalid: ${validationError}. ${buildReturnInstruction(outputSchema)}`;
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

function accumulateTokenUsage(target, usage) {
  if (!usage || typeof usage !== "object") {
    return;
  }
  target.promptTokens += Number(usage.promptTokens ?? usage.prompt_tokens ?? 0);
  target.completionTokens += Number(usage.completionTokens ?? usage.completion_tokens ?? 0);
  target.totalTokens += Number(usage.totalTokens ?? usage.total_tokens ?? 0);
}
