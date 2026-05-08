import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncProject, createTicket } from "aiwf-common-core/services/sync";
import { deriveTicketExecutionProfile, sweepBugs } from "aiwf-common-core/services/orchestrator";
import { withWorkflowStore } from "aiwf-common-core/services/sync";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "workflow-repo");

test("sweepBugs marks a bug done only after verification passes", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "orch-test-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/tags")) {
      return {
        ok: true,
        async json() {
          return { models: [{ name: "mock-model:latest", size: 1000 }] };
        }
      };
    }
    if (String(url).endsWith("/api/generate")) {
      return {
        ok: true,
        async json() {
          return {
            response: `File: src/app.ts\n<<<< SEARCH\nimport "./styles/app.css";\n====\nimport "./styles/app.css";\nimport { readFileSync } from "node:fs";\n>>>>`
          };
        }
      };
    }
    if (String(url).includes("generateContent")) {
      return {
        ok: true,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: `File: src/app.ts\n<<<< SEARCH\nimport "./styles/app.css";\n====\nimport "./styles/app.css";\nimport { readFileSync } from "node:fs";\n>>>>`
                    }
                  ]
                }
              }
            ]
          };
        }
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  process.env.OLLAMA_HOST = "http://mock-ollama.local";

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    
    await syncProject({ projectRoot: targetRoot });

    await createTicket({
      projectRoot: targetRoot,
      entity: {
        id: "BUG-999",
        entityType: "ticket",
        title: "Fix bug in src/app.ts",
        lane: "Todo",
        data: {
          summary: "Patch src/app.ts import handling."
        }
      }
    });

    const report = await sweepBugs({ root: targetRoot });
    assert.match(report, /Sweeping 1 bugs/);
    assert.match(report, /BUG-999/);
    assert.match(report, /verified 1\/1/);

    const storedTicket = await withWorkflowStore(targetRoot, async (store) => store.getEntity("BUG-999"));
    assert.equal(storedTicket.lane, "Done");
    assert.equal(storedTicket.data.executionResult.status, "verified");
    assert.equal(storedTicket.data.executionPlan.verificationCommands[0].command, "npm run --silent test");
    assert.equal(storedTicket.data.executionResult.selection.priorityScore >= 10, true);
    assert.equal(Array.isArray(storedTicket.data.executionResult.attempts), true);
    assert.equal(storedTicket.data.executionResult.attempts.length, 1);
    assert.equal(storedTicket.data.executionResult.attempts[0].patchSuccess, true);
    assert.match(storedTicket.data.executionResult.lessons.join("\n"), /Verified fix against 1 command/);
    assert.equal(Array.isArray(storedTicket.data.executionHistory), true);
    assert.equal(storedTicket.data.executionHistory.at(-1).status, "verified");

    const knowledge = await readFile(path.join(targetRoot, "knowledge.md"), "utf8");
    assert.match(knowledge, /BUG-999 \[verified\] Fix bug in src\/app\.ts/);
    assert.match(knowledge, /Verified fix against 1 command/);
    
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OLLAMA_HOST;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("sweepBugs blocks a bug when the verification baseline is already red", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "orch-test-fail-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/tags")) {
      return {
        ok: true,
        async json() {
          return { models: [{ name: "mock-model:latest", size: 1000 }] };
        }
      };
    }
    if (String(url).endsWith("/api/generate")) {
      return {
        ok: true,
        async json() {
          return {
            response: `File: src/app.ts\n<<<< SEARCH\nimport "./styles/app.css";\n====\nimport "./styles/app.css";\nimport { readFileSync } from "node:fs";\n>>>>`
          };
        }
      };
    }
    if (String(url).includes("generateContent")) {
      return {
        ok: true,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: `File: src/app.ts\n<<<< SEARCH\nimport "./styles/app.css";\n====\nimport "./styles/app.css";\nimport { readFileSync } from "node:fs";\n>>>>`
                    }
                  ]
                }
              }
            ]
          };
        }
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  process.env.OLLAMA_HOST = "http://mock-ollama.local";

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });
    await createTicket({
      projectRoot: targetRoot,
      entity: {
        id: "BUG-1000",
        entityType: "ticket",
        title: "Fix failing bug in src/app.ts",
        lane: "Todo",
        data: {
          summary: "Patch src/app.ts import handling.",
          verification: "npm run definitely-missing-script"
        }
      }
    });

    const report = await sweepBugs({ root: targetRoot, verificationTimeoutMs: 10_000 });
    assert.match(report, /BUG-1000/);
    assert.match(report, /Verification baseline red/);

    const storedTicket = await withWorkflowStore(targetRoot, async (store) => store.getEntity("BUG-1000"));
    assert.equal(storedTicket.lane, "Blocked");
    assert.equal(storedTicket.data.executionResult.status, "baseline-red");
    assert.equal(storedTicket.data.executionPlan.verificationCommands[0].command, "npm run definitely-missing-script");
    assert.equal(storedTicket.data.executionResult.attempts.length, 0);
    assert.match(storedTicket.data.executionResult.lessons.join("\n"), /baseline was already red/i);
    assert.equal(storedTicket.data.executionHistory.at(-1).status, "baseline-red");

    const knowledge = await readFile(path.join(targetRoot, "knowledge.md"), "utf8");
    assert.match(knowledge, /BUG-1000 \[baseline-red\] Fix failing bug in src\/app\.ts/);
    assert.match(knowledge, /Verification baseline was already red before changes/i);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OLLAMA_HOST;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("sweepBugs prioritizes higher-impact bugs first and records the selection reason", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "orch-test-priority-"));
  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });
    await createTicket({
      projectRoot: targetRoot,
      entity: {
        id: "BUG-LOW",
        entityType: "ticket",
        title: "Minor bug in src/app.ts",
        lane: "Todo",
        data: {
          summary: "Cosmetic cleanup only.",
          verification: "npm run definitely-missing-script"
        }
      }
    });
    await createTicket({
      projectRoot: targetRoot,
      entity: {
        id: "BUG-CRIT",
        entityType: "ticket",
        title: "Critical production crash bug in src/app.ts",
        lane: "Todo",
        data: {
          summary: "Production regression blocks operator workflow.",
          verification: "npm run definitely-missing-script"
        }
      }
    });

    const report = await sweepBugs({ root: targetRoot, verificationTimeoutMs: 10_000 });
    const criticalIndex = report.indexOf("BUG-CRIT");
    const lowIndex = report.indexOf("BUG-LOW");
    assert.notEqual(criticalIndex, -1);
    assert.notEqual(lowIndex, -1);
    assert.equal(criticalIndex < lowIndex, true);
    assert.match(report, /Priority order:/);
    assert.match(report, /critical-impact/);

    const criticalTicket = await withWorkflowStore(targetRoot, async (store) => store.getEntity("BUG-CRIT"));
    assert.equal(criticalTicket.data.executionResult.selection.reasons.includes("critical-impact"), true);
    assert.equal(criticalTicket.data.executionHistory.at(-1).selection.reasons.includes("critical-impact"), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("deriveTicketExecutionProfile classifies refactor tickets separately from bug fixes", () => {
  const refactorProfile = deriveTicketExecutionProfile({
    id: "REF-SHELL-01",
    title: "Refactor shell routing into smaller modules",
    lane: "Todo",
    data: {
      summary: "Modularize the planner and fallback code without changing behavior."
    }
  });
  assert.equal(refactorProfile.kind, "refactor");
  assert.equal(refactorProfile.taskClass, "refactoring");
  assert.match(refactorProfile.goalInstruction, /keep behavior stable/i);

  const bugProfile = deriveTicketExecutionProfile({
    id: "BUG-SHELL-01",
    title: "Fix shell routing regression",
    lane: "Todo",
    data: {
      summary: "Repair the broken fallback path."
    }
  });
  assert.equal(bugProfile.kind, "bugfix");
  assert.equal(bugProfile.taskClass, "bug-hunting");
});
