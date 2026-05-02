#!/usr/bin/env node

/**
 * Responsibility: Dogfood the @dharmax library triad through a high-level programming harness.
 * Scope: Uses direct orchestration, CompletionEngine for judging, and LeanContextCompressor for reporting.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { CompletionEngine, LlmMetrics } from "@dharmax/llm-utils";
import { LeanContextCompressor } from "@dharmax/context-manager";
import { openWorkflowStore } from "../../../core/db/sqlite-store.ts";
import { parseArgs } from "./lib/cli.ts";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CLI_PATH = path.join(REPO_ROOT, "cli", "ai-workflow.ts");
const DEFAULT_TARGET = path.resolve(REPO_ROOT, "dogfood-projects", "smart-emoji-game");

async function runCommand(command, args, cwd, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: options.timeout ?? 180_000,
      maxBuffer: 16 * 1024 * 1024,
      ...options
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? String(error),
      error
    };
  }
}

export async function runSmartDogfood(argv = process.argv.slice(2)) {
  const args: any = parseArgs(argv);
  const targetRoot = path.resolve(String(args.target ?? DEFAULT_TARGET));
  const force = Boolean(args.force);
  const trace = [];
  const state = {
    targetRoot,
    buildOutput: "",
    testOk: false,
    testOutput: "",
    judgment: { ok: false, reason: "Not judged." }
  };

  try {
    trace.push({ step: "INIT", startedAt: Date.now() });
    if (force) {
      await rm(targetRoot, { recursive: true, force: true });
    }
    await mkdir(targetRoot, { recursive: true });

    const syncResult = await runCommand("tsx", [CLI_PATH, "sync", "--json"], targetRoot);
    if (!syncResult.ok) {
      throw new Error(`Initialization failed during sync: ${syncResult.stderr}`);
    }
    trace[trace.length - 1].status = "completed";

    trace.push({ step: "BUILD", startedAt: Date.now() });
    const prompt = `Build a modular, expandable 3d canvas Space Invaders-style game using emoji ships in "${targetRoot}". Use the normal shell workflow. Include epics, features, modules, planning notes, tests, and a browser app.`;
    console.log(`[smart-dogfood] Building game with prompt: ${prompt}`);
    const buildResult = await runCommand("tsx", [CLI_PATH, "shell", "--json", "--yes", "mutate", prompt], targetRoot, { timeout: 300_000 });
    if (!buildResult.ok) {
      throw new Error(`Build failed: ${buildResult.stderr}`);
    }
    state.buildOutput = buildResult.stdout;
    trace[trace.length - 1].status = "completed";

    trace.push({ step: "VERIFY", startedAt: Date.now() });
    console.log("[smart-dogfood] Verifying tests...");
    const testResult = await runCommand("npm", ["test"], targetRoot, { timeout: 300_000 });
    state.testOk = testResult.ok;
    state.testOutput = `${testResult.stdout}${testResult.stderr}`;

    console.log("[smart-dogfood] AI judging the results...");
    const judgePrompt = `Assess the following test output for a modular emoji space-invaders game.
Output:
${state.testOutput}

Is the project functionally complete and verified? Respond in JSON: { "ok": boolean, "reason": string }`;

    const judgment = await CompletionEngine.generate(judgePrompt, { id: "gemini-2.0-flash", providerId: "google" });
    try {
      state.judgment = JSON.parse(judgment.text.match(/\{.*\}/s)?.[0] ?? "{}");
    } catch {
      state.judgment = { ok: false, reason: "Failed to parse judgment" };
    }
    trace[trace.length - 1].status = "completed";

    trace.push({ step: "REPORT", startedAt: Date.now() });
    console.log("[smart-dogfood] Generating report...");

    const store = await openWorkflowStore(targetRoot);
    const metricsSummary = store.getMetricsSummary();
    store.close();

    const reportContent = [
      "# Smart Programming Dogfood Report",
      "",
      `Target: ${targetRoot}`,
      `Date: ${new Date().toISOString()}`,
      "",
      "## Verification Outcome",
      `- Tests Passed: ${state.testOk ? "YES" : "NO"}`,
      `- AI Judgment: ${state.judgment?.ok ? "PASS" : "FAIL"}`,
      `- AI Reason: ${state.judgment?.reason}`,
      "",
      "## Efficiency Metrics",
      `- Total Calls: ${metricsSummary.totalCalls}`,
      `- Total Tokens: ${metricsSummary.totalPromptTokens + metricsSummary.totalCompletionTokens}`,
      `- Avg Latency: ${metricsSummary.avgLatencyMs}ms`,
      `- Success Rate: ${metricsSummary.successRate}%`,
      "",
      "## Trace",
      JSON.stringify(trace, null, 2)
    ].join("\n");

    const compressedReport = await LeanContextCompressor.patternCompress(reportContent, 1000);
    await writeFile(path.join(targetRoot, "SMART_REPORT.md"), compressedReport);
    console.log(`[smart-dogfood] Report written to ${path.join(targetRoot, "SMART_REPORT.md")}`);
    trace[trace.length - 1].status = "completed";
    return 0;
  } catch (error) {
    trace.push({
      step: "ERROR",
      startedAt: Date.now(),
      status: "failed",
      error: error?.message ?? String(error)
    });
    console.error(error);
    return 1;
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const exitCode = await runSmartDogfood();
  process.exitCode = exitCode;
}
