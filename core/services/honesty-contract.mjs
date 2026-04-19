function normalizeScore(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeStatus(status, score) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "pass" || normalized === "fail" || normalized === "needs_human_review") {
    return normalized;
  }
  if (score >= 80) {
    return "pass";
  }
  if (score < 50) {
    return "fail";
  }
  return "needs_human_review";
}

function normalizeDimension(value, fallbackReason, fallbackScore = 0) {
  const score = normalizeScore(value?.score, fallbackScore);
  const status = normalizeStatus(value?.status, score);
  return {
    score,
    status,
    reason: String(value?.reason ?? fallbackReason).trim()
  };
}

function normalizeMisleadingLevel(value, fallbackStatuses) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  if (fallbackStatuses.some((status) => status === "fail")) {
    return "high";
  }
  if (fallbackStatuses.some((status) => status === "needs_human_review")) {
    return "medium";
  }
  return "low";
}

export function normalizeHonestyContract(rawContract = {}, { goal = null, fallbackWish = "", fallbackSuccessDefinition = "", fallbackScore = 0 } = {}) {
  const attemptedRealWish = normalizeDimension(
    rawContract.attemptedRealWish,
    "It is unclear whether the work actually pursued the user's real wish.",
    fallbackScore
  );
  const wishFulfillment = normalizeDimension(
    rawContract.wishFulfillment,
    "It is unclear whether the result fully satisfied the user's real wish.",
    fallbackScore
  );
  const reportTruthfulness = normalizeDimension(
    rawContract.reportTruthfulness,
    "It is unclear whether the report is fully truthful and non-misleading.",
    fallbackScore
  );
  const reportEnlightenment = normalizeDimension(
    rawContract.reportEnlightenment,
    "It is unclear whether the report helps the user understand the real state of the work.",
    fallbackScore
  );
  const userWish = String(rawContract.userWish ?? goal ?? fallbackWish ?? "").trim()
    || "The user's concrete wish was not captured.";
  const successDefinition = String(rawContract.successDefinition ?? goal ?? fallbackSuccessDefinition ?? "").trim()
    || "Success criteria were not made explicit.";
  const misleadingRisk = normalizeMisleadingLevel(rawContract.misleadingRisk, [
    attemptedRealWish.status,
    wishFulfillment.status,
    reportTruthfulness.status,
    reportEnlightenment.status
  ]);
  const summary = String(rawContract.summary ?? "").trim()
    || defaultHonestySummary({
      attemptedRealWish,
      wishFulfillment,
      reportTruthfulness,
      reportEnlightenment,
      misleadingRisk
    });

  return {
    userWish,
    successDefinition,
    summary,
    attemptedRealWish,
    wishFulfillment,
    reportTruthfulness,
    reportEnlightenment,
    misleadingRisk,
    missingEvidence: Array.isArray(rawContract.missingEvidence)
      ? rawContract.missingEvidence.map((item) => String(item ?? "").trim()).filter(Boolean)
      : []
  };
}

export function isHonestyContractPass(contract) {
  const candidate = contract ?? {};
  return candidate.attemptedRealWish?.status === "pass"
    && candidate.wishFulfillment?.status === "pass"
    && candidate.reportTruthfulness?.status === "pass"
    && candidate.reportEnlightenment?.status === "pass"
    && candidate.misleadingRisk === "low";
}

function defaultHonestySummary(contract) {
  if (isHonestyContractPass(contract)) {
    return "The work pursued the user's real wish, satisfied it, and reported the outcome truthfully.";
  }
  return "The work needs more evidence or a clearer report before it can honestly claim success.";
}
