import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runNode(args: string[], options: { cwd?: string } = {}) {
  try {
    const result = await execFileAsync(process.execPath, [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), ...args], {
      cwd: options.cwd ?? repoRoot,
      env: process.env,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      code: 0,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? "")
    };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? error)
    };
  }
}

async function runCommand(command: string, cwd: string) {
  try {
    await execFileAsync("/usr/bin/bash", ["-lc", command], { cwd, env: process.env });
  } catch (error: any) {
    throw new Error(String(error.stderr ?? error.message ?? error));
  }
}

test("project codelet registry exposes the search codelet", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-codelet-search-"));

  try {
    await runCommand("git init -q && git config user.email test@example.com && git config user.name 'AI Workflow Test'", targetRoot);
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const showResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "show", "search", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(showResult.code, 0, showResult.stderr || showResult.stdout);
    const payload = JSON.parse(showResult.stdout);
    assert.equal(payload.id, "search");
    assert.equal(payload.backing.exists, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("extract ticket works via the source CLI entrypoint", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-extract-ticket-"));

  try {
    await runCommand("git init -q && git config user.email test@example.com && git config user.name 'AI Workflow Test'", targetRoot);
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    const ticketId = "TEST-EXTRACT-001";
    const createResult = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "ticket",
        "create",
        "--id",
        ticketId,
        "--title",
        "Regression extract ticket",
        "--summary",
        "Exercise source-cli extract ticket flow.",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);

    const extractResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "extract", "ticket", ticketId, "--json"],
      { cwd: targetRoot }
    );
    assert.equal(extractResult.code, 0, extractResult.stderr || extractResult.stdout);
    const payload = JSON.parse(extractResult.stdout);
    assert.equal(payload.ticketId, ticketId);
    assert.equal(Array.isArray(payload.workingSet?.files), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
