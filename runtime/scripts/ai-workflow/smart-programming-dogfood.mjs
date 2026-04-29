#!/usr/bin/env node

/**
 * Responsibility: Dogfood the @dharmax library triad through a high-level programming harness.
 * Scope: Uses AnnotatedStateMachine for orchestration, CompletionEngine for judging, and LeanContextCompressor for reporting.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { AnnotatedStateMachine } from "@dharmax/text-compiler";
import { CompletionEngine, LlmMetrics } from "@dharmax/llm-utils";
import { LeanContextCompressor } from "@dharmax/context-manager";
import { openWorkflowStore } from "../../../core/db/sqlite-store.mjs";
import { parseArgs } from "./lib/cli.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const CLI_PATH = path.join(REPO_ROOT, "cli", "ai-workflow.mjs");
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
  const args = parseArgs(argv);
  const targetRoot = path.resolve(String(args.target ?? DEFAULT_TARGET));
  const force = Boolean(args.force);
  const sm = new AnnotatedStateMachine();

  sm.state("INIT", "Initialize dogfood project", async (ctx, tk) => {
    if (force) {
      await rm(targetRoot, { recursive: true, force: true });
    }
    await mkdir(targetRoot, { recursive: true });
    
    // Initial sync
    const syncResult = await runCommand(process.execPath, [CLI_PATH, "sync", "--json"], targetRoot);
    if (!syncResult.ok) {
      return tk.sm.fail("Initialization failed during sync", syncResult.stderr);
    }
    
    tk.sm.memory.targetRoot = targetRoot;
    return tk.sm.transition("BUILD", "Ready to build");
  }, { "BUILD": "BUILD" });

  sm.state("BUILD", "Build the emoji space-invaders game", async (ctx, tk) => {
    const prompt = `Build a modular, expandable 3d canvas Space Invaders-style game using emoji ships in "${targetRoot}". Use the normal shell workflow. Include epics, features, modules, planning notes, tests, and a browser app.`;
    
    console.log(`[smart-dogfood] Building game with prompt: ${prompt}`);
    
    const buildResult = await runCommand(process.execPath, [
      CLI_PATH, "shell", "--json", "--yes", "mutate", prompt
    ], targetRoot);
    
    if (!buildResult.ok) {
      return tk.sm.fail("Build failed", buildResult.stderr);
    }
    
    tk.sm.memory.buildOutput = buildResult.stdout;
    return tk.sm.transition("VERIFY", "Built successfully");
  }, { "VERIFY": "VERIFY" }, 300_000);

  sm.state("VERIFY", "Verify the generated project", async (ctx, tk) => {
    console.log("[smart-dogfood] Verifying tests...");
    const testResult = await runCommand("npm", ["test"], targetRoot);
    
    tk.sm.memory.testOk = testResult.ok;
    tk.sm.memory.testOutput = testResult.stdout + testResult.stderr;
    
    // AI Judge the result
    console.log("[smart-dogfood] AI judging the results...");
    const judgePrompt = `Assess the following test output for a modular emoji space-invaders game.
Output:
${tk.sm.memory.testOutput}

Is the project functionally complete and verified? Respond in JSON: { "ok": boolean, "reason": string }`;

    const judgment = await CompletionEngine.generate(judgePrompt, { id: "gemini-2.0-flash", providerId: "google" });
    let parsedJudgment = { ok: false, reason: "Failed to parse judgment" };
    try {
      parsedJudgment = JSON.parse(judgment.text.match(/\{.*\}/s)?.[0] ?? "{}");
    } catch {}

    tk.sm.memory.judgment = parsedJudgment;
    return tk.sm.transition("REPORT", "Verification complete");
  }, { "REPORT": "REPORT" }, 300_000);

  sm.state("REPORT", "Generate dogfood report and metrics", async (ctx, tk) => {
    console.log("[smart-dogfood] Generating report...");
    
    const store = await openWorkflowStore(targetRoot);
    const metricsSummary = store.getMetricsSummary();
    
    const reportContent = [
      "# Smart Programming Dogfood Report",
      "",
      `Target: ${targetRoot}`,
      `Date: ${new Date().toISOString()}`,
      "",
      "## Verification Outcome",
      `- Tests Passed: ${tk.sm.memory.testOk ? "YES" : "NO"}`,
      `- AI Judgment: ${tk.sm.memory.judgment?.ok ? "PASS" : "FAIL"}`,
      `- AI Reason: ${tk.sm.memory.judgment?.reason}`,
      "",
      "## Efficiency Metrics",
      `- Total Calls: ${metricsSummary.totalCalls}`,
      `- Total Tokens: ${metricsSummary.totalPromptTokens + metricsSummary.totalCompletionTokens}`,
      `- Avg Latency: ${metricsSummary.avgLatencyMs}ms`,
      `- Success Rate: ${metricsSummary.successRate}%`,
      "",
      "## Trace",
      JSON.stringify(tk.sm.trace, null, 2)
    ].join("\n");

    const compressedReport = await LeanContextCompressor.patternCompress(reportContent, 1000);
    await writeFile(path.join(targetRoot, "SMART_REPORT.md"), compressedReport);
    
    console.log(`[smart-dogfood] Report written to ${path.join(targetRoot, "SMART_REPORT.md")}`);
    return tk.sm.complete("Dogfooding cycle finished");
  }, {});

  const mockTk = {
    sm: {
      transition: (to) => to,
      fail: (reason, data) => { throw new Error(`${reason}: ${data}`); },
      complete: (data) => null,
      memory: {}
    },
    trigger: () => {}
  };

  // Sync our sm.memory to mockTk.sm.memory so states can use it
  mockTk.sm.memory = sm.memory;

  const result = await sm.run("INIT", {}, {}, mockTk);
  return result.status === "completed" ? 0 : 1;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const exitCode = await runSmartDogfood();
  process.exitCode = exitCode;
}
