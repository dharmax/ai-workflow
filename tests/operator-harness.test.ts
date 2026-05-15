import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOperatorRequest, planExecutionProgram } from "aiwf-common-core/services/operator-harness";

test("normalizeOperatorRequest classifies long planning prompts to analysis-plan", async () => {
  const request = await normalizeOperatorRequest(
    "Audit the current state, inspect the relevant harness surfaces, map the gaps, and produce an implementation plan.",
    { surface: "test" }
  );

  assert.equal(request.requestKind, "workflow-program");
  assert.equal(request.taskClassHint, "analysis-plan");
  assert.equal(planExecutionProgram(request).programKind, "analysis-plan");
  assert.equal(request.responsePolicy.includeGapMap, true);
});

test("normalizeOperatorRequest keeps explicit primitives deterministic", async () => {
  const request = await normalizeOperatorRequest("sync", { surface: "test" });

  assert.equal(request.requestKind, "direct-primitive");
  assert.equal(request.explicitPrimitive, "sync");
  assert.equal(planExecutionProgram(request).programKind, "direct-primitive");
});

test("normalizeOperatorRequest classifies code review prompts to repo-investigation", async () => {
  const request = await normalizeOperatorRequest(
    "Review the ask path, inspect the relevant code and tests, and explain the top risks with evidence.",
    { surface: "test" }
  );

  assert.equal(request.requestKind, "workflow-program");
  assert.equal(request.taskClassHint, "repo-investigation");
  assert.equal(planExecutionProgram(request).programKind, "repo-investigation");
});

test("normalizeOperatorRequest treats enforcement audit prompts as workflow programs when analysis-plan is inferred", async () => {
  const request = await normalizeOperatorRequest(
    "Audit ai-workflow's guideline enforcement and honesty enforcement. What is enforced in code today, what is still only prompt guidance, and what are the next recommended moves to reach the DOD? Cite current workflow evidence.",
    { surface: "test" }
  );

  assert.equal(request.taskClassHint, "analysis-plan");
  assert.equal(request.requestKind, "workflow-program");
  assert.equal(planExecutionProgram(request).programKind, "analysis-plan");
});
