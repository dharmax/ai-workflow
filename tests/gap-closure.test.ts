import { test } from "bun:test";
import assert from "node:assert/strict";
import { assessWorkflowGap } from "aiwf-common-core/services/gap-closure";

test("gap assessment recommends stronger recovery actions for misleading fulfillment gaps", () => {
  const review = assessWorkflowGap({
    judgeMode: "artifact",
    ticket: "TKT-HONESTY-003",
    results: [
      {
        command: "pnpm test",
        exitCode: 1,
        snippet: "failing integration check"
      }
    ],
    honestyContract: {
      userWish: "Ship the real feature, not a partial substitute.",
      successDefinition: "The feature works and the report says exactly what remains.",
      attemptedRealWish: { status: "pass", reason: "The target was attempted." },
      wishFulfillment: { status: "fail", reason: "The feature is still incomplete." },
      reportTruthfulness: { status: "fail", reason: "The report claimed completion." },
      reportEnlightenment: { status: "needs_human_review", reason: "The report does not explain the gap." },
      misleadingRisk: "high",
      missingEvidence: ["Current browser verification is missing."]
    },
    artifactJudgment: {
      route: {
        recommended: {
          providerId: "ollama",
          modelId: "small-local",
          quality: "medium",
          score: 10
        },
        fallbackChain: [
          {
            providerId: "openai",
            modelId: "gpt-4o",
            quality: "high",
            score: 30
          }
        ]
      },
      diagnostics: {
        attempts: [
          {
            providerId: "ollama",
            modelId: "small-local",
            success: true
          }
        ],
        successfulProviderId: "ollama",
        successfulModelId: "small-local"
      },
      result: {
        status: "needs_human_review",
        summary: "The evidence is incomplete."
      }
    }
  } as any);

  assert.equal(review.status, "open");
  assert.equal(review.severity, "high");
  assert.equal((review.gapTypes as any[]).includes("wish-fulfillment"), true);
  assert.equal((review.gapTypes as any[]).includes("misleading-report"), true);
  assert.equal((review.actions as any[]).some((action) => action.type === "run-trial-and-error"), true);
  assert.equal((review.actions as any[]).some((action) => action.type === "continue-implementation"), true);
  assert.equal((review.actions as any[]).some((action) => action.type === "revise-report"), true);
  assert.equal((review.actions as any[]).some((action) => action.type === "retry-with-stronger-model" && action.providerId === "openai"), true);
});

test("gap assessment suggests web search when the gap depends on current external facts", () => {
  const review = assessWorkflowGap({
    judgeMode: "artifact",
    honestyContract: {
      userWish: "Use the latest official API documentation and implement the right behavior.",
      successDefinition: "The implementation matches the current API and the report says what was verified.",
      attemptedRealWish: { status: "needs_human_review", reason: "The current official docs were not checked." },
      wishFulfillment: { status: "needs_human_review", reason: "It may be using an old version." },
      reportTruthfulness: { status: "pass", reason: "The report does not overclaim." },
      reportEnlightenment: { status: "pass", reason: "The report is clear." },
      misleadingRisk: "medium",
      missingEvidence: ["Latest official docs were not consulted."]
    } as any
  });

  assert.equal((review.actions as any[]).some((action) => action.type === "use-web-search"), true);
  assert.equal((review.actions as any[]).some((action) => action.type === "ask-user"), true);
});
