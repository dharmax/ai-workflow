import { test } from "bun:test";
import assert from "node:assert";
import { triageShellRequest } from "aiwf-common-core/services/shell-triage";
import { ShellTier } from "aiwf-common-core/services/shell-triage.types";
import { promoteWorkflowToCodelet } from "aiwf-common-core/services/shell-compiler";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("Shell Triage: Tier 1 Detection", async () => {
  const result = await triageShellRequest("sync");
  assert.strictEqual(result.intent.tier, ShellTier.Tier1);
  assert.strictEqual(result.intent.extracted?.primitive, "sync");

  const ticketResult = await triageShellRequest("ticket TKT-123");
  assert.strictEqual(ticketResult.intent.tier, ShellTier.Tier1);
  assert.strictEqual(ticketResult.intent.extracted?.primitive, "ticket tkt-123");
});

test("Shell Triage: Tier 3 Detection (Complex Flow)", async () => {
  const result = await triageShellRequest("If the project status is ready, then migrate all CSS files and verify every component.");
  assert.strictEqual(result.intent.tier, ShellTier.Tier3);
});

test("Shell Triage: Tier 2 Detection (Standard Assistant)", async () => {
  const result = await triageShellRequest("What is the status of the current ticket?");
  assert.strictEqual(result.intent.tier, ShellTier.Tier2);
});

test("Shell Triage: No-AI Mode Force Tier 1", async () => {
  const result = await triageShellRequest("Tell me a joke", { noAi: true });
  assert.strictEqual(result.intent.tier, ShellTier.Tier1);
});

test("Shell Triage: History Awareness for Follow-ups", async () => {
  // Without history, it's just garbage/Tier 2
  const noHistory = await triageShellRequest("do it");
  assert.strictEqual(noHistory.intent.tier, ShellTier.Tier2);

  // With history, it's recognized as a follow-up
  const withHistory = await triageShellRequest("do it", {
    history: [{ role: "user", content: "Should I sync?" }, { role: "assistant", content: "Yes." }]
  });
  assert.strictEqual(withHistory.intent.tier, ShellTier.Tier2);
  assert.strictEqual(withHistory.intent.reason, "Elliptical follow-up detected with active history.");
});

test("Shell Compiler: Codelet Promotion Collision Safety", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-workflow-test-"));
  const code = "console.log('v1');";
  const name = "collision-test";
  
  try {
    await promoteWorkflowToCodelet(tmpDir, name, code);
    
    // Attempting to promote again with same name should fail (BUG-PROMOTION-001)
    await assert.rejects(
      () => promoteWorkflowToCodelet(tmpDir, name, "console.log('v2');"),
      /already exists/
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("Shell Compiler: Syntax Validation on Promotion", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-workflow-test-"));
  const badCode = "const x = ;"; // Syntax error
  
  try {
    await assert.rejects(
      () => promoteWorkflowToCodelet(tmpDir, "bad-codelet", badCode),
      /Invalid JavaScript syntax/
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
