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
  const route = await routeTask({
    root,
    taskClass: context.codelet.taskClass || "task-decomposition",
    allowWeak: true,
    preferLocal: true
  });
  const routed = applyRouteOverride(route, providerId, modelId);
  const attempts = [];
  const candidates = buildRouteCandidates(routed);
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
    `Context policy: ${context.codelet.contextPolicy ?? "default"}`,
    `Tool policy: ${context.codelet.toolPolicy ?? "default"}`,
    `Can mutate: ${context.codelet.canMutate ? "yes" : "no"}`,
    context.codelet.outputSchema ? `Output schema: ${JSON.stringify(context.codelet.outputSchema)}` : null,
    "Return JSON only: { summary, observations[], candidate_codelets[], suggested_actions[], docs_to_update[], needs_human_review }"
  ].filter(Boolean).join("\n");
  validatePayload(context.target, context.codelet.inputSchema, "input");
  const maxRetries = Math.max(1, Number(context.codelet.maxRetries ?? 1));

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
    }
  };
}

function buildRouteCandidates(route) {
  const items = [];
  if (route.recommended?.providerId && route.recommended?.modelId) {
    items.push({
      providerId: route.recommended.providerId,
      modelId: route.recommended.modelId
    });
  }
  for (const item of route.fallbackChain ?? []) {
    if (!items.some((existing) => existing.providerId === item.providerId && existing.modelId === item.modelId)) {
      items.push({
        providerId: item.providerId,
        modelId: item.modelId
      });
    }
  }
  return items;
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

function summarizeAttempts(attempts, successfulProviderId) {
  return {
    failedAttempts: attempts.length,
    successfulProviderId
  };
}

function safeJson(text) {
  try {
    return JSON.parse(String(text ?? ""));
  } catch {
    return { summary: String(text ?? "") };
  }
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

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const startedAt = Date.now();
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
        attemptCount: attempt + 1
      };
    }
    lastError = validationError;
    workingPrompt = buildAttemptPrompt(prompt, validationError);
  }

  throw new Error(lastError ?? "Smart codelet output validation failed.");
}

function buildAttemptPrompt(basePrompt, validationError) {
  if (!validationError) {
    return basePrompt;
  }
  return `${basePrompt}\n\nPrevious response was invalid: ${validationError}. Return corrected JSON only.`;
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
