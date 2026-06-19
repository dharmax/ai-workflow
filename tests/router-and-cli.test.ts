import { test } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { installAgents } from "aiwf-shell/cli/lib/install";
import { routeTask } from "aiwf-common-core/services/router";
import { parseTelegramCommand } from "aiwf-common-core/services/telegram";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("routeTask falls back cleanly when only unavailable local providers exist", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-router-unavail-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: { enabled: false },
          google: { enabled: false },
          openai: { enabled: false },
          anthropic: { enabled: false }
        }
      }),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "summarization"
    } as any);

    assert.equal(route.recommended, null);
    assert.equal(route.providers.ollama.available, false);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("installAgents creates the DB-first project workspace directories and config defaults", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-install-"));

  try {
    const results = await installAgents({
      toolkitRoot: repoRoot,
      projectRoot: targetRoot,
      target: "session"
    } as any);

    assert.equal(results.some((result) => result.path === ".ai-workflow"), true);
    const config = JSON.parse(await readFile(path.join(targetRoot, ".ai-workflow", "config.json"), "utf8"));
    assert.equal(config.storage.dbPath, ".ai-workflow/state/workflow.db");
    assert.equal(config.lifecycle.candidateReviewIntervalHours, 36);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask picks up a configured remote Ollama host", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-ollama-host-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: {
            host: "http://192.168.1.50:11434"
          }
        }
      }, null, 2) + "\n",
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "summarization"
    } as any);

    assert.equal(route.providers.ollama.host, "http://192.168.1.50:11434");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask keeps shell planning on a text-capable Ollama model instead of a vision-only model", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-shell-planner-route-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url): Promise<Response> => {
    if (String(url).endsWith("/api/tags")) {
      return new Response(JSON.stringify({
        models: [
          { name: "moondream:latest", size: 2 * 1024 ** 3 },
          { name: "qwen2.5-coder:7b", size: 7 * 1024 ** 3 }
        ]
      }));
    }
    if (String(url).includes("duckduckgo")) {
      return new Response("<html><body></body></html>");
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: {
            host: "http://127.0.0.1:11434",
            maxModelSizeB: 16
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "shell-planning"
    } as any);

    assert.equal(["ollama", "google"].includes(route.recommended?.providerId), true);
    assert.notEqual(route.recommended?.modelId, "moondream:latest");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask excludes embedding-only models and honors configured Ollama planner model", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-shell-planner-embed-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url): Promise<Response> => {
    if (String(url).endsWith("/api/tags")) {
      return new Response(JSON.stringify({
        models: [
          { name: "nomic-embed-text:latest", size: 300 * 1024 ** 2 },
          { name: "hermes3:8b", size: 4 * 1024 ** 3 },
          { name: "qwen2.5-coder:7b-instruct-q4_K_M", size: 5 * 1024 ** 3 }
        ]
      }));
    }
    if (String(url).includes("duckduckgo")) {
      return new Response("<html><body></body></html>");
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: {
            host: "http://lotus:11434",
            maxModelSizeB: 14,
            plannerModel: "qwen2.5-coder:7b-instruct-q4_K_M"
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "shell-planning",
      preferLocal: true
    } as any);

    assert.equal(route.recommended?.providerId, "ollama");
    assert.equal(route.recommended?.modelId, "qwen2.5-coder:7b-instruct-q4_K_M");
    assert.equal(route.candidates.some((candidate: any) => candidate.modelId === "nomic-embed-text:latest"), false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask prefers the remote provider with remaining free quota", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-route-quota-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: { enabled: false },
          google: {
            apiKey: "g-key",
            quota: { freeUsdRemaining: 0 },
            paidAllowed: false
          },
          openai: {
            apiKey: "o-key",
            quota: { freeUsdRemaining: 7.5 },
            paidAllowed: false
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "strategy",
      preferLocal: false
    } as any);

    assert.equal(route.recommended?.providerId, "openai");
    assert.equal(route.recommended?.reason.includes("free quota $7.50 remaining"), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask reports explicit local requirement failure instead of widening to remote", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-route-require-local-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: { enabled: false },
          google: {
            apiKey: "g-key",
            quota: { freeUsdRemaining: 10 },
            paidAllowed: false
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "shell-planning",
      preferLocal: true,
      requireLocal: true
    } as any);

    assert.equal(route.recommended, null);
    assert.equal(route.degradedPath, true);
    assert.match(route.failureReasons.join("\n"), /local provider was explicitly requested/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask can fall back to ollama when remote free quota is exhausted", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-route-quota-local-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url): Promise<Response> => {
    if (String(url).endsWith("/api/tags")) {
      return new Response(JSON.stringify({
        models: [{ name: "hermes3:8b", size: 4 * 1024 ** 3 }]
      }));
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          google: {
            apiKey: "g-key",
            quota: { freeUsdRemaining: 0 },
            paidAllowed: false
          },
          openai: {
            apiKey: "o-key",
            quota: { freeUsdRemaining: 0 },
            paidAllowed: false
          },
          ollama: {
            host: "http://127.0.0.1:11434",
            maxModelSizeB: 16
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "summarization"
    } as any);

    assert.equal(route.recommended?.providerId, "ollama");
    assert.equal(route.candidates.every((candidate: any) => candidate.providerId !== "openai"), true);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask returns no remote recommendation when paid routes are disabled and free quota is exhausted", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-route-unpaid-exhausted-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          google: {
            apiKey: "g-key",
            quota: { freeUsdRemaining: 0 },
            paidAllowed: false
          },
          openai: {
            apiKey: "o-key",
            quota: { freeUsdRemaining: 0 },
            paidAllowed: false
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "strategy",
      preferLocal: false
    } as any);

    assert.equal(route.recommended, null);
    assert.equal(route.candidates.length, 0);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("routeTask prefers local shell planning over env-only remote providers", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-route-shell-local-"));
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_API_KEY = "env-only-google-key";
  globalThis.fetch = async (url): Promise<Response> => {
    if (String(url).endsWith("/api/tags")) {
      return new Response(JSON.stringify({
        models: [{ name: "deepseek-r1:8b", size: 5 * 1024 ** 3 }]
      }));
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          ollama: {
            host: "http://127.0.0.1:11434",
            hardwareClass: "tiny",
            maxModelSizeB: 4
          }
        }
      }, null, 2),
      "utf8"
    );

    const route: any = await routeTask({
      root: targetRoot,
      taskClass: "shell-planning"
    } as any);

    assert.equal(route.recommended?.providerId, "ollama");
    assert.equal(route.candidates.every((candidate: any) => candidate.providerId === "ollama"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGoogleKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("CLI sync, summary, ticket creation, note creation, route, and telegram preview work together", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-cli-"));
  const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "workflow-repo");

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });

    const sync = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(sync.code, 0, sync.stderr || sync.stdout);
    const syncPayload = JSON.parse(sync.stdout);
    assert.equal(syncPayload.indexedFiles >= 8, true);

    const summary = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "summary", "--json"], { cwd: targetRoot });
    assert.equal(summary.code, 0, summary.stderr || summary.stdout);
    const summaryPayload = JSON.parse(summary.stdout);
    assert.equal(summaryPayload.fileCount >= 8, true);

    const readiness = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "readiness",
      "--goal",
      "beta_readiness",
      "--question",
      "Is this ready for beta testing?",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(readiness.code, 0, readiness.stderr || readiness.stdout);
    const readinessPayload = JSON.parse(readiness.stdout);
    assert.equal(readinessPayload.protocol_version, "1.0");
    assert.equal(readinessPayload.operation, "evaluate_readiness");
    assert.equal(["complete", "insufficient_evidence"].includes(readinessPayload.status), true);
    assert.equal(Array.isArray(readinessPayload.blockers), true);
    assert.equal(Array.isArray(readinessPayload.gaps), true);

    const ticket = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "TKT-333",
      "--title",
      "CLI-created ticket",
      "--lane",
      "In Progress",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(ticket.code, 0, ticket.stderr || ticket.stdout);

    const note = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "note",
      "add",
      "--type",
      "BUG",
      "--body",
      "shared provider route can break review promotion",
      "--file",
      "src/core/router.ts",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(note.code, 0, note.stderr || note.stdout);

    const search = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "search", "provider route", "--json"], { cwd: targetRoot });
    assert.equal(search.code, 0, search.stderr || search.stdout);
    const searchPayload = JSON.parse(search.stdout);
    assert.equal(searchPayload.length >= 1, true);

    const route = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "route", "review", "--json"], { cwd: targetRoot });
    assert.equal(route.code, 0, route.stderr || route.stdout);

    const telegram = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "telegram", "preview", "--json"], { cwd: targetRoot });
    assert.equal(telegram.code, 0, telegram.stderr || telegram.stdout);
    const telegramPayload = JSON.parse(telegram.stdout);
    assert.match(telegramPayload.text, /AI Workflow Status/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("CLI project readiness supports tool-dev evidence-root mode", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-cli-readiness-tool-dev-"));
  const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "workflow-repo");

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });

    const sync = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });
    assert.equal(sync.code, 0, sync.stderr || sync.stdout);

    const readiness = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "readiness",
      "--mode",
      "tool-dev",
      "--evidence-root",
      targetRoot,
      "--goal",
      "beta_readiness",
      "--question",
      "Is this ready for beta testing?",
      "--json"
    ], { cwd: repoRoot });

    assert.equal(readiness.code, 0, readiness.stderr || readiness.stdout);
    const payload = JSON.parse(readiness.stdout);
    assert.equal(payload.operation, "evaluate_readiness");
    assert.equal(payload.meta.mode, "tool-dev");
    assert.equal(payload.meta.evidence_root, targetRoot);
    assert.equal(payload.meta.operational_root, targetRoot);
    assert.equal(Array.isArray(payload.blockers), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("CLI provider quota refresh updates configured monthly free quota windows", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-cli-provider-quota-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          google: {
            apiKey: "g-key",
            quota: {
              freeUsdRemaining: 0,
              monthlyFreeUsd: 3,
              resetAt: "2026-03-01"
            }
          }
        }
      }, null, 2),
      "utf8"
    );

    const refresh = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "provider",
      "quota",
      "refresh",
      "google",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(refresh.code, 0, refresh.stderr || refresh.stdout);
    const payload = JSON.parse(refresh.stdout);
    assert.equal(payload.refreshed[0].providerId, "google");
    assert.equal(typeof payload.refreshed[0].quota.freeUsdRemaining, "number");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("telegram command parser remains thin and deterministic", () => {
  assert.deepEqual(parseTelegramCommand("/status now"), { command: "status", args: ["now"] });
  assert.deepEqual(parseTelegramCommand("status now"), { command: "unknown", args: [] });
});

async function runNode(args: string[], options: any = {}) {
  const captureDir = await mkdtemp(path.join(os.tmpdir(), "workflow-cli-capture-"));
  const stdoutPath = path.join(captureDir, "stdout.log");
  const stderrPath = path.join(captureDir, "stderr.log");
  try {
    await execFileAsync("/usr/bin/bash", ["-lc", `bun  > ${shellQuote(stdoutPath)} 2> ${shellQuote(stderrPath)}`], {
      cwd: options.cwd ?? repoRoot,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      code: 0,
      stdout: await readFile(stdoutPath, "utf8").catch(() => ""),
      stderr: await readFile(stderrPath, "utf8").catch(() => "")
    };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: await readFile(stdoutPath, "utf8").catch(() => error.stdout ?? ""),
      stderr: await readFile(stderrPath, "utf8").catch(() => error.stderr ?? error.message)
    };
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

function shellQuote(value) {
  return JSON.stringify(String(value));
}
