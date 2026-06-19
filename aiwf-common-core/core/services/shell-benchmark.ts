/**
 * Responsibility: Run live shell trust benchmarks against fixed operator-style corpora.
 * Scope: Executes the real CLI shell surface, records artifacts, and reports deterministic plus judged quality signals.
 */

import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  SHELL_TRUST_BENCHMARK_CASES,
  SHELL_TRUST_BENCHMARK_MIN_CASES,
  SHELL_TRUST_BENCHMARK_SUITE_ID,
  SHELL_TRUST_BENCHMARK_THRESHOLD
} from "../../shared/prompts/shell-trust-benchmark.ts";
import { judgeShellTranscripts } from "./shell-transcript-verification.ts";

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_TOTAL_TIMEOUT_MS = 120000;

export async function runShellBenchmark(promptOrOptions = {}, options = {}) {
  const prompt = typeof promptOrOptions === "string" ? String(promptOrOptions).trim() : "";
  const mergedOptions = prompt
    ? options
    : (promptOrOptions && typeof promptOrOptions === "object" ? promptOrOptions : options);
  const suite = String(mergedOptions?.suite ?? "").trim();

  if (suite) {
    if (suite !== SHELL_TRUST_BENCHMARK_SUITE_ID) {
      return { ok: false, error: `Unknown benchmark suite: ${suite}` };
    }
    return runShellTrustBenchmark(mergedOptions);
  }

  if (!prompt) {
    return {
      ok: false,
      error: `Benchmark requires a prompt or --suite ${SHELL_TRUST_BENCHMARK_SUITE_ID}.`
    };
  }

  return runAdHocShellBenchmark(prompt, mergedOptions);
}

export async function runShellTrustBenchmark(options = {}) {
  const root = path.resolve(String(options.root ?? process.cwd()));
  const cliPath = resolveCliPath(root, options);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const totalTimeoutMs = normalizeTotalTimeout(options.totalTimeoutMs);
  const now = typeof options.now === "function" ? options.now : Date.now;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const cases = Array.isArray(options.cases) && options.cases.length
    ? options.cases
    : SHELL_TRUST_BENCHMARK_CASES;
  const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : SHELL_TRUST_BENCHMARK_THRESHOLD;
  const minimumCaseCount = Number.isFinite(options.minimumCaseCount)
    ? Number(options.minimumCaseCount)
    : SHELL_TRUST_BENCHMARK_MIN_CASES;
  const expectLocalModel = Boolean(options.expectLocalModel);
  const runCommand = options.runCommand ?? runNodeProcess;
  const judge = options.judge ?? judgeShellTranscripts;
  const keepArtifacts = options.keepArtifacts ?? true;
  const requestedArtifactRoot = options.artifactRoot
    ? path.resolve(String(options.artifactRoot))
    : await mkdtemp(path.join(os.tmpdir(), "ai-workflow-shell-benchmark-"));
  const benchmarkRunId = options.runId ?? `shell-trust-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const artifactRoot = options.artifactRoot
    ? path.join(requestedArtifactRoot, benchmarkRunId)
    : requestedArtifactRoot;
  const startedAt = now();
  const deadlineAt = startedAt + totalTimeoutMs;

  await mkdir(artifactRoot, { recursive: true });

  try {
    const caseResults = [];
    emitProgress(onProgress, {
      type: "suite_start",
      message: `shell-trust benchmark starting ${cases.length} cases with ${totalTimeoutMs}ms total timeout`,
      caseCount: cases.length,
      totalTimeoutMs
    });
    for (const [index, benchmarkCase] of cases.entries()) {
      const remainingMs = deadlineAt - now();
      if (remainingMs <= 0) {
        break;
      }
      emitProgress(onProgress, {
        type: "case_start",
        message: `shell-trust case ${index + 1}/${cases.length} starting: ${benchmarkCase.id}`,
        caseId: benchmarkCase.id,
        caseIndex: index,
        caseCount: cases.length,
        remainingMs
      });
      const caseResult = await runBenchmarkedShellCase({
        root,
        cliPath,
        timeoutMs: Math.min(timeoutMs, remainingMs),
        benchmarkCase,
        artifactRoot,
        expectLocalModel,
        runCommand,
        judge
      });
      caseResults.push(caseResult);
      emitProgress(onProgress, {
        type: "case_complete",
        message: `shell-trust case ${index + 1}/${cases.length} ${caseResult.ok ? "passed" : "failed"} in ${caseResult.durationMs}ms: ${benchmarkCase.id}`,
        caseId: benchmarkCase.id,
        caseIndex: index,
        caseCount: cases.length,
        ok: caseResult.ok,
        durationMs: caseResult.durationMs,
        remainingMs: Math.max(0, deadlineAt - now())
      });
    }

    const remainingCaseIds = cases.slice(caseResults.length).map((item) => item.id);
    const incomplete = remainingCaseIds.length > 0;
    const timedOut = incomplete && now() >= deadlineAt;
    const passedCount = caseResults.filter((item) => item.ok).length;
    const failedCases = caseResults.filter((item) => !item.ok);
    const failedCriticalCases = failedCases.filter((item) => item.critical).map((item) => item.id);
    const caseCount = caseResults.length;
    const passRate = caseCount ? passedCount / caseCount : 0;
    const ok = !incomplete
      && caseCount >= minimumCaseCount
      && passRate >= threshold
      && failedCriticalCases.length === 0;

    const payload = {
      ok,
      incomplete,
      timedOut,
      suiteId: SHELL_TRUST_BENCHMARK_SUITE_ID,
      root,
      cliPath,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(now()).toISOString(),
      durationMs: now() - startedAt,
      totalTimeoutMs,
      threshold,
      caseCount,
      minimumCaseCount,
      passedCount,
      passRate,
      failedCaseIds: failedCases.map((item) => item.id),
      failedCriticalCases,
      remainingCaseIds,
      artifactRoot,
      cases: caseResults,
      summary: buildBenchmarkSummary({
        ok,
        passedCount,
        caseCount,
        totalCaseCount: cases.length,
        failedCriticalCases,
        incomplete,
        remainingCaseIds
      })
    };
    await writeFile(path.join(artifactRoot, "benchmark.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    emitProgress(onProgress, {
      type: incomplete ? "suite_incomplete" : "suite_complete",
      message: payload.summary,
      ok,
      incomplete,
      timedOut,
      durationMs: payload.durationMs,
      remainingCaseIds
    });
    return payload;
  } finally {
    if (!options.artifactRoot && !keepArtifacts) {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }
}

async function runAdHocShellBenchmark(prompt, options = {}) {
  const root = path.resolve(String(options.root ?? process.cwd()));
  const cliPath = resolveCliPath(root, options);
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const runCommand = options.runCommand ?? runNodeProcess;
  const judge = options.judge ?? judgeShellTranscripts;
  const artifactRoot = options.artifactRoot
    ? path.resolve(String(options.artifactRoot))
    : await mkdtemp(path.join(os.tmpdir(), "ai-workflow-shell-ad-hoc-"));
  const benchmarkCase = {
    id: "ad-hoc-shell-prompt",
    title: "Ad hoc shell prompt benchmark",
    critical: true,
    requireProgress: true,
    expectLocalWhenAvailable: Boolean(options.expectLocalModel),
    prompt,
    rubric: "The shell output must answer the prompt directly, stay grounded in repo or workflow evidence when relevant, avoid planner/router chatter, and must not ask for a clearer phrasing when a concrete answer was possible.",
    requiredPatterns: [],
    bannedPatterns: [/needs the ai planner/i, /clearer phrasing/i]
  };

  try {
    const result = await runBenchmarkedShellCase({
      root,
      cliPath,
      timeoutMs,
      benchmarkCase,
      artifactRoot,
      expectLocalModel: Boolean(options.expectLocalModel),
      runCommand,
      judge
    });

    const payload = {
      ok: result.ok,
      suiteId: "ad-hoc-shell-prompt",
      root,
      cliPath,
      caseCount: 1,
      passedCount: result.ok ? 1 : 0,
      passRate: result.ok ? 1 : 0,
      artifactRoot,
      cases: [result],
      summary: result.ok
        ? "Ad hoc shell benchmark passed."
        : `Ad hoc shell benchmark failed: ${result.failures.join("; ")}`
    };
    await writeFile(path.join(artifactRoot, "benchmark.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return payload;
  } finally {
    if (!options.artifactRoot) {
      await rm(artifactRoot, { recursive: true, force: true });
    }
  }
}

async function runBenchmarkedShellCase({
  root,
  cliPath,
  timeoutMs,
  benchmarkCase,
  artifactRoot,
  expectLocalModel,
  runCommand,
  judge
}) {
  const commandArgs = [cliPath, "shell", benchmarkCase.prompt, "--trace"];
  const result = await runCommand({
    cwd: root,
    timeoutMs,
    args: commandArgs
  });
  const model = extractModelTrace(result.stdout, result.stderr);
  const progressLines = extractProgressLines(result.stdout, result.stderr);
  const visibleText = extractVisibleText(result.stdout, result.stderr);
  const combinedText = `${visibleText}\n${result.stderr ?? ""}`.trim();
  const transcriptPath = path.join(artifactRoot, `${benchmarkCase.id}.txt`);
  const transcript = [
    `Case: ${benchmarkCase.id}`,
    `Title: ${benchmarkCase.title}`,
    `Prompt: ${benchmarkCase.prompt}`,
    `Command: ${ "npx", "tsx"} ${commandArgs.map(shellQuote).join(" ")}`,
    model ? `Model: ${model}` : null,
    progressLines.length ? `Progress:\n${progressLines.join("\n")}` : null,
    "Visible output:",
    visibleText || "(empty)",
    "",
    "Stderr:",
    result.stderr ?? ""
  ].filter(Boolean).join("\n\n");
  await writeFile(transcriptPath, `${transcript}\n`, "utf8");

  const deterministicFailures = collectDeterministicFailures({
    benchmarkCase,
    result,
    model,
    progressLines,
    combinedText,
    expectLocalModel
  });
  const semantic = deterministicFailures.length === 0
    ? await maybeJudgeBenchmarkCase({
        benchmarkCase,
        root,
        transcriptPath,
        model,
        judge
      })
    : null;
  const semanticStatus = semantic?.result?.status ?? null;
  const semanticFailure = deterministicFailures.length > 0 && semanticStatus === "fail"
    ? [semantic?.result?.summary ?? "semantic shell benchmark judgment failed"]
    : [];
  const semanticWarnings = deterministicFailures.length === 0 && semanticStatus === "fail"
    ? [semantic?.result?.summary ?? "semantic shell benchmark judgment failed"]
    : [];
  const ok = deterministicFailures.length === 0 && semanticFailure.length === 0;

  return {
    id: benchmarkCase.id,
    title: benchmarkCase.title,
    critical: Boolean(benchmarkCase.critical),
    ok,
    code: result.code,
    timedOut: Boolean(result.timedOut),
    durationMs: result.durationMs,
    model,
    progressLines,
    transcriptPath,
    prompt: benchmarkCase.prompt,
    stdout: truncateText(result.stdout, 2400),
    stderr: truncateText(result.stderr, 1600),
    visibleText: truncateText(visibleText, 2400),
    failures: [...deterministicFailures, ...semanticFailure],
    semanticWarnings,
    semantic: semantic
      ? {
          status: semantic.result?.status ?? "needs_human_review",
          score: semantic.result?.score ?? 0,
          confidence: semantic.result?.confidence ?? 0,
          summary: semantic.result?.summary ?? ""
        }
      : null
  };
}

async function maybeJudgeBenchmarkCase({ benchmarkCase, root, transcriptPath, model, judge }) {
  if (typeof judge !== "function" || !benchmarkCase.rubric) {
    return null;
  }
  const routedModel = parseModelRef(model);
  return judge({
    projectRoot: root,
    artifactPaths: [transcriptPath],
    rubric: benchmarkCase.rubric,
    goal: benchmarkCase.title,
    providerId: routedModel?.providerId ?? null,
    modelId: routedModel?.modelId ?? null
  });
}

function collectDeterministicFailures({
  benchmarkCase,
  result,
  model,
  progressLines,
  combinedText,
  expectLocalModel
}) {
  const failures = [];
  if (result.code !== 0) {
    failures.push(`shell exited with code ${result.code}`);
  }
  if (benchmarkCase.requireProgress && !progressLines.length) {
    failures.push("missing non-interactive shell progress output");
  }
  if (!model) {
    failures.push("missing shell model trace");
  }
  if (expectLocalModel && benchmarkCase.expectLocalWhenAvailable && model && !/^ollama:/i.test(model)) {
    failures.push("expected local Ollama routing when Ollama is available");
  }
  for (const pattern of benchmarkCase.requiredPatterns ?? []) {
    if (!pattern.test(combinedText)) {
      failures.push(`missing required signal: ${pattern}`);
    }
  }
  for (const pattern of benchmarkCase.bannedPatterns ?? []) {
    if (pattern.test(combinedText)) {
      failures.push(`matched banned signal: ${pattern}`);
    }
  }
  return failures;
}

function buildBenchmarkSummary({ ok, passedCount, caseCount, totalCaseCount = caseCount, failedCriticalCases, incomplete = false, remainingCaseIds = [] }) {
  if (ok) {
    return `Shell trust benchmark passed ${passedCount}/${caseCount} cases.`;
  }
  if (incomplete) {
    return `Shell trust benchmark incomplete after completing ${caseCount}/${totalCaseCount} cases (${passedCount} passed). Remaining cases: ${remainingCaseIds.join(", ")}.`;
  }
  const critical = failedCriticalCases.length
    ? ` Critical failures: ${failedCriticalCases.join(", ")}.`
    : "";
  return `Shell trust benchmark failed ${caseCount - passedCount}/${caseCount} cases.${critical}`;
}

function resolveCliPath(root, options) {
  if (options.cliPath) {
    return path.resolve(String(options.cliPath));
  }
  if (options.toolkitRoot) {
    return path.resolve(String(options.toolkitRoot), "cli", "ai-workflow.mjs");
  }
  return path.resolve(root, "cli", "ai-workflow.mjs");
}

function normalizeTimeout(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
}

function normalizeTotalTimeout(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? Number(timeoutMs) : DEFAULT_TOTAL_TIMEOUT_MS;
}

function emitProgress(onProgress, event) {
  if (!onProgress) {
    return;
  }
  try {
    onProgress(event);
  } catch {
    // Progress reporting must not break benchmark execution.
  }
}

function extractModelTrace(stdout, stderr) {
  const combined = `${stdout ?? ""}\n${stderr ?? ""}`;
  const match = combined.match(/(?:\[trace\]|\[progress\]\s+planning and running)\s*[^\n]*->\s*([^\n]+)/i);
  return match ? match[1].trim() : null;
}

function extractProgressLines(stdout, stderr) {
  const combined = `${stdout ?? ""}\n${stderr ?? ""}`;
  return combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("[progress] "));
}

function extractVisibleText(stdout, stderr) {
  return `${stdout ?? ""}\n${stderr ?? ""}`
    .split(/\r?\n/)
    .filter((line) => !/^\[(?:progress|trace|workflow)\]/.test(line.trim()))
    .join("\n")
    .trim();
}

function parseModelRef(model) {
  const text = String(model ?? "").trim();
  const match = text.match(/^([^:]+):(.+?)(?:\s+@|$)/);
  if (!match) {
    return null;
  }
  return {
    providerId: match[1],
    modelId: match[2]
  };
}

function truncateText(value, maxLength = 1600) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n... [truncated]`;
}

function shellQuote(value) {
  return JSON.stringify(String(value));
}

async function runNodeProcess({ cwd, args, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(resolveTsxCliPath(), args, {
      cwd,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        FORCE_COLOR: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      stderr += error.message;
      finish(1);
    });
    child.on("close", (code) => {
      finish(code);
    });
  });
}

function killProcessTree(child) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall through to killing only the direct child.
    }
  }
  child.kill("SIGKILL");
}

export async function readShellBenchmarkArtifacts(artifactRoot) {
  const payloadPath = path.resolve(String(artifactRoot), "benchmark.json");
  const raw = await readFile(payloadPath, "utf8");
  return JSON.parse(raw);
}
import { resolveTsxCliPath } from "../lib/tsx-runtime.ts";
