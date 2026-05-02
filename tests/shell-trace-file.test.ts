import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleShellCommand } from "../cli/lib/shell.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runNode(args, options = {}) {
  return await new Promise((resolve) => {
    execFile( "npx", "tsx", args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      timeout: options.timeout ?? 180000,
      maxBuffer: 8 * 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({
        code: error?.code ?? 0,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? "")
      });
    });
  });
}

test("handleShellCommand enables trace file mode", async () => {
  const root = path.resolve("/tmp/ai-workflow-shell-trace-command-" + Math.random().toString(36).slice(2));
  const options = {
    root,
    json: true,
    shellMode: "plan",
    trace: false
  };

  try {
    const result = handleShellCommand("trace on file traces/session.log", options);
    assert.equal(result?.handled, true);
    assert.equal(result?.stateChanged, true);
    assert.equal(options.trace, true);
    assert.equal(options.traceConsole, false);
    assert.equal(options.traceFilePath, path.resolve(root, "traces/session.log"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("shell CLI writes workflow trace to a file without stderr noise", async () => {
  const root = path.resolve("/tmp/ai-workflow-shell-trace-cli-" + Math.random().toString(36).slice(2));
  const statePath = path.join(root, "shell-state.json");
  const tracePath = path.join(root, "artifacts", "shell.trace.log");
  await fs.mkdir(root, { recursive: true });

  try {
    const configureTrace = await runNode([
      "cli/ai-workflow.ts",
      "shell",
      "--json",
      "--state-file",
      statePath,
      `trace on file ${tracePath}`
    ], { cwd: repoRoot });
    assert.equal(configureTrace.code, 0, configureTrace.stderr || configureTrace.stdout);

    const configuredState = JSON.parse(await fs.readFile(statePath, "utf8"));
    assert.equal(configuredState.trace, true);
    assert.equal(configuredState.traceConsole, false);
    assert.equal(configuredState.traceFilePath, tracePath);

    const result = await runNode([
      "cli/ai-workflow.ts",
      "shell",
      "--no-ai",
      "--state-file",
      statePath,
      "version"
    ], { cwd: repoRoot });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stderr, /\[trace\]|\[workflow\]|\[Workflow\]/);

    const traceText = await fs.readFile(tracePath, "utf8");
    assert.match(traceText, /\[workflow\]/);
    assert.doesNotMatch(traceText, /\[Workflow\]/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
