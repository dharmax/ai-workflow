import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { openWorkflowStore } from "../core/db/sqlite-store.mjs";
import { writeProjectFile } from "../core/lib/filesystem.mjs";
import { withWorkspaceMutation } from "../core/lib/workspace-mutation.mjs";
import { inspectWorkspaceHonesty } from "../runtime/scripts/ai-workflow/lib/workspace-honesty.mjs";

const execFileAsync = promisify(execFile);

test("workspace honesty detects tracked manual edits after the latest ai-workflow mutation", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-honesty-"));

  try {
    await execFileAsync("git", ["init"], { cwd: targetRoot });

    await withWorkspaceMutation(targetRoot, "seed workflow file", async () => {
      await writeProjectFile(targetRoot, "README.md", "# Seed\n");
    });

    const store = await openWorkflowStore({ projectRoot: targetRoot });
    try {
      const latestMutation = store.getLatestWorkspaceMutation(targetRoot);
      assert.equal(Boolean(latestMutation), true);
      assert.equal(latestMutation?.operation, "seed workflow file");
    } finally {
      store.close();
    }

    const cleanCheck = await inspectWorkspaceHonesty(targetRoot, { graceMs: 0 });
    assert.equal(cleanCheck.status, "pass");
    assert.equal(cleanCheck.suspiciousCount, 0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(path.join(targetRoot, "README.md"), "# Manual edit\n", "utf8");

    const dirtyCheck = await inspectWorkspaceHonesty(targetRoot, { graceMs: 0 });
    assert.equal(dirtyCheck.status, "fail");
    assert.equal(dirtyCheck.suspiciousFiles.some((file) => file.relativePath === "README.md"), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
