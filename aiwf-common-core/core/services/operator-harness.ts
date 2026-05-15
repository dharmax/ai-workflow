/**
 * Responsibility: Normalize operator requests and build one shared harness plan across shell/ask surfaces.
 * Scope: Request classification, structured context packing, workflow-program planning, redaction, and trace metadata.
 */

import { getRelevantGuidelineBlocks } from "./guidelines.ts";
import { getProjectMetrics, getProjectSummary, withWorkflowStore } from "./sync.ts";
import { listCodeletsFromStore } from "./codelets.ts";
import { discoverProviderState } from "./providers.ts";
import { resolveProjectStatus } from "./status.ts";
import path from "node:path";

export interface NormalizedOperatorRequest {
  surface: string;
  explicitPrimitive: string | null;
  requestKind: string;
  taskClass: string;
  taskClassReason: string;
  taskClassHint: string | null;
  workMode: string;
  subject: string;
  goals: string[];
  mutationIntent: "read-only" | "may-mutate" | "must-mutate";
  continuation: string | null;
  needsRepoContext: boolean;
  successContract: string[];
  responsePolicy: {
    format: string;
    style: string;
    includeEvidence: boolean;
    includePlan: boolean;
    includeGapMap: boolean;
  };
}

export interface ExecutionStepSpec {
  id: string;
  title: string;
  kind: string;
  mutation: "none" | "allowed" | "required";
  evidence: string[];
}

export interface ExecutionProgram {
  programKind: "direct-primitive" | "analysis-plan" | "ticket-execution" | "repo-investigation" | "feature-implementation";
  steps: ExecutionStepSpec[];
  allowedMutations: "none" | "limited" | "required";
  requiredEvidence: string[];
  verificationPlan: string[];
  fallbackPolicy: string;
  replyPolicy: {
    style: string;
    format: string;
    includeEvidence: boolean;
    includePlan: boolean;
    includeGapMap: boolean;
  };
}

export interface CodeletStepContract {
  inputSchema: any;
  outputSchema: any;
  contextPolicy: string | null;
  toolPolicy: string | null;
  graderId: string | null;
  maxRetries: number;
  canMutate: boolean;
}

export interface HarnessTraceRecord {
  normalizedRequest: NormalizedOperatorRequest;
  programKind: ExecutionProgram["programKind"];
  selectedSteps: string[];
  degradedPath: boolean;
  providerModel: string | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  redactionsApplied: string[];
}

export async function normalizeOperatorRequest(inputText: string, options: {
  surface?: string;
  plannerContext?: any;
  continuationState?: any;
} = {}): Promise<NormalizedOperatorRequest> {
  const text = String(inputText ?? "").trim();
  const lower = text.toLowerCase();
  const explicitPrimitive = extractExplicitPrimitive(text);
  const goals = splitGoals(text);
  const taskClassHint = inferProgramKind(text, goals);
  const requestKind = explicitPrimitive
    ? "direct-primitive"
    : (taskClassHint || looksLikeWorkflowProgram(text))
      ? "workflow-program"
      : "grounded-reply";
  const taskClass = explicitPrimitive
    ? "shell-primitive"
    : taskClassHint === "analysis-plan"
      ? "project-planning"
      : taskClassHint === "repo-investigation"
        ? "review"
        : taskClassHint === "feature-implementation"
          ? "code-generation"
          : "task-decomposition";

  return {
    surface: options.surface ?? "operator",
    explicitPrimitive,
    requestKind,
    taskClass,
    taskClassReason: explicitPrimitive
      ? "Explicit deterministic primitive detected."
      : taskClassHint
        ? `Matched shared harness workflow shape: ${taskClassHint}.`
        : "Defaulted to shared operator workflow planning.",
    taskClassHint,
    workMode: inferWorkMode(text, explicitPrimitive),
    subject: inferSubject(text),
    goals,
    mutationIntent: inferMutationIntent(text),
    continuation: options.continuationState ? "continue-prior-work" : null,
    needsRepoContext: !explicitPrimitive,
    successContract: inferSuccessContract(text, taskClassHint),
    responsePolicy: {
      format: /\bjson\b/i.test(text) ? "json" : "markdown",
      style: /\bconcise|brief\b/i.test(lower) ? "concise" : "structured",
      includeEvidence: true,
      includePlan: /\bplan\b/i.test(lower) || !explicitPrimitive,
      includeGapMap: /\bgap|missing|blocker|current state\b/i.test(lower)
    }
  };
}

export async function buildHarnessContextPack(root: string, options: {
  normalizedRequest: NormalizedOperatorRequest;
  plannerContext?: any;
}): Promise<any> {
  const { normalizedRequest, plannerContext = {} } = options;
  const [summary, metrics, providerState, status] = await Promise.all([
    getProjectSummary({ projectRoot: root }).catch(() => null),
    getProjectMetrics({ projectRoot: root }).catch(() => null),
    discoverProviderState({ root, forceRefresh: false }).catch(() => null),
    resolveProjectStatus({ projectRoot: root, selector: ".", includeRelated: true, rawQuestion: true, relatedLimit: 8 }).catch(() => null)
  ]);

  const relevantTargets = await collectRelevantTargets(root, normalizedRequest, plannerContext);

  return withWorkflowStore(root, async (store) => {
    const [guidelineBlocks, codelets] = await Promise.all([
      getRelevantGuidelineBlocks(store, {
        inputText: normalizedRequest.goals.join(" "),
        categories: normalizedRequest.taskClassHint === "feature-implementation" ? ["coding", "process"] : []
      }).catch(() => []),
      listCodeletsFromStore(store).catch(() => [])
    ]);

    return {
      request: normalizedRequest,
      runtime: {
        root,
        surface: normalizedRequest.surface,
        workMode: normalizedRequest.workMode
      },
      currentState: {
        statusTitle: status?.title ?? null,
        statusSummary: status?.summary ?? null,
        activeTickets: summary?.activeTickets ?? plannerContext?.summary?.activeTickets ?? [],
        modules: summary?.modules ?? plannerContext?.summary?.modules ?? [],
        metrics: metrics ?? null
      },
      relevantTargets,
      guardrails: guidelineBlocks
        .slice(0, 6)
        .map((block) => `${block.title}: ${String(block.body ?? "").trim().split(/\r?\n/)[0]}`),
      guidelines: guidelineBlocks.slice(0, 8).map((block) => ({
        title: block.title,
        category: block.category,
        body: String(block.body ?? "").trim()
      })),
      codelets: codelets.slice(0, 20).map((codelet) => ({
        id: codelet.id,
        summary: codelet.summary ?? codelet.data?.summary ?? "",
        category: codelet.category ?? codelet.data?.category ?? null,
        safetyClass: codelet.data?.canMutate ? "mutating" : "read-only"
      })),
      providerAvailability: redactSensitiveObject(providerState),
      continuationState: normalizedRequest.continuation,
      responsePolicy: normalizedRequest.responsePolicy
    };
  });
}

export function planExecutionProgram(normalizedRequest: NormalizedOperatorRequest): ExecutionProgram {
  const programKind = explicitOrDerivedProgramKind(normalizedRequest);
  if (programKind === "direct-primitive") {
    return {
      programKind,
      steps: [],
      allowedMutations: normalizedRequest.mutationIntent === "read-only" ? "none" : "limited",
      requiredEvidence: [],
      verificationPlan: [],
      fallbackPolicy: "Use the deterministic host/shell primitive directly.",
      replyPolicy: normalizedRequest.responsePolicy
    };
  }

  if (programKind === "analysis-plan") {
    return {
      programKind,
      steps: [
        { id: "inspect-state", title: "Inspect workflow state", kind: "status", mutation: "none", evidence: ["current state", "active tickets", "metrics"] },
        { id: "inspect-harness", title: "Inspect harness surfaces", kind: "repo-read", mutation: "none", evidence: ["relevant modules", "planner/compiler surfaces"] },
        { id: "gap-map", title: "Produce gap map", kind: "analysis", mutation: "none", evidence: ["misroutes", "missing context", "coverage gaps"] },
        { id: "implementation-plan", title: "Produce implementation plan", kind: "plan", mutation: "none", evidence: ["sequenced changes", "verification plan"] }
      ],
      allowedMutations: "none",
      requiredEvidence: ["workflow state", "relevant files", "tests or verification surfaces"],
      verificationPlan: ["Summarize current state.", "List concrete gaps.", "End with an implementation plan."],
      fallbackPolicy: "If a targeted code search is weak, say so and keep the answer evidence-backed.",
      replyPolicy: normalizedRequest.responsePolicy
    };
  }

  if (programKind === "repo-investigation") {
    return {
      programKind,
      steps: [
        { id: "inspect-state", title: "Inspect workflow state", kind: "status", mutation: "none", evidence: ["status summary"] },
        { id: "inspect-targets", title: "Inspect relevant modules and tests", kind: "repo-read", mutation: "none", evidence: ["module matches", "test surfaces"] },
        { id: "summarize-findings", title: "Summarize evidence-backed findings", kind: "analysis", mutation: "none", evidence: ["findings", "risks", "next steps"] }
      ],
      allowedMutations: "none",
      requiredEvidence: ["workflow state", "repo evidence"],
      verificationPlan: ["Cite concrete files or modules in the final reply."],
      fallbackPolicy: "If evidence is weak, keep the scope narrow and say what is missing.",
      replyPolicy: normalizedRequest.responsePolicy
    };
  }

  if (programKind === "ticket-execution") {
    return {
      programKind,
      steps: [
        { id: "select-ticket", title: "Select workflow ticket", kind: "ticket", mutation: "none", evidence: ["ticket selection"] },
        { id: "perform-work", title: "Perform requested work", kind: "execution", mutation: "required", evidence: ["changes made"] },
        { id: "verify", title: "Verify outcome", kind: "verification", mutation: "none", evidence: ["tests", "status checks"] }
      ],
      allowedMutations: "required",
      requiredEvidence: ["ticket evidence", "verification output"],
      verificationPlan: ["Run targeted verification and report outcomes honestly."],
      fallbackPolicy: "If no safe ticket exists, stop and explain the blocker.",
      replyPolicy: normalizedRequest.responsePolicy
    };
  }

  return {
    programKind,
    steps: [
      { id: "inspect-state", title: "Inspect current state", kind: "status", mutation: "none", evidence: ["workflow state"] },
      { id: "implement", title: "Implement the requested feature or build flow", kind: "execution", mutation: "required", evidence: ["changed files", "artifacts"] },
      { id: "verify", title: "Verify the result", kind: "verification", mutation: "none", evidence: ["tests", "build output", "artifact checks"] }
    ],
    allowedMutations: "required",
    requiredEvidence: ["current state", "changed files", "verification output"],
    verificationPlan: ["Verify the produced artifacts and summarize failures honestly."],
    fallbackPolicy: "If implementation is blocked, return the blocker and the highest-signal evidence collected.",
    replyPolicy: normalizedRequest.responsePolicy
  };
}

export function renderExecutionProgramReply(options: {
  normalizedRequest: NormalizedOperatorRequest;
  program: ExecutionProgram;
  contextPack: any;
}): string {
  const { normalizedRequest, program, contextPack } = options;
  const lines: string[] = [];
  const currentState = contextPack.currentState ?? {};
  const relevantTargets = Array.isArray(contextPack.relevantTargets) ? contextPack.relevantTargets : [];

  lines.push("Current state:");
  lines.push(`- Status: ${currentState.statusTitle ?? "unknown"}`);
  lines.push(`- Summary: ${currentState.statusSummary ?? "none"}`);
  const activeTickets = Array.isArray(currentState.activeTickets) ? currentState.activeTickets : [];
  if (activeTickets.length) {
    lines.push(`- Active tickets: ${activeTickets.slice(0, 4).map((ticket) => `${ticket.id} [${ticket.lane}] ${ticket.title}`).join("; ")}`);
  } else {
    lines.push("- Active tickets: none");
  }

  if (relevantTargets.length) {
    lines.push("");
    lines.push(program.programKind === "feature-implementation" ? "Relevant implementation targets:" : "Relevant graph-backed targets:");
    for (const target of relevantTargets.slice(0, 4)) {
      const fileList = extractTargetFiles(target, contextPack.runtime?.root).slice(0, 4);
      lines.push(`- ${target.title} [${target.type}]`);
      if (target.summary) {
        lines.push(`  ${target.summary}`);
      }
      if (fileList.length) {
        lines.push(`  Files: ${fileList.join(", ")}`);
      }
      if (Array.isArray(target.tests) && target.tests.length) {
        lines.push(`  Tests: ${target.tests.slice(0, 3).map((test: any) => test.title).join(", ")}`);
      }
    }
  }

  if (program.programKind === "analysis-plan" || program.programKind === "repo-investigation") {
    lines.push("");
    lines.push(program.programKind === "analysis-plan" ? "Gap map:" : "Findings:");
    for (const item of inferProgramFindings(program, relevantTargets, currentState)) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("");
  lines.push(program.programKind === "feature-implementation" ? "Execution plan:" : "Implementation plan:");
  for (const step of program.steps) {
    lines.push(`- ${step.title}: ${summarizeStep(step, relevantTargets)}`);
  }

  if (Array.isArray(program.verificationPlan) && program.verificationPlan.length) {
    lines.push("");
    lines.push("Verification:");
    for (const item of program.verificationPlan) {
      lines.push(`- ${item}`);
    }
  }

  if (normalizedRequest.responsePolicy.includeEvidence) {
    const evidenceLines = collectEvidenceLines(relevantTargets);
    if (evidenceLines.length) {
      lines.push("");
      lines.push("Evidence:");
      for (const item of evidenceLines.slice(0, 6)) {
        lines.push(`- ${item}`);
      }
    }
  }

  return lines.join("\n");
}

export function runExecutionProgram(options: {
  normalizedRequest: NormalizedOperatorRequest;
  program: ExecutionProgram;
  contextPack: any;
}): {
  kind: string;
  confidence: number;
  workflowPrompt: string | null;
  reason: string;
  strategy: string;
  intent: any;
  harnessTrace: HarnessTraceRecord;
} {
  const { normalizedRequest, program, contextPack } = options;
  const harnessTrace: HarnessTraceRecord = {
    normalizedRequest,
    programKind: program.programKind,
    selectedSteps: program.steps.map((step) => step.id),
    degradedPath: false,
    providerModel: null,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    latencyMs: 0,
    redactionsApplied: ["provider credentials"]
  };

  if (program.programKind === "direct-primitive") {
    return {
      kind: "plan",
      confidence: 0.99,
      workflowPrompt: null,
      reason: "Shared harness classified this as a deterministic primitive.",
      strategy: "Use the deterministic primitive path.",
      intent: {
        capability: "direct-primitive",
        requestKind: normalizedRequest.requestKind
      },
      harnessTrace
    };
  }

  const workflowPrompt = buildWorkflowPrompt(normalizedRequest, program, contextPack);
  return {
    kind: "plan",
    confidence: 0.93,
    workflowPrompt,
    reason: `Shared operator harness selected ${program.programKind}.`,
    strategy: `Run the ${program.programKind} workflow with explicit evidence and verification.`,
    intent: {
      capability: program.programKind,
      requestKind: normalizedRequest.requestKind,
      subject: normalizedRequest.subject
    },
    harnessTrace
  };
}

export function redactSensitiveObject(input: any): any {
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveObject(item));
  }
  if (!input || typeof input !== "object") {
    return input;
  }

  const output: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (/(api.?key|token|secret|password|authorization)/i.test(key)) {
      output[key] = value ? "[redacted]" : null;
      continue;
    }
    output[key] = redactSensitiveObject(value);
  }
  return output;
}

function buildWorkflowPrompt(
  normalizedRequest: NormalizedOperatorRequest,
  program: ExecutionProgram,
  contextPack: any
): string {
  const lines = [
    `Program kind: ${program.programKind}`,
    `Surface: ${normalizedRequest.surface}`,
    `Objective: ${normalizedRequest.subject}`,
    `Request goals: ${normalizedRequest.goals.join(" | ")}`,
    `Mutation intent: ${normalizedRequest.mutationIntent}`,
    "",
    "Current state:",
    `- Status: ${contextPack.currentState.statusTitle ?? "unknown"}`,
    `- Summary: ${contextPack.currentState.statusSummary ?? "none"}`,
    `- Active tickets: ${(contextPack.currentState.activeTickets ?? []).slice(0, 5).map((ticket) => `${ticket.id}: ${ticket.title}`).join("; ") || "none"}`,
    `- Modules: ${(contextPack.currentState.modules ?? []).slice(0, 5).map((module) => module.name ?? module.id ?? String(module)).join("; ") || "none"}`,
    "",
    "Relevant graph-backed targets:",
    ...formatWorkflowTargets(contextPack.relevantTargets, contextPack.runtime?.root),
    "",
    "Guardrails:",
    ...((contextPack.guardrails ?? []).length
      ? contextPack.guardrails.map((item) => `- ${item}`)
      : ["- Preserve the real objective.", "- Do not invent evidence.", "- Never expose credentials or internal secrets."]),
    "",
    "Execution steps:",
    ...program.steps.map((step, index) => `${index + 1}. ${step.title} [${step.kind}]`),
    "",
    "Evidence requirements:",
    ...program.requiredEvidence.map((item) => `- ${item}`),
    "",
    "Verification plan:",
    ...program.verificationPlan.map((item) => `- ${item}`),
    "",
    "Final reply policy:",
    `- format: ${program.replyPolicy.format}`,
    `- style: ${program.replyPolicy.style}`,
    `- include evidence: ${program.replyPolicy.includeEvidence ? "yes" : "no"}`,
    `- include gap map: ${program.replyPolicy.includeGapMap ? "yes" : "no"}`,
    `- include implementation plan: ${program.replyPolicy.includePlan ? "yes" : "no"}`,
    "",
    "Return a concise final object with at least: { summary, changedFiles, verification, evidence, plan }."
  ];
  return lines.join("\n");
}

async function collectRelevantTargets(root: string, request: NormalizedOperatorRequest, plannerContext: any) {
  const selectors = collectRequestSelectors(request, plannerContext);
  const seen = new Set<string>();
  const results = [];

  for (const selector of selectors) {
    const normalized = String(selector ?? "").trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    const payload = await resolveProjectStatus({
      projectRoot: root,
      selector: normalized,
      includeRelated: true,
      rawQuestion: true,
      relatedLimit: 8
    }).catch(() => null);
    if (payload?.ok) {
      results.push(payload);
    }
    if (results.length >= 4) {
      break;
    }
  }

  return dedupeTargetReports(results);
}

function collectRequestSelectors(request: NormalizedOperatorRequest, plannerContext: any) {
  const selectors = new Set<string>();
  selectors.add(request.subject);
  for (const goal of request.goals ?? []) {
    selectors.add(goal);
  }

  for (const match of request.subject.match(/\b(?:BUG|TKT|EPC|EPIC|REL|REF|MOD|FEAT)-[A-Z0-9-]+\b/gi) ?? []) {
    selectors.add(match.toUpperCase());
  }

  for (const module of plannerContext?.summary?.modules ?? []) {
    const moduleName = String(module?.name ?? "").trim();
    if (!moduleName) continue;
    const tail = moduleName.split("/").filter(Boolean).at(-1) ?? moduleName;
    const normalizedSubject = request.subject.toLowerCase();
    if (normalizedSubject.includes(tail.toLowerCase())) {
      selectors.add(moduleName);
      selectors.add(tail);
    }
  }

  const focusTicket = (plannerContext?.summary?.activeTickets ?? []).find((ticket: any) => String(ticket?.lane ?? "").toLowerCase() === "in progress");
  if (focusTicket?.id && request.taskClassHint === "feature-implementation") {
    selectors.add(String(focusTicket.id));
  }

  return [...selectors].filter(Boolean);
}

function dedupeTargetReports(reports: any[]) {
  const seen = new Set<string>();
  return reports.filter((report) => {
    const key = String(report?.id ?? report?.title ?? "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatWorkflowTargets(targets: any[], root: string | undefined) {
  if (!Array.isArray(targets) || !targets.length) {
    return ["- none resolved from the graph-backed status layer"];
  }
  return targets.slice(0, 4).map((target) => {
    const files = extractTargetFiles(target, root).slice(0, 3);
    const details = [
      `${target.title} [${target.type}]`,
      target.summary ? `summary: ${target.summary}` : null,
      files.length ? `files: ${files.join(", ")}` : null
    ].filter(Boolean);
    return `- ${details.join(" | ")}`;
  });
}

function extractTargetFiles(target: any, root: string | undefined) {
  const files = new Set<string>();
  for (const item of target?.related ?? []) {
    if (item?.type === "file" && item?.title) {
      files.add(root ? path.resolve(root, String(item.title)) : String(item.title));
    }
  }
  return [...files];
}

function inferProgramFindings(program: ExecutionProgram, relevantTargets: any[], currentState: any) {
  const findings: string[] = [];
  if (!relevantTargets.length) {
    findings.push("The graph-backed status layer did not resolve a precise target, so the answer scope is limited.");
  }
  if (!Array.isArray(currentState?.activeTickets) || !currentState.activeTickets.length) {
    findings.push("No active ticket context is visible, which weakens workflow-grounded implementation guidance.");
  }
  const failingOrUnknownTests = relevantTargets.some((target) => {
    const latest = target?.latestTestResult?.status;
    return latest && latest !== "pass";
  });
  if (failingOrUnknownTests) {
    findings.push("Verification evidence is incomplete or non-passing for at least one relevant target.");
  }
  if (program.programKind === "analysis-plan") {
    findings.push("The current operator path still needs deterministic graph-backed analysis before any compiler-dependent plan generation.");
  }
  if (program.programKind === "repo-investigation") {
    findings.push("The best grounded answer should stay tied to related files, tests, and workflow entities instead of free-form planner output.");
  }
  return findings.slice(0, 4);
}

function summarizeStep(step: ExecutionStepSpec, relevantTargets: any[]) {
  if (step.kind === "repo-read" && relevantTargets.length) {
    return `Inspect ${relevantTargets.slice(0, 3).map((target) => target.title).join(", ")} with linked files/tests.`;
  }
  if (step.kind === "verification" && relevantTargets.some((target) => Array.isArray(target?.tests) && target.tests.length)) {
    return "Use the linked tests and current workflow evidence to verify the result.";
  }
  return `${step.kind} with explicit evidence requirements.`;
}

function collectEvidenceLines(relevantTargets: any[]) {
  const lines: string[] = [];
  for (const target of relevantTargets) {
    for (const item of target?.evidence ?? []) {
      lines.push(`${target.title}: ${item}`);
    }
  }
  return [...new Set(lines)];
}

function extractExplicitPrimitive(text: string): string | null {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if ([
    "summary",
    "project summary",
    "status",
    "project status",
    "sync",
    "doctor",
    "version",
    "provider status",
    "providers",
    "metrics",
    "reprofile",
    "list tickets",
    "show tickets"
  ].includes(normalized)) {
    return normalized;
  }
  if (/^(ticket|search|run|route|config)\b/i.test(normalized)) {
    return normalized;
  }
  return null;
}

function splitGoals(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/\s+(?:and|then|while|plus)\s+|[.;]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function inferProgramKind(text: string, goals: string[]): ExecutionProgram["programKind"] | null {
  const lower = text.toLowerCase();
  const hasStrongAnalysisBundle =
    /\b(current state|gap map|implementation plan|reground|audit|analyze|analysis-plan|misroute|routing|plan-only)\b/.test(lower)
    && /\b(inspect|relevant code|relevant tests|harness|surface|workflow)\b/.test(lower);
  if (hasStrongAnalysisBundle) {
    return "analysis-plan";
  }
  if (/\b(investigate|inspect|review|look into)\b/.test(lower) && /\b(repo|code|files|modules|tests)\b/.test(lower)) {
    return "repo-investigation";
  }
  if (/\b(build|implement|scaffold|create|dogfood|feature|project|from scratch)\b/.test(lower) && /\b(verify|test|artifact|checklist|from scratch|modular|canvas)\b/.test(lower)) {
    return "feature-implementation";
  }
  return null;
}

function explicitOrDerivedProgramKind(request: NormalizedOperatorRequest): ExecutionProgram["programKind"] {
  return request.explicitPrimitive ? "direct-primitive" : (request.taskClassHint as ExecutionProgram["programKind"] | null) ?? "analysis-plan";
}

function looksLikeWorkflowProgram(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b(current state|gap map|implementation plan)\b/.test(lower) && /\b(inspect|audit|analyze|relevant code|relevant tests|harness|workflow)\b/.test(lower)) {
    return true;
  }
  if (/\b(build|implement|create|scaffold|dogfood|from scratch)\b/.test(lower) && /\b(verify|test|artifact|checklist|canvas|modular)\b/.test(lower)) {
    return true;
  }
  if (/\b(investigate|inspect|review)\b/.test(lower) && /\b(repo|code|files|modules|tests)\b/.test(lower)) {
    return true;
  }
  return false;
}

function inferWorkMode(text: string, explicitPrimitive: string | null): string {
  if (explicitPrimitive) {
    return "deterministic";
  }
  if (/\b(fix|implement|build|create|mutate|update|write)\b/i.test(text)) {
    return "execution";
  }
  return "analysis";
}

function inferSubject(text: string): string {
  return normalizeWhitespace(text).slice(0, 240);
}

function inferMutationIntent(text: string): "read-only" | "may-mutate" | "must-mutate" {
  const lower = text.toLowerCase();
  if (/\b(fix|implement|build|create|write|update|modify|change|generate)\b/.test(lower)) {
    return "must-mutate";
  }
  if (/\b(run|verify|inspect|investigate|review)\b/.test(lower)) {
    return "may-mutate";
  }
  return "read-only";
}

function inferSuccessContract(text: string, taskClassHint: string | null): string[] {
  const contract = ["Preserve the real objective.", "Do not expose secrets.", "State verification honestly."];
  if (taskClassHint === "analysis-plan") {
    contract.push("Return current state, a gap map, and an implementation plan.");
  }
  if (/\bjson\b/i.test(text)) {
    contract.push("Return machine-readable JSON-compatible structure.");
  }
  return contract;
}

function normalizeWhitespace(text: string): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}
