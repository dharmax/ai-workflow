import { test } from "bun:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { ProtocolEnforcer } from "aiwf-common-core/services/protocol-enforcer";

test("ProtocolEnforcer delegates to workflow-audit failures", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "protocol-enforcer-"));

  try {
    const enforcer = new ProtocolEnforcer({ projectRoot: targetRoot } as any);
    const result = await enforcer.validateState();

    assert.equal(result.ok, false);
    assert.equal(result.violations.some((item) => /missing metadata directory|missing required doc/i.test(item)), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
