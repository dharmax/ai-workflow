import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { openWorkflowStore } from "../core/db/sqlite-store.mjs";
import { planOperatorRequest } from "../core/services/operator-brain.mjs";

test("planOperatorRequest falls back to another candidate if the first one fails", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-fallback-"));
  
  // Mock fetch to fail for the first (Gemini) request and succeed for the second (Ollama-like)
  let callCount = 0;
  globalThis.fetch = async (url) => {
    callCount++;
    const urlStr = String(url);
    if (urlStr.includes("generativelanguage.googleapis.com")) {
      return {
        ok: false,
        status: 403,
        async text() {
          return JSON.stringify({
            error: {
              reason: "API_KEY_SERVICE_BLOCKED",
              message: "Requests to this API are blocked."
            }
          });
        }
      };
    }
    
    // Assume other calls (like Ollama or OpenAI) succeed
    return {
      ok: true,
      async json() {
        if (urlStr.includes("/api/generate") || urlStr.includes("/chat/completions")) {
          const response = JSON.stringify({ kind: "plan", code: "console.log('fallback success')" });
          if (urlStr.includes("openai.com")) {
            return {
              choices: [{ message: { content: response } }],
              usage: {
                prompt_tokens: 123,
                completion_tokens: 45,
                total_tokens: 168
              }
            };
          }
          return { response, prompt_eval_count: 123, eval_count: 45 };
        }
        return { models: [{ name: "fallback-model", size: 1000 }] };
      }
    };
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          google: { apiKey: "g-key" },
          openai: { apiKey: "o-key" },
          ollama: { enabled: false }
        }
      }, null, 2),
      "utf8"
    );

    const result = await planOperatorRequest("test prompt", { root: targetRoot });

    assert.ok(result);
    assert.equal(result.kind, "plan");
    assert.equal(result.code, "console.log('fallback success')");
    assert.ok(callCount > 1, "Should have called fetch multiple times");

    const store = await openWorkflowStore({ projectRoot: targetRoot });
    const metrics = store.getMetricsSummary();
    store.close();

    assert.equal(metrics.totalCalls, 1);
    assert.equal(metrics.totalPromptTokens, 123);
    assert.equal(metrics.totalCompletionTokens, 45);
    assert.equal(metrics.windows.latestSession.diagnostics.fallbackRuns, 1);
    assert.equal(metrics.windows.latestSession.diagnostics.fallbackRecoveries, 1);
    assert.equal(metrics.windows.latestSession.diagnostics.failedAttempts, 2);
    assert.equal(metrics.windows.latestSession.tokenUsage.callsWithReportedUsage, 1);
    assert.equal(metrics.windows.latestSession.diagnostics.byStage[0].stage, "operator-planning");
    assert.match(metrics.windows.latestSession.diagnostics.topFailures[0].label, /google:gemini-2.0-(pro-exp|flash)/i);

  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("planOperatorRequest answers repo explainer questions without invoking the AI planner", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-grounded-"));
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("fetch should not be called for grounded operator replies");
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });

    const result = await planOperatorRequest("what is the projections service?", {
      root: targetRoot,
      plannerContext: {
        summary: {
          modules: [
            {
              name: "core/services/projections",
              responsibility: "Builds project summaries and kanban projections."
            }
          ]
        }
      }
    });

    assert.equal(result.kind, "reply");
    assert.match(result.assistantReply, /core\/services\/projections\.mjs/i);
    assert.match(result.assistantReply, /renderKanbanProjection|Builds project summaries and kanban projections/i);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("planOperatorRequest returns a grounded operator brief without invoking the AI planner", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-brief-"));
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("fetch should not be called for grounded operator briefs");
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });

    const result = await planOperatorRequest("Give me a concise operator brief grounded in the current workflow state, and justify the recommendation.", {
      root: targetRoot
    });

    assert.equal(result.kind, "reply");
    assert.match(result.assistantReply, /Current workflow state:/);
    assert.match(result.assistantReply, /Recommendation:/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("planOperatorRequest grounds projections service questions to the projections module", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-projections-"));
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("fetch should not be called for grounded projections replies");
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });

    const result = await planOperatorRequest("what is the projections service?", {
      root: targetRoot
    });

    assert.equal(result.kind, "reply");
    assert.match(result.assistantReply, /core\/services\/projections\.mjs/i);
    assert.match(result.assistantReply, /renderKanbanProjection/i);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});
