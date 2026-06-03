import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { runDogfoodHarness } from "aiwf-common-core/services/dogfood-harness";

test("dogfood harness falls back to a verified modular emoji game", async () => {
  const root = path.join("/tmp", `ai-workflow-dogfood-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(root, { recursive: true });

  try {
    const report = await runDogfoodHarness({
      root,
      maxAttempts: 1,
      executeRequest: async () => ({
        ok: false,
        assistantReply: "forced planner failure",
        plan: { usage: { totalTokens: 17 } }
      })
    });

    assert.equal(report.ok, true);
    assert.equal(report.generationSource, "deterministic-fallback");
    const verification = report.verification as any;
    assert.equal(verification.hasEngine, true);
    assert.equal(verification.hasEntities, true);
    assert.equal(verification.hasUI, true);
    assert.equal(verification.hasMain, true);
    assert.equal(verification.hasEmojis, true);
    assert.equal(verification.hasCanvasTexture, true);

    const entities = await fs.readFile(path.join(report.projectPath, "src", "entities.js"), "utf8");
    assert.match(entities, /CanvasTexture/);
    assert.match(entities, /🚀|👾/u);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
