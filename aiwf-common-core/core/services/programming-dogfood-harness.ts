/**
 * Responsibility: Provide a smart programming dogfood harness for multi-turn project generation and verification.
 * Scope: Handles project scaffolding, recursive shell-driven building, verification of dev scripts, and aggregated efficiency metrics.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeOperatorRequest } from "./operator-brain.ts";
import { syncProject } from "./sync.ts";
import { redactSensitiveObject } from "./operator-harness.ts";

const execFileAsync = promisify(execFile);

export interface DogfoodMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  attempts: number;
  turns: number;
  plannerCalls: number;
  workflowCalls: number;
}

export interface DogfoodResult {
  ok: boolean;
  projectRoot: string;
  reportPath: string;
  metrics: DogfoodMetrics;
  artifacts: string[];
  artifactJsonPath: string;
  verification: any;
  turns: any[];
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
    turns: 0,
    plannerCalls: 0,
    workflowCalls: 0
  };

  const prompts = [
    {
      id: "initialize",
      prompt: `Create a dedicated programming dogfood project in "${targetRoot}" from scratch for a modular, expandable 3d canvas Space Invaders-style game that uses emoji ships. Create the initial package, source tree, and an artifact checklist before editing files.`
    },
    {
      id: "engine-and-entities",
      prompt: `Implement the engine, entities (player, enemies, bullets), and a UI overlay for the modular emoji space-invaders-style 3d canvas game. Preserve a clean module structure and return concrete changed files plus verification.`
    },
    {
      id: "tests-and-verification",
      prompt: `Add verification for the game project in "${targetRoot}". Include targeted tests for core logic such as collision handling and enemy movement, then report what still fails and why.`
    },
    {
      id: "finalize",
      prompt: `Finalize the dogfood project in "${targetRoot}" with working npm scripts for dev, build, and test. Verify the artifact checklist and return a concise implementation summary with honest failures if any remain.`
    }
  ];

  const artifacts: string[] = [];
  const turnRecords: any[] = [];
  let currentResult: any = null;

  for (const turn of prompts) {
    const turnStartedAt = Date.now();
    metrics.turns++;
    const plannerTraceEvents: any[] = [];
    const workflowTraceEvents: any[] = [];

    currentResult = await executeOperatorRequest(turn.prompt, {
      root: targetRoot,
      shellMode: "mutate",
      requestedWorkMode: "auto",
      yes: true,
      noAi: false,
      traceAi: (event) => plannerTraceEvents.push(redactSensitiveObject(event)),
      traceWorkflow: (event) => workflowTraceEvents.push(redactSensitiveObject(event))
    });

    const turnEndedAt = Date.now();
    metrics.latencyMs += (turnEndedAt - turnStartedAt);
    metrics.attempts += 1;
    metrics.plannerCalls += plannerTraceEvents.length;
    metrics.workflowCalls += workflowTraceEvents.length;

    if (currentResult.plan?.usage) {
      metrics.promptTokens += (currentResult.plan.usage.promptTokens ?? 0);
      metrics.completionTokens += (currentResult.plan.usage.completionTokens ?? 0);
      metrics.totalTokens += (currentResult.plan.usage.totalTokens ?? 0);
    }
    if (!metrics.totalTokens && currentResult.workflowResult?.usage) {
      metrics.promptTokens += Number(currentResult.workflowResult.usage.promptTokens ?? 0);
      metrics.completionTokens += Number(currentResult.workflowResult.usage.completionTokens ?? 0);
      metrics.totalTokens += Number(currentResult.workflowResult.usage.totalTokens ?? 0);
    }

    turnRecords.push({
      id: turn.id,
      prompt: turn.prompt,
      ok: Boolean(currentResult?.ok),
      assistantReply: currentResult?.assistantReply ?? null,
      changedFiles: currentResult?.workflowResult?.result?.changedFiles ?? [],
      verification: currentResult?.workflowResult?.result?.verification ?? [],
      plannerTraceEvents,
      workflowTraceEvents,
      latencyMs: turnEndedAt - turnStartedAt
    });
    
    if (!currentResult.ok) {
      break;
    }
  }

  // Final sync and verification
  await syncProject({ projectRoot: targetRoot });
  const verification = await verifyProject(targetRoot);
  const ok = verification.ok;

  const reportPath = path.join(targetRoot, "DOGFOOD_REPORT.md");
  const artifactJsonPath = path.join(targetRoot, "DOGFOOD_REPORT.json");
  const artifactPayload = {
    ok,
    targetRoot,
    metrics,
    verification,
    turns: turnRecords,
    artifacts
  };
  await fs.writeFile(artifactJsonPath, `${JSON.stringify(artifactPayload, null, 2)}\n`, "utf8");
  await writeDogfoodReport(reportPath, { ok, metrics, targetRoot, verification, artifactJsonPath, turns: turnRecords });
  artifacts.push(reportPath, artifactJsonPath);

  return {
    ok,
    projectRoot: targetRoot,
    reportPath,
    metrics,
    artifacts,
    artifactJsonPath,
    verification,
    turns: turnRecords
  };
}

async function verifyProject(projectRoot: string): Promise<any> {
  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    const files = await fs.readdir(projectRoot, { recursive: true });
    const fileList = files.map((file) => String(file));
    const checklist = {
      packageJson: true,
      engine: fileList.some((file) => /engine/i.test(file)),
      entities: fileList.some((file) => /entities?/i.test(file)),
      overlay: fileList.some((file) => /overlay|ui/i.test(file)),
      tests: fileList.some((file) => /\.test\./i.test(file) || /tests?/i.test(file)),
      scripts: Boolean(packageJson?.scripts?.dev && packageJson?.scripts?.build && packageJson?.scripts?.test)
    };
    const commandResults = [];
    for (const command of [
      { name: "npm test", args: ["test"] },
      { name: "npm run build", args: ["run", "build"] }
    ]) {
      commandResults.push(await runNpmCommand(projectRoot, command.name, command.args));
    }

    return {
      ok: Object.values(checklist).every(Boolean),
      checklist,
      commands: commandResults
    };
  } catch (error: any) {
    return {
      ok: false,
      checklist: {
        packageJson: false,
        engine: false,
        entities: false,
        overlay: false,
        tests: false,
        scripts: false
      },
      commands: [],
      error: error?.message ?? String(error)
    };
  }
}

async function writeDogfoodReport(reportPath: string, data: { ok: boolean, metrics: DogfoodMetrics, targetRoot: string, verification: any, artifactJsonPath: string, turns: any[] }) {
  const { ok, metrics, targetRoot, verification, artifactJsonPath, turns } = data;
  const content = [
    "# Programming Dogfood Report",
    "",
    `Status: ${ok ? "PASSED" : "FAILED"}`,
    `Project: ${targetRoot}`,
    `JSON Artifact: ${artifactJsonPath}`,
    "",
    "## Efficiency Metrics",
    `- Total Turns: ${metrics.turns}`,
    `- Planner Trace Events: ${metrics.plannerCalls}`,
    `- Workflow Trace Events: ${metrics.workflowCalls}`,
    `- Attempts: ${metrics.attempts}`,
    `- Total Tokens: ${metrics.totalTokens} (${metrics.promptTokens}p / ${metrics.completionTokens}c)`,
    `- Total Latency: ${metrics.latencyMs}ms`,
    `- Avg Latency/Turn: ${Math.round(metrics.latencyMs / (metrics.turns || 1))}ms`,
    "",
    "## Verification",
    ...Object.entries(verification.checklist ?? {}).map(([key, value]) => `- ${key}: ${value ? "yes" : "no"}`),
    ...(verification.commands ?? []).map((command) => `- ${command.name}: ${command.ok ? "passed" : "failed"} (${command.summary})`),
    "",
    "## Turn Summaries",
    ...turns.map((turn) => `- ${turn.id}: ${turn.ok ? "ok" : "failed"} (${turn.latencyMs}ms)`),
    ""
  ].join("\n");

  await fs.writeFile(reportPath, content, "utf8");
}

async function runNpmCommand(projectRoot: string, name: string, args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync("npm", args, {
      cwd: projectRoot,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      name,
      ok: true,
      summary: summarizeCommandOutput(stdout, stderr)
    };
  } catch (error: any) {
    return {
      name,
      ok: false,
      summary: summarizeCommandOutput(error?.stdout ?? "", error?.stderr ?? error?.message ?? "")
    };
  }
}

function summarizeCommandOutput(stdout: string, stderr: string) {
  const text = `${String(stdout ?? "")}\n${String(stderr ?? "")}`.trim();
  return text.split(/\r?\n/).slice(-3).join(" | ").slice(0, 240) || "no output";
}
