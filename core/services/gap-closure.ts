/**
 * @file gap-closure.js
 * @brief Auto-generated header for gap-closure.js. Needs detailed responsibility and scope.
 */

function normalizeTextList(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function scoreSeverity(gapTypes) {
  if (gapTypes.includes("wish-fulfillment") || gapTypes.includes("misleading-report")) {
    return "high";
  }
  if (gapTypes.includes("missing-evidence") || gapTypes.includes("verification-failure") || gapTypes.includes("model-capability")) {
    return "medium";
  }
  return "low";
}

function buildAction(type, priority, reason, extra = {}) {
  return {
    type,
    priority,
    reason,
    ...extra
  };
}

function chooseModelEscalation(route, diagnostics = {}) {
  const attempts = Array.isArray(diagnostics.attempts) ? diagnostics.attempts : [];
  const successfulKey = diagnostics.successfulProviderId && diagnostics.successfulModelId
    ? `${diagnostics.successfulProviderId}:${diagnostics.successfulModelId}`
    : null;
  const candidates = [
    route?.recommended,
    ...(Array.isArray(route?.fallbackChain) ? route.fallbackChain : []),
    ...(Array.isArray(route?.candidates) ? route.candidates : [])
  ].filter((candidate) => candidate?.providerId && candidate?.modelId);

  for (const candidate of candidates) {
    const key = `${candidate.providerId}:${candidate.modelId}`;
    if (successfulKey && key === successfulKey) {
      continue;
    }
    const alreadyTried = attempts.some((attempt) => `${attempt.providerId}:${attempt.modelId}` === key && attempt.success);
    if (alreadyTried) {
      continue;
    }
    if (candidate.quality === "high" || Number(candidate.score ?? 0) > 0) {
      return candidate;
    }
  }

  return null;
}

function shouldSuggestWebSearch(contract, evidenceTexts) {
  const haystack = [
    contract?.userWish,
    contract?.successDefinition,
    contract?.summary,
    ...evidenceTexts
  ].join("\n").toLowerCase();
  return /\b(latest|current|today|recent|official docs|documentation|spec|api|pricing|policy|law|regulation|version)\b/.test(haystack);
}

export function assessWorkflowGap({
  honestyContract = null,
  artifactJudgment = null,
  results = [],
  judgeMode = "artifact",
  ticket = null
} = {}) {
  const contract = honestyContract ?? null;
  const resultList = Array.isArray(results) ? results : [];
  const evidenceTexts = normalizeTextList([
    contract?.attemptedRealWish?.reason,
    contract?.wishFulfillment?.reason,
    contract?.reportTruthfulness?.reason,
    contract?.reportEnlightenment?.reason,
    contract?.summary,
    artifactJudgment?.result?.summary,
    ...normalizeTextList(artifactJudgment?.result?.findings),
    ...normalizeTextList(contract?.missingEvidence),
    ...resultList.map((result) => result?.snippet)
  ]);

  const gapTypes = [];
  const actions = [];

  const commandFailures = resultList.filter((result) => Number(result?.exitCode ?? 0) !== 0);
  if (commandFailures.length) {
    gapTypes.push("verification-failure");
    actions.push(buildAction(
      "run-trial-and-error",
      10,
      "Verification commands failed. Iterate on the implementation and rerun the failing checks until the result actually works.",
      {
        commands: commandFailures.map((result) => result.command)
      }
    ));
  }

  if (contract?.attemptedRealWish?.status === "fail") {
    gapTypes.push("wrong-target");
    actions.push(buildAction(
      "continue-implementation",
      9,
      "The work did not pursue the user's real wish. Redirect implementation toward the actual requested outcome before closing."
    ));
  }

  if (contract?.wishFulfillment?.status === "fail" || contract?.wishFulfillment?.status === "needs_human_review") {
    gapTypes.push("wish-fulfillment");
    actions.push(buildAction(
      "continue-implementation",
      8,
      "The delivered result does not yet fully satisfy the user's wish. Keep building and verifying the missing outcome."
    ));
  }

  if (contract?.reportTruthfulness?.status === "fail" || contract?.misleadingRisk === "high") {
    gapTypes.push("misleading-report");
    actions.push(buildAction(
      "revise-report",
      10,
      "The report is overclaiming or hiding material gaps. Rewrite it with exact limits, failures, and missing evidence."
    ));
  }

  if (contract?.reportEnlightenment?.status === "fail" || contract?.reportEnlightenment?.status === "needs_human_review") {
    gapTypes.push("weak-reporting");
    actions.push(buildAction(
      "improve-report",
      6,
      "The report does not help the operator understand what is done, what is missing, and what should happen next."
    ));
  }

  const missingEvidence = normalizeTextList(contract?.missingEvidence);
  if (missingEvidence.length || artifactJudgment?.result?.status === "needs_human_review") {
    gapTypes.push("missing-evidence");
    actions.push(buildAction(
      "rerun-verification",
      7,
      "The available evidence is incomplete or ambiguous. Gather stronger proof before claiming completion.",
      {
        missingEvidence
      }
    ));
  }

  const escalationCandidate = chooseModelEscalation(artifactJudgment?.route, artifactJudgment?.diagnostics);
  if (escalationCandidate && (gapTypes.includes("wish-fulfillment") || gapTypes.includes("missing-evidence") || gapTypes.includes("misleading-report"))) {
    gapTypes.push("model-capability");
    actions.push(buildAction(
      "retry-with-stronger-model",
      5,
      "A stronger model candidate is available for a more critical pass on planning or judging.",
      {
        providerId: escalationCandidate.providerId,
        modelId: escalationCandidate.modelId
      }
    ));
  }

  if (shouldSuggestWebSearch(contract, evidenceTexts)) {
    gapTypes.push("external-knowledge");
    actions.push(buildAction(
      "use-web-search",
      4,
      "The gap likely depends on current external facts or official documentation. Pull current evidence instead of guessing."
    ));
  }

  if (gapTypes.includes("wish-fulfillment") || gapTypes.includes("wrong-target")) {
    actions.push(buildAction(
      "goe-discussion",
      3,
      "Revisit goal, outcome, and evidence alignment before declaring success."
    ));
  }

  if (!resultList.length && !artifactJudgment && !contract) {
    gapTypes.push("missing-evidence");
    actions.push(buildAction(
      "ask-user",
      1,
      "No evidence was recorded. Clarify the desired proof or the missing inputs before proceeding."
    ));
  } else if (contract?.attemptedRealWish?.status === "needs_human_review" || contract?.wishFulfillment?.status === "needs_human_review") {
    actions.push(buildAction(
      "ask-user",
      2,
      "The real target is still ambiguous enough that the workflow should confirm the operator's priority."
    ));
  }

  const normalizedGapTypes = [...new Set(gapTypes)];
  const severity = scoreSeverity(normalizedGapTypes);
  const status = normalizedGapTypes.length ? "open" : "resolved";
  const dedupedActions = uniqueBy(actions, (action) => `${action.type}:${action.providerId ?? ""}:${action.modelId ?? ""}:${action.reason}`)
    .sort((left, right) => right.priority - left.priority || left.type.localeCompare(right.type));

  return {
    status,
    severity,
    summary: status === "resolved"
      ? "No material wish-vs-done gap remains after verification."
      : buildGapSummary(normalizedGapTypes, ticket, judgeMode),
    gapTypes: normalizedGapTypes,
    actions: dedupedActions,
    evidence: {
      ticket,
      judgeMode,
      commandFailures: commandFailures.map((result) => ({
        command: result.command,
        exitCode: result.exitCode,
        snippet: result.snippet ?? null
      })),
      missingEvidence
    }
  };
}

function buildGapSummary(gapTypes, ticket, judgeMode) {
  const scope = ticket ? `ticket ${ticket}` : `${judgeMode} verification`;
  return `${scope} still has unresolved gap(s): ${gapTypes.join(", ")}.`;
}
