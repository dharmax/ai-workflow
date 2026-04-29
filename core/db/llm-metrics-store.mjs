import { InMemoryMetricsStore, LlmMetrics } from "@dharmax/llm-utils";

export class WorkflowMetricsStoreAdapter {
  constructor(workflowStore) {
    this.workflowStore = workflowStore;
  }

  append(event) {
    this.workflowStore.appendMetric({
      taskClass: event.taskClass ?? "unknown",
      capability: event.capability ?? "unknown",
      providerId: event.providerId,
      modelId: event.modelId,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      latencyMs: event.latencyMs,
      success: event.success,
      errorMessage: event.error ?? null,
      details: event.metadata ?? null,
      createdAt: event.timestamp
    });
  }

  query(query = {}) {
    const rows = this.workflowStore.listMetrics({ limit: null, order: query.order ?? "desc" });
    const fromMs = query.from ? Date.parse(query.from) : null;
    const toMs = query.to ? Date.parse(query.to) : null;

    let events = rows
      .map(metricRowToEvent)
      .filter((event) => {
        const eventMs = Date.parse(event.timestamp);
        if (fromMs !== null && eventMs < fromMs) return false;
        if (toMs !== null && eventMs > toMs) return false;
        if (query.providerId && event.providerId !== query.providerId) return false;
        if (query.modelId && event.modelId !== query.modelId) return false;
        if (query.taskClass && event.taskClass !== query.taskClass) return false;
        if (typeof query.success === "boolean" && event.success !== query.success) return false;
        return true;
      });

    if (typeof query.limit === "number" && query.limit >= 0) {
      events = events.slice(0, query.limit);
    }

    return events;
  }
}

export function buildMetricsServiceFromRows(rows) {
  const store = new InMemoryMetricsStore({
    initialEvents: rows.map(metricRowToEvent)
  });
  return new LlmMetrics(store);
}

export function metricRowToEvent(metric) {
  return {
    timestamp: metric.created_at,
    providerId: metric.provider_id,
    modelId: metric.model_id,
    promptTokens: Number(metric.prompt_tokens ?? 0),
    completionTokens: Number(metric.completion_tokens ?? 0),
    totalTokens: Number(metric.prompt_tokens ?? 0) + Number(metric.completion_tokens ?? 0),
    latencyMs: Number(metric.latency_ms ?? 0),
    success: Boolean(metric.success),
    error: metric.error_message ?? null,
    taskClass: metric.task_class ?? undefined,
    capability: metric.capability ?? undefined,
    metadata: metric.details ?? {}
  };
}
