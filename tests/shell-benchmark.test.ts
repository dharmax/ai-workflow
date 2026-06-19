import { test } from "bun:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { runShellTrustBenchmark } from "aiwf-common-core/services/shell-benchmark";

test("runShellTrustBenchmark scores a fixed shell corpus and writes artifacts", async () => {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-shell-benchmark-"));
  const cases = [
    {
      id: "operator-brief",
      title: "Operator brief",
      critical: true,
      requireProgress: true,
      expectLocalWhenAvailable: false,
      prompt: "operator brief",
      rubric: "must answer directly",
      requiredPatterns: [/status:/i, /recommendation:/i],
      bannedPatterns: [/needs the ai planner/i]
    },
    {
      id: "status-next",
      title: "Status and next step",
      critical: false,
      requireProgress: true,
      expectLocalWhenAvailable: false,
      prompt: "status next",
      rubric: "must answer directly",
      requiredPatterns: [/blocker/i, /next step/i],
      bannedPatterns: []
    }
  ];

  try {
    const result = await runShellTrustBenchmark({
      root: "/tmp/fixture",
      cliPath: "/tmp/fixture/aiwf-shell/cli/ai-workflow.ts",
      cases,
      threshold: 1,
      minimumCaseCount: 2,
      artifactRoot,
      runCommand: async ({ args }) => {
        const prompt = args[2];
        if (prompt === "operator brief") {
          return {
            code: 0,
            stdout: "Current workflow state:\nStatus: focused\nRecommendation: close the blocker\n",
            stderr: "[progress] planning and running -> ollama:qwen3\n",
            timedOut: false,
            durationMs: 25
          };
        }
        return {
          code: 0,
          stdout: "Blocker: benchmark gap\nNext step: add the corpus gate\n",
          stderr: "[progress] planning and running -> ollama:qwen3\n",
          timedOut: false,
          durationMs: 30
        };
      },
      judge: async () => ({
        result: {
          status: "pass",
          score: 95,
          confidence: 0.98,
          summary: "Grounded and direct."
        }
      })
    });

    assert.equal(result.ok, true);
    assert.equal(result.caseCount, 2);
    assert.equal(result.passedCount, 2);
    assert.equal(result.failedCriticalCases.length, 0);
    assert.equal((result.cases as any[]).every((item) => item.ok), true);

    const benchmarkReport = JSON.parse(await readFile(path.join(result.artifactRoot, "benchmark.json"), "utf8"));
    assert.equal(benchmarkReport.caseCount, 2);
    assert.equal(benchmarkReport.ok, true);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test("runShellTrustBenchmark fails when a critical case misses required signals", async () => {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-shell-benchmark-fail-"));
  const cases = [
    {
      id: "critical-operator-brief",
      title: "Critical operator brief",
      critical: true,
      requireProgress: true,
      expectLocalWhenAvailable: false,
      prompt: "critical brief",
      rubric: "must answer directly",
      requiredPatterns: [/status:/i],
      bannedPatterns: []
    },
    {
      id: "noncritical-followup",
      title: "Noncritical follow-up",
      critical: false,
      requireProgress: true,
      expectLocalWhenAvailable: false,
      prompt: "followup",
      rubric: "must answer directly",
      requiredPatterns: [/next step/i],
      bannedPatterns: []
    }
  ];

  try {
    const result = await runShellTrustBenchmark({
      root: "/tmp/fixture",
      cliPath: "/tmp/fixture/aiwf-shell/cli/ai-workflow.ts",
      cases,
      threshold: 0.5,
      minimumCaseCount: 2,
      artifactRoot,
      runCommand: async ({ args }) => ({
        code: 0,
        stdout: args[2] === "critical brief" ? "Recommendation only\n" : "Next step: continue\n",
        stderr: "[progress] planning and running -> ollama:qwen3\n",
        timedOut: false,
        durationMs: 20
      }),
      judge: async () => ({
        result: {
          status: "pass",
          score: 90,
          confidence: 0.95,
          summary: "Fine."
        }
      })
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.failedCriticalCases, ["critical-operator-brief"]);
    assert.equal((result.cases as any[]).find((item) => item.id === "critical-operator-brief")?.ok, false);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test("runShellTrustBenchmark stops at the suite deadline and reports progress", async () => {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-shell-benchmark-timeout-"));
  let currentTime = 0;
  const progress = [];
  const cases = ["first", "second", "third"].map((id) => ({
    id,
    title: id,
    critical: false,
    requireProgress: true,
    expectLocalWhenAvailable: false,
    prompt: id,
    rubric: "",
    requiredPatterns: [],
    bannedPatterns: []
  }));

  try {
    const result = await runShellTrustBenchmark({
      root: "/tmp/fixture",
      cliPath: "/tmp/fixture/aiwf-shell/cli/ai-workflow.ts",
      cases,
      threshold: 1,
      minimumCaseCount: 3,
      artifactRoot,
      totalTimeoutMs: 100,
      now: () => currentTime,
      onProgress: (event) => progress.push(event),
      runCommand: async () => {
        currentTime += 60;
        return {
          code: 0,
          stdout: "Grounded benchmark response\n",
          stderr: "[progress] planning and running -> ollama:qwen3\n",
          timedOut: false,
          durationMs: 60
        };
      }
    });

    assert.equal(result.ok, false);
    assert.equal(result.incomplete, true);
    assert.equal(result.timedOut, true);
    assert.deepEqual(result.remainingCaseIds, ["third"]);
    assert.match(result.summary, /benchmark incomplete/i);
    assert.equal(progress.some((event) => event.type === "case_start" && event.caseId === "first"), true);
    assert.equal(progress.some((event) => event.type === "case_complete" && event.caseId === "second"), true);
    assert.equal(progress.at(-1)?.type, "suite_incomplete");
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});
