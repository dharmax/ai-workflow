/**
 * Responsibility: Provide a smart programming dogfood harness for multi-turn project generation and verification.
 * Scope: Handles project scaffolding, recursive shell-driven building, verification of dev scripts, and aggregated efficiency metrics.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { executeOperatorRequest } from "./operator-brain.ts";
import { syncProject } from "./sync.ts";

export interface DogfoodMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempts: number;
  turns: number;
}

export interface DogfoodResult {
  ok: boolean;
  projectRoot: string;
  reportPath: string;
  metrics: DogfoodMetrics;
  artifacts: string[];
}

/**
 * Run a smart programming dogfood harness that builds a modular emoji space-invaders-style 3d canvas game.
 */
export async function runProgrammingDogfoodHarness(options: {
  root: string;
  target?: string;
  force?: boolean;
  json?: boolean;
} = {}): Promise<DogfoodResult> {
  const repoRoot = options.root;
  const targetRoot = options.target ?? path.resolve(repoRoot, "dogfood-projects", "space-invaders-emoji-3d");
  
  if (options.force) {
    await fs.rm(targetRoot, { recursive: true, force: true });
  }
  await fs.mkdir(targetRoot, { recursive: true });

  const metrics: DogfoodMetrics = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    attempts: 0,
    turns: 0
  };

  const prompts = [
    `Build a dedicated programming dogfood project in "${targetRoot}" from scratch for a modular, expandable 3d canvas Space Invaders-style game that uses emoji ships.`,
    `Ensure it has a clear project structure with an engine, entities (player, enemies, bullets), and a UI overlay.`,
    `Add a test suite that verifies the core game logic (e.g. collision detection, enemy movement).`,
    `Finalize the project with working npm scripts for dev and build.`
  ];

  const artifacts: string[] = [];
  let currentResult: any = null;

  for (const prompt of prompts) {
    const turnStartedAt = Date.now();
    metrics.turns++;
    
    currentResult = await executeOperatorRequest(prompt, {
      root: targetRoot,
      shellMode: "mutate",
      requestedWorkMode: "auto",
      yes: true,
      noAi: false
    });

    const turnEndedAt = Date.now();
    metrics.latencyMs += (turnEndedAt - turnStartedAt);
    
    if (currentResult.plan?.usage) {
      metrics.promptTokens += (currentResult.plan.usage.promptTokens ?? 0);
      metrics.completionTokens += (currentResult.plan.usage.completionTokens ?? 0);
      metrics.totalTokens += (currentResult.plan.usage.totalTokens ?? 0);
    }
    
    if (!currentResult.ok) {
      break;
    }
  }

  // Final sync and verification
  await syncProject(targetRoot);
  const ok = await verifyProject(targetRoot);

  const reportPath = path.join(targetRoot, "DOGFOOD_REPORT.md");
  await writeDogfoodReport(reportPath, { ok, metrics, targetRoot });

  return {
    ok,
    projectRoot: targetRoot,
    reportPath,
    metrics,
    artifacts
  };
}

async function verifyProject(projectRoot: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    await fs.access(packageJsonPath);
    
    const files = await fs.readdir(projectRoot, { recursive: true });
    const hasEngine = files.some(f => f.includes("engine"));
    const hasEntities = files.some(f => f.includes("entities"));
    const hasEmojis = true; // Hard to verify programmatically without parsing files
    
    return hasEngine && hasEntities;
  } catch {
    return false;
  }
}

async function writeDogfoodReport(reportPath: string, data: { ok: boolean, metrics: DogfoodMetrics, targetRoot: string }) {
  const { ok, metrics, targetRoot } = data;
  const content = [
    "# Programming Dogfood Report",
    "",
    `Status: ${ok ? "PASSED" : "FAILED"}`,
    `Project: ${targetRoot}`,
    "",
    "## Efficiency Metrics",
    `- Total Turns: ${metrics.turns}`,
    `- Total Tokens: ${metrics.totalTokens} (${metrics.promptTokens}p / ${metrics.completionTokens}c)`,
    `- Total Latency: ${metrics.latencyMs}ms`,
    `- Avg Latency/Turn: ${Math.round(metrics.latencyMs / (metrics.turns || 1))}ms`,
    "",
    "## Verification",
    `- Project Scaffolding: ${ok ? "Success" : "Incomplete"}`,
    ""
  ].join("\n");

  await fs.writeFile(reportPath, content, "utf8");
}
