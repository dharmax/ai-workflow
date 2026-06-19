import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { judgeShellTranscripts } from "../services/shell-transcript-verification.ts";
import { ensureDir, readText } from "./fs-utils.ts";
import { getShellRoot, getToolkitRoot } from "./toolkit-root.ts";
import { resolveTsxCliPath } from "./tsx-runtime.ts";
import { collectOperatorSurfaceState, listOperatorSurfaceIds } from "./operator-surfaces.ts";
import { inspectWorkspaceHonesty } from "./workspace-honesty.ts";
import { runDogfoodHarness } from "../services/dogfood-harness.ts";
import { runShellTrustBenchmark } from "../services/shell-benchmark.ts";

export const DEFAULT_DOGFOOD_REPORT_PATH = ".ai-workflow/generated/dogfood-report.json";

export async function runDogfood({
  silent = false,
  root = process.cwd(),
  surfaces = listOperatorSurfaceIds(),
  profile = "full",
  toolkitRoot = getToolkitRoot(),
  timeoutMs = 45000,
  writeReport = true
} = {}) {
  const normalizedRoot = path.resolve(root);
  const requestedSurfaces = dedupeSurfaceIds(surfaces);
  const cliPath = resolveShellCliPath(toolkitRoot);
  const startedAt: string = new Date().toISOString();
  const surfaceSnapshots = await collectOperatorSurfaceState(normalizedRoot, requestedSurfaces);
  const report = {
    version: 2,
    generatedAt: startedAt,
    root: normalizedRoot,
    toolkitRoot,
    profile,
    timeoutMs,
    status: "pass",
    workspaceHonesty: null,
    surfaces: {}
  };

  const pendingSurfaces = {};
  for (const surfaceId of requestedSurfaces) {
    const snapshot = surfaceSnapshots[surfaceId] ?? { fileCount: 0, files: [], fileHashes: {} };
    const scenarios = await runSurfaceScenarios({
      surfaceId,
      profile,
      root: normalizedRoot,
      toolkitRoot,
      cliPath,
      timeoutMs
    });
    pendingSurfaces[surfaceId] = {
      description: snapshot.description ?? null,
      fileCount: snapshot.fileCount ?? 0,
      files: snapshot.files ?? [],
      fileHashes: snapshot.fileHashes ?? {},
      scenarios
    };
  }

  const workspaceHonesty = await inspectWorkspaceHonesty(normalizedRoot);
  report.workspaceHonesty = workspaceHonesty;

  for (const [surfaceId, pendingSurface] of Object.entries(pendingSurfaces)) {
    const scenarios = [...pendingSurface.scenarios];
    const surfaceHonesty = summarizeSurfaceHonesty(workspaceHonesty, pendingSurface.files ?? []);
    if (surfaceHonesty.status === "fail") {
      scenarios.push({
        id: "workspace-honesty",
        description: "surface files are newer than the latest ai-workflow mutation record",
        ok: false,
        stdout: "",
        stderr: surfaceHonesty.summary,
        code: 1
      });
    }
    const passed = scenarios.every((scenario) => scenario.ok);

    report.surfaces[surfaceId] = {
      ...pendingSurface,
      scenarioCount: scenarios.length,
      status: passed ? "pass" : "fail",
      workspaceHonesty: surfaceHonesty,
      scenarios
    };
  }

  report.status = Object.values(report.surfaces).every((surface) => surface.status === "pass")
    && workspaceHonesty.status !== "fail"
    ? "pass"
    : "fail";

  if (writeReport) {
    const reportPath = path.resolve(normalizedRoot, DEFAULT_DOGFOOD_REPORT_PATH);
    await ensureDir(path.dirname(reportPath));
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

function resolveShellCliPath(toolkitRoot) {
  const shellRoot = getShellRoot(toolkitRoot);
  return path.resolve(shellRoot, "cli", "ai-workflow.ts");
}

export async function readDogfoodReport(root = process.cwd()) {
  const reportPath = path.resolve(root, DEFAULT_DOGFOOD_REPORT_PATH);
  const raw = await readText(reportPath, "");
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function dedupeSurfaceIds(surfaceIds) {
  const values = Array.isArray(surfaceIds)
    ? surfaceIds
    : String(surfaceIds ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function summarizeSurfaceHonesty(workspaceHonesty, files) {
  if (workspaceHonesty?.status !== "fail") {
    return {
      status: workspaceHonesty?.status ?? "unknown",
      suspiciousCount: 0,
      suspiciousFiles: [],
      summary: workspaceHonesty?.summary ?? "workspace honesty status unavailable"
    };
  }

  const fileSet = new Set((files ?? []).map((file) => String(file)));
  const suspiciousFiles = (workspaceHonesty.suspiciousFiles ?? []).filter((file) => fileSet.has(file.relativePath));
  if (!suspiciousFiles.length) {
    return {
      status: "pass",
      suspiciousCount: 0,
      suspiciousFiles: [],
      summary: "surface files align with the latest ai-workflow mutation record"
    };
  }

  return {
    status: "fail",
    suspiciousCount: suspiciousFiles.length,
    suspiciousFiles,
    summary: `found ${suspiciousFiles.length} surface file(s) newer than the latest ai-workflow mutation record`
  };
}

async function runSurfaceScenarios({ surfaceId, profile, root, toolkitRoot, cliPath, timeoutMs }) {
  switch (surfaceId) {
    case "shell":
      return buildShellScenarios({ profile, cliPath, root, timeoutMs });
    case "provider":
      return buildProviderScenarios({ cliPath, root, timeoutMs });
    case "workflow":
      return buildWorkflowScenarios({ cliPath, root, timeoutMs });
    case "init":
      if (profile === "bootstrap") {
        return [];
      }
      return buildInitScenarios({ cliPath, root, timeoutMs, toolkitRoot });
    case "smart-programming":
      return buildSmartProgrammingScenarios({ root, timeoutMs });
    default:
      return [];
  }
}

async function buildSmartProgrammingScenarios({ root, timeoutMs }) {
  const startedAt = Date.now();
  if (!silent) console.log("[dogfood] Starting smart-programming dogfood (Space Invaders Game generation)...");
  
  try {
    const report = await runDogfoodHarness({ root });
    const durationMs = Date.now() - startedAt;
    
    return [
      {
        id: "space-invaders-generation",
        description: "Generate and verify a modular emoji space-invaders-style 3d canvas game",
        ok: report.ok,
        durationMs,
        stdout: report.summary,
        stderr: report.ok ? "" : (report.error ?? "Generation failed"),
        model: "ai-workflow:recursive",
        progressLines: [
          `[progress] latency: ${report.verification.latencyMs}ms`,
          `[progress] tokens: ${report.verification.tokens}`,
          `[progress] files: ${report.verification.fileCount}`
        ]
      }
    ];
  } catch (err) {
    return [
      {
        id: "space-invaders-generation",
        description: "Generate and verify a modular emoji space-invaders-style 3d canvas game",
        ok: false,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: `Dogfood harness crash: ${err.message}`,
        model: "ai-workflow:recursive"
      }
    ];
  }
}

async function buildShellScenarios({ profile, cliPath, root, timeoutMs }) {
  const shellPlanningExpectation = profile === "bootstrap"
    ? { expectLocalModel: false }
    : await detectShellPlanningExpectation({ cliPath, root, timeoutMs });
  const scenarios = [
    await runCliScenario({
      id: "doctor-command",
      description: "shell handles `doctor` locally",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["shell", "doctor", "--json", "--no-ai"]
    }),
    await runCliScenario({
      id: "doctor-help-command",
      description: "shell handles `doctor help` locally",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["shell", "doctor help", "--json", "--no-ai"]
    }),
    await runCliScenario({
      id: "incomplete-epic-request",
      description: "shell asks for the missing epic topic without AI",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["shell", "can you write an epic?", "--json", "--no-ai"]
    }),
    await runCliScenario({
      id: "epic-read-request",
      description: "shell answers `epic?` without AI",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["shell", "epic?", "--json", "--no-ai"]
    })
  ];

  if (profile !== "bootstrap") {
    scenarios.push(await runCliScenario({
      id: "ai-planning-read",
      description: "shell answers a planning question with trace enabled",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["shell", "Give me a concise operator brief grounded in the current workflow state, and justify the recommendation.", "--trace"],
      validationHints: {
        ...shellPlanningExpectation,
        semanticRubric: "The shell output must directly answer the operator brief request, stay grounded in workflow/project state, avoid exposing internal planner/router chatter, and must not say it needs the AI planner or a clearer phrasing."
      }
    }));
    scenarios.push(await runCliScenario({
      id: "ai-explainer-read",
      description: "shell answers a repo explainer question with grounded AI fallback behavior",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["shell", "what is the projections service?", "--trace"],
      validationHints: {
        ...shellPlanningExpectation,
        semanticRubric: "The shell output must answer what the projections service is, mention projections directly, stay grounded in repo/project evidence, avoid internal planner/router chatter, and must not say it needs the AI planner or a clearer phrasing."
      }
    }));
    const benchmark = await runShellTrustBenchmark({
      root,
      cliPath,
      timeoutMs: Math.max(timeoutMs, 90000),
      expectLocalModel: shellPlanningExpectation.expectLocalModel,
      artifactRoot: path.resolve(root, ".ai-workflow", "generated", "shell-benchmark")
    });
    scenarios.push({
      id: "human-language-benchmark",
      description: "shell survives a fixed corpus of messy operator prompts grounded in this repo",
      command: `bun ${cliPath} tool benchmark --suite shell-trust --json`,
      ok: benchmark.ok,
      code: benchmark.ok ? 0 : 1,
      timedOut: false,
      durationMs: benchmark.durationMs,
      model: null,
      progressLines: [
        `[progress] benchmark pass rate: ${benchmark.passedCount}/${benchmark.caseCount}`,
        `[progress] benchmark threshold: ${benchmark.threshold}`
      ],
      stdout: truncateText(JSON.stringify({
        summary: benchmark.summary,
        suiteId: benchmark.suiteId,
        passRate: benchmark.passRate,
        passedCount: benchmark.passedCount,
        caseCount: benchmark.caseCount,
        failedCaseIds: benchmark.failedCaseIds,
        artifactRoot: benchmark.artifactRoot
      }, null, 2)),
      stderr: benchmark.ok
        ? ""
        : truncateText(benchmark.cases.filter((item) => !item.ok).map((item) => `${item.id}: ${item.failures.join("; ")}`).join("\n")),
      benchmark
    });
  }

  return scenarios;
}

async function detectShellPlanningExpectation({ cliPath, root, timeoutMs }) {
  const result = await runNodeProcess({
    cwd: root,
    timeoutMs,
    args: [cliPath, "route", "shell-planning", "--json"]
  });
  if (result.code !== 0) {
    return { expectLocalModel: false };
  }

  try {
    const payload = JSON.parse(result.stdout);
    return {
      expectLocalModel: Boolean(payload?.providers?.ollama?.available)
    };
  } catch {
    return { expectLocalModel: false };
  }
}

async function buildProviderScenarios({ cliPath, root, timeoutMs }) {
  return [
    await runCliScenario({
      id: "doctor-json",
      description: "doctor returns provider status",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["doctor", "--json"]
    }),
    await runCliScenario({
      id: "route-shell-planning",
      description: "route shell-planning returns the current planner chain",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["route", "shell-planning", "--json"]
    })
  ];
}

async function buildWorkflowScenarios({ cliPath, root, timeoutMs }) {
  return [
    await runCliScenario({
      id: "sync-json",
      description: "sync returns workflow summary",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["sync", "--json"]
    }),
    await runCliScenario({
      id: "project-summary-json",
      description: "project summary is available through the workflow CLI",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["project", "summary", "--json"]
    }),
    await runCliScenario({
      id: "guidelines-extract",
      description: "guideline extraction returns workflow-first guidance",
      cwd: root,
      timeoutMs,
      cliPath,
      args: ["extract", "guidelines", "dogfooding"]
    })
  ];
}

async function buildInitScenarios({ timeoutMs, toolkitRoot }) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-dogfood-init-"));
  const initScriptPath = path.resolve(getShellRoot(toolkitRoot), "scripts", "init-project.ts");
  const auditScriptPath = path.resolve(fixtureRoot, "scripts", "ai-workflow", "workflow-audit.ts");
  const initTimeoutMs = Math.max(timeoutMs, 90000);
  try {
    const initResult = await runNodeProcess({
      cwd: toolkitRoot,
      timeoutMs: initTimeoutMs,
      args: [initScriptPath, "--target", fixtureRoot]
    });
    const auditResult = initResult.code === 0
      ? await runNodeProcess({
          cwd: fixtureRoot,
          timeoutMs,
          args: [auditScriptPath, "--json"]
        })
      : {
          code: 1,
          stdout: "",
          stderr: "skipped workflow-audit because init failed",
          timedOut: false,
          durationMs: 0
        };

    return [
      buildScenarioResult({
        id: "init-project",
        description: "init installs workflow scaffolding and bootstrap dogfood report",
        command: `bun ${initScriptPath} --target ${fixtureRoot}`,
        result: initResult
      }),
      buildScenarioResult({
        id: "init-audit",
        description: "initialized project passes workflow-audit immediately",
        command: `bun ${auditScriptPath} --json`,
        result: auditResult
      })
    ];
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

async function runCliScenario({ id, description, cwd, timeoutMs, cliPath, args, validationHints = {} }) {
  const result = await runNodeProcess({
    cwd,
    timeoutMs,
    args: [cliPath, ...args]
  });
  const scenario = buildScenarioResult({
    id,
    description,
    command: `bun ${cliPath} ${args.map(shellQuote).join(" ")}`,
    result,
    validationHints
  });
  return applyScenarioSemanticValidation({ cwd, scenario, validationHints });
}

function buildScenarioResult({ id, description, command, result, validationHints = {} }) {
  const model = extractModelTrace(result.stdout, result.stderr);
  const progressLines = extractProgressLines(result.stdout, result.stderr);
  const validation = validateScenarioResult({ id, result, model, progressLines, validationHints });
  return {
    id,
    description,
    command,
    ok: validation.ok,
    code: result.code,
    timedOut: Boolean(result.timedOut),
    durationMs: result.durationMs,
    model,
    progressLines,
    stdout: truncateText(result.stdout),
    stderr: truncateText(validation.message ? `${result.stderr}\n${validation.message}`.trim() : result.stderr)
  };
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

function validateScenarioResult({ id, result, model, progressLines, validationHints = {} }) {
  if ([
    "doctor-command",
    "doctor-help-command",
    "incomplete-epic-request",
    "epic-read-request"
  ].includes(id)) {
    if (progressLines.length) {
      return { ok: false, message: "local shell scenario unexpectedly emitted planner progress output" };
    }
    if (model) {
      return { ok: false, message: "local shell scenario unexpectedly emitted an AI model trace" };
    }
  }
  if (id === "ai-planning-read") {
    if (!progressLines.length) {
      return { ok: false, message: "missing non-interactive shell progress output" };
    }
    if (!model) {
      return { ok: false, message: "missing AI model trace for live shell planning" };
    }
    if (validationHints.expectLocalModel && !/^ollama:/i.test(model)) {
      return { ok: false, message: "expected the shell soft test to route through Ollama when Ollama is available" };
    }
    if (/needs the AI planner or a more direct phrasing/i.test(`${result.stdout}\n${result.stderr}`)) {
      return { ok: false, message: "operator-brief prompt fell back to the generic shell failure reply" };
    }
  }
  if (id === "ai-explainer-read") {
    if (!progressLines.length) {
      return { ok: false, message: "missing non-interactive shell progress output for explainer prompt" };
    }
    if (!model) {
      return { ok: false, message: "missing AI model trace for explainer prompt" };
    }
    if (validationHints.expectLocalModel && !/^ollama:/i.test(model)) {
      return { ok: false, message: "expected the explainer prompt to route through Ollama when Ollama is available" };
    }
    if (/needs the AI planner or a more direct phrasing/i.test(`${result.stdout}\n${result.stderr}`)) {
      return { ok: false, message: "explainer prompt fell back to the generic shell failure reply" };
    }
    if (!/projections/i.test(result.stdout)) {
      return { ok: false, message: "explainer prompt did not return a projections-focused answer" };
    }
  }
  if (result.code !== 0) {
    return { ok: false, message: "scenario process exited with a non-zero code" };
  }
  return { ok: true, message: "" };
}

async function applyScenarioSemanticValidation({ cwd, scenario, validationHints = {} }) {
  if (!validationHints.semanticRubric) {
    return scenario;
  }

  const transcriptRoot = await mkdtemp(path.join(os.tmpdir(), `ai-workflow-dogfood-${scenario.id}-`));
  const transcriptPath = path.join(transcriptRoot, `${scenario.id}.txt`);
  const transcript = [
    `Scenario: ${scenario.id}`,
    `Description: ${scenario.description}`,
    `Command: ${scenario.command}`,
    scenario.model ? `Model: ${scenario.model}` : null,
    scenario.progressLines?.length ? `Progress:\n${scenario.progressLines.join("\n")}` : null,
    "Stdout:",
    scenario.stdout ?? "",
    "Stderr:",
    scenario.stderr ?? ""
  ].filter(Boolean).join("\n\n");

  try {
    await writeFile(transcriptPath, `${transcript}\n`, "utf8");
    const routedModel = parseScenarioModelRef(scenario.model);
    const judgment = await judgeShellTranscripts({
      projectRoot: cwd,
      artifactPaths: [transcriptPath],
      rubric: validationHints.semanticRubric,
      goal: scenario.description,
      providerId: routedModel?.providerId ?? null,
      modelId: routedModel?.modelId ?? null
    });
    scenario.semanticJudgment = {
      status: judgment.result?.status ?? "needs_human_review",
      score: judgment.result?.score ?? 0,
      confidence: judgment.result?.confidence ?? 0,
      summary: judgment.result?.summary ?? ""
    };
    if (judgment.result?.status === "fail") {
      scenario.ok = false;
      scenario.stderr = truncateText([
        scenario.stderr,
        `semantic validation failed: ${judgment.result?.summary ?? "artifact judge did not pass"}`
      ].filter(Boolean).join("\n"));
    } else if (judgment.result?.status && judgment.result.status !== "pass") {
      scenario.stderr = truncateText([
        scenario.stderr,
        `semantic validation warning: ${judgment.result?.summary ?? "artifact judge requested human review"}`
      ].filter(Boolean).join("\n"));
    }
    return scenario;
  } catch (error) {
    scenario.semanticJudgment = {
      status: "needs_human_review",
      score: 0,
      confidence: 0,
      summary: error?.message ?? String(error)
    };
    scenario.stderr = truncateText([
      scenario.stderr,
      `semantic validation warning: ${error?.message ?? String(error)}`
    ].filter(Boolean).join("\n"));
    return scenario;
  } finally {
    await rm(transcriptRoot, { recursive: true, force: true });
  }
}

function parseScenarioModelRef(model) {
  const text = String(model ?? "").trim();
  if (!text) {
    return null;
  }
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
      child.kill("SIGKILL");
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
