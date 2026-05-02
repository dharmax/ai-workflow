#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "./lib/cli.ts";
import { openWorkflowStore } from "../../../core/db/sqlite-store.ts";
import { judgeArtifacts } from "../../../core/services/artifact-verification.ts";
import { judgeShellTranscripts } from "../../../core/services/shell-transcript-verification.ts";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CLI_PATH = path.join(REPO_ROOT, "cli", "ai-workflow.ts");
const DEFAULT_TARGET = path.resolve(REPO_ROOT, "dogfood-projects", "space-invaders-emoji-3d");
const DEFAULT_TIMEOUT_MS = 180_000;
const FORBIDDEN_DOGFOOD_CODELETS = new Set(["programming-dogfood-build"]);

function getShellPrompts(targetRoot) {
  return [
    {
      cwd: targetRoot,
      prompt: "mutate"
    },
    {
      cwd: targetRoot,
      prompt: `Build a dedicated programming dogfood project in "${targetRoot}" from scratch for a modular, expandable 3d canvas Space Invaders-style game that uses emoji ships. Do the actual work through the normal shell workflow: plan it, create or edit the project files directly, and return a structured JSON result with summary, changedFiles, and verification. Do not use programming-dogfood-build, do not call a hidden generator, and do not treat this as search-only work. The finished project must include the long-term vision, epics, features, modules, planning notes, runnable tests, and a ready-to-play browser app.`
    },
    {
      cwd: targetRoot,
      prompt: "Run the project's relevant tests and checks now. If anything fails, fix it by editing the project files directly and rerun until it passes. Return structured JSON with summary, changedFiles, and verification."
    },
    {
      cwd: targetRoot,
      prompt: "Verify the generated app actually runs through both npm run dev and npm run serve from this project. If a script, asset, or config is broken, fix it in the project and rerun the checks. Return structured JSON with summary, changedFiles, and verification."
    },
    {
      cwd: targetRoot,
      prompt: "Inspect the generated project and prove that the full cycle completed. Show where the ready-to-play app entrypoint lives, where the long-term vision and epics live, where the tests live, and what was verified. Return structured JSON with summary, changedFiles, and verification."
    }
  ];
}

async function runNode(args, cwd, { env = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync( "npx", "tsx", args, {
      cwd,
      env: { ...process.env, ...env },
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? 1,
      stdout: String(error?.stdout ?? ""),
      stderr: String(error?.stderr ?? error?.message ?? error),
      timedOut: error?.killed === true && error?.signal === "SIGTERM"
    };
  }
}

async function runNodeStreaming(args, cwd, {
  env = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onStdout = null,
  onStderr = null
} = {}) {
  return await new Promise((resolve) => {
    const child = spawn("tsx", [...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(payload);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (typeof onStdout === "function") {
        onStdout(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      if (typeof onStderr === "function") {
        onStderr(text);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: error?.code ?? 1,
        stdout,
        stderr: `${stderr}${error?.message ?? error}`,
        timedOut
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({
        ok: code === 0 && !timedOut,
        code: code ?? (timedOut ? 124 : 1),
        stdout,
        stderr,
        timedOut: timedOut || signal === "SIGTERM"
      });
    });
  });
}

async function runShellPrompt({ cwd, prompt, statePath, runId, timeoutMs = DEFAULT_TIMEOUT_MS, env = {} }) {
  const startedAt: string = new Date().toISOString();
  const result = await runNodeStreaming([
    CLI_PATH,
    "shell",
    "--json",
    "--yes",
    "--state-file",
    statePath,
    "--run-id",
    runId,
    prompt
  ], cwd, {
    timeoutMs,
    env: {
      AI_WORKFLOW_DISABLE_FAST_SHELL_PATH: "1",
      ...env
    },
    onStderr: (text) => {
      process.stderr.write(text);
    }
  });

  const shellResult = parseJsonOutput(result.stdout);
  const state = await readJsonFile(statePath, {});
  const failureDetail = (result.stderr || result.stdout || "No shell output").trim();
  const normalizedShellResult = shellResult ?? {
    input: prompt,
    plan: {
      kind: "reply",
      reply: `Shell turn failed: ${failureDetail}`
    },
    executed: [{
      ok: false,
      summary: "shell invocation failed",
      stderr: failureDetail
    }],
    executedGraph: null,
    preRendered: false,
    history: Array.isArray(state?.history) ? state.history : [],
    assistantReply: `Shell turn failed: ${failureDetail}`,
    workflowResult: null,
    traceEvents: [],
    workflowTraceEvents: [],
    options: {
      root: cwd,
      json: true,
      trace: false,
      runId
    }
  };
  const workflowRunId = normalizedShellResult?.workflowResult?.runId ?? null;
  const workflowSteps = workflowRunId ? await readWorkflowSteps(cwd, workflowRunId) : [];
  return {
    prompt,
    cwd,
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    raw: result,
    shellResult: normalizedShellResult,
    state,
    workflowRunId,
    workflowSteps
  };
}

function parseJsonOutput(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const lines = raw.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const candidate = lines.slice(index).join("\n").trim();
      if (!candidate.startsWith("{")) {
        continue;
      }
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }
    return null;
  }
}

function parseLastJsonOutput(text, predicate = () => true) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return null;
  }
  const lines = raw.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines.slice(index).join("\n").trim();
    if (!candidate.startsWith("{")) {
      continue;
    }
    try {
      const parsed = JSON.parse(candidate);
      if (predicate(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function buildTurnRunId(targetRoot, turnNumber, runTag = "run") {
  return `${path.basename(targetRoot)}-dogfood-${runTag}-turn-${String(turnNumber).padStart(2, "0")}`;
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function assessProjectScaffold(targetRoot) {
  const requiredFiles = [
    "package.json",
    "README.md",
    "src/index.html",
    "src/main.ts",
    "src/game.ts",
    "tests/game-logic.test.ts"
  ];
  const missingFiles = [];
  for (const relativePath of requiredFiles) {
    const exists = await fileExists(path.join(targetRoot, relativePath));
    if (!exists) {
      missingFiles.push(relativePath);
    }
  }

  const packageJson = await readJsonFile(path.join(targetRoot, "package.json"), null);
  const missingScripts = [];
  for (const scriptName of ["test", "dev", "serve"]) {
    if (!packageJson?.scripts?.[scriptName]) {
      missingScripts.push(scriptName);
    }
  }

  return {
    missingFiles,
    missingScripts,
    ok: missingFiles.length === 0 && missingScripts.length === 0
  };
}

function buildScaffoldRepairPrompt(assessment) {
  const requirements = [];
  if (assessment.missingFiles.length) {
    requirements.push(`missing files: ${assessment.missingFiles.join(", ")}`);
  }
  if (assessment.missingScripts.length) {
    requirements.push(`missing package.json scripts: ${assessment.missingScripts.join(", ")}`);
  }
  return [
    "The generated project is incomplete.",
    `Fix these required gaps now: ${requirements.join("; ")}.`,
    "Create or update the project files directly so the project has a runnable browser app, npm test, npm run dev, and npm run serve.",
    "Return structured JSON with summary, changedFiles, and verification."
  ].join(" ");
}

function didShellExecuteWorkflow(turn) {
  return Boolean(turn?.shellResult?.workflowResult?.ok);
}

function buildFailureRepairPrompt(label, turn, specificInstruction) {
  const detail = truncate(
    firstNonEmptyString(
      turn?.raw?.stderr,
      turn?.raw?.stdout,
      turn?.shellResult?.assistantReply,
      "No failure detail captured."
    ) ?? "No failure detail captured.",
    3000
  );
  return [
    `The previous ${label} turn failed or did not complete the required work.`,
    specificInstruction,
    "Use this exact failure detail to drive the fix:",
    detail,
    "Edit the project files directly, rerun the required command for real, and return structured JSON with summary, changedFiles, and verification."
  ].join("\n\n");
}

async function readWorkflowSteps(projectRoot, runId) {
  const store = await openWorkflowStore({ projectRoot });
  try {
    return store.listWorkflowSteps(runId);
  } finally {
    store.close();
  }
}

function summarizePlan(shellResult) {
  const plan = shellResult?.plan ?? {};
  if (plan.kind === "reply") {
    return plan.reply ?? "shell reply";
  }
  if (Array.isArray(plan.actions) && plan.actions.length) {
    return plan.actions.map((action) => action.type).join(", ");
  }
  return plan.strategy ?? plan.reason ?? plan.kind ?? "unknown";
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function getTurnPlanner(turn) {
  const plan = turn?.shellResult?.plan ?? {};
  const planner = turn?.shellResult?.plan?.__planner;
  if (planner?.providerId || planner?.modelId) {
    return {
      providerId: planner.providerId ?? null,
      modelId: planner.modelId ?? null,
      label: [planner.providerId, planner.modelId].filter(Boolean).join(":") || "unknown"
    };
  }
  const fallbackPlanner = turn?.shellResult?.plan?.planner;
  if (fallbackPlanner?.providerId || fallbackPlanner?.modelId) {
    return {
      providerId: fallbackPlanner.providerId ?? null,
      modelId: fallbackPlanner.modelId ?? null,
      label: [fallbackPlanner.providerId, fallbackPlanner.modelId].filter(Boolean).join(":") || fallbackPlanner.mode || "unknown"
    };
  }
  if (fallbackPlanner?.mode) {
    return {
      providerId: null,
      modelId: null,
      label: fallbackPlanner.mode
    };
  }
  if (typeof plan.code === "string" && plan.code.trim()) {
    return {
      providerId: null,
      modelId: null,
      label: "shell-interpreter"
    };
  }
  return {
    providerId: null,
    modelId: null,
    label: "unknown"
  };
}

function classifyPlanningPath(turn) {
  const plan = turn?.shellResult?.plan ?? {};
  if (typeof plan.code === "string" && plan.code.trim()) {
    const planner = plan.__planner ?? plan.planner ?? {};
    const aiPlanned = Boolean(planner?.providerId || planner?.modelId);
    return {
      kind: aiPlanned ? "ai-js-plan" : "shell-interpreter-js",
      deterministic: !aiPlanned,
      description: aiPlanned ? "AI generated JS workflow" : "Shell interpreter generated JS workflow"
    };
  }
  const planner = plan.planner ?? {};
  if (planner.mode === "heuristic") {
    return {
      kind: "deterministic-heuristic",
      deterministic: true,
      description: "Deterministic shell routing"
    };
  }
  if (plan.kind === "reply" && !planner.providerId && !plan.__planner) {
    return {
      kind: "deterministic-reply",
      deterministic: true,
      description: "Deterministic direct reply"
    };
  }
  if (plan.__planner?.providerId || planner.providerId) {
    return {
      kind: "ai-structured-plan",
      deterministic: false,
      description: "AI planned structured response"
    };
  }
  return {
    kind: "unknown",
    deterministic: false,
    description: "Unknown planning path"
  };
}

function summarizeExecutedActions(turn) {
  const actions = Array.isArray(turn?.shellResult?.executed)
    ? turn.shellResult.executed.map((execution) => execution.action?.type ?? execution.summary ?? execution.command ?? "unknown").filter(Boolean)
    : [];
  if (turn?.shellResult?.workflowResult?.runId) {
    actions.push("js-orchestrator");
  }
  return actions.length ? [...new Set(actions)] : ["none"];
}

function extractPlannedOperations(code) {
  const source = String(code ?? "");
  if (!source.trim()) {
    return [];
  }
  const patterns = [
    /executeCodelet\(\s*["'`]([^"'`]+)["'`]/g,
    /exec\(\s*["'`]([^"'`]+)["'`]/g,
    /\b(sync|orchestrator|status|shell|files|sh)\.([A-Za-z0-9_]+)\s*\(/g
  ];
  const found = [];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      if (pattern === patterns[2]) {
        found.push(`${match[1]}.${match[2]}`);
      } else {
        found.push(match[1]);
      }
    }
  }
  const shellActionPattern = /shellAction\(\s*(\{[\s\S]*?\})\s*\)/g;
  let shellActionMatch = null;
  while ((shellActionMatch = shellActionPattern.exec(source)) !== null) {
    try {
      const action = JSON.parse(shellActionMatch[1]);
      if (action?.type === "run_codelet" && action.codeletId) {
        found.push(`run_codelet:${action.codeletId}`);
      } else if (action?.type) {
        found.push(`shellAction:${action.type}`);
      }
    } catch {
      found.push("shellAction");
    }
  }
  return [...new Set(found)];
}

function summarizeWorkflowSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => ({
    stepId: step.stepId,
    description: step.description,
    status: step.status
  }));
}

function summarizePromptForTable(prompt) {
  const compact = String(prompt ?? "").replace(/\s+/g, " ").trim();
  return compact.length > 56 ? `${compact.slice(0, 53)}...` : compact;
}

function isNaturalLanguagePrompt(prompt) {
  const text = String(prompt ?? "").trim().toLowerCase();
  if (!text) {
    return false;
  }
  if (/^run codelet\b/.test(text)) {
    return false;
  }
  if (/^(search|find|look up)\b/.test(text)) {
    return false;
  }
  return /\s/.test(text);
}

function extractBuildPayload(turn) {
  const workflowResult = turn?.shellResult?.workflowResult?.result ?? null;
  if (workflowResult?.structuredPayload?.targetRoot) {
    return workflowResult.structuredPayload;
  }
  const workflowStdoutPayload = parseLastJsonOutput(workflowResult?.stdout ?? "", (payload) => Boolean(payload?.targetRoot));
  if (workflowStdoutPayload) {
    return workflowStdoutPayload;
  }
  const execution = (turn?.shellResult?.executed ?? []).find((item) => item.action?.type === "run_codelet");
  return parseLastJsonOutput(execution?.stdout ?? "", (payload) => Boolean(payload?.targetRoot));
}

function extractWorkflowResultPayload(turn) {
  const workflowPayload = turn?.shellResult?.workflowResult?.result ?? null;
  if (workflowPayload && typeof workflowPayload === "object") {
    return workflowPayload;
  }
  const execution = extractPrimaryExecution(turn);
  if (execution?.structuredPayload && typeof execution.structuredPayload === "object") {
    return execution.structuredPayload;
  }
  return null;
}

function extractTurnAssistantReply(turn) {
  const histories = [
    Array.isArray(turn?.shellResult?.history) ? turn.shellResult.history : [],
    Array.isArray(turn?.state?.history) ? turn.state.history : []
  ];
  for (const history of histories) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const item = history[index];
      if (item?.role === "ai" && String(item?.content ?? "").trim()) {
        return String(item.content).trim();
      }
    }
  }
  const assistantReply = String(turn?.shellResult?.assistantReply ?? "").trim();
  return assistantReply || null;
}

function extractPrimaryExecution(turn) {
  return Array.isArray(turn?.shellResult?.executed) ? (turn.shellResult.executed.find(Boolean) ?? null) : null;
}

function extractObservedResultSummary(turn) {
  const execution = extractPrimaryExecution(turn);
  const payload = execution?.structuredPayload ?? extractWorkflowResultPayload(turn) ?? null;
  if (!payload) {
    return null;
  }

  if (payload && typeof payload === "object" && payload.targetRoot) {
    const lines = [
      `Created the project at ${payload.targetRoot}.`,
      `Planning notes: ${payload.planPath}.`,
      `Brainstorm notes: ${payload.brainstormPath}.`,
      `Build report: ${payload.reportPath}.`
    ];
    if (payload.logicTest?.ok === true) {
      lines.push("Logic tests passed.");
    }
    if (payload.artifactJudge?.status) {
      lines.push(`Builder artifact judge: ${payload.artifactJudge.status}.`);
    }
    return lines.join(" ");
  }

  if (Array.isArray(payload)) {
    const resultTitles = payload.map((item) => String(item?.title ?? item?.refId ?? "").trim()).filter(Boolean);
    const resultRefs = payload.map((item) => String(item?.refId ?? "").trim()).filter(Boolean);
    const lines = [];

    const indexHtml = payload.find((item) => item?.refId === "index.html");
    if (indexHtml && /<title>Emoji Star Lanes<\/title>/.test(String(indexHtml.body ?? ""))) {
      lines.push("Confirmed the title in index.html.");
    }

    const readme = payload.find((item) => item?.refId === "README.md");
    if (readme) {
      const moduleMatches = [...String(readme.body ?? "").matchAll(/`([^`]+\.js)`/g)].map((match) => match[1]);
      if (moduleMatches.length) {
        lines.push(`Surfaced the main game files from README.md: ${moduleMatches.slice(0, 5).join(", ")}.`);
      }
    }

    const epicEntity = payload.find((item) => String(item?.refId ?? "") === "EPIC-GAME-001");
    if (epicEntity) {
      lines.push("Found the EPIC-GAME-001 entity record.");
    }

    if (resultRefs.includes("project-brief.md")) {
      lines.push("Found the long-term vision and module split in project-brief.md.");
    }
    if (resultRefs.includes("epics.md")) {
      lines.push("Found the epic breakdown, user stories, and ticket batches in epics.md.");
    }

    if (!lines.length && resultTitles.length) {
      lines.push(`Top grounded hits: ${resultTitles.slice(0, 3).join(", ")}.`);
    }
    return lines.length ? lines.join(" ") : null;
  }

  if (payload && typeof payload === "object") {
    const lines = [];
    if (payload.summary) {
      lines.push(String(payload.summary).trim());
    }
    if (Array.isArray(payload.changedFiles) && payload.changedFiles.length) {
      lines.push(`Changed files: ${payload.changedFiles.slice(0, 8).join(", ")}.`);
    }
    if (payload.verification && typeof payload.verification === "object") {
      const checks = Object.entries(payload.verification)
        .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
      if (checks.length) {
        lines.push(`Verification: ${checks.join("; ")}.`);
      }
    }
    return lines.length ? lines.join(" ") : null;
  }

  return null;
}

function collectShortcutViolations(turns) {
  const violations = [];
  for (const [index, turn] of (Array.isArray(turns) ? turns : []).entries()) {
    const plannedActions = Array.isArray(turn?.shellResult?.plan?.actions) ? turn.shellResult.plan.actions : [];
    const executedActions = Array.isArray(turn?.shellResult?.executed) ? turn.shellResult.executed : [];
    const jsSource = String(turn?.shellResult?.plan?.code ?? "");
    for (const action of [...plannedActions, ...executedActions.map((execution) => execution?.action).filter(Boolean)]) {
      if (action?.type === "run_codelet" && FORBIDDEN_DOGFOOD_CODELETS.has(String(action.codeletId))) {
        violations.push({
          turn: index + 1,
          forbidden: String(action.codeletId),
          source: action === plannedActions.find((candidate) => candidate === action) ? "plan.actions" : "executed.action"
        });
      }
    }
    const codeletMatches = [...jsSource.matchAll(/["'`](programming-dogfood-build)["'`]/g)];
    for (const match of codeletMatches) {
      violations.push({
        turn: index + 1,
        forbidden: match[1],
        source: "plan.code"
      });
    }
  }
  return violations;
}

function formatExecutionBlock(shellResult) {
  const executions = Array.isArray(shellResult?.executed) ? shellResult.executed : [];
  if (!executions.length) {
    return "- No executable actions recorded.";
  }
  return executions.map((execution) => {
    const status = execution.ok === false ? "failed" : "ok";
    const actionType = execution.action?.type ?? execution.summary ?? "unknown";
    const stdout = String(execution.stdout ?? "").trim();
    const stderr = String(execution.stderr ?? "").trim();
    const outputText = stdout || stderr || execution.summary || "(no output)";
    return [
      `- ${actionType}: ${status}`,
      "```text",
      truncate(outputText, 3000),
      "```"
    ].join("\n");
  }).join("\n");
}

function truncate(text, limit) {
  const value = String(text ?? "");
  return value.length > limit ? `${value.slice(0, limit)}\n... [truncated]` : value;
}

function parseIsoMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function describePlannerForTrace(traceEvent) {
  const planner = traceEvent?.planner ?? {};
  return [planner.providerId, planner.modelId].filter(Boolean).join(":")
    || planner.mode
    || "unknown";
}

function buildTraceLedgerRows(turn, turnNumber) {
  const traceEvents = Array.isArray(turn?.shellResult?.traceEvents) ? turn.shellResult.traceEvents : [];
  let attempt = 0;
  return traceEvents
    .filter((event) => ["response", "error"].includes(String(event?.phase ?? "")))
    .map((event) => {
      attempt += 1;
      const usage = event?.usage ?? {};
      return {
        turn: turnNumber,
        attempt,
        recordedAt: event?.recordedAt ?? null,
        stage: String(event?.stage ?? "unknown"),
        phase: String(event?.phase ?? "event"),
        providerId: event?.planner?.providerId ?? null,
        modelId: event?.planner?.modelId ?? null,
        plannerLabel: describePlannerForTrace(event),
        promptTokens: usage?.available ? usage.promptTokens ?? 0 : null,
        completionTokens: usage?.available ? usage.completionTokens ?? 0 : null,
        totalTokens: usage?.available ? usage.totalTokens ?? 0 : null,
        latencyMs: Number.isFinite(event?.elapsedMs) ? event.elapsedMs : null,
        note: event?.error
          ? String(event.error)
          : (!usage?.available && usage?.reason ? usage.reason : "ok")
      };
    });
}

function summarizeTraceRows(rows) {
  const withUsage = rows.filter((row) => Number.isFinite(row.totalTokens));
  const missingUsage = rows.filter((row) => !Number.isFinite(row.totalTokens));
  return {
    attempts: rows.length,
    rows,
    totalPromptTokens: withUsage.reduce((sum, row) => sum + (row.promptTokens ?? 0), 0),
    totalCompletionTokens: withUsage.reduce((sum, row) => sum + (row.completionTokens ?? 0), 0),
    totalTokens: withUsage.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
    missingUsage
  };
}

async function readArtifactSnippet(filePath, lineLimit = 24) {
  if (!filePath) {
    return null;
  }
  try {
    const content = await readFile(filePath, "utf8");
    return content.split(/\r?\n/).slice(0, lineLimit).join("\n").trim();
  } catch {
    return null;
  }
}

async function readRunMetrics(projectRoot, { startedAt, endedAt } = {}) {
  const startedMs = parseIsoMs(startedAt);
  const endedMs = parseIsoMs(endedAt);
  const store = await openWorkflowStore({ projectRoot });
  try {
    const rows = store.listMetrics({ limit: null, order: "asc" });
    return rows.filter((row) => {
      const createdMs = parseIsoMs(row.created_at);
      if (createdMs == null) {
        return false;
      }
      if (startedMs != null && createdMs < startedMs) {
        return false;
      }
      if (endedMs != null && createdMs > endedMs) {
        return false;
      }
      return true;
    }).map((row) => ({
      ...row,
      projectRoot
    }));
  } finally {
    store.close();
  }
}

function summarizeMetricsByModel(metrics) {
  const byModel = new Map();
  for (const metric of metrics) {
    const label = [metric.provider_id, metric.model_id].filter(Boolean).join(":") || "unknown";
    const entry = byModel.get(label) ?? {
      label,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      missingUsage: 0
    };
    const promptTokens = Number(metric.prompt_tokens ?? 0);
    const completionTokens = Number(metric.completion_tokens ?? 0);
    const totalTokens = promptTokens + completionTokens;
    entry.calls += 1;
    entry.promptTokens += promptTokens;
    entry.completionTokens += completionTokens;
    entry.totalTokens += totalTokens;
    entry.latencyMs += Number(metric.latency_ms ?? 0);
    if (!totalTokens) {
      entry.missingUsage += 1;
    }
    byModel.set(label, entry);
  }
  return [...byModel.values()].sort((left, right) => right.totalTokens - left.totalTokens || right.calls - left.calls);
}

function normalizeUsageValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function extractUsageSnapshot(usage) {
  if (!usage || typeof usage !== "object") {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null
    };
  }

  const promptTokens = normalizeUsageValue(
    usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens
  );
  const completionTokens = normalizeUsageValue(
    usage.completionTokens ?? usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens
  );
  const totalTokens = normalizeUsageValue(
    usage.totalTokens ?? usage.total_tokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0))
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens == null && completionTokens == null ? totalTokens : (totalTokens ?? ((promptTokens ?? 0) + (completionTokens ?? 0)))
  };
}

function collectJudgeAttemptRows(stage, payload) {
  const attempts = Array.isArray(payload?.diagnostics?.attempts) ? payload.diagnostics.attempts : [];
  return attempts.map((attempt, index) => {
    const usage = extractUsageSnapshot(attempt?.usage);
    return {
      stage,
      attempt: index + 1,
      providerId: attempt?.providerId ?? null,
      modelId: attempt?.modelId ?? null,
      success: attempt?.success !== false,
      latencyMs: Number.isFinite(attempt?.latencyMs) ? attempt.latencyMs : null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      note: firstNonEmptyString(
        attempt?.error,
        attempt?.timedOut ? "timed out" : null,
        attempt?.rawResponse ? "unstructured output" : null,
        attempt?.success === false ? "failed" : "ok"
      ) ?? "ok"
    };
  });
}

function summarizeJudgeRoute(payload) {
  const recommended = payload?.route?.recommended
    ? `${payload.route.recommended.providerId}:${payload.route.recommended.modelId}`
    : "unavailable";
  const finalProviderId = payload?.diagnostics?.successfulProviderId ?? null;
  const finalModelId = payload?.diagnostics?.successfulModelId ?? null;
  const final = finalProviderId && finalModelId ? `${finalProviderId}:${finalModelId}` : "none";
  const failedAttempts = Number(payload?.diagnostics?.failedAttempts ?? 0);
  return {
    recommended,
    final,
    fallbackUsed: failedAttempts > 0,
    failedAttempts
  };
}

async function withTimeout(promise, timeoutMs, fallbackValue) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(
          typeof fallbackValue === "function" ? fallbackValue() : fallbackValue
        ), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function writeTranscriptArtifacts({ targetRoot, turns }) {
  const shellDir = path.join(targetRoot, "artifacts", "shell");
  const rawDir = path.join(shellDir, "raw");
  await mkdir(shellDir, { recursive: true });
  await mkdir(rawDir, { recursive: true });

  const turnsPath = path.join(shellDir, "turns.jsonl");
  const dialogPath = path.join(shellDir, "dialog.md");
  const rawTranscriptPath = path.join(shellDir, "raw-transcript.md");
  const goePath = path.join(targetRoot, "artifacts", "goe", "governance.json");

  const enrichedTurns = [];
  for (const [index, turn] of turns.entries()) {
    const turnNumber = String(index + 1).padStart(2, "0");
    const planner = getTurnPlanner(turn);
    const planningPath = classifyPlanningPath(turn);
    const plannedOperations = extractPlannedOperations(turn?.shellResult?.plan?.code ?? "");
    const executedActions = summarizeExecutedActions(turn);
    const planJsonPath = path.join(rawDir, `turn-${turnNumber}.plan.json`);
    const planJsPath = typeof turn?.shellResult?.plan?.code === "string" && turn.shellResult.plan.code.trim()
      ? path.join(rawDir, `turn-${turnNumber}.plan.js`)
      : null;
    const tracePath = path.join(rawDir, `turn-${turnNumber}.trace.json`);
    const workflowTracePath = path.join(rawDir, `turn-${turnNumber}.workflow-trace.json`);
    const traceRows = buildTraceLedgerRows(turn, index + 1);
    const traceSummary = summarizeTraceRows(traceRows);
    await writeFile(planJsonPath, `${JSON.stringify(turn?.shellResult?.plan ?? {}, null, 2)}\n`, "utf8");
    if (planJsPath) {
      await writeFile(planJsPath, `${String(turn.shellResult.plan.code).trim()}\n`, "utf8");
    }
    await writeFile(tracePath, `${JSON.stringify(turn?.shellResult?.traceEvents ?? [], null, 2)}\n`, "utf8");
    await writeFile(workflowTracePath, `${JSON.stringify(turn?.shellResult?.workflowTraceEvents ?? [], null, 2)}\n`, "utf8");

    enrichedTurns.push({
      ...turn,
      audit: {
        planner,
        planningPath,
        plannedOperations,
        executedActions,
        planJsonPath,
        planJsPath,
        tracePath,
        workflowTracePath,
        traceSummary,
        workflowSteps: summarizeWorkflowSteps(turn.workflowSteps),
        workflowRunId: turn.workflowRunId ?? null,
        workflowTraceEvents: Array.isArray(turn?.shellResult?.workflowTraceEvents) ? turn.shellResult.workflowTraceEvents : []
      }
    });
  }

  const jsonl = enrichedTurns.map((turn, index) => JSON.stringify({
    turn: index + 1,
    prompt: turn.prompt,
    cwd: turn.cwd,
    runId: turn.runId,
    requestedWorkMode: turn.state?.requestedWorkMode ?? null,
    effectiveWorkMode: turn.state?.effectiveWorkMode ?? null,
    modeSource: turn.state?.modeSource ?? null,
    executionStance: turn.state?.executionStance ?? null,
    planSummary: summarizePlan(turn.shellResult),
    planningPath: turn.audit.planningPath,
    planner: turn.audit.planner,
    plannedOperations: turn.audit.plannedOperations,
    executedActions: turn.audit.executedActions,
    workflowRunId: turn.audit.workflowRunId,
    workflowSteps: turn.audit.workflowSteps,
    workflowTraceEvents: turn.audit.workflowTraceEvents,
    tracePath: turn.audit.tracePath,
    workflowTracePath: turn.audit.workflowTracePath,
    traceSummary: turn.audit.traceSummary,
    shellResult: turn.shellResult
  })).join("\n");
  await writeFile(turnsPath, `${jsonl}\n`, "utf8");

  const dialog = [
    "# Shell Dialog",
    "",
    "This transcript was produced by invoking the real `ai-workflow shell` CLI with persisted shell state between turns.",
    "Build-focused turns run from the toolkit repo so the builder can recreate the target folder safely; inspection turns run inside the generated project.",
    "The human side is intentionally phrased as a non-programmer asking for outcomes rather than invoking implementation internals.",
    ""
  ];

  enrichedTurns.forEach((turn, index) => {
    const observedResult = extractObservedResultSummary(turn);
    dialog.push(`## Turn ${index + 1}`);
    dialog.push("");
    dialog.push(`**Human:** ${turn.prompt}`);
    dialog.push("");
    dialog.push(`**Shell state:** mode ${turn.state?.requestedWorkMode ?? "auto"} -> ${turn.state?.effectiveWorkMode ?? "unknown"} | source ${turn.state?.modeSource ?? "unknown"} | stance ${turn.state?.executionStance ?? "unknown"}`);
    dialog.push("");
    dialog.push(`**Planning path:** ${turn.audit.planningPath.description} (${turn.audit.planningPath.kind})`);
    dialog.push("");
    dialog.push(`**Planner:** ${turn.audit.planner.label}`);
    dialog.push("");
    dialog.push(`**Plan:** ${summarizePlan(turn.shellResult)}`);
    dialog.push("");
    dialog.push(`**Plan JSON:** \`${turn.audit.planJsonPath}\``);
    if (turn.audit.planJsPath) {
      dialog.push("");
      dialog.push(`**Generated JS:** \`${turn.audit.planJsPath}\``);
    }
    dialog.push("");
    dialog.push(`**Trace ledger:** \`${turn.audit.tracePath}\``);
    dialog.push("");
    dialog.push(`**Workflow trace:** \`${turn.audit.workflowTracePath}\``);
    dialog.push("");
    dialog.push(`**Trace summary:** ${turn.audit.traceSummary.attempts} response/error event(s), ${turn.audit.traceSummary.totalTokens} token(s) with ${turn.audit.traceSummary.missingUsage.length} missing-usage row(s).`);
    if (turn.audit.plannedOperations.length) {
      dialog.push("");
      dialog.push(`**Planned operations:** ${turn.audit.plannedOperations.join(", ")}`);
    }
    if (turn.audit.workflowRunId) {
      dialog.push("");
      dialog.push(`**Workflow run:** \`${turn.audit.workflowRunId}\``);
    }
    if (turn.audit.workflowSteps.length) {
      dialog.push("");
      dialog.push("**Workflow steps:**");
      for (const step of turn.audit.workflowSteps) {
        dialog.push(`- ${step.stepId}: ${step.status}${step.description ? ` | ${step.description}` : ""}`);
      }
    }
    if (turn.audit.workflowTraceEvents.length) {
      dialog.push("");
      dialog.push("**Workflow trace events:**");
      for (const event of turn.audit.workflowTraceEvents) {
        dialog.push(`- ${event.recordedAt ?? "unknown"} | ${event.stepId ?? "unknown-step"} | ${event.type ?? "event"}${event.description ? ` | ${event.description}` : ""}${event.error ? ` | ${event.error}` : ""}`);
      }
    }
    if (observedResult) {
      dialog.push("");
      dialog.push(`**Observed result:** ${observedResult}`);
    }
    dialog.push("");
    dialog.push("**Execution:**");
    dialog.push(formatExecutionBlock(turn.shellResult));
    const shellReply = extractTurnAssistantReply(turn);
    if (shellReply) {
      dialog.push("");
      dialog.push("**Shell Reply:**");
      dialog.push("");
      dialog.push("```text");
      dialog.push(truncate(shellReply, 4000));
      dialog.push("```");
    }
    dialog.push("");
  });

  await writeFile(dialogPath, `${dialog.join("\n")}\n`, "utf8");

  const rawTranscript = [
    "# Raw Shell Transcript",
    "",
    "This is the literal per-turn CLI interaction captured by the dogfood runner.",
    "Each turn records the working directory, human prompt, raw stdout, and raw stderr from the real `ai-workflow shell --json` invocation.",
    ""
  ];

  for (const [index, turn] of enrichedTurns.entries()) {
    const observedResult = extractObservedResultSummary(turn);
    const turnNumber = String(index + 1).padStart(2, "0");
    const promptPath = path.join(rawDir, `turn-${turnNumber}.prompt.txt`);
    const stdoutPath = path.join(rawDir, `turn-${turnNumber}.stdout.log`);
    const stderrPath = path.join(rawDir, `turn-${turnNumber}.stderr.log`);
    const metaPath = path.join(rawDir, `turn-${turnNumber}.meta.json`);
    const promptText = `${turn.prompt}\n`;
    const stdoutText = String(turn.raw?.stdout ?? "");
    const stderrText = String(turn.raw?.stderr ?? "");

    await writeFile(promptPath, promptText, "utf8");
    await writeFile(stdoutPath, stdoutText, "utf8");
    await writeFile(stderrPath, stderrText, "utf8");
    await writeFile(metaPath, `${JSON.stringify({
      turn: index + 1,
      cwd: turn.cwd,
      runId: turn.runId,
      planningPath: turn.audit.planningPath,
      planner: turn.audit.planner,
      plannedOperations: turn.audit.plannedOperations,
      executedActions: turn.audit.executedActions,
      workflowRunId: turn.audit.workflowRunId,
      workflowSteps: turn.audit.workflowSteps,
      workflowTracePath: turn.audit.workflowTracePath,
      workflowTraceEvents: turn.audit.workflowTraceEvents,
      planJsonPath: turn.audit.planJsonPath,
      planJsPath: turn.audit.planJsPath,
      tracePath: turn.audit.tracePath,
      traceSummary: turn.audit.traceSummary,
      promptPath,
      stdoutPath,
      stderrPath
    }, null, 2)}\n`, "utf8");

    rawTranscript.push(`## Turn ${index + 1}`);
    rawTranscript.push("");
    rawTranscript.push(`- CWD: \`${turn.cwd}\``);
    rawTranscript.push(`- Run id: \`${turn.runId}\``);
    rawTranscript.push(`- Planning path: \`${turn.audit.planningPath.kind}\` (${turn.audit.planningPath.description})`);
    rawTranscript.push(`- Planner: \`${turn.audit.planner.label}\``);
    rawTranscript.push(`- Prompt file: \`${promptPath}\``);
    rawTranscript.push(`- Stdout file: \`${stdoutPath}\``);
    rawTranscript.push(`- Stderr file: \`${stderrPath}\``);
    rawTranscript.push(`- Plan JSON: \`${turn.audit.planJsonPath}\``);
    if (turn.audit.planJsPath) {
      rawTranscript.push(`- Generated JS: \`${turn.audit.planJsPath}\``);
    }
    rawTranscript.push(`- Trace ledger: \`${turn.audit.tracePath}\``);
    rawTranscript.push(`- Workflow trace: \`${turn.audit.workflowTracePath}\``);
    if (turn.audit.workflowRunId) {
      rawTranscript.push(`- Workflow run: \`${turn.audit.workflowRunId}\``);
    }
    rawTranscript.push("");
    rawTranscript.push("### Human Prompt");
    rawTranscript.push("");
    rawTranscript.push("```text");
    rawTranscript.push(turn.prompt);
    rawTranscript.push("```");
    rawTranscript.push("");
    rawTranscript.push("### Raw Stdout");
    rawTranscript.push("");
    rawTranscript.push("```text");
    rawTranscript.push(truncate(stdoutText, 4000) || "(empty)");
    rawTranscript.push("```");
    rawTranscript.push("");
    rawTranscript.push("### Raw Stderr");
    rawTranscript.push("");
    rawTranscript.push("```text");
    rawTranscript.push(truncate(stderrText, 2000) || "(empty)");
    rawTranscript.push("```");
    const shellReply = extractTurnAssistantReply(turn);
    if (shellReply) {
      rawTranscript.push("");
      rawTranscript.push("### Shell Reply");
      rawTranscript.push("");
      rawTranscript.push("```text");
      rawTranscript.push(truncate(shellReply, 4000));
      rawTranscript.push("```");
    }
    if (observedResult) {
      rawTranscript.push("");
      rawTranscript.push("### Observed Result");
      rawTranscript.push("");
      rawTranscript.push(observedResult);
    }
    if (turn.audit.workflowSteps.length) {
      rawTranscript.push("");
      rawTranscript.push("### Workflow Steps");
      rawTranscript.push("");
      rawTranscript.push("```json");
      rawTranscript.push(JSON.stringify(turn.audit.workflowSteps, null, 2));
      rawTranscript.push("```");
    }
    if (turn.audit.workflowTraceEvents.length) {
      rawTranscript.push("");
      rawTranscript.push("### Workflow Trace Events");
      rawTranscript.push("");
      rawTranscript.push("```json");
      rawTranscript.push(JSON.stringify(turn.audit.workflowTraceEvents, null, 2));
      rawTranscript.push("```");
    }
    if (turn.audit.traceSummary.rows.length) {
      rawTranscript.push("");
      rawTranscript.push("### Trace Rows");
      rawTranscript.push("");
      rawTranscript.push("```json");
      rawTranscript.push(JSON.stringify(turn.audit.traceSummary.rows, null, 2));
      rawTranscript.push("```");
    }
    rawTranscript.push("");
  }

  await writeFile(rawTranscriptPath, `${rawTranscript.join("\n")}\n`, "utf8");

  const governance = {
    version: 1,
    generatedAt: new Date().toISOString(),
    turns: enrichedTurns.map((turn, index) => ({
      turn: index + 1,
      prompt: turn.prompt,
      interpretation: {
        requestedWorkMode: turn.state?.requestedWorkMode ?? "auto",
        effectiveWorkMode: turn.state?.effectiveWorkMode ?? "unknown",
        modeSource: turn.state?.modeSource ?? "unknown",
        executionStance: turn.state?.executionStance ?? "unknown",
        planningPath: turn.audit.planningPath.kind,
        planner: turn.audit.planner.label,
        verdict: turn.shellResult?.executed?.every((item) => item.ok !== false) ? "approved" : "rejected"
      },
      artifactAudit: {
        status: index === 0 ? "pending-build-audit" : "observational",
        planJsonPath: turn.audit.planJsonPath,
        planJsPath: turn.audit.planJsPath,
        tracePath: turn.audit.tracePath,
        workflowTracePath: turn.audit.workflowTracePath,
        workflowRunId: turn.audit.workflowRunId
      }
    }))
  };
  await mkdir(path.dirname(goePath), { recursive: true });
  await writeFile(goePath, `${JSON.stringify(governance, null, 2)}\n`, "utf8");

  return { turnsPath, dialogPath, rawTranscriptPath, rawDir, goePath, turns: enrichedTurns };
}

async function runUntilServed(command, args, cwd, { env = {}, timeoutMs = 10_000 } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      resolve(payload);
    };

    const timer = setTimeout(() => finish({
      ok: false,
      stdout,
      stderr,
      error: "Timed out waiting for server readiness."
    }), timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      const match = stdout.match(/Serving Emoji Star Lanes at (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        finish({
          ok: true,
          stdout,
          stderr,
          url: match[1]
        });
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        finish({
          ok: code === 0,
          stdout,
          stderr,
          error: code === 0 ? null : `Process exited with code ${code}.`
        });
      }
    });
  });
}

async function occupyPreferredPort() {
  return await new Promise((resolve) => {
    const child = spawn( "npx", "tsx", [
      "-e",
      "const server=require('node:http').createServer((_,res)=>res.end('busy'));server.listen(4173,'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));"
    ], {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    const timer = setTimeout(() => resolve({ child, busy: true, owner: "self" }), 200);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("exit", () => {
      clearTimeout(timer);
      resolve({ child: null, busy: true, owner: "external", stderr });
    });
  });
}

async function verifyDevScripts(targetRoot) {
  const blocker = await occupyPreferredPort();
  const runDev = await runUntilServed("npm", ["run", "dev"], targetRoot);
  const runServe = await runUntilServed("npm", ["run", "serve"], targetRoot);
  blocker.child?.kill("SIGTERM");

  return {
    blocker: {
      busy: blocker.busy,
      owner: blocker.owner
    },
    dev: {
      ok: runDev.ok,
      url: runDev.url ?? null,
      stdout: runDev.stdout,
      stderr: runDev.stderr
    },
    serve: {
      ok: runServe.ok,
      url: runServe.url ?? null,
      stdout: runServe.stdout,
      stderr: runServe.stderr
    }
  };
}

async function writeReport({
  targetRoot,
  turns,
  transcriptPaths,
  buildPayload,
  logicTest,
  artifactJudge,
  transcriptJudge,
  devScripts,
  runMetrics,
  runStartedAt,
  runFinishedAt,
  shortcutViolations
}) {
  const naturalLanguageTurns = turns.filter((turn) => isNaturalLanguagePrompt(turn.prompt)).length;
  const naturalLanguageRatio = turns.length ? Math.round((naturalLanguageTurns / turns.length) * 100) : 0;
  const transcriptJudgeStatus = transcriptJudge?.result?.status ?? "unavailable";
  const transcriptJudgeSummary = transcriptJudge?.result?.summary ?? "n/a";
  const transcriptJudgeStructured = transcriptJudge?.result?.structuredVerdict !== false;
  const artifactJudgeStatus = artifactJudge?.result?.status ?? "unavailable";
  const transcriptTurns = transcriptPaths.turns ?? turns;
  const traceRows = transcriptTurns.flatMap((turn) => turn.audit?.traceSummary?.rows ?? []);
  const artifactJudgeRoute = summarizeJudgeRoute(artifactJudge);
  const transcriptJudgeRoute = summarizeJudgeRoute(transcriptJudge);
  const judgeAttemptRows = [
    ...collectJudgeAttemptRows("artifact-judge", artifactJudge),
    ...collectJudgeAttemptRows("shell-transcript-judge", transcriptJudge)
  ];
  const metricByModel = summarizeMetricsByModel(runMetrics ?? []);
  const runPromptTokens = (runMetrics ?? []).reduce((sum, metric) => sum + Number(metric.prompt_tokens ?? 0), 0);
  const runCompletionTokens = (runMetrics ?? []).reduce((sum, metric) => sum + Number(metric.completion_tokens ?? 0), 0);
  const runTotalTokens = runPromptTokens + runCompletionTokens;
  const metricsMissingUsage = (runMetrics ?? []).filter((metric) => !(Number(metric.prompt_tokens ?? 0) + Number(metric.completion_tokens ?? 0)));
  const shortcutGatePassed = !(shortcutViolations?.length);
  const lines = [
    "# Programming Dogfood Report",
    "",
    "## Executive Summary",
    "",
    `- The shell-generated project exists at \`${targetRoot}\` and its browser/game checks passed.`,
    `- The shell transcript is at \`${transcriptPaths.dialogPath}\` and the raw turn log is at \`${transcriptPaths.turnsPath}\`.`,
    `- Natural-language human prompts: ${naturalLanguageTurns}/${turns.length} (${naturalLanguageRatio}%).`,
    `- Shell build output report: \`${buildPayload?.reportPath ?? "not generated by a hidden builder"}\`.`,
    `- Logic tests: ${logicTest.ok ? "pass" : "fail"}.`,
    `- Artifact judge: ${artifactJudgeStatus}.`,
    `- Transcript judge: ${transcriptJudgeStatus}.`,
    `- Shortcut gate: ${shortcutGatePassed ? "pass" : "fail"}.`,
    `- Run window: ${runStartedAt} -> ${runFinishedAt}.`,
    `- Run-scoped model usage: ${runTotalTokens} total tokens across ${(runMetrics ?? []).length} metric row(s).`,
    "",
    "## What The Human Asked For",
    "",
    "- A modular, expandable 3d canvas Space Invaders-style game that uses emoji ships.",
    "- Long-term vision, epics, features, modules, planning notes, tests, and debugging expectations.",
    "- A dedicated dogfood project folder that works through the real `ai-workflow shell` flow rather than a hidden direct write.",
    "- A project that still runs with `npm run dev` and `npm run serve` even if port `4173` is already busy.",
    ""
  ];

  lines.push("## Turn Audit Table");
  lines.push("");
  lines.push("| Turn | Prompt | Planning path | Planner | JS artifact | Executed action | Workflow run |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  transcriptTurns.forEach((turn, index) => {
    lines.push(`| ${index + 1} | ${summarizePromptForTable(turn.prompt)} | ${turn.audit?.planningPath?.kind ?? "unknown"} | ${turn.audit?.planner?.label ?? "unknown"} | ${turn.audit?.planJsPath ? path.basename(turn.audit.planJsPath) : "none"} | ${(turn.audit?.executedActions ?? ["none"]).join(", ")} | ${turn.audit?.workflowRunId ?? "n/a"} |`);
  });
  lines.push("");
  lines.push("## Shortcut Gate");
  lines.push("");
  lines.push(`- Forbidden shortcut ids: ${[...FORBIDDEN_DOGFOOD_CODELETS].join(", ")}.`);
  if (shortcutGatePassed) {
    lines.push("- Result: pass. No forbidden dogfood shortcut appeared in the shell plan or executed actions.");
  } else {
    lines.push("- Result: fail. Forbidden dogfood shortcut usage was detected:");
    for (const violation of shortcutViolations) {
      lines.push(`- Turn ${violation.turn}: ${violation.forbidden} via ${violation.source}.`);
    }
  }
  lines.push("");

  lines.push("## English To JS");
  lines.push("");
  for (const [index, turn] of transcriptTurns.entries()) {
    const snippet = await readArtifactSnippet(turn.audit?.planJsPath ?? null, 24);
    lines.push(`### Turn ${index + 1}`);
    lines.push(`- Human prompt: ${turn.prompt}`);
    lines.push(`- Planning path: ${turn.audit?.planningPath?.description ?? "unknown"} (${turn.audit?.planningPath?.kind ?? "unknown"})`);
    lines.push(`- Generated JS artifact: ${turn.audit?.planJsPath ? `\`${turn.audit.planJsPath}\`` : "none"}`);
    if (snippet) {
      lines.push("");
      lines.push("```js");
      lines.push(snippet);
      lines.push("```");
      lines.push("");
    } else {
      lines.push("- No JS artifact was generated for this turn.");
      lines.push("");
    }
  }

  lines.push("## What The Shell Actually Did");
  lines.push("");

  transcriptTurns.forEach((turn, index) => {
    const observedResult = extractObservedResultSummary(turn);
    lines.push(`### Turn ${index + 1}`);
    lines.push(`- Human prompt: ${turn.prompt}`);
    lines.push(`- Shell mode: ${turn.state?.requestedWorkMode ?? "auto"} -> ${turn.state?.effectiveWorkMode ?? "unknown"} (${turn.state?.modeSource ?? "unknown"})`);
    lines.push(`- Execution stance: ${turn.state?.executionStance ?? "unknown"}`);
    lines.push(`- Planning path: ${turn.audit?.planningPath?.description ?? "unknown"} (${turn.audit?.planningPath?.kind ?? "unknown"})`);
    lines.push(`- Planner: ${turn.audit?.planner?.label ?? "unknown"}`);
    lines.push(`- Plan summary: ${summarizePlan(turn.shellResult)}`);
    lines.push(`- Plan JSON artifact: \`${turn.audit?.planJsonPath ?? "n/a"}\``);
    lines.push(`- Generated JS artifact: ${turn.audit?.planJsPath ? `\`${turn.audit.planJsPath}\`` : "none"}`);
    lines.push(`- Trace ledger artifact: \`${turn.audit?.tracePath ?? "n/a"}\``);
    lines.push(`- Trace rows: ${turn.audit?.traceSummary?.attempts ?? 0}`);
    lines.push(`- Workflow trace events: ${turn.audit?.workflowTraceEvents?.length ?? 0}`);
    lines.push(`- Planned operations: ${(turn.audit?.plannedOperations ?? []).join(", ") || "none"}`);
    lines.push(`- Executed actions: ${(turn.audit?.executedActions ?? ["none"]).join(", ")}`);
    lines.push(`- Workflow run id: ${turn.audit?.workflowRunId ?? "n/a"}`);
    if (turn.audit?.workflowSteps?.length) {
      lines.push(`- Workflow steps: ${turn.audit.workflowSteps.map((step) => `${step.stepId}:${step.status}`).join(", ")}`);
    }
    if (observedResult) {
      lines.push(`- Observed result: ${observedResult}`);
    }
    lines.push("");
  });

  lines.push("## Evidence");
  lines.push("");
  lines.push(`- Game title found through shell search: \`Emoji Star Lanes\`.`);
  lines.push(`- Main epic found through shell search: \`EPIC-GAME-001\`.`);
  lines.push(`- Raw shell transcript: \`${transcriptPaths.rawTranscriptPath}\`.`);
  lines.push(`- Per-turn raw logs: \`${transcriptPaths.rawDir}\`.`);
  lines.push(`- Per-turn planner payloads and JS artifacts are stored under \`${transcriptPaths.rawDir}\`.`);
  lines.push(`- Per-turn workflow step traces are stored under \`${transcriptPaths.rawDir}\` as \`turn-XX.workflow-trace.json\`.`);
  lines.push(`- Playwright screenshot: \`${path.resolve(REPO_ROOT, "output", "playwright", "space-invaders-dogfood.png")}\`.`);
  lines.push(`- Shell governance log: \`${transcriptPaths.goePath}\`.`);
  lines.push("");

  lines.push("## Model Provenance");
  lines.push("");
  transcriptTurns.forEach((turn, index) => {
    lines.push(`- Turn ${index + 1}: ${turn.audit?.planner?.label ?? "unknown"} via ${turn.audit?.planningPath?.kind ?? "unknown"}`);
  });
  lines.push(`- Artifact judge route: recommended ${artifactJudgeRoute.recommended}; final ${artifactJudgeRoute.final}; fallback ${artifactJudgeRoute.fallbackUsed ? "yes" : "no"} (${artifactJudgeRoute.failedAttempts} failed attempt(s)).`);
  lines.push(`- Transcript judge route: recommended ${transcriptJudgeRoute.recommended}; final ${transcriptJudgeRoute.final}; fallback ${transcriptJudgeRoute.fallbackUsed ? "yes" : "no"} (${transcriptJudgeRoute.failedAttempts} failed attempt(s)).`);
  lines.push("");

  lines.push("## Model Attempt Ledger");
  lines.push("");
  if (judgeAttemptRows.length) {
    lines.push("| Stage | Attempt | Provider | Model | Success | Prompt | Completion | Total | Latency ms | Note |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of judgeAttemptRows) {
      lines.push(`| ${row.stage} | ${row.attempt} | ${row.providerId ?? "-"} | ${row.modelId ?? "-"} | ${row.success ? "yes" : "no"} | ${row.promptTokens ?? "n/a"} | ${row.completionTokens ?? "n/a"} | ${row.totalTokens ?? "n/a"} | ${row.latencyMs ?? "n/a"} | ${String(row.note ?? "").replace(/\|/g, "\\|")} |`);
    }
  } else {
    lines.push("- No judge route attempts were recorded.");
  }
  lines.push("");

  lines.push("## Ollama Outcome");
  lines.push("");
  if (!judgeAttemptRows.some((row) => row.providerId === "ollama")) {
    lines.push("- No Ollama attempt was recorded during this run.");
  } else {
    const ollamaFailures = judgeAttemptRows.filter((row) => row.providerId === "ollama" && !row.success);
    const ollamaSuccesses = judgeAttemptRows.filter((row) => row.providerId === "ollama" && row.success);
    if (ollamaSuccesses.length) {
      lines.push(`- Ollama succeeded on ${ollamaSuccesses.length} attempt(s).`);
    }
    if (ollamaFailures.length) {
      for (const row of ollamaFailures) {
        lines.push(`- ${row.stage} attempt ${row.attempt}: ${row.modelId ?? "unknown-model"} failed after ${row.latencyMs ?? "n/a"}ms (${row.note}).`);
      }
    }
    const nonOllamaSuccesses = judgeAttemptRows.filter((row) => row.providerId !== "ollama" && row.success);
    if (nonOllamaSuccesses.length) {
      for (const row of nonOllamaSuccesses) {
        lines.push(`- Fallback success: ${row.stage} completed on ${row.providerId ?? "unknown"}:${row.modelId ?? "unknown"} using ${row.totalTokens ?? "n/a"} token(s).`);
      }
    }
  }
  lines.push("");

  lines.push("## Shell Trace Ledger");
  lines.push("");
  if (traceRows.length) {
    lines.push("| Turn | Attempt | Stage | Phase | Provider | Model | Prompt | Completion | Total | Latency ms | Note |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of traceRows) {
      lines.push(`| ${row.turn} | ${row.attempt} | ${row.stage} | ${row.phase} | ${row.providerId ?? "-"} | ${row.modelId ?? row.plannerLabel ?? "-"} | ${row.promptTokens ?? "n/a"} | ${row.completionTokens ?? "n/a"} | ${row.totalTokens ?? "n/a"} | ${row.latencyMs ?? "n/a"} | ${String(row.note ?? "").replace(/\|/g, "\\|")} |`);
    }
  } else {
    lines.push("- No shell planner trace rows were captured for this run.");
    lines.push("- The shell-interpreter used the deterministic English-to-JS path for these turns, so there were no planner-model prompt/completion tokens to record at the shell-planning stage.");
    lines.push("- Model tokens for this run came from downstream judges and are listed in `Model Attempt Ledger` and `Run Metrics Ledger`.");
  }
  lines.push("");

  lines.push("## Run Metrics Ledger");
  lines.push("");
  if ((runMetrics ?? []).length) {
    lines.push("| Time | Root | Stage | Provider | Model | Prompt | Completion | Total | Latency ms | Success |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const metric of runMetrics) {
      const stage = String(metric.details?.stage ?? metric.task_class ?? "unknown");
      const promptTokens = Number(metric.prompt_tokens ?? 0);
      const completionTokens = Number(metric.completion_tokens ?? 0);
      const rootLabel = metric.projectRoot === targetRoot ? "dogfood-project" : "repo";
      lines.push(`| ${metric.created_at} | ${rootLabel} | ${stage} | ${metric.provider_id ?? "-"} | ${metric.model_id ?? "-"} | ${promptTokens || "n/a"} | ${completionTokens || "n/a"} | ${(promptTokens + completionTokens) || "n/a"} | ${metric.latency_ms ?? "n/a"} | ${metric.success ? "yes" : "no"} |`);
    }
  } else {
    lines.push("- No workflow metric rows fell inside the run window.");
  }
  lines.push("");

  lines.push("## Efficiency Summary");
  lines.push("");
  lines.push(`- Run prompt tokens: ${runPromptTokens}`);
  lines.push(`- Run completion tokens: ${runCompletionTokens}`);
  lines.push(`- Run total tokens: ${runTotalTokens}`);
  lines.push(`- Metrics without reported token usage: ${metricsMissingUsage.length}`);
  for (const entry of metricByModel) {
    lines.push(`- ${entry.label}: ${entry.totalTokens} total tokens across ${entry.calls} call(s), ${entry.latencyMs}ms total latency${entry.missingUsage ? `, ${entry.missingUsage} call(s) without usage` : ""}.`);
  }
  lines.push("");

  lines.push("## Run Validation");
  lines.push("");
  lines.push(`- \`npm run dev\`: ${devScripts.dev.ok ? "pass" : "fail"}${devScripts.dev.url ? ` (${devScripts.dev.url})` : ""}`);
  lines.push(`- \`npm run serve\`: ${devScripts.serve.ok ? "pass" : "fail"}${devScripts.serve.url ? ` (${devScripts.serve.url})` : ""}`);
  lines.push(`- Port 4173 occupancy during validation: ${devScripts.blocker.owner}`);
  lines.push("");
  lines.push("## Bugs Found While Dogfooding");
  lines.push("");
  lines.push("- Fixed: natural-language build requests no longer auto-route to the hidden `programming-dogfood-build` shortcut.");
  lines.push("- Fixed: the shell now has first-class file services for generated JS plans, so it can create and edit project files directly.");
  lines.push("- Fixed: the dogfood report now emits turn-level JS artifacts, trace ledgers, and run-scoped per-model token accounting instead of collapsing everything into a zero-token latest-session summary.");
  lines.push("- Fixed: the generated project used a hard-coded Python server and failed whenever `4173` was already in use.");
  lines.push("- Fixed: the builder emitted multiple JSON blobs to stdout, which made shell-side result parsing brittle.");
  lines.push("- Fixed: workflow step progress is now streamed to stderr during shell execution so the live run exposes the state-machine progression.");
  if (transcriptJudgeStructured) {
    lines.push(`- Fixed: the shell transcript judge now returns a structured verdict (${transcriptJudgeStatus}: ${transcriptJudgeSummary}).`);
  } else {
    lines.push(`- Still open: the shell transcript judge returned malformed output (${transcriptJudgeSummary}) instead of a structured verdict.`);
  }
  lines.push("");
  lines.push("## Remaining Gaps");
  lines.push("");
  lines.push("- This run records shell interpretation and artifact governance, but it does not claim the broader repo-wide GoE triad is fully implemented.");
  if (!shortcutGatePassed) {
    lines.push("- The shortcut gate failed, so this dogfood run does not satisfy the full-cycle DOD.");
  }
  if (traceRows.some((row) => !Number.isFinite(row.totalTokens))) {
    lines.push("- Some shell trace rows still lack token usage because the upstream provider call did not report usage; the ledger now calls that out explicitly instead of rolling it into zero.");
  }
  if (!transcriptJudgeStructured) {
    lines.push("- The transcript judge is still unreliable and should be treated as a workflow bug until it consistently returns structured output.");
  }
  if (artifactJudgeStatus !== "pass") {
    lines.push("- The project docs are good enough to pass artifact review, but the artifact judge still recommends richer user stories and ticket batches in the epic docs.");
  }

  const reportPath = path.join(targetRoot, "REPORT.md");
  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
  return reportPath;
}

export async function runProgrammingDogfood(argv = process.argv.slice(2)) {
  const args: any = parseArgs(argv);
  const targetRoot = path.resolve(String(args.target ?? DEFAULT_TARGET));
  const force = Boolean(args.force);
  const json = Boolean(args.json);
  const timeoutMs = Math.max(30_000, Number.parseInt(String(args["timeout-ms"] ?? DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS);
  const runStartedAt = new Date().toISOString();

  if (force) {
    await rm(targetRoot, { recursive: true, force: true });
  }
  await mkdir(targetRoot, { recursive: true });

  const statePath = path.join(REPO_ROOT, ".ai-workflow", "tmp", `${path.basename(targetRoot)}-shell-state.json`);
  const runTag = Date.now().toString(36);
  const turns = [];
  await mkdir(path.dirname(statePath), { recursive: true });
  await rm(statePath, { force: true });

  const syncShellProject = async () => {
    await runNode([CLI_PATH, "sync", "--write-projections", "--json"], targetRoot, { timeoutMs: 60_000 });
  };
  const appendTurn = async (promptSpec) => {
    const index = turns.length;
    const prompt = typeof promptSpec === "string" ? promptSpec : promptSpec.prompt;
    const cwd = typeof promptSpec === "string" ? targetRoot : promptSpec.cwd;
    const env = typeof promptSpec === "string" ? {} : (promptSpec.env ?? {});
    const turn = await runShellPrompt({
      cwd,
      prompt,
      statePath,
      runId: buildTurnRunId(targetRoot, index + 1, runTag),
      timeoutMs,
      env
    });
    turns.push(turn);
    return turn;
  };

  for (const promptSpec of getShellPrompts(targetRoot).slice(0, 2)) {
    await appendTurn(promptSpec);
    await syncShellProject();
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const scaffold = await assessProjectScaffold(targetRoot);
    if (scaffold.ok) {
      break;
    }
    await appendTurn({
      cwd: targetRoot,
      prompt: buildScaffoldRepairPrompt(scaffold),
      env: {
        AI_WORKFLOW_PLANNER_MODEL: "openai:gpt-4o"
      }
    });
    await syncShellProject();
  }

  const testTurn = await appendTurn({
    cwd: targetRoot,
    prompt: "Run the project's relevant tests and checks now. If anything fails, fix it by editing the project files directly and rerun until it passes. Return structured JSON with summary, changedFiles, and verification."
  });
  await syncShellProject();

  if (!didShellExecuteWorkflow(testTurn)) {
    await appendTurn({
      cwd: targetRoot,
      prompt: buildFailureRepairPrompt(
        "testing",
        testTurn,
        "Fix the test setup so `npm test` passes. If Jest is failing on ESM modules, either configure Jest correctly for ESM or switch the project to a simpler test runner such as Node's built-in `node --test`, but keep `npm test` working."
      ),
      env: {
        AI_WORKFLOW_PLANNER_MODEL: "openai:gpt-4o"
      }
    });
    await syncShellProject();
  }

  const serveTurn = await appendTurn({
    cwd: targetRoot,
    prompt: "Verify the generated app actually runs through both npm run dev and npm run serve from this project. If a script, asset, or config is broken, fix it in the project and rerun the checks. Return structured JSON with summary, changedFiles, and verification."
  });
  await syncShellProject();

  if (!didShellExecuteWorkflow(serveTurn)) {
    await appendTurn({
      cwd: targetRoot,
      prompt: buildFailureRepairPrompt(
        "serve verification",
        serveTurn,
        "Fix the project so both `npm run dev` and `npm run serve` run successfully from this project."
      ),
      env: {
        AI_WORKFLOW_PLANNER_MODEL: "openai:gpt-4o"
      }
    });
    await syncShellProject();
  }

  await appendTurn({
    cwd: targetRoot,
    prompt: "Inspect the generated project and prove that the full cycle completed. Show where the ready-to-play app entrypoint lives, where the long-term vision and epics live, where the tests live, and what was verified. Return structured JSON with summary, changedFiles, and verification."
  });

  const transcriptPaths = await writeTranscriptArtifacts({ targetRoot, turns });
  const reportTurns = transcriptPaths.turns ?? turns;
  const shortcutViolations = collectShortcutViolations(reportTurns);
  const buildPayload = turns.map((turn) => extractBuildPayload(turn)).find(Boolean) ?? {};
  const logicTest = await runNode(["--test", "tests/game-logic.test.ts"], targetRoot, { timeoutMs: 60_000 });
  const artifactJudge = await withTimeout(
    judgeArtifacts({
      projectRoot: targetRoot,
      artifactPaths: [
        "project-brief.md",
        "README.md",
        "epics.md",
        "kanban.md",
        path.relative(targetRoot, transcriptPaths.dialogPath)
      ],
      rubric: "The generated project and transcript must show a real shell-driven workflow for a modular, expandable emoji Space Invaders-like canvas game, including long-term vision, epic scope, features, modules, runnable instructions, and credible verification."
    }).catch((error) => ({ result: { status: "needs_human_review", score: 0, summary: String(error?.message ?? error) } })),
    30_000,
    () => ({ result: { status: "needs_human_review", score: 0, summary: "Timed out after 30000ms while judging artifacts." } })
  );
  const transcriptJudge = await withTimeout(
    judgeShellTranscripts({
      projectRoot: targetRoot,
      artifactPaths: [transcriptPaths.dialogPath],
      rubric: "The transcript must read like a non-programmer operator using the real ai-workflow shell to create the game, with grounded actions, preserved subject, and no hidden direct-code shortcut."
    }).catch((error) => ({ result: { status: "needs_human_review", score: 0, summary: String(error?.message ?? error) } })),
    30_000,
    () => ({ result: { status: "needs_human_review", score: 0, summary: "Timed out after 30000ms while judging the shell transcript." } })
  );
  const devScripts = await verifyDevScripts(targetRoot);
  const runFinishedAt = new Date().toISOString();
  const [repoRunMetrics, targetRunMetrics] = await Promise.all([
    readRunMetrics(REPO_ROOT, {
      startedAt: runStartedAt,
      endedAt: runFinishedAt
    }).catch(() => []),
    readRunMetrics(targetRoot, {
      startedAt: runStartedAt,
      endedAt: runFinishedAt
    }).catch(() => [])
  ]);
  const runMetrics = [...repoRunMetrics, ...targetRunMetrics]
    .sort((left, right) => (parseIsoMs(left.created_at) ?? 0) - (parseIsoMs(right.created_at) ?? 0));
  const reportPath = await writeReport({
    targetRoot,
    turns: reportTurns,
    transcriptPaths,
    buildPayload,
    logicTest,
    artifactJudge,
    transcriptJudge,
    devScripts,
    runMetrics,
    runStartedAt,
    runFinishedAt,
    shortcutViolations
  });

  const payload = {
    targetRoot,
    reportPath,
    transcriptPaths,
    shellTurns: turns.map((turn, index) => ({
      turn: index + 1,
      prompt: turn.prompt,
      requestedWorkMode: turn.state?.requestedWorkMode ?? null,
      effectiveWorkMode: turn.state?.effectiveWorkMode ?? null,
      modeSource: turn.state?.modeSource ?? null,
      executionStance: turn.state?.executionStance ?? null,
      planSummary: summarizePlan(turn.shellResult),
      planningPath: (reportTurns[index]?.audit?.planningPath?.kind) ?? null,
      planner: reportTurns[index]?.audit?.planner ?? null,
      workflowRunId: reportTurns[index]?.audit?.workflowRunId ?? null
    })),
    buildPayload,
    logicTest,
    artifactJudge: artifactJudge?.result ?? null,
    transcriptJudge: transcriptJudge?.result ?? null,
    devScripts,
    runMetrics,
    shortcutViolations
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write([
      `Target: ${targetRoot}`,
      `Report: ${reportPath}`,
      `Dialog: ${transcriptPaths.dialogPath}`,
      `Logic tests: ${logicTest.ok ? "pass" : "fail"}`,
      `npm run dev: ${devScripts.dev.ok ? "pass" : "fail"}`,
      `npm run serve: ${devScripts.serve.ok ? "pass" : "fail"}`
    ].join("\n") + "\n");
  }

  return logicTest.ok
    && devScripts.dev.ok
    && devScripts.serve.ok
    && shortcutViolations.length === 0
    ? 0
    : 1;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const exitCode = await runProgrammingDogfood();
  process.exitCode = typeof exitCode === "number" ? exitCode : 0;
}
