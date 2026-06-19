import { test } from "bun:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("legacy root cli launcher forwards to the shell package build", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-root-cli-"));

  try {
    await execFileAsync("bun", [path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot], { maxBuffer: 8 * 1024 * 1024 });

    const result = await execFileAsync(
      process.execPath,
      [path.join(repoRoot, "cli", "ai-workflow.mjs"), "project", "summary", "--json"],
      { cwd: targetRoot, maxBuffer: 8 * 1024 * 1024 }
    );
    const payload = JSON.parse(String(result.stdout ?? ""));
    assert.equal(typeof payload.entityCount, "number");
    assert.equal(typeof payload.fileCount, "number");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
