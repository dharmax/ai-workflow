import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { openWorkflowStore } from "aiwf-common-core/db/sqlite-store";
import { executeOperatorRequest, planOperatorRequest, resolveHostRequest } from "aiwf-common-core/services/operator-brain";

test("planOperatorRequest falls back to another candidate if the first one fails", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-fallback-"));
  
  // Mock fetch to fail for the first (Gemini) request and succeed for the second (Ollama-like)
  let callCount = 0;
  globalThis.fetch = (async (url) => {
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
  }) as any;

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
              name: "aiwf-common-core/core/services/projections",
              responsibility: "Builds project summaries and kanban projections."
            }
          ]
        }
      }
    });

    assert.equal(result.kind, "reply");
    assert.match(result.assistantReply, /core\/services\/projections\.js/i);
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
    assert.match(result.assistantReply, /core\/services\/projections\.js/i);
    assert.match(result.assistantReply, /renderKanbanProjection/i);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("planOperatorRequest answers provider status follow-ups without invoking the AI planner", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-provider-followup-"));
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error("fetch should not be called for grounded provider replies");
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });

    const result = await planOperatorRequest("what about ollama?", {
      root: targetRoot,
      plannerContext: {
        providerState: {
          providers: {
            ollama: {
              available: true,
              local: true,
              host: "http://127.0.0.1:11434",
              models: [{ id: "qwen2.5-coder:7b" }]
            }
          }
        }
      }
    });

    assert.equal(result.kind, "reply");
    assert.match(result.assistantReply, /Ollama status:/);
    assert.match(result.assistantReply, /http:\/\/127\.0\.0\.1:11434/);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("executeOperatorRequest preserves successful structured JS workflow results", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-js-result-"));

  globalThis.fetch = (async (url) => {
    const urlStr = String(url);
    if (urlStr.includes("/chat/completions")) {
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  kind: "plan",
                  confidence: 0.94,
                  reason: "Return a direct JS plan.",
                  code: `async () => ({ summary: "List of modules in the project", changedFiles: [], verification: ["cli", "aiwf-common-core/core/services"] })`
                })
              }
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              total_tokens: 120
            }
          };
        }
      };
    }
    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  }) as any;

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          openai: { apiKey: "o-key" },
          ollama: { enabled: false }
        }
      }, null, 2),
      "utf8"
    );

    const result = await executeOperatorRequest("list me the modules of this project", { root: targetRoot });

    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.equal(result.workflowResult?.result?.summary, "List of modules in the project");
    assert.deepEqual(Array.from(result.workflowResult?.result?.verification ?? []), ["cli", "aiwf-common-core/core/services"]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("executeOperatorRequest runs compiler-native workflowPrompt plans through text-compiler", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-text-compiler-"));

  globalThis.fetch = (async (url, options: any = {}) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/tags")) {
      return {
        ok: true,
        async json() {
          return { models: [] };
        }
      };
    }

    if (!urlStr.includes("/chat/completions")) {
      return {
        ok: true,
        async json() {
          return {};
        }
      };
    }

    const body = JSON.parse(options.body ?? "{}");
    const promptText = body.messages?.map((message) => message.content).join("\n\n") ?? "";
    let content = JSON.stringify({
      kind: "reply",
      assistantReply: "unexpected prompt"
    });

    if (promptText.includes("Your Response (JSON):")) {
      content = JSON.stringify({
        kind: "plan",
        confidence: 0.96,
        workflowPrompt: "Create or update the necessary workflow state, then return a final object summarizing the modules request with no file changes and verification evidence."
      });
    } else if (promptText.includes("Analyze the Task against the Available Services")) {
      content = JSON.stringify({ missingServices: [] });
    } else {
      content = [
        'tk.sm.state("finalize", "Return workflow summary", async () => ({',
        '  summary: "compiler path result",',
        '  changedFiles: [],',
        '  verification: ["text-compiler"]',
        '}), {});',
        'return await tk.sm.run("finalize", {}, ctx, tk);'
      ].join("\n");
    }

    return {
      ok: true,
      async json() {
        return {
          choices: [{
            message: { content }
          }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150
          }
        };
      }
    };
  }) as any;

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          openai: { apiKey: "o-key" },
          ollama: { enabled: false }
        }
      }, null, 2),
      "utf8"
    );

    const result = await executeOperatorRequest("list me the modules of this project", { root: targetRoot });

    assert.equal(result.ok, true);
    assert.equal(result.workflowResult?.result?.summary, "compiler path result");
    assert.deepEqual(Array.from(result.workflowResult?.result?.verification ?? []), ["text-compiler"]);
    assert.match(result.assistantReply, /Workflow completed successfully/);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("resolveHostRequest routes long planning prompts through the shared harness instead of the codelet registry", async () => {
  const originalFetch = globalThis.fetch;
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-brain-shared-harness-"));

  globalThis.fetch = (async (url, options: any = {}) => {
    const urlStr = String(url);
    if (urlStr.includes("/api/tags")) {
      return {
        ok: true,
        async json() {
          return { models: [] };
        }
      };
    }
    if (!urlStr.includes("/chat/completions")) {
      return {
        ok: true,
        async json() {
          return {};
        }
      };
    }
    const body = JSON.parse(options.body ?? "{}");
    const promptText = body.messages?.map((msg) => msg.content).join("\n\n") ?? "";
    let content = JSON.stringify({
      kind: "reply",
      assistantReply: "unexpected prompt"
    });
    if (promptText.includes("Your Response (JSON):")) {
      content = JSON.stringify({
        kind: "plan",
        confidence: 0.96,
        workflowPrompt: "Inspect the workflow state, map the gaps, and return a final object with current state, gap map, and implementation plan."
      });
    } else if (promptText.includes("Analyze the Task against the Available Services")) {
      content = JSON.stringify({ missingServices: [] });
    } else {
      content = [
        "tk.sm.state(\"finalize\", \"Return workflow summary\", async () => ({",
        "  summary: \"shared harness answer\",",
        "  changedFiles: [],",
        "  verification: [\"text-compiler\"],",
        "  evidence: [\"current state\", \"gap map\"],",
        "  plan: [\"implementation plan\"]",
        "}));",
        "return await tk.sm.run(\"finalize\", {}, ctx, tk);"
      ].join("\n");
    }
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content } }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150
          }
        };
      }
    };
  }) as any;

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          openai: { apiKey: "o-key" },
          ollama: { enabled: false }
        }
      }, null, 2),
      "utf8"
    );

    const response: any = await resolveHostRequest({
      projectRoot: targetRoot,
      text: "Audit the current state of the shell and ask harnesses, inspect the relevant code and tests, map the gaps, and produce an implementation plan.",
      continuationState: null,
      host: {
        surface: "cli-host",
        capabilities: {
          supports_json: true,
          supports_streaming: false,
          supports_followups: true
        }
      }
    });

    assert.equal(response.route.operation, "shared_operator_graph_reply");
    assert.equal(response.route.intent, "analysis-plan");
    assert.notEqual(response.route.intent, "codelet_registry_question");
    assert.match(response.payload.answer, /Current state:/);
    assert.match(response.payload.answer, /Implementation plan:/);
    assert.equal(response.meta.programKind, "analysis-plan");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("resolveHostRequest answers code review prompts through a graph-backed repo investigation reply", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "operator-host-review-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });

    const response: any = await resolveHostRequest({
      projectRoot: targetRoot,
      text: "Review the projections service, inspect the relevant code and tests, and explain the top risks with evidence.",
      continuationState: null,
      host: {
        surface: "cli-host",
        capabilities: {
          supports_json: true,
          supports_streaming: false,
          supports_followups: true
        }
      }
    });

    assert.equal(response.route.operation, "shared_operator_graph_reply");
    assert.equal(response.route.intent, "repo-investigation");
    assert.match(response.payload.answer, /Current state:/);
    assert.match(response.payload.answer, /Findings:/);
    assert.equal(response.meta.programKind, "repo-investigation");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
