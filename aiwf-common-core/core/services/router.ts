/**
 * @file router.js
 * @brief Auto-generated header for router.js. Needs detailed responsibility and scope.
 */

import { discoverProviderState } from "./providers.ts";
import { applyModelFitMatrix, buildModelFitMatrix } from "./model-fit.ts";

const QUALITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3
};

export async function routeTask({
  root = process.cwd(),
  taskClass,
  domain = null,
  preferLocal = true,
  requireLocal = false,
  allowWeak = false,
  forceRefresh = false,
  providerState = null
} = {}) {
  if (!taskClass) {
    throw new Error("taskClass is required");
  }

  const discoveredProviderState = providerState ?? await discoverProviderState({ root: root || process.cwd(), forceRefresh });
  const modelFitMatrix = await buildModelFitMatrix({ root, providerState: discoveredProviderState, taskClass });
  const routedState = applyModelFitMatrix(discoveredProviderState, modelFitMatrix);
  const knowledge = routedState.knowledge || { capabilityMapping: {}, minimumQuality: {} };
  const capability = knowledge.capabilityMapping[taskClass] ?? domain ?? "logic";
  const minimumQuality = knowledge.minimumQuality[taskClass] ?? "medium";
  const preferLocalForTask = preferLocal ?? routedState.routingPolicy.preferLocalFor?.includes(taskClass) ?? routedState.routingPolicy.preferLocalFor?.includes(capability) ?? false;
  const quotaStrategy = routedState.routingPolicy.quotaStrategy ?? "prefer-free-remote";
  const candidates = [];
  const remoteFreeQuotaAvailable = Object.values(routedState.providers).some((provider) =>
    !provider.local && provider.available && hasFreeQuota(provider)
  );

  for (const [providerId, provider] of Object.entries(routedState.providers)) {
    if (!provider.available) {
      continue;
    }
    if (!provider.local && shouldBlockProviderForQuota(provider, { quotaStrategy, remoteFreeQuotaAvailable })) {
      continue;
    }

    for (const model of provider.models) {
      const isInteractiveOrchestrator = ["shell-planning", "agent-orchestration"].includes(taskClass);
      const isInteractiveOrchestratorLocal = isInteractiveOrchestrator && provider.local;
      const quality = model.quality ?? "medium";
      if (isNonGenerativeModel(model, taskClass)) {
        continue;
      }
      if (taskClass === "shell-planning" && isVisionOnlyModel(model)) {
        continue;
      }
      if (!allowWeak && QUALITY_ORDER[quality] < QUALITY_ORDER[minimumQuality]) {
        continue;
      }

      // Check hardware limits for local models
      if (!isInteractiveOrchestratorLocal && provider.local && provider.maxModelSizeB && model.sizeB && model.sizeB > provider.maxModelSizeB) {
        continue;
      }

      // 0-5 competency score (Data-driven inference)
      const competency = model.capabilities?.[capability] ?? inferCompetency(model, capability, knowledge.inferenceHeuristics);
      const localNoRemoteFallback = provider.local && !remoteFreeQuotaAvailable;

      if (competency < 2 || (!allowWeak && !isInteractiveOrchestratorLocal && !localNoRemoteFallback && competency < 3 && QUALITY_ORDER[minimumQuality] > QUALITY_ORDER.low)) {
        continue;
      }

      const localPreference = preferLocalForTask && provider.local ? (isInteractiveOrchestratorLocal ? 12 : 3) : 0;
      const shellPlanningRemotePenalty = isInteractiveOrchestrator && preferLocalForTask && !provider.local ? -6 : 0;
      const configTrustBonus = provider.local ? 1 : provider.configured ? 2 : -3;
      
      // Item 35: Historical Success Bias
      const byModel = Array.isArray(routedState.metricsSummary?.byModel) ? routedState.metricsSummary.byModel : [];
      const modelMetrics = byModel.find(m => m.model_id === model.id);
      const reliabilityBonus = modelMetrics ? (modelMetrics.success_rate / 20) : 2; // 0-5 bonus based on success rate
      const latencyBonus = scoreLatency(modelMetrics?.avg_latency, { taskClass, local: provider.local });
      const interactiveShellBonus = scoreInteractiveShellPlanner(model, taskClass);
      const configuredPlannerBonus = provider.local && provider.plannerModel === model.id ? scoreConfiguredPlannerModel(taskClass) : 0;
      const quotaBonus = scoreQuota(provider, { quotaStrategy, remoteFreeQuotaAvailable });
      const fitBonus = typeof model.fitScore === "number" ? (model.fitScore / 10) : 0;
      const score = (10 - (model.costTier ?? 5)) + (competency * 2) + localPreference + shellPlanningRemotePenalty + reliabilityBonus + latencyBonus + interactiveShellBonus + configuredPlannerBonus + quotaBonus + configTrustBonus + fitBonus;
      
      candidates.push({
        providerId,
        modelId: model.id,
        local: provider.local,
        quality,
        costTier: model.costTier ?? 5,
        competency,
        fitScore: model.fitScore ?? null,
        fitReasons: model.fitReasons ?? [],
        quota: provider.quota ?? null,
        freeQuotaRemaining: provider.quota?.freeUsdRemaining ?? null,
        apiKey: provider.apiKey ?? null,
        host: model.host ?? provider.host ?? null,
        baseUrl: provider.baseUrl ?? null,
        score
      });
    }
  }

  if (preferLocalForTask && candidates.some((candidate) => candidate.local)) {
    const localOnly = candidates.filter((candidate) => candidate.local);
    if (localOnly.length) {
      candidates.length = 0;
      candidates.push(...localOnly);
    }
  } else if (!remoteFreeQuotaAvailable && candidates.some((candidate) => candidate.local)) {
    const localOnly = candidates.filter((candidate) => candidate.local);
    if (localOnly.length) {
      candidates.length = 0;
      candidates.push(...localOnly);
    }
  }

  candidates.sort((left, right) => right.score - left.score || left.costTier - right.costTier || left.modelId.localeCompare(right.modelId));
  if (requireLocal && !candidates.some((candidate) => candidate.local)) {
    return {
      taskClass,
      capability,
      minimumQuality,
      recommended: null,
      fallbackChain: [],
      candidates: [],
      providers: routedState.providers,
      modelFitMatrix,
      degradedPath: true,
      failureReasons: [
        "local provider was explicitly requested, but no available local model satisfied the task route"
      ],
      tooling: {
        leanCtx: routedState.leanCtx,
        contextCompression: routedState.routingPolicy.contextCompression
      }
    };
  }
  const primary = candidates[0] ?? null;

  return {
    taskClass,
    capability,
    minimumQuality,
    recommended: primary ? {
      ...primary,
      reason: buildReason(primary, taskClass, minimumQuality, capability)
    } : null,
    fallbackChain: candidates.slice(1, 4).map((candidate) => ({
      ...candidate,
      reason: buildReason(candidate, taskClass, minimumQuality, capability)
    })),
    candidates,
    providers: routedState.providers,
    modelFitMatrix,
    degradedPath: false,
    failureReasons: [],
    tooling: {
      leanCtx: routedState.leanCtx,
      contextCompression: routedState.routingPolicy.contextCompression
    }
  };
}

function scoreLatency(avgLatencyMs, { taskClass, local }) {
  const latency = Number(avgLatencyMs ?? 0);
  if (!Number.isFinite(latency) || latency <= 0) {
    return 0;
  }

  const latencySensitive = taskClass === "shell-planning";
  if (latencySensitive) {
    if (latency <= 4_000) return 3;
    if (latency <= 8_000) return 2;
    if (latency <= 15_000) return 0;
    if (latency <= 30_000) return -3;
    return local ? -6 : -4;
  }

  if (latency <= 5_000) return 1;
  if (latency <= 15_000) return 0;
  if (latency <= 30_000) return -1;
  return local ? -2 : -1;
}

function scoreInteractiveShellPlanner(model, taskClass) {
  if (taskClass !== "shell-planning") {
    return 0;
  }

  const lower = String(model?.id ?? "").toLowerCase();
  const capabilities = model?.capabilities ?? {};
  const prose = Number(capabilities.prose ?? 0);
  const strategy = Number(capabilities.strategy ?? 0);
  let score = 0;

  // Interactive shell turns need a bounded, instruction-following assistant more than a slow reasoning model.
  if (/(?:\br1\b|reason)/.test(lower)) {
    score -= 6;
  }
  if (prose >= 4) {
    score += 2;
  } else if (prose >= 3) {
    score += 1;
  }
  if (strategy >= 2.5 && strategy <= 4) {
    score += 1;
  }
  if (strategy - prose > 1) {
    score -= 1;
  }

  return score;
}

function scoreConfiguredPlannerModel(taskClass) {
  return ["shell-planning", "agent-orchestration", "review", "bug-hunting", "feature-implementation"].includes(taskClass)
    ? 8
    : 3;
}

function buildReason(candidate, taskClass, minimumQuality, capability) {
  const parts = [];
  parts.push(`competency ${candidate.competency}/5 for ${capability}`);
  parts.push(candidate.local ? "local-first candidate" : "remote provider candidate");
  if (typeof candidate.fitScore === "number") {
    parts.push(`fit score ${candidate.fitScore}`);
  }
  if (candidate.freeQuotaRemaining !== null) {
    parts.push(`free quota $${candidate.freeQuotaRemaining.toFixed(2)} remaining`);
  }
  if (candidate.costTier <= 2) {
    parts.push("low cost tier");
  }
  return parts.join(", ");
}

function hasFreeQuota(provider) {
  return provider.quota?.freeUsdRemaining !== null && provider.quota.freeUsdRemaining > 0;
}

function shouldBlockProviderForQuota(provider, { quotaStrategy, remoteFreeQuotaAvailable }) {
  if (provider.local) return false;
  if (provider.paidAllowed === false && provider.quota?.freeUsdRemaining !== null && provider.quota.freeUsdRemaining <= 0) {
    return true;
  }
  if (quotaStrategy !== "prefer-free-remote") return false;
  if (!remoteFreeQuotaAvailable) return false;
  if (hasFreeQuota(provider)) return false;
  return provider.quota?.freeUsdRemaining !== null;
}

function scoreQuota(provider, { quotaStrategy, remoteFreeQuotaAvailable }) {
  if (provider.local) return remoteFreeQuotaAvailable ? -4 : 2;
  if (quotaStrategy !== "prefer-free-remote") return 0;
  if (hasFreeQuota(provider)) {
    return 8 + Math.min(4, provider.quota.freeUsdRemaining / 5);
  }
  if (provider.quota?.freeUsdRemaining !== null) {
    return provider.paidAllowed === false ? -50 : -10;
  }
  return 0;
}

function isVisionOnlyModel(model) {
  const lower = String(model?.id ?? "").toLowerCase();
  if (/(moondream|vision|multimodal|llava|minicpm-v)/.test(lower) && !/(coder|qwen|gemma|deepseek|mistral|llama|phi)/.test(lower)) {
    return true;
  }
  const capabilities = model?.capabilities ?? {};
  const prose = Number(capabilities.prose ?? 0);
  const strategy = Number(capabilities.strategy ?? 0);
  const visual = Number(capabilities.visual ?? 0);
  return visual >= 4 && prose < 2.5 && strategy < 2.5;
}

function isNonGenerativeModel(model, taskClass) {
  const lower = String(model?.id ?? "").toLowerCase();
  const embeddingTask = /\b(embed|embedding|semantic-search|vector)\b/.test(String(taskClass ?? "").toLowerCase());
  if (embeddingTask) {
    return false;
  }
  return /(?:^|[-_/:])(?:embed|embedding|nomic-embed|bge-|e5-|text-embedding)(?:[-_/:]|$)/.test(lower)
    || lower.includes("nomic-embed");
}

function inferCompetency(model, capability, heuristics) {
  if (!heuristics) return 3; // Neutral default

  const h = heuristics[capability] ?? { base: 3 };
  const lowerId = model.id.toLowerCase();
  
  let score = h.base ?? 3;

  // Keyword Matching
  if (h.keywords) {
    for (const kw of h.keywords) {
      if (lowerId.includes(kw)) {
        score += (h.bonus ?? 1);
        break; 
      }
    }
  }

  // Size Multiplier (Larger models are generally more capable generalists)
  const thresholds = heuristics.sizeThresholds ?? { large: 30, medium: 7 };
  if ((model.sizeB ?? 0) >= thresholds.large) {
    score += 1;
  } else if ((model.sizeB ?? 0) < 4 && (capability === "logic" || capability === "strategy")) {
    score -= 1; // Penalty for ultra-tiny models on complex reasoning
  }

  return Math.max(0, Math.min(5, score));
}
