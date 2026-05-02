import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { runAssessment } from "../core/services/assessment.ts";
import { registerProvider } from "../core/services/providers.ts";

test("runAssessment resolves with heuristic fallback when no provider candidate is available", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assessment-no-provider-"));

  try {
    await mkdir(path.join(root, ".ai-workflow"), { recursive: true });
    await writeFile(path.join(root, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        ollama: { enabled: false },
        google: { enabled: false },
        openai: { enabled: false },
        anthropic: { enabled: false }
      }
    }, null, 2), "utf8");

    const result = await runAssessment({ type: "project", id: "demo" }, {
      root,
      scope: "health"
    });

    assert.equal(result.status, "resolved");
    assert.equal(result.plan.source, "heuristic-fallback");
    assert.equal(result.plan.fallback.used, true);
    assert.equal(Array.isArray(result.plan.steps), true);
    assert.equal(result.plan.steps.length >= 3, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runAssessment falls back cleanly when the provider returns malformed JSON", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "assessment-bad-json-"));
  const providerId = `assessment-malformed-${Date.now()}`;

  try {
    await mkdir(path.join(root, ".ai-workflow"), { recursive: true });
    await writeFile(path.join(root, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        ollama: { enabled: false }
      }
    }, null, 2), "utf8");

    registerProvider(providerId, {
      generate: async ({ modelId }) => ({
        providerId,
        modelId,
        response: ""
      })
    });

    const result = await runAssessment({ type: "project", id: "demo" }, {
      root,
      scope: "health",
      planner: {
        providerId,
        modelId: "bad-json"
      }
    });

    assert.equal(result.status, "resolved");
    assert.equal(result.plan.source, "heuristic-fallback");
    assert.equal(result.plan.fallback.reason.includes("empty-response"), true);
    assert.equal(result.criticism.source, "heuristic-fallback");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
