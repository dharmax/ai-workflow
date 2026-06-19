import { test } from "bun:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runNode(args: string[], options: any = {}) {
  try {
    const result = await execFileAsync("bun", args, { ...options, maxBuffer: 8 * 1024 * 1024 });
    return {
      code: 0,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? "")
    };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? "")
    };
  }
}


test("ai-workflow run uses in-process JS codelet exports when available", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-executor-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await mkdir(path.join(targetRoot, "src"), { recursive: true });
    await writeFile(path.join(targetRoot, "src", "echo-codelet.ts"), [
      "export async function runSmartCodelet(argv) {",
      "  return {",
      "    codeletId: 'echo-codelet',",
      "    argv,",
      "    mode: 'in-process'",
      "  };",
      "}"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "echo-codelet.json"), JSON.stringify({
      id: "echo-codelet",
      stability: "staged",
      category: "documentation",
      summary: "Echo an in-process codelet response.",
      runner: "node-script",
      execution: "js",
      entry: "src/echo-codelet.ts",
      status: "staged"
    }, null, 2), "utf8");

    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const runResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "run",
      "echo-codelet",
      "--json"
    ], { cwd: targetRoot });

    assert.equal(runResult.code, 0, runResult.stderr || runResult.stdout);
    const payload = JSON.parse(runResult.stdout);
    assert.equal(payload.codeletId, "echo-codelet");
    assert.equal(payload.mode, "in-process");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
