/**
 * Responsibility: Provide a shared operator-brain backend for natural-language workflow handling.
 * Scope: Handles grounding, planning (NL-to-JS), and execution orchestration.
 */

import { promptMultiChoice } from "../lib/disambiguation.ts";
import path from "node:path";
import { withWorkflowStore, getProjectSummary, getActiveTickets, syncProject, getProjectMetrics, getSmartProjectStatus, createTicket, listEpics, getEpic, updateTicketLifecycle, getCodelet, evaluateProjectReadiness } from "./sync.ts";
import { resolveProjectStatus } from "./status.ts";
import { executeTicket, decomposeTicket, ideateFeature, sweepBugs } from "./orchestrator.ts";
import { runAssessment } from "./assessment.ts";
import { getRelevantGuidelineBlocks } from "./guidelines.ts";
import { executeCodelet } from "./codelet-executor.ts";
import { executeTextCompilerWorkflow, executeJsOrchestrator } from "./text-compiler-host.ts";
import { resolveHostRequest as resolveDeterministicHostRequest } from "./host-resolver.ts";
import { discoverProviderState, generateCompletion, summarizeCompletionUsage } from "./providers.ts";
import { routeTask } from "./router.ts";
import { stableId } from "../lib/hash.ts";
import { runHooks } from "./hooks.ts";
import { buildTicketEntity } from "./projections.ts";
import { LeanContextCompressor } from "@dharmax/context-manager";
import { getGlobalConfigPath, getProjectConfigPath, readConfigSafe } from "../../cli/lib/config-store.ts";
import { collectProjectFiles, readProjectFile, writeProjectFile, loadPromptTemplate, renderTemplate } from "../lib/filesystem.ts";
import * as fs from "node:fs/promises";
import * as pathMod from "node:path";

/**
 * Executes a natural language request through the operator brain.
 */
export async function executeOperatorRequest(prompt, options = {}) {
  const root = options.root ?? process.cwd();

  const plan = await planOperatorRequest(prompt, options);
  const effectiveInputText = plan.__effectiveInputText ?? prompt;

  if (plan.kind === "reply") {
    return {
      ok: true,
      plan,
      assistantReply: plan.assistantReply ?? plan.reply ?? "I'm not sure how to handle that request."
    };
  }

  const workflowInstructions = typeof plan.workflowPrompt === "string" && plan.workflowPrompt.trim()
    ? plan.workflowPrompt.trim()
    : null;

  if (plan.kind !== "plan" || (!plan.code && !workflowInstructions)) {
    return {
      ok: true,
      plan,
      assistantReply: plan.assistantReply ?? plan.reply ?? "I'm not sure how to handle that request."
    };
  }

  const services = buildOperatorServices(root, options);
  const runId = options.runId ?? stableId("run", effectiveInputText, Date.now());

  const workflowResult = await withWorkflowStore(root, async (workflowStore) => {
    workflowStore.upsertWorkflowRun({
      id: runId,
      prompt: effectiveInputText,
      code: workflowInstructions ?? plan.code,
      status: "running",
      result: null
    });

    if (workflowInstructions) {
      return executeTextCompilerWorkflow({
        workflowStore,
        prompt: effectiveInputText,
        instructions: workflowInstructions,
        runId,
        services,
        root,
        planner: plan.__planner ?? null,
        traceWorkflow: options.traceWorkflow
      });
    }

    return executeJsOrchestrator(plan.code, {
      workflowStore,
      prompt: effectiveInputText,
      runId,
      services,
      root,
      traceWorkflow: options.traceWorkflow
    });
  });

  const plannerInfo = plan.__planner ? ` [via ${plan.__planner.providerId}:${plan.__planner.modelId}]` : "";
  return {
    ok: workflowResult.ok,
    plan,
    workflowResult,
    assistantReply: workflowResult.ok ? `Workflow completed successfully.${plannerInfo}` : `Workflow failed: ${workflowResult.error}${plannerInfo}`
  };
}

function getOperatorPlannerTimeoutMs(options, candidate) {
  if (Number.isFinite(options?.plannerTimeoutMs) && options.plannerTimeoutMs > 0) {
    return options.plannerTimeoutMs;
  }
  const envTimeout = Number(process.env.AI_WORKFLOW_OPERATOR_PLANNER_TIMEOUT_MS ?? process.env.AI_WORKFLOW_SHELL_PLANNER_TIMEOUT_MS ?? "");
  if (Number.isFinite(envTimeout) && envTimeout > 0) {
    return envTimeout;
  }
  if (candidate?.providerId === "ollama") {
    return 20000;
  }
  return 15000;
}

function buildOperatorPlanningMetric({ candidates, attempts, successfulCandidate, plan, startedAt }) {
  const providerId = successfulCandidate?.providerId ?? attempts.at(-1)?.providerId ?? candidates[0]?.providerId ?? "unavailable";
  const modelId = successfulCandidate?.modelId ?? attempts.at(-1)?.modelId ?? candidates[0]?.modelId ?? "unavailable";
  const failedCandidates = attempts
    .filter((attempt) => !attempt.success)
    .map(({ providerId: failedProviderId, modelId: failedModelId, latencyMs, timedOut, error }) => ({
      providerId: failedProviderId,
      modelId: failedModelId,
      latencyMs,
      timedOut,
      error
    }));
  const failedLatencyMs = failedCandidates.reduce((sum, attempt) => sum + Number(attempt.latencyMs ?? 0), 0);
  const tokenUsage = summarizeCompletionUsage(attempts.map((attempt) => attempt.usage));

  return {
    taskClass: "project-planning",
    capability: "strategy",
    providerId,
    modelId,
    promptTokens: tokenUsage.promptTokens,
    completionTokens: tokenUsage.completionTokens,
    latencyMs: Date.now() - startedAt,
    success: Boolean(plan),
    errorMessage: plan ? null : (failedCandidates.at(-1)?.error ?? "No planning candidates available."),
    details: {
      stage: "operator-planning",
      candidateCount: candidates.length,
      attemptCount: attempts.length,
      fallbackUsed: attempts.length > 1,
      failedAttempts: failedCandidates.length,
      failedLatencyMs,
      successfulProviderId: successfulCandidate?.providerId ?? null,
      successfulModelId: successfulCandidate?.modelId ?? null,
      failedCandidates,
      tokenUsage
    }
  };
}

export async function planOperatorRequest(inputText, options = {}) {
  const root = options.root ?? process.cwd();
  const traceEvent = typeof options.traceAi === "function" ? options.traceAi : null;
  
  const [projectConfigState, globalConfigState] = await Promise.all([
    readConfigSafe(getProjectConfigPath(root)),
    readConfigSafe(getGlobalConfigPath())
  ]);
  const config = { 
    ...globalConfigState.config, 
    ...projectConfigState.config,
    hooks: {
      ...(globalConfigState.config?.hooks ?? {}),
      ...(projectConfigState.config?.hooks ?? {})
    }
  };

  // Run BeforePlan hooks
  const prePlanContext = await runHooks("BeforePlan", { 
    root, 
    config, 
    context: { inputText, options } 
  });
  const effectiveInputText = prePlanContext.inputText ?? inputText;

  const groundedBriefReply = await buildGroundedOperatorBriefReply(effectiveInputText, options);
  if (groundedBriefReply) {
    groundedBriefReply.__effectiveInputText = effectiveInputText;
    groundedBriefReply.__planner = {
      mode: "grounded-brief",
      reason: groundedBriefReply.reason ?? "Grounded operator brief."
    };
    traceEvent?.({
      stage: "planning",
      phase: "grounded-brief",
      planner: groundedBriefReply.__planner,
      prompt: effectiveInputText,
      result: groundedBriefReply.assistantReply
    });
    return groundedBriefReply;
  }

  const groundedReply = await buildGroundedOperatorReply(effectiveInputText, options);
  if (groundedReply) {
    groundedReply.__effectiveInputText = effectiveInputText;
    groundedReply.__planner = {
      mode: "grounded-reply",
      reason: groundedReply.reason ?? "Grounded operator reply."
    };
    traceEvent?.({
      stage: "planning",
      phase: "grounded",
      planner: groundedReply.__planner,
      prompt: effectiveInputText,
      result: groundedReply.assistantReply
    });
    return groundedReply;
  }

  const { system, prompt } = await buildOperatorPlannerPrompt(effectiveInputText, options);
  
  const route = await routeTask({ root, taskClass: "project-planning" });
  let candidates = route.candidates ?? [];
  
  // If a specific planner is requested, put it at the top of the list
  if (options.planner) {
    candidates = [
      { ...options.planner, score: 999 }, 
      ...candidates.filter(c => c.providerId !== options.planner.providerId || c.modelId !== options.planner.modelId)
    ];
  }

  const errors = [];
  const attempts = [];
  const planningStartedAt = Date.now();

  let plan = null;
  let successfulCandidate = null;
  const candidatePool = candidates.slice(0, 5);
  for (const candidate of candidatePool) {
    const timeoutMs = getOperatorPlannerTimeoutMs(options, candidate);
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timeoutId = null;
    const attemptStartedAt = Date.now();
    try {
      traceEvent?.({
        phase: "request",
        stage: "operator-planner",
        planner: candidate,
        system,
        prompt
      });
      if (process.env.AI_WORKFLOW_DEBUG_FALLBACK) {
        console.error(`[operator-brain] Attempting planning with ${candidate.providerId}:${candidate.modelId}...`);
      }
      if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutId = setTimeout(() => controller.abort(new Error(`planner timed out after ${timeoutMs}ms`)), timeoutMs);
      }

      const completion = await generateCompletion({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        system,
        prompt,
        config: { host: candidate.host, apiKey: candidate.apiKey, baseUrl: candidate.baseUrl, format: "json" },
        signal: controller?.signal ?? null
      });

      traceEvent?.({
        phase: "response",
        stage: "operator-planner",
        planner: candidate,
        response: completion.response,
        usage: completion.usage ?? null,
        elapsedMs: Date.now() - attemptStartedAt
      });
      const parsedPlan = normalizePlannerResponse(parsePlannerResponse(completion.response));
      validateGeneratedPlan(parsedPlan, options);
      plan = parsedPlan;
      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        latencyMs: Date.now() - attemptStartedAt,
        success: true,
        timedOut: false,
        error: null,
        usage: completion.usage ?? null
      });
      successfulCandidate = candidate;
      break;
    } catch (error) {
      const timedOut = controller?.signal?.aborted && Number.isFinite(timeoutMs) && timeoutMs > 0;
      const message = timedOut ? `planner timed out after ${timeoutMs}ms` : (error?.message ?? String(error));
      traceEvent?.({
        phase: "error",
        stage: "operator-planner",
        planner: candidate,
        error: message,
        elapsedMs: Date.now() - attemptStartedAt
      });
      attempts.push({
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        latencyMs: Date.now() - attemptStartedAt,
        success: false,
        timedOut,
        error: message,
        usage: error?.completion?.usage ?? null
      });
      if (process.env.AI_WORKFLOW_DEBUG_FALLBACK) {
        console.error(`[operator-brain] Planning failed with ${candidate.providerId}:${candidate.modelId}:`, message);
      }
      errors.push(`${candidate.providerId}:${candidate.modelId} failed: ${message}`);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  await withWorkflowStore(root, async (store) => {
    store.appendMetric(buildOperatorPlanningMetric({
      candidates: candidatePool,
      attempts,
      successfulCandidate,
      plan,
      startedAt: planningStartedAt
    }));
  }).catch(() => {});

  if (!plan) {
    return { 
      kind: "reply", 
      assistantReply: errors.length
        ? `Planning failed for all candidates:\n- ${errors.join("\n- ")}`
        : "Planning failed because no planning candidates were available."
    };
  }

  // Run AfterPlan hooks
  const postPlanContext = await runHooks("AfterPlan", {
    root,
    config,
    context: { plan, inputText: effectiveInputText, options }
  });

  const finalPlan = postPlanContext.plan ?? plan;
  
  // Tag the plan with the effective input so the executor can log it correctly
  if (typeof finalPlan === "object" && finalPlan !== null) {
    finalPlan.__effectiveInputText = effectiveInputText;
    finalPlan.__planner = successfulCandidate;
  }

  // Item 2: Plan Persistence
  if (finalPlan && finalPlan.kind === "plan") {
    const fsP = await import("node:fs/promises");
    const pathP = await import("node:path");
    const designDir = pathP.resolve(root, "design");
    await fsP.mkdir(designDir, { recursive: true });
    const runId = options.runId || Date.now();
    await fsP.writeFile(pathP.resolve(designDir, "plan-" + runId + ".json"), JSON.stringify(finalPlan, null, 2), "utf8");
    await withWorkflowStore(root, async (store) => {
        store.setWorkflowState(runId, "plan", finalPlan);
    }).catch(() => {});
  }

  return finalPlan;
}

/**
 * Safely parses a JSON response from the planner, stripping markdown wrappers if present.
 */
function parsePlannerResponse(text) {
  const trimmed = text.trim();
  
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // Try to extract JSON from markdown code block
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {
        // Fall through
      }
    }
    throw e; // Re-throw original error if extraction fails
  }
}

async function buildOperatorPlannerPrompt(inputText, options) {
  const root = options.root ?? process.cwd();
  const plannerContext = options.plannerContext ?? {};

  const catalog = buildActionCatalog(plannerContext);
  const runtimeContext = buildOperatorPlannerRuntimeContext(plannerContext, options);
  const groundingContext = await buildOperatorPlannerGroundingContext(inputText, options);
  const historyContext = buildOperatorPlannerHistoryContext(options.history);
  const managedContext = options.managedContext ?? "";
  const schemaPrompt = buildOperatorPlannerSchemaPrompt();

  // Item: Targeted Guideline & Knowledge Injection
  const { guidelines, lore } = await withWorkflowStore(root, async (store) => {
    const relevantGuidelines = await getRelevantGuidelineBlocks(store, { 
      inputText, 
      categories: ["coding", "process", "styling", "js-coding", "data-structure", "architecture", "planning", "assessing", "documentation", "debugging", "bug-hunting", "analysis", "fixing", "deployment", "testing"] 
    });
    const relevantLore = await getRelevantGuidelineBlocks(store, { inputText, categories: ["lore"] });

    return {
      guidelines: relevantGuidelines.map(b => `### ${b.title}\n${b.body}`).join("\n\n"),
      lore: relevantLore.map(b => `### ${b.title}\n${b.body}`).join("\n\n")
    };
  });

  const templateVariables = {
    runtimeContext,
    managedContext,
    historyContext,
    groundingContext: groundingContext || "No active tickets or recent status found. This project is a blank slate.",
    schemaPrompt,
    guidelines,
    lore,
    inputText
  };

  const { content: systemTemplate } = await loadPromptTemplate("operator-brain.system");
  const { content: promptTemplate } = await loadPromptTemplate("operator-brain.prompt");
  const system = renderTemplate(systemTemplate, templateVariables);
  const prompt = renderTemplate(promptTemplate, templateVariables);

  return {
    system: system || "You are the OPERATOR BRAIN. Plan the request.",
    prompt: prompt || `## Request:\n"${inputText}"\n\nYour Response (JSON):`
  };
}
/**
 * Updates the managed (condensed) context with the latest turn.
 */
export async function updateManagedContext(currentContext, lastUserTurn, lastAiTurn, options = {}) {
  const root = options.root ?? process.cwd();
  
  const templateVariables = {
    currentContext: currentContext || "(No context yet)",
    lastUserTurn,
    lastAiTurn
  };

  const { content: systemTemplate } = await loadPromptTemplate("context-manager.system");
  const { content: promptTemplate } = await loadPromptTemplate("context-manager.prompt");
  const system = renderTemplate(systemTemplate, templateVariables);
  const prompt = renderTemplate(promptTemplate, templateVariables);


  const route = await routeTask({ root, taskClass: "project-planning" });
  const candidate = route.recommended ?? route.candidates?.[0];

  if (!candidate) {
    return compressManagedContextFallback(currentContext, lastUserTurn, lastAiTurn);
  }

  try {
    const completion = await generateCompletion({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      system,
      prompt,
      config: { host: candidate.host, apiKey: candidate.apiKey, baseUrl: candidate.baseUrl, format: "text" }
    });

    return completion.response.trim();
  } catch (error) {
    return compressManagedContextFallback(currentContext, lastUserTurn, lastAiTurn);
  }
}

async function compressManagedContextFallback(currentContext, lastUserTurn, lastAiTurn) {
  const combined = `${currentContext || ""}\nUser: ${lastUserTurn}\nAI: ${lastAiTurn}`.trim();
  return LeanContextCompressor.patternCompress(combined, 300);
}

function buildOperatorPlannerHistoryContext(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return "";
  }
  return history.map(turn => {
    const role = turn.role === "user" ? "User" : "Assistant";
    return `${role}: ${turn.content}`;
  }).join("\n---\n");
}

async function buildOperatorPlannerGroundingContext(inputText, options = {}) {
  const sections = [];
  const root = options.root ?? process.cwd();
  const lower = inputText.toLowerCase();

  // Evaluative/Bootstrap Intent (Audit, Health, Quality, Mess, Regression)
  if (/\b(how is|audit|health|quality|metrics|checks?|status|doing|ready|readiness|mess|regression|broken)\b/i.test(lower)) {
    const status = await resolveProjectStatus({ projectRoot: root, selector: ".", includeRelated: true }).catch(() => null);
    if (status?.ok) {
      sections.push(`### Project Health / Status\n${status.title}\n${status.summary}\nActive Tickets: ${status.evidence?.filter(e => e.includes("ticket")).length ?? 0}`);
    }
    const metrics = await getProjectMetrics({ projectRoot: root }).catch(() => null);
    if (metrics) {
      sections.push(`### Performance Metrics\n- Success Rate: ${metrics.successRate}%\n- Avg Latency: ${metrics.avgLatencyMs}ms\n- Total Calls: ${metrics.totalCalls}`);
    }
  }

  // Workplan/Focus Intent (Next steps, Planning, Roadmap, Focus)
  if (/\b(plan|start|next|roadmap|todo|working on|tackle|sequence|order|focus|workplan)\b/i.test(lower)) {
    const summary = await getProjectSummary({ projectRoot: root }).catch(() => null);
    if (summary) {
      const topTickets = summary.activeTickets.slice(0, 5).map(t => `- [${t.lane}] ${t.id}: ${t.title}`).join("\n");
      sections.push(`### Current Working Set\n${topTickets || "No active tickets."}`);
    }
  }

  // Fallback Grounding (Heuristic search)
  if (sections.length === 0 && inputText.length > 15) {
    const payload = await resolveProjectStatus({
      projectRoot: root,
      selector: ".",
      includeRelated: true,
      rawQuestion: true,
      relatedLimit: 3
    }).catch(() => null);
    
    if (payload?.ok) {
      sections.push(`### Project Context\n${payload.summary}`);
    }
  }

  return sections.filter(Boolean).join("\n\n");
}

function buildOperatorPlannerRuntimeContext(plannerContext = {}, options = {}) {
  const lines = [
    `cwd: ${options.root ?? process.cwd()}`,
    `project: ${plannerContext.projectSummary?.title ?? "unknown"}`
  ];
  return lines.join("\n");
}

function buildOperatorPlannerSchemaPrompt() {
  return [
    '{"kind":"plan","confidence":0.9,"workflowPrompt":"Create or move ticket, perform the work, verify it, and return { summary, changedFiles, verification }.","intent":{...}}',
    'Preferred field: "workflowPrompt". It must be concise natural-language instructions for @dharmax/text-compiler.',
    'Legacy compatibility: "code" may still be used for raw async JS when needed, but prefer "workflowPrompt".',
    'Available capabilities you may reference in the workflow prompt:',
    '- ticketing and workflow state: syncProject, getProjectSummary, getActiveTickets, createTicket, updateTicketLifecycle, assess',
    '- repo introspection: resolveProjectStatus, getSmartProjectStatus, files.list, files.read',
    '- mutation: files.write, orchestrator.executeTicket, orchestrator.decomposeTicket, orchestrator.ideateFeature, orchestrator.sweepBugs',
    '- execution: shell.execute, sh.execute, codelets.execute',
    'Guardrails to express in the workflow prompt:',
    '- create or update a ticket before mutating files or git state',
    '- assess core/ or cli/ changes before editing them',
    '- verify the result and return `{ summary, changedFiles, verification }` for coding flows',
    'Simple replies: use kind:"reply" and omit both "workflowPrompt" and "code".'
  ].join("\n");
}
function buildActionCatalog(plannerContext = {}) {
  const baseActions = [
    "sync", "status_query", "doctor", "execute_ticket", "decompose_ticket", "ideate_feature", "sweep_bugs"
  ];
  return `Valid actions: ${baseActions.join(", ")}`;
}

async function buildGroundedOperatorReply(inputText, options = {}) {
  const groundedProviderReply = await buildGroundedProviderReply(inputText, options);
  if (groundedProviderReply) {
    return groundedProviderReply;
  }

  if (!looksLikeRepoExplainerQuestion(inputText)) {
    return null;
  }

  const normalized = normalizeConversationText(inputText);
  if (/\bprojection(?:s)?\b/.test(normalized)) {
    return {
      kind: "reply",
      confidence: 0.86,
      assistantReply: [
        "The projections service lives in core/services/projections.js.",
        "It turns workflow DB state into operator-facing summaries and files, including the project summary, kanban projection, epics projection, and projection writes back to disk.",
        "Evidence: buildProjectSummary, renderKanbanProjection, renderEpicsProjection, and writeProjectProjections are defined there."
      ].join("\n"),
      reason: "Grounded projections-service reply."
    };
  }

  const plannerContext = options.plannerContext ?? {};
  const moduleMatches = findGroundingModuleMatches(inputText, plannerContext);
  const selectors = extractGroundingSelectors(inputText, plannerContext);
  const root = options.root ?? process.cwd();

  for (const selector of selectors.slice(0, 4)) {
    const payload = await resolveProjectStatus({
      projectRoot: root,
      selector,
      includeRelated: true,
      rawQuestion: true,
      relatedLimit: 8
    }).catch(() => null);
    if (!payload?.ok) {
      continue;
    }
    return {
      kind: "reply",
      confidence: 0.8,
      assistantReply: renderGroundedOperatorReply(payload, moduleMatches),
      reason: "Grounded repo explainer reply."
    };
  }

  if (moduleMatches.length) {
    const top = moduleMatches[0];
    return {
      kind: "reply",
      confidence: 0.74,
      assistantReply: `${top.name} is the most likely match here. ${top.responsibility ?? "It is a tracked repo module."}`,
      reason: "Module-match explainer reply."
    };
  }

  return null;
}

async function buildGroundedProviderReply(inputText, options = {}) {
  if (!looksLikeProviderStatusQuestion(inputText, options?.plannerContext?.providerState?.providers ?? {})) {
    return null;
  }

  const root = options.root ?? process.cwd();
  const providerState = options?.plannerContext?.providerState ?? await discoverProviderState({ root }).catch(() => null);
  const providers = providerState?.providers ?? {};
  const mentionedProviders = findMentionedProviders(inputText, providers);
  const targets = mentionedProviders.length
    ? mentionedProviders.filter((providerId) => providers[providerId])
    : Object.keys(providers);

  if (!targets.length) {
    return {
      kind: "reply",
      confidence: 0.75,
      assistantReply: "I could not find any connected provider state in this environment.",
      reason: "Grounded provider-status reply."
    };
  }

  const lines = targets.length === 1
    ? [`${formatProviderDisplayName(targets[0])} status: ${renderGroundedProviderLine(targets[0], providers[targets[0]])}`]
    : [
      "AI providers:",
      ...targets.map((providerId) => `- ${renderGroundedProviderLine(providerId, providers[providerId])}`)
    ];

  return {
    kind: "reply",
    confidence: 0.88,
    assistantReply: lines.join("\n"),
    reason: "Grounded provider-status reply."
  };
}

async function buildGroundedOperatorBriefReply(inputText, options = {}) {
  if (!looksLikeOperatorBriefQuestion(inputText)) {
    return null;
  }

  const root = options.root ?? process.cwd();
  const [summary, metrics] = await Promise.all([
    getProjectSummary({ projectRoot: root }).catch(() => null),
    getProjectMetrics({ projectRoot: root }).catch(() => null)
  ]);

  const activeTickets = Array.isArray(summary?.activeTickets) ? summary.activeTickets : [];
  const inProgress = activeTickets.filter((ticket) => String(ticket?.lane ?? "").toLowerCase() === "in progress");
  const todo = activeTickets.filter((ticket) => String(ticket?.lane ?? "").toLowerCase() === "todo");
  const focusTicket = inProgress[0] ?? todo[0] ?? activeTickets[0] ?? null;

  const lines = ["Current workflow state:"];
  if (focusTicket) {
    lines.push(`- Focus ticket: ${focusTicket.id} [${focusTicket.lane}] ${focusTicket.title}`);
  } else {
    lines.push("- Focus ticket: none currently active.");
  }
  lines.push(`- Active tickets: ${activeTickets.length}`);
  if (metrics && Number.isFinite(metrics.successRate)) {
    lines.push(`- Recent automation success rate: ${metrics.successRate}% across ${metrics.totalCalls ?? 0} recorded calls.`);
  }

  if (focusTicket) {
    lines.push("");
    lines.push(`Recommendation: finish ${focusTicket.id} before starting new work.`);
    lines.push(`Why: it is already in the active queue, and closing the current operator-surface acceptance work will reduce workflow noise faster than opening another branch of work.`);
  } else {
    lines.push("");
    lines.push("Recommendation: sync the project and create the next concrete ticket before executing more work.");
    lines.push("Why: the workflow state does not currently expose an active ticket, so the next useful move is to establish a tracked focus item.");
  }

  if (todo.length) {
    lines.push(`Queued next: ${todo.slice(0, 2).map((ticket) => `${ticket.id} ${ticket.title}`).join("; ")}.`);
  }

  return {
    kind: "reply",
    confidence: 0.84,
    assistantReply: lines.join("\n"),
    reason: "Grounded operator brief reply."
  };
}

function normalizeConversationText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[?!.,;:()\[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeOperatorBriefQuestion(inputText) {
  const normalized = normalizeConversationText(inputText);
  return /\b(operator brief|workflow state|current workflow state)\b/.test(normalized)
    || (/\bbrief\b/.test(normalized) && /\bworkflow\b/.test(normalized))
    || (/\brecommendation\b/.test(normalized) && /\bworkflow\b/.test(normalized));
}

function looksLikeRepoExplainerQuestion(inputText) {
  const normalized = normalizeConversationText(inputText);
  if (!/\b(what is|whats|what are|explain|describe|tell me about|teach me about)\b/.test(normalized)) {
    return false;
  }
  // Do not preempt if it looks like an action request
  if (/\b(add|create|new|implement|fix|repair|resolve|run|execute|mutate|start)\b/.test(normalized)) {
    return false;
  }
  return /\b(service|module|modules|projection|projections|router|shell|sync|status|ticket|workflow|context|provider|planner|codelet|claim|claims)\b/.test(normalized)
    || /\bwhat are those\b/.test(normalized);
}

function looksLikeProviderStatusQuestion(inputText, providerMap = {}) {
  const normalized = normalizeConversationText(inputText);
  const simpleProviderStatusRequest = (
    /\b(?:what|which|show|list)\b.*\b(?:ai\s+)?providers?\b/.test(normalized)
      || /\bproviders?\b.*\b(?:connected|configured|available|active|status|looking|doing|healthy|health)\b/.test(normalized)
  ) && !/\b(inspect|investigate|debug|diagnose|deep|deeply|why|fix|repair|resolve|trace)\b/.test(normalized);

  if (simpleProviderStatusRequest) {
    return true;
  }

  return textMentionsKnownProvider(inputText, providerMap)
    && /\b(what about|how about|status|health|healthy|configured|connected|available|working|broken|failing|routeable)\b/.test(normalized);
}

function listKnownProviderAliases(providerMap = {}) {
  return Array.from(new Set([
    ...Object.keys(providerMap ?? {}).map((key) => String(key).trim().toLowerCase()).filter(Boolean),
    "ollama",
    "openai",
    "google",
    "gemini",
    "anthropic"
  ]));
}

function textMentionsKnownProvider(inputText, providerMap = {}) {
  const normalized = normalizeConversationText(inputText);
  return listKnownProviderAliases(providerMap).some((providerId) => new RegExp(`\\b${escapeRegExp(providerId)}\\b`, "i").test(normalized));
}

function canonicalizeProviderAlias(providerId) {
  if (providerId === "gemini") {
    return "google";
  }
  return providerId;
}

function findMentionedProviders(inputText, providerMap = {}) {
  const normalized = normalizeConversationText(inputText);
  return listKnownProviderAliases(providerMap)
    .filter((providerId) => new RegExp(`\\b${escapeRegExp(providerId)}\\b`, "i").test(normalized))
    .map((providerId) => canonicalizeProviderAlias(providerId))
    .filter((providerId, index, items) => items.indexOf(providerId) === index);
}

function formatProviderDisplayName(providerId) {
  if (providerId === "ollama") return "Ollama";
  if (providerId === "openai") return "OpenAI";
  if (providerId === "google") return "Google/Gemini";
  if (providerId === "anthropic") return "Anthropic";
  return providerId;
}

function renderGroundedProviderLine(providerId, provider = {}) {
  const parts = [providerId];
  if (provider.local) {
    parts.push(provider.available ? "available" : "unavailable");
    if (provider.host) {
      parts.push(`host ${provider.host}`);
    }
    if (Array.isArray(provider.models) && provider.models.length) {
      parts.push(`${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`);
    }
    if (provider.details && !provider.available) {
      parts.push(String(provider.details));
    }
  } else {
    parts.push(provider.configured ? "configured" : (provider.available ? "available via env" : "not configured"));
    parts.push(provider.available ? "routeable" : "not routeable");
    if (provider.paidAllowed === false) {
      parts.push("paid disabled");
    }
  }
  return parts.join(", ");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPlannerModules(plannerContext = {}) {
  return [
    ...(Array.isArray(plannerContext?.summary?.modules) ? plannerContext.summary.modules : []),
    ...(Array.isArray(plannerContext?.projectSummary?.modules) ? plannerContext.projectSummary.modules : [])
  ];
}

function extractGroundingSelectors(inputText, plannerContext = {}) {
  const text = String(inputText ?? "").trim();
  const normalized = normalizeConversationText(text);
  const selectors = new Set();
  if (text) {
    selectors.add(text);
  }

  const quoted = text.match(/["'`](.+?)["'`]/g) ?? [];
  for (const match of quoted) {
    const unwrapped = match.slice(1, -1).trim();
    if (unwrapped) {
      selectors.add(unwrapped);
    }
  }

  const simplified = normalized
    .replace(/\b(what is|whats|what are|explain|describe|tell me about|teach me about|what are those)\b/g, " ")
    .replace(/\b(the|those|this|current|service|module|modules|thing|system|component)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (simplified) {
    selectors.add(simplified);
  }

  for (const module of getPlannerModules(plannerContext)) {
    const name = String(module?.name ?? "").trim();
    if (!name) {
      continue;
    }
    const tail = name.split("/").filter(Boolean).at(-1) ?? name;
    if (normalized.includes(tail.toLowerCase())) {
      selectors.add(name);
      selectors.add(tail);
    }
  }

  return [...selectors].filter(Boolean);
}

function findGroundingModuleMatches(inputText, plannerContext = {}) {
  const normalized = normalizeConversationText(inputText);
  return getPlannerModules(plannerContext).filter((item) => {
    const name = String(item?.name ?? "").trim().toLowerCase();
    if (!name) {
      return false;
    }
    const tail = name.split("/").filter(Boolean).at(-1) ?? name;
    return normalized.includes(tail) || normalized.includes(name.replace(/[^a-z0-9/_:-]+/g, " "));
  });
}

function renderGroundedOperatorReply(payload, moduleMatches = []) {
  const lines = [];
  const matchingModule = moduleMatches.find((item) => String(item?.name ?? "") === String(payload?.title ?? ""))
    ?? moduleMatches.find((item) => String(payload?.title ?? "").includes(String(item?.name ?? "").split("/").filter(Boolean).at(-1) ?? ""));
  if (matchingModule?.responsibility) {
    lines.push(`${matchingModule.name} is the relevant service here. ${matchingModule.responsibility}`);
  } else {
    lines.push(`${payload.title} is the relevant ${payload.type} here.`);
  }
  if (payload.summary && payload.summary !== "Tracked module.") {
    lines.push(payload.summary);
  }
  if (payload.related?.length) {
    lines.push(`Related: ${payload.related.slice(0, 4).map((item) => `${item.title} [${item.type}]`).join(", ")}`);
  }
  if (payload.evidence?.length) {
    lines.push(`Evidence: ${payload.evidence.slice(0, 3).join(" | ")}`);
  }
  return lines.join("\n");
}

function normalizePlannerResponse(plan) {
  if (!plan || typeof plan !== "object") {
    return plan;
  }

  if (plan.kind === "reply" && !plan.assistantReply) {
    const assistantReply = [
      plan.reply,
      plan.content,
      plan.message,
      plan.summary
    ].find((value) => typeof value === "string" && value.trim());
    if (assistantReply) {
      return {
        ...plan,
        assistantReply
      };
    }
  }

  return plan;
}

function validateGeneratedPlan(plan, options = {}) {
  if (!plan || plan.kind !== "plan") {
    return;
  }

  if (typeof plan.workflowPrompt === "string" && plan.workflowPrompt.trim()) {
    return;
  }

  if (typeof plan.code !== "string" || !plan.code.trim()) {
    return;
  }

  if (options.skipGuardrails) {
    return;
  }
  const trimmedCode = plan.code
    .trim()
    .replace(/^```javascript/, "")
    .replace(/^```js/, "")
    .replace(/^```/, "")
    .replace(/```$/, "");
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  try {
    if (trimmedCode.startsWith("async") || trimmedCode.startsWith("function")) {
      // Parse function-style plans without executing them.
      Function(`return (${trimmedCode});`)();
    } else {
      new AsyncFunction(trimmedCode);
    }
  } catch (error) {
    throw new Error(`generated JS failed syntax validation: ${error?.message ?? error}`);
  }

  if (/\brequire\s*\(/.test(trimmedCode)) {
    throw new Error("generated JS failed validation: 'require()' is forbidden in this ESM environment. Use dynamic 'await import()'.");
  }

  // Guardrail: Ticket Prerequisite for Mutations
  if (/\bfiles\.write\s*\(/.test(trimmedCode) || /\bsh\.execute\s*\(\s*['"`]git\b/.test(trimmedCode)) {
    const hasTicketCall = /\bsync\.createTicket\s*\(/.test(trimmedCode) || /\bsync\.updateTicketLifecycle\s*\(/.test(trimmedCode);
    if (!hasTicketCall) {
      throw new Error("generated JS failed validation: Any code that modifies files or git state MUST first create or update a ticket via 'sync.createTicket' or 'sync.updateTicketLifecycle'.");
    }
  }

  // Guardrail: Safety for Core modifications
  if (/\bfiles\.write\s*\(\s*['"`](?:core|cli)\//.test(trimmedCode)) {
    const hasAssessment = /\bsync\.assess\s*\(/.test(trimmedCode);
    if (!hasAssessment) {
       throw new Error("generated JS failed validation: Modifying core system files (core/ or cli/) requires a preceding 'await sync.assess(target, { scope: \"architecture\" })' call to ensure systemic integrity.");
    }
  }

  // Guardrail: Enforce recursive mkdir
  if (/\bmkdir\s*\(\s*[^,)]+\s*\)/.test(trimmedCode) && !/\brecursive:\s*true/.test(trimmedCode)) {
    throw new Error("generated JS failed validation: Any 'mkdir' call MUST include '{ recursive: true }' to ensure idempotency and prevent crashes if the directory already exists.");
  }

  const reservedHelpers = [
    "files",
    "sync",
    "status",
    "orchestrator",
    "sh",
    "codelets",
    "step",
    "transition",
    "shell",
    "exec",
    "executeCodelet",
    "getState",
    "setState",
    "services",
    "db"
  ];
  for (const helper of reservedHelpers) {
    const redeclarePattern = new RegExp(`\\b(?:const|let|var|function|class)\\s+${helper}\\b`);
    if (redeclarePattern.test(trimmedCode)) {
      throw new Error(`generated JS redeclared reserved helper: ${helper}`);
    }
  }
}

/**
 * Resolves a host request (e.g. from the 'ask' surface).
 */
export async function resolveHostRequest(options) {
  const { projectRoot, text, host } = options;
  const deterministic = await resolveDeterministicHostRequest({
    projectRoot,
    text,
    continuationState: options.continuationState ?? null,
    host
  });
  if (deterministic?.route?.intent && deterministic.route.intent !== "broad_project_question") {
    return deterministic;
  }

  const normalized = String(text ?? "").toLowerCase();

  if (/\b(beta|readiness|ready for beta|beta testing)\b/.test(normalized)) {
    const readiness = await evaluateProjectReadiness({
      projectRoot,
      request: {
        protocol_version: "1.0",
        operation: "evaluate_readiness",
        goal: {
          type: "beta-readiness",
          target: "project",
          question: text
        },
        host
      }
    });
    const readinessPayload = { ...readiness, operation: "evaluate_readiness" };
    if (/\b(project status|status of the project|how is the project|project state)\b/.test(normalized)) {
      const summary = await getProjectSummary({ projectRoot });
      return {
        status: "complete",
        route: { intent: "project_status_readiness", operation: "composite", reason: "Combined status/readiness request." },
        response_type: "composite",
        payload: {
          project_status: {
            active_ticket_count: summary.activeTickets?.length ?? 0,
            candidate_count: summary.candidateCount ?? 0,
            note_count: summary.noteCount ?? 0,
            focus_tickets: summary.activeTickets ?? []
          },
          readiness: readinessPayload
        }
      };
    }
    return {
      status: "complete",
      route: { intent: "readiness_question", operation: "evaluate_readiness", reason: "Readiness request routed deterministically." },
      response_type: "protocol",
      payload: readinessPayload
    };
  }

  if (/\b(current work|working on|what should i work on|in progress)\b/.test(normalized)) {
    const summary = await getProjectSummary({ projectRoot });
    const activeTickets = Array.isArray(summary.activeTickets) ? summary.activeTickets : [];
    const focusTickets = activeTickets
      .filter((ticket) => /in progress/i.test(String(ticket.lane ?? "")))
      .concat(activeTickets.filter((ticket) => !/in progress/i.test(String(ticket.lane ?? ""))))
      .slice(0, 5);
    const answer = focusTickets.length
      ? `Current work: ${focusTickets.map((ticket) => `${ticket.id}: ${ticket.title}`).join("; ")}.`
      : "No active current work is visible in the workflow summary.";
    return {
      status: "complete",
      route: { intent: "current_work", operation: "project_summary", reason: "Current-work request routed to project summary." },
      response_type: "summary",
      payload: {
        summary: `${activeTickets.length} active tickets.`,
        answer,
        focus_tickets: focusTickets
      }
    };
  }
  
  // Reuse the execution logic
  const result = await executeOperatorRequest(text, {
    root: projectRoot,
    host
  });

  // Map result back to host-resolver format for compatibility
  return {
    status: result.ok ? "complete" : "failed",
    route: {
      intent: result.plan?.intent?.capability ?? "operator_request",
      operation: "operator_brain",
      reason: result.plan?.reason ?? "Handled by shared operator brain."
    },
    response_type: "reply",
    payload: {
      summary: result.assistantReply,
      answer: result.assistantReply,
      workflowResult: result.workflowResult
    }
  };
}

function buildOperatorServices(root, options) {
  return {
    sync: {
      syncProject: (args) => syncProject({ projectRoot: root, ...args }),
      getProjectSummary: (args) => getProjectSummary({ projectRoot: root, ...args }),
      getActiveTickets: (args) => getActiveTickets({ projectRoot: root, ...args }),
      listActiveTickets: (args) => getActiveTickets({ projectRoot: root, ...args }),
      getProjectMetrics: (args) => getProjectMetrics({ projectRoot: root, ...args }),
      createTicket: (title, data = {}) => {
        const id = data.id ?? buildReadableAutoTicketId(title);
        const entity = buildTicketEntity({ id, title, ...data });
        return createTicket({ projectRoot: root, entity });
      },
      updateTicketLifecycle: (args) => updateTicketLifecycle({ projectRoot: root, ...args }),
      listEpics: (args) => listEpics({ projectRoot: root, ...args }),
      getEpic: (args) => getEpic({ projectRoot: root, ...args }),
      assess: (target, opts = {}) => runAssessment(target, { root, planner: options.planner, ...opts }),
    },
    status: {
      resolveProjectStatus: (args) => resolveProjectStatus({ projectRoot: root, ...args }),
      getSmartProjectStatus: (args) => getSmartProjectStatus({ projectRoot: root, ...args }),
    },
    files: {
      list: (args = {}) => collectProjectFiles(root, args),
      read: (relativePath) => readProjectFile(root, relativePath),
      write: (relativePath, content) => writeProjectFile(root, relativePath, content)
    },
    // Item: Pre-injected Node.js globals for reliability
    fs,
    path: pathMod,
    orchestrator: {
      executeTicket: (args) => executeTicket({ root, ...args }),
      decomposeTicket: (args) => decomposeTicket({ root, ...args }),
      ideateFeature: (title, summary, data = {}) => ideateFeature({ root, title, summary, ...data }),
      sweepBugs: (args) => sweepBugs({ root, ...args }),
    },
    codelets: {
      execute: async (id, args) => {
        const codelet = await resolveExecutableCodelet(root, id);
        return executeCodelet(codelet, args, { cwd: root });
      },
    },
    shell: {
      execute: (prompt, opts) => executeOperatorRequest(prompt, { ...options, traceAi: options.traceAi, trace: options.trace, ...opts }),
    },
    sh: {
      execute: async (command, args = []) => {
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);
        
        // Item: Shell Safety - ensure arguments with spaces are handled correctly
        // When shell:true is used, we need to be careful with concatenation.
        // For git commit specifically, ensure the message is treated as a single arg.
        const { stdout, stderr } = await execFileAsync(command, args, { cwd: root, shell: false });
        return { stdout: stdout.trim(), stderr: stderr.trim(), ok: true };
      }
    }
  };
}

function buildReadableAutoTicketId(title) {
  const slug = String(title ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "UNTITLED";
  return `TKT-AUTO-${slug}-${Date.now().toString(36).toUpperCase()}`;
}

async function resolveExecutableCodelet(root, codeletOrId) {
  if (codeletOrId && typeof codeletOrId === "object") {
    return codeletOrId;
  }

  const codeletId = String(codeletOrId ?? "").trim();
  if (!codeletId) {
    throw new Error("Missing codelet id.");
  }

  const codelet = await getCodelet({ projectRoot: root, codeletId });
  if (!codelet) {
    throw new Error(`Unknown codelet: ${codeletId}`);
  }

  return codelet;
}
