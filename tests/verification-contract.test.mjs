import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { openWorkflowStore } from "../core/db/sqlite-store.mjs";
import { registerProvider } from "../core/services/providers.mjs";
import { runVerificationSummary } from "../runtime/scripts/ai-workflow/verification-summary.mjs";

test("verification summary persists a passing honesty contract to the workflow DB", { concurrency: false }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "verification-contract-pass-"));
  const providerId = `mock-verification-contract-pass-${Date.now()}`;

  try {
    await mkdir(path.join(root, ".ai-workflow"), { recursive: true });
    await writeFile(path.join(root, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        ollama: {
          enabled: false
        }
      }
    }, null, 2), "utf8");
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "review.md"), "# Review\n\nPlayable and documented.\n", "utf8");

    registerProvider(providerId, {
      generate: async () => ({
        providerId,
        modelId: "judge-v1",
        response: JSON.stringify({
          status: "pass",
          score: 95,
          confidence: 0.98,
          summary: "The artifact satisfies the request and reports it honestly.",
          findings: ["Artifact present"],
          recommendations: [],
          contract: {
            userWish: "Ship a working result that truly satisfies the request.",
            successDefinition: "The artifact meets the goal and the report tells the truth about remaining gaps.",
            attemptedRealWish: { score: 96, status: "pass", reason: "The work pursued the actual goal." },
            wishFulfillment: { score: 94, status: "pass", reason: "The result satisfies the goal." },
            reportTruthfulness: { score: 95, status: "pass", reason: "The report does not overclaim." },
            reportEnlightenment: { score: 93, status: "pass", reason: "The report explains the real state clearly." },
            misleadingRisk: "low"
          },
          artifacts: [
            {
              path: "docs/review.md",
              status: "pass",
              score: 95,
              findings: ["Artifact judged successfully"]
            }
          ],
          needs_human_review: false
        })
      })
    });

    const summary = await runVerificationSummary([
      "--root", root,
      "--artifact", "docs/review.md",
      "--rubric", "The artifact must satisfy the request and report the state honestly.",
      "--goal", "Ship a working result that truly satisfies the request.",
      "--provider", providerId,
      "--model", "judge-v1",
      "--json"
    ]);

    assert.equal(summary.conclusion, "verified");
    assert.equal(summary.honestyContract.reportTruthfulness.status, "pass");
    assert.match(summary.honestyContract.summary, /pursued the user's real wish/i);
    assert.equal(summary.gapReview.status, "resolved");

    const store = await openWorkflowStore({ projectRoot: root });
    try {
      const contract = store.getLatestWorkflowContract(root);
      const gapReview = store.getLatestWorkflowGapReview(root);
      assert.equal(contract?.userWish, "Ship a working result that truly satisfies the request.");
      assert.equal(contract?.truthfulnessStatus, "pass");
      assert.equal(contract?.misleadingLevel, "low");
      assert.equal(gapReview?.status, "resolved");
    } finally {
      store.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verification summary refuses full verification when the report contract is misleading", { concurrency: false }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "verification-contract-fail-"));
  const providerId = `mock-verification-contract-fail-${Date.now()}`;

  try {
    await mkdir(path.join(root, ".ai-workflow"), { recursive: true });
    await writeFile(path.join(root, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        ollama: {
          enabled: false
        }
      }
    }, null, 2), "utf8");
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "review.md"), "# Review\n\nLooks polished.\n", "utf8");

    registerProvider(providerId, {
      generate: async () => ({
        providerId,
        modelId: "judge-v1",
        response: JSON.stringify({
          status: "pass",
          score: 92,
          confidence: 0.97,
          summary: "The artifact looks good.",
          findings: ["Artifact present"],
          recommendations: [],
          contract: {
            userWish: "Actually satisfy the user's request, not just look complete.",
            successDefinition: "The result must be real and the report must not overclaim.",
            attemptedRealWish: { score: 90, status: "pass", reason: "The goal was attempted." },
            wishFulfillment: { score: 88, status: "pass", reason: "The artifact seems close." },
            reportTruthfulness: { score: 20, status: "fail", reason: "The report overclaims readiness." },
            reportEnlightenment: { score: 35, status: "fail", reason: "The report hides critical gaps." },
            misleadingRisk: "high"
          },
          artifacts: [
            {
              path: "docs/review.md",
              status: "pass",
              score: 92,
              findings: ["Artifact judged successfully"]
            }
          ],
          needs_human_review: false
        })
      })
    });

    const summary = await runVerificationSummary([
      "--root", root,
      "--artifact", "docs/review.md",
      "--rubric", "The artifact must satisfy the request and report the state honestly.",
      "--goal", "Actually satisfy the user's request, not just look complete.",
      "--provider", providerId,
      "--model", "judge-v1",
      "--json"
    ]);

    assert.equal(summary.conclusion, "not verified");
    assert.equal(summary.honestyContract.reportTruthfulness.status, "fail");
    assert.equal(summary.honestyContract.misleadingRisk, "high");
    assert.equal(summary.gapReview.status, "open");
    assert.equal(summary.gapReview.severity, "high");
    assert.equal(summary.gapReview.actions.some((action) => action.type === "revise-report"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
