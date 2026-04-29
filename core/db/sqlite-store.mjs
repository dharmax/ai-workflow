/**
 * @file sqlite-store.mjs
 * @brief Auto-generated header for sqlite-store.mjs. Needs detailed responsibility and scope.
 */

import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { LlmMetrics } from "@dharmax/llm-utils";
import { SQLITE_SCHEMA } from "./schema.mjs";
import { stableId } from "../lib/hash.mjs";
import { buildMetricsServiceFromRows, WorkflowMetricsStoreAdapter } from "./llm-metrics-store.mjs";

const WORKFLOW_STORE_OPEN_RETRY_DELAYS_MS = [0, 50, 150, 300, 600, 1200];
const METRICS_SESSION_IDLE_GAP_MS = 45 * 60 * 1000;
const METRICS_TRAILING_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const METRICS_LAST_WORK_HOURS_MS = 4 * 60 * 60 * 1000;
const METRICS_DEFAULT_PROFILE = {
  manualBaselineMs: 12 * 60 * 1000,
  operatorOverheadMs: 75 * 1000,
  fastEnoughMs: 15 * 1000
};
const METRICS_TASK_PROFILES = {
  "shell-planning": { manualBaselineMs: 8 * 60 * 1000, operatorOverheadMs: 45 * 1000, fastEnoughMs: 8 * 1000 },
  "project-planning": { manualBaselineMs: 14 * 60 * 1000, operatorOverheadMs: 75 * 1000, fastEnoughMs: 15 * 1000 },
  "task-decomposition": { manualBaselineMs: 18 * 60 * 1000, operatorOverheadMs: 90 * 1000, fastEnoughMs: 20 * 1000 },
  "review": { manualBaselineMs: 25 * 60 * 1000, operatorOverheadMs: 90 * 1000, fastEnoughMs: 20 * 1000 },
  "architectural-reasoning": { manualBaselineMs: 22 * 60 * 1000, operatorOverheadMs: 90 * 1000, fastEnoughMs: 20 * 1000 },
  "architectural-design": { manualBaselineMs: 22 * 60 * 1000, operatorOverheadMs: 90 * 1000, fastEnoughMs: 20 * 1000 },
  "code-generation": { manualBaselineMs: 30 * 60 * 1000, operatorOverheadMs: 2 * 60 * 1000, fastEnoughMs: 30 * 1000 },
  "refactoring": { manualBaselineMs: 24 * 60 * 1000, operatorOverheadMs: 90 * 1000, fastEnoughMs: 25 * 1000 },
  "bug-hunting": { manualBaselineMs: 28 * 60 * 1000, operatorOverheadMs: 2 * 60 * 1000, fastEnoughMs: 30 * 1000 },
  "debugging": { manualBaselineMs: 28 * 60 * 1000, operatorOverheadMs: 2 * 60 * 1000, fastEnoughMs: 30 * 1000 },
  "summarization": { manualBaselineMs: 10 * 60 * 1000, operatorOverheadMs: 60 * 1000, fastEnoughMs: 12 * 1000 },
  "extraction": { manualBaselineMs: 8 * 60 * 1000, operatorOverheadMs: 60 * 1000, fastEnoughMs: 12 * 1000 },
  "classification": { manualBaselineMs: 7 * 60 * 1000, operatorOverheadMs: 45 * 1000, fastEnoughMs: 10 * 1000 },
  "note-normalization": { manualBaselineMs: 6 * 60 * 1000, operatorOverheadMs: 45 * 1000, fastEnoughMs: 10 * 1000 },
  "data": { manualBaselineMs: 10 * 60 * 1000, operatorOverheadMs: 60 * 1000, fastEnoughMs: 12 * 1000 }
};

function nowIso() {
  return new Date().toISOString();
}

function asJson(value) {
  return JSON.stringify(value ?? {});
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export async function openWorkflowStore(options = {}) {
  const projectRoot = options.projectRoot || (typeof options === "string" ? options : process.cwd());
  const dbPath = options.dbPath;
  const resolvedDbPath = dbPath ?? path.resolve(projectRoot, ".ai-workflow", "state", "workflow.db");
  await mkdir(path.dirname(resolvedDbPath), { recursive: true });
  for (let attempt = 0; attempt < WORKFLOW_STORE_OPEN_RETRY_DELAYS_MS.length; attempt += 1) {
    let db = null;
    try {
      db = new DatabaseSync(resolvedDbPath);
      db.exec("PRAGMA busy_timeout = 5000;");
      db.exec("PRAGMA synchronous = NORMAL;");
      const journalMode = db.prepare("PRAGMA journal_mode;").get()?.journal_mode;
      if (String(journalMode ?? "").toLowerCase() !== "wal") {
        db.exec("PRAGMA journal_mode = WAL;");
      }
      db.exec(SQLITE_SCHEMA);

      const store = new SqliteWorkflowStore({ db, dbPath: resolvedDbPath, projectRoot });
      await store.ensureSchemaConsistency();
      return store;
    } catch (error) {
      try {
        db?.close();
      } catch {
        // Ignore close failures during retry cleanup.
      }
      if (!isWorkflowStoreLockError(error) || attempt === WORKFLOW_STORE_OPEN_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }
      await sleep(WORKFLOW_STORE_OPEN_RETRY_DELAYS_MS[attempt + 1]);
    }
  }

  throw new Error(`failed to open workflow store at ${resolvedDbPath}`);
}

function isWorkflowStoreLockError(error) {
  const text = `${error?.code ?? ""} ${error?.message ?? error ?? ""}`;
  return /(?:database|sqlite).*(?:locked|busy)|ERR_SQLITE_ERROR/i.test(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function metricTimestampMs(metric) {
  return Date.parse(metric?.created_at ?? 0) || 0;
}

function metricProfile(taskClass) {
  return METRICS_TASK_PROFILES[String(taskClass ?? "").trim()] ?? METRICS_DEFAULT_PROFILE;
}

function estimateMetricActiveWorkMs(metric) {
  const profile = metricProfile(metric?.task_class);
  return Math.max(0, Number(metric?.latency_ms ?? 0)) + profile.operatorOverheadMs;
}

function estimateMetricManualBaselineMs(metric) {
  return metricProfile(metric?.task_class).manualBaselineMs;
}

function isFastEnoughMetric(metric) {
  const profile = metricProfile(metric?.task_class);
  return Boolean(metric?.success) && Number(metric?.latency_ms ?? 0) <= profile.fastEnoughMs;
}

function splitMetricSessions(metrics) {
  const sessions = [];
  let current = [];
  let previousAt = null;

  for (const metric of metrics) {
    const createdAtMs = metricTimestampMs(metric);
    if (current.length && previousAt !== null && createdAtMs - previousAt > METRICS_SESSION_IDLE_GAP_MS) {
      sessions.push(current);
      current = [];
    }
    current.push(metric);
    previousAt = createdAtMs;
  }

  if (current.length) {
    sessions.push(current);
  }

  return sessions;
}

function selectLastActiveWorkRows(metrics, targetMs) {
  const selected = [];
  let accumulatedMs = 0;

  for (let index = metrics.length - 1; index >= 0; index -= 1) {
    const metric = metrics[index];
    selected.unshift(metric);
    accumulatedMs += estimateMetricActiveWorkMs(metric);
    if (accumulatedMs >= targetMs) {
      break;
    }
  }

  return selected;
}

function isMockMetric(metric) {
  const providerId = String(metric?.provider_id ?? "").trim().toLowerCase();
  const modelId = String(metric?.model_id ?? "").trim().toLowerCase();
  return /^mock(?:[-_:]|$)/.test(providerId)
    || /^mock(?:[-_:]|$)/.test(modelId)
    || /(?:^|[-_:])mock(?:[-_:]|$)/.test(modelId);
}

function emptyMetricsSetSummary() {
  return {
    calls: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    avgLatencyMs: 0,
    successRate: 0,
    activeWorkHours: 0,
    wallClockHours: 0,
    localCalls: 0,
    remoteCalls: 0,
    byModel: [],
    byTaskClass: [],
    periodStart: null,
    periodEnd: null,
    cost: {
      estimatedManualMinutes: 0,
      estimatedToolMinutes: 0,
      estimatedMinutesSaved: 0,
      leverageRatio: 0,
      localCallShare: 0
    },
    quality: {
      successRate: 0,
      failureRate: 0,
      fastEnoughRate: 0,
      qualityScore: 0
    },
    tokenUsage: {
      callsWithReportedUsage: 0,
      callsMissingUsage: 0,
      coveragePercent: 0,
      missingReasons: []
    },
    diagnostics: {
      fallbackRuns: 0,
      fallbackRecoveries: 0,
      failedAttempts: 0,
      wastedLatencyMs: 0,
      byStage: [],
      topFailures: []
    }
  };
}

function normalizeMetricFailureLabel(text) {
  const normalized = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized;
}

function summarizeMetricDiagnostics(metrics) {
  if (!metrics.length) {
    return emptyMetricsSetSummary().diagnostics;
  }

  const byStage = new Map();
  const failureCounts = new Map();
  let fallbackRuns = 0;
  let fallbackRecoveries = 0;
  let failedAttempts = 0;
  let wastedLatencyMs = 0;

  for (const metric of metrics) {
    const details = metric.details ?? {};
    const stage = String(details.stage ?? metric.task_class ?? "unknown").trim() || "unknown";
    const attemptCount = Number.isFinite(Number(details.attemptCount)) ? Math.max(0, Math.round(Number(details.attemptCount))) : 0;
    const explicitFailedAttempts = Number.isFinite(Number(details.failedAttempts)) ? Math.max(0, Math.round(Number(details.failedAttempts))) : null;
    const failedCandidateList = Array.isArray(details.failedCandidates) ? details.failedCandidates : [];
    const metricFailedAttempts = explicitFailedAttempts ?? failedCandidateList.length;
    const fallbackUsed = Boolean(details.fallbackUsed) || attemptCount > 1 || metricFailedAttempts > 0;
    const failedLatencyMs = Number.isFinite(Number(details.failedLatencyMs)) ? Math.max(0, Math.round(Number(details.failedLatencyMs))) : 0;

    const stageEntry = byStage.get(stage) ?? {
      stage,
      calls: 0,
      successes: 0,
      fallbackRuns: 0,
      failedAttempts: 0,
      wastedLatencyMs: 0
    };
    stageEntry.calls += 1;
    stageEntry.successes += metric.success ? 1 : 0;
    stageEntry.fallbackRuns += fallbackUsed ? 1 : 0;
    stageEntry.failedAttempts += metricFailedAttempts;
    stageEntry.wastedLatencyMs += failedLatencyMs;
    byStage.set(stage, stageEntry);

    fallbackRuns += fallbackUsed ? 1 : 0;
    fallbackRecoveries += fallbackUsed && metric.success ? 1 : 0;
    failedAttempts += metricFailedAttempts;
    wastedLatencyMs += failedLatencyMs;

    const directError = normalizeMetricFailureLabel(metric.error_message);
    if (directError) {
      failureCounts.set(directError, (failureCounts.get(directError) ?? 0) + 1);
    }
    for (const failed of failedCandidateList) {
      const providerModel = [failed?.providerId, failed?.modelId].filter(Boolean).join(":");
      const label = normalizeMetricFailureLabel([providerModel, failed?.error].filter(Boolean).join(" "));
      if (!label) {
        continue;
      }
      failureCounts.set(label, (failureCounts.get(label) ?? 0) + 1);
    }
  }

  return {
    fallbackRuns,
    fallbackRecoveries,
    failedAttempts,
    wastedLatencyMs,
    byStage: Array.from(byStage.values())
      .map((entry) => ({
        stage: entry.stage,
        calls: entry.calls,
        successRate: Math.round((entry.successes / entry.calls) * 100),
        fallbackRuns: entry.fallbackRuns,
        failedAttempts: entry.failedAttempts,
        wastedLatencyMs: entry.wastedLatencyMs
      }))
      .sort((left, right) => right.calls - left.calls || left.stage.localeCompare(right.stage)),
    topFailures: Array.from(failureCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5)
  };
}

function summarizeMetricSet(metrics) {
  if (!metrics.length) {
    return emptyMetricsSetSummary();
  }

  let fastEnoughCount = 0;
  let localCalls = 0;
  let estimatedToolMs = 0;
  let estimatedManualMs = 0;
  const byTaskClass = new Map();
  let callsWithReportedUsage = 0;
  const missingTokenReasons = new Map();
  const metricsService = buildMetricsServiceFromRows(metrics);
  const totals = metricsService.totals();
  const byModel = metricsService.byModel();

  for (const metric of metrics) {
    const success = Boolean(metric.success);
    const activeMs = estimateMetricActiveWorkMs(metric);
    const manualMs = estimateMetricManualBaselineMs(metric);
    const tokenUsage = metric.details?.tokenUsage ?? null;
    const usageAvailable = tokenUsage?.available === true
      || Number(metric.prompt_tokens ?? 0) > 0
      || Number(metric.completion_tokens ?? 0) > 0;

    fastEnoughCount += isFastEnoughMetric(metric) ? 1 : 0;
    localCalls += metric.provider_id === "ollama" ? 1 : 0;
    estimatedToolMs += activeMs;
    estimatedManualMs += manualMs;
    callsWithReportedUsage += usageAvailable ? 1 : 0;
    if (!usageAvailable) {
      const reason = String(tokenUsage?.reason ?? "Metric recorded no token usage details.").trim() || "Metric recorded no token usage details.";
      missingTokenReasons.set(reason, (missingTokenReasons.get(reason) ?? 0) + 1);
    }

    const taskEntry = byTaskClass.get(metric.task_class) ?? {
      task_class: metric.task_class,
      count: 0,
      successes: 0,
      estimated_manual_ms: 0,
      estimated_tool_ms: 0
    };
    taskEntry.count += 1;
    taskEntry.successes += success ? 1 : 0;
    taskEntry.estimated_manual_ms += manualMs;
    taskEntry.estimated_tool_ms += activeMs;
    byTaskClass.set(metric.task_class, taskEntry);
  }

  const calls = metrics.length;
  const totalPromptTokens = totals.promptTokens;
  const totalCompletionTokens = totals.completionTokens;
  const totalTokens = totals.totalTokens;
  const successRate = Math.round(totals.successRate);
  const fastEnoughRate = Math.round((fastEnoughCount / calls) * 100);
  const failureRate = 100 - successRate;
  const qualityScore = Math.round((successRate * 0.7) + (fastEnoughRate * 0.3));
  const diagnostics = summarizeMetricDiagnostics(metrics);
  const callsMissingUsage = calls - callsWithReportedUsage;
  const estimatedMinutesSaved = Math.round((estimatedManualMs - estimatedToolMs) / 60000);
  const leverageRatio = estimatedToolMs > 0
    ? Number((estimatedManualMs / estimatedToolMs).toFixed(2))
    : 0;
  const firstTimestamp = metricTimestampMs(metrics[0]);
  const lastTimestamp = metricTimestampMs(metrics[metrics.length - 1]);

  return {
    calls,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    avgLatencyMs: totals.avgLatencyMs,
    successRate,
    activeWorkHours: Number((estimatedToolMs / (60 * 60 * 1000)).toFixed(2)),
    wallClockHours: Number((Math.max(0, lastTimestamp - firstTimestamp) / (60 * 60 * 1000)).toFixed(2)),
    localCalls,
    remoteCalls: calls - localCalls,
    periodStart: metrics[0].created_at,
    periodEnd: metrics[metrics.length - 1].created_at,
    byModel: byModel
      .map((entry) => ({
        model_id: entry.modelId,
        provider_id: entry.providerId,
        count: entry.metrics.calls,
        success_rate: Math.round(entry.metrics.successRate),
        avg_latency: entry.metrics.avgLatencyMs
      }))
      .sort((left, right) => right.count - left.count || left.model_id.localeCompare(right.model_id)),
    byTaskClass: Array.from(byTaskClass.values())
      .map((entry) => ({
        task_class: entry.task_class,
        count: entry.count,
        success_rate: Math.round((entry.successes / entry.count) * 100),
        estimated_manual_minutes: Math.round(entry.estimated_manual_ms / 60000),
        estimated_tool_minutes: Math.round(entry.estimated_tool_ms / 60000)
      }))
      .sort((left, right) => right.count - left.count || left.task_class.localeCompare(right.task_class)),
    cost: {
      estimatedManualMinutes: Math.round(estimatedManualMs / 60000),
      estimatedToolMinutes: Math.round(estimatedToolMs / 60000),
      estimatedMinutesSaved,
      leverageRatio,
      localCallShare: Math.round((localCalls / calls) * 100)
    },
    quality: {
      successRate,
      failureRate,
      fastEnoughRate,
      qualityScore
    },
    tokenUsage: {
      callsWithReportedUsage,
      callsMissingUsage,
      coveragePercent: Math.round((callsWithReportedUsage / calls) * 100),
      missingReasons: Array.from(missingTokenReasons.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
        .slice(0, 5)
    },
    diagnostics
  };
}

function summarizeMetricsWindow(metrics) {
  const overall = summarizeMetricSet(metrics);
  const realMetrics = metrics.filter((metric) => !isMockMetric(metric));
  const mockMetrics = metrics.filter((metric) => isMockMetric(metric));
  const realTraffic = summarizeMetricSet(realMetrics);
  const mockTraffic = summarizeMetricSet(mockMetrics);
  const scoringSource = realMetrics.length ? realTraffic : overall;
  const basis = realMetrics.length ? "real-traffic" : (mockMetrics.length ? "mock-only" : "all-traffic");
  const basisLabel = realMetrics.length ? "real traffic" : (mockMetrics.length ? "all traffic (mock only)" : "all traffic");
  const helpScore = Math.max(
    0,
    Math.round(
      (scoringSource.quality.qualityScore / 100)
        * Math.max(0, (scoringSource.cost.estimatedManualMinutes - scoringSource.cost.estimatedToolMinutes))
        / Math.max(scoringSource.cost.estimatedManualMinutes, 1)
        * 100
    )
  );
  const alerts = [];

  if (realMetrics.length && mockMetrics.length) {
    alerts.push(`Quality/help score excludes ${mockTraffic.calls} mock calls and follows ${realTraffic.calls} real calls.`);
  }
  if (realTraffic.calls && (realTraffic.quality.successRate < 50 || realTraffic.quality.fastEnoughRate < 50)) {
    alerts.push(`Real traffic is degraded: ${realTraffic.quality.successRate}% success, ${realTraffic.avgLatencyMs}ms avg latency.`);
  }
  if (overall.diagnostics.fallbackRuns) {
    const wastedSeconds = Math.round(overall.diagnostics.wastedLatencyMs / 1000);
    alerts.push(`Fallback used in ${overall.diagnostics.fallbackRuns} run(s), with ${overall.diagnostics.failedAttempts} failed attempt(s) and ${wastedSeconds}s lost before recovery.`);
  }

  return {
    ...overall,
    realTraffic: {
      calls: realTraffic.calls,
      successRate: realTraffic.quality.successRate,
      avgLatencyMs: realTraffic.avgLatencyMs,
      totalTokens: realTraffic.totalTokens,
      localCalls: realTraffic.localCalls,
      remoteCalls: realTraffic.remoteCalls
    },
    mockTraffic: {
      calls: mockTraffic.calls,
      successRate: mockTraffic.quality.successRate,
      avgLatencyMs: mockTraffic.avgLatencyMs,
      totalTokens: mockTraffic.totalTokens,
      localCalls: mockTraffic.localCalls,
      remoteCalls: mockTraffic.remoteCalls
    },
    quality: {
      ...scoringSource.quality,
      basis,
      basisLabel,
      evaluatedCalls: scoringSource.calls,
      excludedMockCalls: mockTraffic.calls
    },
    helpVsBaseline: {
      helpScore,
      basis,
      evaluatedCalls: scoringSource.calls,
      excludedMockCalls: mockTraffic.calls
    },
    alerts
  };
}

export class SqliteWorkflowStore {
  async ensureSchemaConsistency() {
    // Item 37: SchemaGuardian - Detect and fix missing columns.
    // Older or externally-mutated DBs can behave inconsistently here; ignore
    // duplicate-column failures and re-read the schema after each attempt.
    await this.ensureColumn("entities", "consultation_question", "TEXT");
    await this.ensureColumn("entities", "parent_id", "TEXT");
    await this.ensureColumn("metrics", "details_json", "TEXT NOT NULL DEFAULT '{}'");
  }

  constructor({ db, dbPath, projectRoot }) {
    this.db = db;
    this.dbPath = dbPath;
    this.projectRoot = projectRoot;
  }

  close() {
    this.db.close();
  }

  async ensureColumn(tableName, columnName, columnType) {
    const names = this.db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
    if (names.includes(columnName)) {
      return;
    }
    try {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType};`);
    } catch (error) {
      if (!String(error?.message ?? error).includes("duplicate column name")) {
        throw error;
      }
    }
  }

  setMeta(key, value) {
    this.db.prepare(`
      INSERT INTO workspace_meta (key, value_json)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `).run(key, asJson(value));
  }

  getEntity(id) {
    const row = this.db.prepare("SELECT * FROM entities WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      entityType: row.entity_type,
      title: row.title,
      lane: row.lane,
      state: row.state,
      confidence: row.confidence,
      provenance: row.provenance,
      sourceKind: row.source_kind,
      reviewState: row.review_state,
      parentId: row.parent_id,
      relevantUntil: row.relevant_until,
      consultationQuestion: row.consultation_question,
      data: parseJson(row.data_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  getMeta(key, fallback = null) {
    const row = this.db.prepare("SELECT value_json FROM workspace_meta WHERE key = ?").get(key);
    return row ? parseJson(row.value_json, fallback) : fallback;
  }

  getFile(filePath) {
    const row = this.db.prepare("SELECT * FROM files WHERE path = ?").get(filePath);
    if (!row) {
      return null;
    }
    return {
      path: row.path,
      language: row.language,
      fileKind: row.file_kind,
      sha1: row.sha1,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms,
      metadata: parseJson(row.metadata_json),
      indexedAt: row.indexed_at
    };
  }

  listFiles() {
    return this.db.prepare("SELECT * FROM files ORDER BY path").all().map((row) => ({
      path: row.path,
      language: row.language,
      fileKind: row.file_kind,
      sha1: row.sha1,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms,
      metadata: parseJson(row.metadata_json),
      indexedAt: row.indexed_at
    }));
  }

  replaceIndexedFile({ file, parsed, sha1, indexedAt }) {
    const symbolIds = this.db.prepare("SELECT id FROM symbols WHERE file_path = ? AND source_kind = 'indexed'").all(file.relativePath);
    this.db.prepare(`
      INSERT INTO files (path, language, file_kind, sha1, size_bytes, mtime_ms, metadata_json, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        language = excluded.language,
        file_kind = excluded.file_kind,
        sha1 = excluded.sha1,
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms,
        metadata_json = excluded.metadata_json,
        indexed_at = excluded.indexed_at
    `).run(
      file.relativePath,
      parsed.language,
      parsed.fileKind,
      sha1,
      file.sizeBytes,
      file.mtimeMs,
      asJson(parsed.metadata),
      indexedAt
    );

    this.db.prepare("DELETE FROM symbols WHERE file_path = ? AND source_kind = 'indexed'").run(file.relativePath);
    this.db.prepare("DELETE FROM claims WHERE file_path = ? AND source_kind = 'indexed'").run(file.relativePath);
    this.db.prepare("DELETE FROM notes WHERE file_path = ? AND source_kind = 'indexed'").run(file.relativePath);
    this.db.prepare("DELETE FROM search_index WHERE scope = 'file' AND ref_id = ?").run(file.relativePath);
    for (const symbol of symbolIds) {
      this.db.prepare("DELETE FROM search_index WHERE scope = 'symbol' AND ref_id = ?").run(symbol.id);
    }

    for (const [index, symbol] of (parsed.symbols ?? []).entries()) {
      const symbolId = stableId("symbol", file.relativePath, symbol.kind, symbol.name, index);
      this.db.prepare(`
        INSERT INTO symbols (id, file_path, name, kind, exported, line, column, metadata_json, source_kind, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?)
        ON CONFLICT(id) DO UPDATE SET
          file_path = excluded.file_path,
          name = excluded.name,
          kind = excluded.kind,
          exported = excluded.exported,
          line = excluded.line,
          column = excluded.column,
          metadata_json = excluded.metadata_json,
          source_kind = excluded.source_kind,
          updated_at = excluded.updated_at
      `).run(
        symbolId,
        file.relativePath,
        symbol.name,
        symbol.kind,
        symbol.exported ? 1 : 0,
        symbol.line ?? null,
        symbol.column ?? null,
        asJson(symbol.metadata),
        indexedAt
      );

      this.db.prepare(`
        INSERT INTO search_index (id, scope, ref_id, title, body, tags, updated_at)
        VALUES (?, 'symbol', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          body = excluded.body,
          tags = excluded.tags,
          updated_at = excluded.updated_at
      `).run(
        stableId("search", "symbol", symbolId),
        symbolId,
        renderSymbolSearchTitle(symbol),
        renderSymbolSearchBody(file.relativePath, symbol),
        [symbol.kind, symbol.exported ? "exported" : "local", file.relativePath, symbol.name].join(","),
        indexedAt
      );
    }

    for (const [index, fact] of (parsed.facts ?? []).entries()) {
      this.db.prepare(`
        INSERT INTO claims (id, subject_id, predicate, object_id, object_text, kind, confidence, provenance, source_kind, lifecycle_state, file_path, line, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'indexed', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject_id = excluded.subject_id,
          predicate = excluded.predicate,
          object_id = excluded.object_id,
          object_text = excluded.object_text,
          kind = excluded.kind,
          confidence = excluded.confidence,
          provenance = excluded.provenance,
          source_kind = excluded.source_kind,
          lifecycle_state = excluded.lifecycle_state,
          file_path = excluded.file_path,
          line = excluded.line,
          updated_at = excluded.updated_at
      `).run(
        stableId("claim", file.relativePath, fact.predicate, fact.objectText ?? fact.objectId, fact.line ?? index),
        `file:${file.relativePath}`,
        fact.predicate,
        fact.objectId ?? null,
        fact.objectText ?? null,
        fact.kind ?? "fact",
        fact.confidence ?? 1,
        fact.provenance ?? file.relativePath,
        fact.lifecycleState ?? "active",
        file.relativePath,
        fact.line ?? null,
        indexedAt,
        indexedAt
      );
    }

    for (const note of parsed.notes ?? []) {
      this.upsertNote({
        id: stableId("note", file.relativePath, note.noteType, note.line ?? 0, note.body),
        noteType: note.noteType,
        status: "observed",
        filePath: file.relativePath,
        symbolName: note.symbolName ?? null,
        line: note.line ?? null,
        column: note.column ?? null,
        body: note.body,
        sourceKind: "indexed",
        provenance: file.relativePath,
        riskScore: note.riskScore,
        leverageScore: note.leverageScore,
        ticketValueScore: note.ticketValueScore,
        candidateScore: note.candidateScore,
        observedAt: indexedAt
      });
    }

    this.db.prepare(`
      INSERT INTO search_index (id, scope, ref_id, title, body, tags, updated_at)
      VALUES (?, 'file', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        body = excluded.body,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `).run(
      stableId("search", "file", file.relativePath),
      file.relativePath,
      file.relativePath,
      parsed.searchText ?? "",
      [parsed.language, parsed.fileKind].join(","),
      indexedAt
    );
  }

  pruneIndexedFiles(activePaths = []) {
    const normalizedPaths = [...new Set(activePaths.filter(Boolean))];
    if (!normalizedPaths.length) {
      this.db.prepare("DELETE FROM search_index WHERE scope = 'symbol'").run();
      this.db.prepare("DELETE FROM symbols WHERE source_kind = 'indexed'").run();
      this.db.prepare("DELETE FROM claims WHERE source_kind = 'indexed'").run();
      this.db.prepare("DELETE FROM notes WHERE source_kind = 'indexed'").run();
      this.db.prepare("DELETE FROM search_index WHERE scope = 'file'").run();
      this.db.prepare("DELETE FROM files").run();
      return;
    }

    const placeholders = normalizedPaths.map(() => "?").join(", ");
    this.db.prepare(`
      DELETE FROM search_index
      WHERE scope = 'symbol'
        AND ref_id IN (
          SELECT id
          FROM symbols
          WHERE source_kind = 'indexed'
            AND file_path NOT IN (${placeholders})
        )
    `).run(...normalizedPaths);
    this.db.prepare(`
      DELETE FROM symbols
      WHERE source_kind = 'indexed'
        AND file_path NOT IN (${placeholders})
    `).run(...normalizedPaths);
    this.db.prepare(`
      DELETE FROM claims
      WHERE source_kind = 'indexed'
        AND file_path NOT IN (${placeholders})
    `).run(...normalizedPaths);
    this.db.prepare(`
      DELETE FROM notes
      WHERE source_kind = 'indexed'
        AND file_path NOT IN (${placeholders})
    `).run(...normalizedPaths);
    this.db.prepare(`
      DELETE FROM search_index
      WHERE scope = 'file'
        AND ref_id NOT IN (${placeholders})
    `).run(...normalizedPaths);
    this.db.prepare(`
      DELETE FROM files
      WHERE path NOT IN (${placeholders})
    `).run(...normalizedPaths);
  }

  upsertEntity(entity) {
    const timestamp = entity.updatedAt ?? nowIso();
    this.db.prepare(`
      INSERT INTO entities (id, entity_type, title, lane, state, confidence, provenance, source_kind, review_state, parent_id, relevant_until, consultation_question, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        entity_type = excluded.entity_type,
        title = excluded.title,
        lane = excluded.lane,
        state = excluded.state,
        confidence = excluded.confidence,
        provenance = excluded.provenance,
        source_kind = excluded.source_kind,
        review_state = excluded.review_state,
        parent_id = excluded.parent_id,
        relevant_until = excluded.relevant_until,
        consultation_question = excluded.consultation_question,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(
      entity.id,
      entity.entityType,
      entity.title ?? '',
      entity.lane ?? null,
      entity.state ?? "open",
      entity.confidence ?? 1,
      entity.provenance ?? "manual",
      entity.sourceKind ?? "manual",
      entity.reviewState ?? "active",
      entity.parentId ?? null,
      entity.relevantUntil ?? null,
      entity.consultationQuestion ?? null,
      asJson(entity.data),
      entity.createdAt ?? timestamp,
      timestamp
    );
  }

  deleteEntity(id) {
    this.db.prepare("DELETE FROM search_index WHERE scope = 'entity' AND ref_id = ?").run(id);
    this.db.prepare("DELETE FROM entities WHERE id = ?").run(id);
  }

  upsertModule(module) {
    const now = nowIso();
    const existing = this.db.prepare("SELECT created_at FROM modules WHERE id = ?").get(module.id);
    const createdAt = existing ? existing.created_at : now;

    this.db.prepare(`
      INSERT INTO modules (id, name, responsibility, api_paradigm, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        responsibility = excluded.responsibility,
        api_paradigm = excluded.api_paradigm,
        updated_at = excluded.updated_at
    `).run(
      module.id,
      module.name,
      module.responsibility ?? null,
      module.apiParadigm ?? "method-calls",
      createdAt,
      now
    );
  }

  upsertFeature(feature) {
    const now = nowIso();
    const existing = this.db.prepare("SELECT created_at FROM features WHERE id = ?").get(feature.id);
    const createdAt = existing ? existing.created_at : now;

    this.db.prepare(`
      INSERT INTO features (id, name, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        updated_at = excluded.updated_at
    `).run(
      feature.id,
      feature.name,
      feature.description ?? null,
      feature.status ?? "active",
      createdAt,
      now
    );
  }

  appendArchitecturalPredicate({ subjectId, predicate, objectId, metadata = {} }) {
    this.db.prepare(`
      INSERT INTO architectural_graph (id, subject_id, predicate, object_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      stableId("arch", subjectId, predicate, objectId, Math.random()),
      subjectId,
      predicate,
      objectId,
      asJson(metadata),
      nowIso()
    );
  }

  resetArchitecture() {
    this.db.prepare("DELETE FROM architectural_graph WHERE predicate = 'belongs_to'").run();
    this.db.prepare(`
      DELETE FROM modules
      WHERE id LIKE 'MOD-%'
        AND id NOT IN (
          SELECT object_id
          FROM architectural_graph
          WHERE predicate != 'belongs_to'
        )
    `).run();
  }

  listModules() {
    return this.db.prepare("SELECT * FROM modules").all();
  }

  listFeatures() {
    return this.db.prepare("SELECT * FROM features").all();
  }

  getArchitecturalGraph() {
    return this.db.prepare("SELECT * FROM architectural_graph").all();
  }

  listEntities(filters = {}) {
    const clauses = [];
    const values = [];

    if (filters.entityType) {
      clauses.push("entity_type = ?");
      values.push(filters.entityType);
    }

    if (filters.lanes?.length) {
      clauses.push(`lane IN (${filters.lanes.map(() => "?").join(", ")})`);
      values.push(...filters.lanes);
    }

    if (filters.states?.length) {
      clauses.push(`state IN (${filters.states.map(() => "?").join(", ")})`);
      values.push(...filters.states);
    }

    const query = `
      SELECT *
      FROM entities
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY entity_type, COALESCE(lane, ''), updated_at DESC, id
    `;

    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      title: row.title,
      lane: row.lane,
      state: row.state,
      confidence: row.confidence,
      provenance: row.provenance,
      sourceKind: row.source_kind,
      reviewState: row.review_state,
      parentId: row.parent_id,
      relevantUntil: row.relevant_until,
      consultationQuestion: row.consultation_question,
      data: parseJson(row.data_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  upsertNote(note) {
    this.db.prepare(`
      INSERT INTO notes (id, note_type, status, file_path, symbol_name, line, column, body, normalized_body, source_kind, provenance, risk_score, leverage_score, ticket_value_score, candidate_score, observed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = CASE
          WHEN notes.status = 'resolved' AND excluded.status = 'observed' THEN notes.status
          ELSE excluded.status
        END,
        symbol_name = excluded.symbol_name,
        line = excluded.line,
        column = excluded.column,
        body = excluded.body,
        normalized_body = excluded.normalized_body,
        provenance = excluded.provenance,
        risk_score = excluded.risk_score,
        leverage_score = excluded.leverage_score,
        ticket_value_score = excluded.ticket_value_score,
        candidate_score = excluded.candidate_score,
        updated_at = excluded.updated_at
    `).run(
      note.id,
      note.noteType,
      note.status ?? "observed",
      note.filePath ?? null,
      note.symbolName ?? null,
      note.line ?? null,
      note.column ?? null,
      note.body,
      normalizeText(note.body),
      note.sourceKind ?? "manual",
      note.provenance ?? "manual",
      note.riskScore ?? 0,
      note.leverageScore ?? 0,
      note.ticketValueScore ?? 0,
      note.candidateScore ?? 0,
      note.observedAt ?? nowIso(),
      note.updatedAt ?? nowIso()
    );
  }

  listNotes(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.noteTypes?.length) {
      clauses.push(`note_type IN (${filters.noteTypes.map(() => "?").join(", ")})`);
      values.push(...filters.noteTypes);
    }
    if (filters.filePath) {
      clauses.push("file_path = ?");
      values.push(filters.filePath);
    }
    if (filters.statuses?.length) {
      clauses.push(`status IN (${filters.statuses.map(() => "?").join(", ")})`);
      values.push(...filters.statuses);
    }
    const query = `
      SELECT *
      FROM notes
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY candidate_score DESC, updated_at DESC
    `;
    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      noteType: row.note_type,
      status: row.status,
      filePath: row.file_path,
      symbolName: row.symbol_name,
      line: row.line,
      column: row.column,
      body: row.body,
      normalizedBody: row.normalized_body,
      sourceKind: row.source_kind,
      provenance: row.provenance,
      riskScore: row.risk_score,
      leverageScore: row.leverage_score,
      ticketValueScore: row.ticket_value_score,
      candidateScore: row.candidate_score,
      observedAt: row.observed_at,
      updatedAt: row.updated_at
    }));
  }

  getNoteById(noteId) {
    const row = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      noteType: row.note_type,
      status: row.status,
      filePath: row.file_path,
      symbolName: row.symbol_name,
      line: row.line,
      column: row.column,
      body: row.body,
      normalizedBody: row.normalized_body,
      sourceKind: row.source_kind,
      provenance: row.provenance,
      riskScore: row.risk_score,
      leverageScore: row.leverage_score,
      ticketValueScore: row.ticket_value_score,
      candidateScore: row.candidate_score,
      observedAt: row.observed_at,
      updatedAt: row.updated_at
    };
  }

  updateNoteStatus(noteId, status, updatedAt = nowIso()) {
    const result = this.db.prepare(`
      UPDATE notes
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, updatedAt, noteId);
    return result.changes > 0 ? this.getNoteById(noteId) : null;
  }

  listSymbols(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.filePath) {
      clauses.push("file_path = ?");
      values.push(filters.filePath);
    }
    if (filters.name) {
      clauses.push("name = ?");
      values.push(filters.name);
    }
    const query = `
      SELECT *
      FROM symbols
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY file_path, line, name
    `;
    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      kind: row.kind,
      exported: Boolean(row.exported),
      line: row.line,
      column: row.column,
      metadata: parseJson(row.metadata_json),
      sourceKind: row.source_kind,
      updatedAt: row.updated_at
    }));
  }

  getSymbolById(symbolId) {
    const row = this.db.prepare("SELECT * FROM symbols WHERE id = ?").get(symbolId);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      kind: row.kind,
      exported: Boolean(row.exported),
      line: row.line,
      column: row.column,
      metadata: parseJson(row.metadata_json),
      sourceKind: row.source_kind,
      updatedAt: row.updated_at
    };
  }

  listClaims(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.subjectId) {
      clauses.push("subject_id = ?");
      values.push(filters.subjectId);
    }
    if (filters.predicate) {
      clauses.push("predicate = ?");
      values.push(filters.predicate);
    }
    if (filters.filePath) {
      clauses.push("file_path = ?");
      values.push(filters.filePath);
    }
    const query = `
      SELECT *
      FROM claims
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id
    `;
    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      predicate: row.predicate,
      objectId: row.object_id,
      objectText: row.object_text,
      kind: row.kind,
      confidence: row.confidence,
      provenance: row.provenance,
      sourceKind: row.source_kind,
      lifecycleState: row.lifecycle_state,
      filePath: row.file_path,
      line: row.line,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  upsertCandidate(candidate) {
    const existing = this.db.prepare("SELECT * FROM candidates WHERE id = ?").get(candidate.id);
    const preservedStatus = existing && ["rejected", "archived", "promoted"].includes(existing.status)
      ? existing.status
      : candidate.status;

    this.db.prepare(`
      INSERT INTO candidates (id, note_id, title, status, reason, score, decision_key, last_review_at, next_review_at, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        note_id = excluded.note_id,
        title = excluded.title,
        status = ?,
        reason = excluded.reason,
        score = excluded.score,
        last_review_at = COALESCE(candidates.last_review_at, excluded.last_review_at),
        next_review_at = COALESCE(candidates.next_review_at, excluded.next_review_at),
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(
      candidate.id,
      candidate.noteId,
      candidate.title,
      preservedStatus,
      candidate.reason,
      candidate.score,
      candidate.decisionKey,
      candidate.lastReviewAt ?? null,
      candidate.nextReviewAt ?? null,
      asJson(candidate.data),
      candidate.createdAt ?? nowIso(),
      candidate.updatedAt ?? nowIso(),
      preservedStatus
    );
  }

  listCandidates(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.statuses?.length) {
      clauses.push(`status IN (${filters.statuses.map(() => "?").join(", ")})`);
      values.push(...filters.statuses);
    }
    const query = `
      SELECT *
      FROM candidates
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY score DESC, updated_at DESC
    `;
    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      noteId: row.note_id,
      title: row.title,
      status: row.status,
      reason: row.reason,
      score: row.score,
      decisionKey: row.decision_key,
      lastReviewAt: row.last_review_at,
      nextReviewAt: row.next_review_at,
      data: parseJson(row.data_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  appendEvent({ eventType, entityType, entityId = null, payload = {}, createdAt = nowIso() }) {
    this.db.prepare(`
      INSERT INTO events (id, event_type, entity_type, entity_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      stableId("event", eventType, entityType, entityId, createdAt, Math.random()),
      eventType,
      entityType,
      entityId,
      asJson(payload),
      createdAt
    );
  }

  appendMetric({ taskClass, capability, providerId, modelId, promptTokens, completionTokens, latencyMs, success, errorMessage = null, details = null, createdAt = nowIso() }) {
    const normalizedPromptTokens = Number.isFinite(Number(promptTokens)) ? Number(promptTokens) : 0;
    const normalizedCompletionTokens = Number.isFinite(Number(completionTokens)) ? Number(completionTokens) : 0;
    const normalizedLatencyMs = Number.isFinite(Number(latencyMs)) ? Math.max(0, Math.round(Number(latencyMs))) : 0;
    this.db.prepare(`
      INSERT INTO metrics (id, task_class, capability, provider_id, model_id, prompt_tokens, completion_tokens, latency_ms, success, error_message, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stableId("metric", taskClass, providerId, modelId, createdAt, Math.random()),
      taskClass,
      capability,
      providerId,
      modelId,
      normalizedPromptTokens,
      normalizedCompletionTokens,
      normalizedLatencyMs,
      success ? 1 : 0,
      errorMessage,
      asJson(details ?? {}),
      createdAt
    );
  }

  getMetricsSummary({ now = null } = {}) {
    const rows = this.listMetrics({ limit: null, order: "asc" });
    const metricsService = new LlmMetrics(new WorkflowMetricsStoreAdapter(this));
    const allTimeTotals = metricsService.totals({ order: "asc" });
    const allTimeByModel = metricsService.byModel({ order: "asc" }).map((entry) => ({
      model_id: entry.modelId,
      provider_id: entry.providerId,
      count: entry.metrics.calls,
      success_rate: Math.round(entry.metrics.successRate),
      avg_latency: entry.metrics.avgLatencyMs
    }));
    const referenceNow = now instanceof Date
      ? now
      : rows.length
        ? new Date(metricTimestampMs(rows[rows.length - 1]))
        : new Date();
    const allTime = summarizeMetricsWindow(rows);
    const sessions = splitMetricSessions(rows);
    const latestSessionRows = sessions.at(-1) ?? [];
    const latestSession = summarizeMetricsWindow(latestSessionRows);
    const last4WorkHoursRows = selectLastActiveWorkRows(rows, METRICS_LAST_WORK_HOURS_MS);
    const trailingWeekRows = rows.filter((row) => metricTimestampMs(row) >= referenceNow.getTime() - METRICS_TRAILING_WEEK_MS);
    const trailingWeek = summarizeMetricsWindow(trailingWeekRows);

    return {
      totalCalls: allTimeTotals.calls,
      totalPromptTokens: allTimeTotals.promptTokens,
      totalCompletionTokens: allTimeTotals.completionTokens,
      avgLatencyMs: allTimeTotals.avgLatencyMs,
      successRate: Math.round(allTimeTotals.successRate),
      byModel: allTimeByModel,
      sessionCount: sessions.length,
      assumptions: {
        helpVsBaseline: "heuristic estimate from task-class manual baselines versus active ai-workflow work time",
        activeWork: "latency plus a fixed operator-overhead allowance per recorded metric event",
        qualityBasis: "quality/help score prefers real traffic when available and excludes mock traffic from scoring",
        tokens: "token counts show actual model usage only; manual-baseline token savings are not estimated",
        details: "structured metric details capture stage, fallback, and wasted-latency diagnostics when a caller provides them",
        sessionIdleGapMinutes: Math.round(METRICS_SESSION_IDLE_GAP_MS / 60000),
        trailingWeekDays: 7,
        lastWorkHours: 4
      },
      windows: {
        latestSession: {
          label: "Latest session",
          ...latestSession
        },
        last4WorkHours: {
          label: "Last 4 active work hours",
          ...summarizeMetricsWindow(last4WorkHoursRows)
        },
        trailingWeek: {
          label: "Trailing week",
          ...trailingWeek
        }
      }
    };
  }

  listMetrics({ limit = 20, order = "desc" } = {}) {
    const normalizedOrder = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
    const query = limit == null
      ? `SELECT * FROM metrics ORDER BY created_at ${normalizedOrder}`
      : `SELECT * FROM metrics ORDER BY created_at ${normalizedOrder} LIMIT ?`;
    const rows = limit == null
      ? this.db.prepare(query).all()
      : this.db.prepare(query).all(limit);
    return rows.map(m => ({
      id: m.id,
      task_class: m.task_class,
      capability: m.capability,
      provider_id: m.provider_id,
      model_id: m.model_id,
      prompt_tokens: m.prompt_tokens,
      completion_tokens: m.completion_tokens,
      latency_ms: m.latency_ms,
      success: Boolean(m.success),
      error_message: m.error_message,
      details: parseJson(m.details_json, {}),
      created_at: m.created_at
    }));
  }

  cleanupDerivedState() {
    this.db.prepare("DELETE FROM candidates WHERE note_id NOT IN (SELECT id FROM notes)").run();
    this.db.prepare("DELETE FROM entities WHERE entity_type = 'candidate-ticket' AND source_kind = 'proposal'").run();
    this.db.prepare(`
      DELETE FROM search_index
      WHERE scope = 'entity'
        AND ref_id NOT IN (SELECT id FROM entities)
    `).run();
  }

  search(query, { limit = 20, scopes = [] } = {}) {
    const trimmed = String(query).trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    const scopeClause = scopes.length ? `AND scope IN (${scopes.map(() => "?").join(", ")})` : "";
    const rows = this.db.prepare(`
      SELECT *,
        (CASE
          WHEN scope = 'entity' AND (',' || lower(tags) || ',') LIKE '%,' || ? || ',%' THEN 130
          WHEN scope = 'entity' AND lower(title) LIKE ? || ' %' THEN 125
          WHEN scope = 'symbol' AND lower(title) LIKE '% ' || ? THEN 120
          WHEN scope = 'symbol' AND lower(tags) LIKE '%' || ? || '%' THEN 110
          WHEN scope = 'symbol' AND lower(title) = ? THEN 105
          WHEN scope = 'symbol' AND lower(title) LIKE '%' || ? || '%' THEN 85
          WHEN lower(title) LIKE '%' || ? || '%' THEN 40
          WHEN lower(body) LIKE '%' || ? || '%' THEN 20
          ELSE 0
        END) AS score
      FROM search_index
      WHERE (lower(title) LIKE '%' || ? || '%' OR lower(body) LIKE '%' || ? || '%')
        ${scopeClause}
      ORDER BY score DESC, updated_at DESC
      LIMIT ?
    `).all(trimmed, trimmed, trimmed, trimmed, trimmed, trimmed, trimmed, trimmed, trimmed, trimmed, ...scopes, limit);

    const indexedResults = rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      refId: row.ref_id,
      title: row.title,
      body: row.body,
      tags: row.tags ? row.tags.split(",").filter(Boolean) : [],
      updatedAt: row.updated_at
    }));

    const noteRows = this.db.prepare(`
      SELECT id, file_path, note_type, body, updated_at
      FROM notes
      WHERE lower(body) LIKE '%' || ? || '%'
         OR lower(COALESCE(file_path, '')) LIKE '%' || ? || '%'
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(trimmed, trimmed, limit);

    const noteResults = noteRows.map((row) => ({
      id: `note:${row.id}`,
      scope: "note",
      refId: row.id,
      title: `${row.note_type} ${row.file_path ?? "manual"}`,
      body: row.body,
      tags: [row.note_type, row.file_path].filter(Boolean),
      updatedAt: row.updated_at
    }));

    return [...indexedResults, ...noteResults]
      .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
      .slice(0, limit);
  }

  getSummary() {
    const files = this.db.prepare("SELECT COUNT(*) AS value FROM files").get().value;
    const notes = this.db.prepare("SELECT COUNT(*) AS value FROM notes").get().value;
    const symbols = this.db.prepare("SELECT COUNT(*) AS value FROM symbols").get().value;
    const claims = this.db.prepare("SELECT COUNT(*) AS value FROM claims").get().value;
    const tickets = this.db.prepare("SELECT COUNT(*) AS value FROM entities WHERE entity_type = 'ticket'").get().value;
    const codelets = this.db.prepare("SELECT COUNT(*) AS value FROM entities WHERE entity_type = 'codelet'").get().value;
    const candidates = this.db.prepare("SELECT COUNT(*) AS value FROM candidates").get().value;
    return { files, notes, symbols, claims, tickets, codelets, candidates };
  }

  deleteEntitiesBySourceKind(sourceKind, entityTypes = []) {
    const values = [sourceKind];
    let entityClause = "";
    if (entityTypes.length) {
      entityClause = ` AND entity_type IN (${entityTypes.map(() => "?").join(", ")})`;
      values.push(...entityTypes);
    }
    const ids = this.db.prepare(`
      SELECT id
      FROM entities
      WHERE source_kind = ?
      ${entityClause}
    `).all(...values).map((row) => row.id);
    if (!ids.length) {
      return 0;
    }
    const deleteValues = [sourceKind, ...entityTypes];
    this.db.prepare(`
      DELETE FROM entities
      WHERE source_kind = ?
      ${entityClause}
    `).run(...deleteValues);
    this.db.prepare(`
      DELETE FROM search_index
      WHERE scope = 'entity'
        AND ref_id IN (${ids.map(() => "?").join(", ")})
    `).run(...ids);
    return ids.length;
  }

  deleteArchitecturalPredicatesByMetadataToken(token) {
    const pattern = `%${String(token)}%`;
    return this.db.prepare("DELETE FROM architectural_graph WHERE metadata_json LIKE ?").run(pattern).changes ?? 0;
  }

  listArchitecturalPredicates(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.subjectId) {
      clauses.push("subject_id = ?");
      values.push(filters.subjectId);
    }
    if (filters.objectId) {
      clauses.push("object_id = ?");
      values.push(filters.objectId);
    }
    if (filters.predicate) {
      clauses.push("predicate = ?");
      values.push(filters.predicate);
    }
    const query = `
      SELECT *
      FROM architectural_graph
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id
    `;
    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      subjectId: row.subject_id,
      predicate: row.predicate,
      objectId: row.object_id,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at
    }));
  }

  upsertTestRun(run) {
    const timestamp = run.updatedAt ?? nowIso();
    this.db.prepare(`
      INSERT INTO test_runs (id, run_id, test_id, target_id, source, label, status, command, summary, artifact_ref, recorded_at, details_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        run_id = excluded.run_id,
        test_id = excluded.test_id,
        target_id = excluded.target_id,
        source = excluded.source,
        label = excluded.label,
        status = excluded.status,
        command = excluded.command,
        summary = excluded.summary,
        artifact_ref = excluded.artifact_ref,
        recorded_at = excluded.recorded_at,
        details_json = excluded.details_json,
        updated_at = excluded.updated_at
    `).run(
      run.id,
      run.runId,
      run.testId,
      run.targetId,
      run.source,
      run.label ?? null,
      run.status,
      run.command ?? null,
      run.summary ?? null,
      run.artifactRef ?? null,
      run.recordedAt ?? timestamp,
      asJson(run.details),
      timestamp
    );
  }

  replaceTestRunsForSource(source, runs = []) {
    this.db.prepare("DELETE FROM test_runs WHERE source = ?").run(source);
    for (const run of runs) {
      this.upsertTestRun(run);
    }
  }

  listTestRuns(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.source) {
      clauses.push("source = ?");
      values.push(filters.source);
    }
    if (filters.testId) {
      clauses.push("test_id = ?");
      values.push(filters.testId);
    }
    if (filters.targetId) {
      clauses.push("target_id = ?");
      values.push(filters.targetId);
    }
    const query = `
     SELECT *
     FROM test_runs
     ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
     ORDER BY recorded_at DESC, updated_at DESC, id DESC
    `;
    return this.db.prepare(query).all(...values).map((row) => ({
      id: row.id,
      runId: row.run_id,
      testId: row.test_id,
      targetId: row.target_id,
      source: row.source,
      label: row.label,
      status: row.status,
      command: row.command,
      summary: row.summary,
      artifactRef: row.artifact_ref,
      recordedAt: row.recorded_at,
      details: parseJson(row.details_json),
      updatedAt: row.updated_at
    }));
  }

  upsertWorkflowRun(run) {
    const now = nowIso();
    const existing = this.getWorkflowRun(run.id);
    
    // Ensure we don't overwrite prompt/code/createdAt with nulls on partial updates
    const finalPrompt = run.prompt ?? existing?.prompt ?? "unknown";
    const finalCode = run.code ?? existing?.code ?? "";
    const finalCreatedAt = run.createdAt ?? existing?.createdAt ?? now;

    this.db.prepare(`
      INSERT INTO workflow_runs (id, prompt, code, status, current_state, result_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        current_state = COALESCE(excluded.current_state, workflow_runs.current_state),
        result_json = excluded.result_json,
        updated_at = excluded.updated_at
    `).run(
      run.id,
      finalPrompt,
      finalCode,
      run.status ?? existing?.status ?? "running",
      run.currentState ?? null,
      asJson(run.result),
      finalCreatedAt,
      now
    );
  }

  addWorkflowTransition(transition) {
    this.db.prepare(`
      INSERT INTO workflow_transitions (run_id, from_state, to_state, label, trigger_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      transition.runId,
      transition.from,
      transition.to,
      transition.label ?? null,
      transition.triggerType,
      asJson(transition.payload),
      nowIso()
    );
  }

  listWorkflowTransitions(runId) {
    return this.db.prepare("SELECT * FROM workflow_transitions WHERE run_id = ? ORDER BY created_at").all(runId).map(row => ({
      runId: row.run_id,
      from: row.from_state,
      to: row.to_state,
      label: row.label,
      triggerType: row.trigger_type,
      payload: parseJson(row.payload_json),
      createdAt: row.created_at
    }));
  }

  getWorkflowRun(id) {
    const row = this.db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id);
    if (!row) return null;
    return {
      id: row.id,
      prompt: row.prompt,
      code: row.code,
      status: row.status,
      result: parseJson(row.result_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertWorkflowStep(step) {
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO workflow_steps (run_id, step_id, description, status, result_json, error_json, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, step_id) DO UPDATE SET
        status = excluded.status,
        result_json = excluded.result_json,
        error_json = excluded.error_json,
        completed_at = excluded.completed_at
    `).run(
      step.runId,
      step.stepId,
      step.description ?? null,
      step.status,
      asJson(step.result),
      asJson(step.error),
      step.startedAt ?? now,
      step.completedAt ?? null
    );
  }

  listWorkflowSteps(runId) {
    return this.db.prepare("SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY started_at").all(runId).map(row => ({
      runId: row.run_id,
      stepId: row.step_id,
      description: row.description,
      status: row.status,
      result: parseJson(row.result_json),
      error: parseJson(row.error_json),
      startedAt: row.started_at,
      completedAt: row.completed_at
    }));
  }

  setWorkflowState(runId, key, value) {
    this.db.prepare(`
      INSERT INTO workflow_state (run_id, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(run_id, key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(runId, key, asJson(value), nowIso());
  }

  getWorkflowState(runId, key, fallback = null) {
    const row = this.db.prepare("SELECT value_json FROM workflow_state WHERE run_id = ? AND key = ?").get(runId, key);
    return row ? parseJson(row.value_json, fallback) : fallback;
  }

  getWorkflowStateMap(runId) {
    const rows = this.db.prepare("SELECT key, value_json FROM workflow_state WHERE run_id = ?").all(runId);
    const result = {};
    for (const row of rows) {
      result[row.key] = parseJson(row.value_json);
    }
    return result;
  }

  upsertWorkflowIssue(issue) {
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO workflow_issues (id, run_id, issue_type, severity, summary, details_json, status, resolution_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        issue_type = excluded.issue_type,
        severity = excluded.severity,
        summary = excluded.summary,
        details_json = excluded.details_json,
        status = excluded.status,
        resolution_json = excluded.resolution_json,
        updated_at = excluded.updated_at
    `).run(
      issue.id,
      issue.runId ?? null,
      issue.issueType,
      issue.severity,
      issue.summary,
      asJson(issue.details),
      issue.status ?? "open",
      asJson(issue.resolution),
      issue.createdAt ?? now,
      now
    );
  }

  listWorkflowIssues(filters = {}) {
    const clauses = [];
    const values = [];
    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    if (filters.issueType) {
      clauses.push("issue_type = ?");
      values.push(filters.issueType);
    }
    const query = `
      SELECT * FROM workflow_issues
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC
    `;
    return this.db.prepare(query).all(...values).map(row => ({
      id: row.id,
      runId: row.run_id,
      issueType: row.issue_type,
      severity: row.severity,
      summary: row.summary,
      details: parseJson(row.details_json),
      status: row.status,
      resolution: parseJson(row.resolution_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  upsertWorkflowContract(contract) {
    const updatedAt = contract.updatedAt ?? nowIso();
    this.db.prepare(`
      INSERT INTO workflow_contracts (
        run_id,
        root,
        source,
        user_wish,
        success_definition,
        attempted_status,
        fulfillment_status,
        truthfulness_status,
        enlightenment_status,
        misleading_level,
        summary,
        evidence_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        root = excluded.root,
        source = excluded.source,
        user_wish = excluded.user_wish,
        success_definition = excluded.success_definition,
        attempted_status = excluded.attempted_status,
        fulfillment_status = excluded.fulfillment_status,
        truthfulness_status = excluded.truthfulness_status,
        enlightenment_status = excluded.enlightenment_status,
        misleading_level = excluded.misleading_level,
        summary = excluded.summary,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at
    `).run(
      contract.runId,
      path.resolve(String(contract.root ?? this.projectRoot ?? ".")),
      contract.source ?? "unknown",
      contract.userWish ?? "",
      contract.successDefinition ?? "",
      contract.attemptedStatus ?? "needs_human_review",
      contract.fulfillmentStatus ?? "needs_human_review",
      contract.truthfulnessStatus ?? "needs_human_review",
      contract.enlightenmentStatus ?? "needs_human_review",
      contract.misleadingLevel ?? "unknown",
      contract.summary ?? "",
      asJson(contract.evidence ?? {}),
      updatedAt
    );
  }

  getLatestWorkflowContract(root = null) {
    const resolvedRoot = root ? path.resolve(String(root)) : path.resolve(String(this.projectRoot ?? "."));
    const row = this.db.prepare(`
      SELECT *
      FROM workflow_contracts
      WHERE root = ?
      ORDER BY updated_at DESC, run_id DESC
      LIMIT 1
    `).get(resolvedRoot);
    if (!row) {
      return null;
    }
    return {
      runId: row.run_id,
      root: row.root,
      source: row.source,
      userWish: row.user_wish,
      successDefinition: row.success_definition,
      attemptedStatus: row.attempted_status,
      fulfillmentStatus: row.fulfillment_status,
      truthfulnessStatus: row.truthfulness_status,
      enlightenmentStatus: row.enlightenment_status,
      misleadingLevel: row.misleading_level,
      summary: row.summary,
      evidence: parseJson(row.evidence_json),
      updatedAt: row.updated_at
    };
  }

  upsertWorkflowGapReview(review) {
    const updatedAt = review.updatedAt ?? nowIso();
    this.db.prepare(`
      INSERT INTO workflow_gap_reviews (
        run_id,
        root,
        source,
        status,
        severity,
        summary,
        gap_types_json,
        actions_json,
        evidence_json,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        root = excluded.root,
        source = excluded.source,
        status = excluded.status,
        severity = excluded.severity,
        summary = excluded.summary,
        gap_types_json = excluded.gap_types_json,
        actions_json = excluded.actions_json,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at
    `).run(
      review.runId,
      path.resolve(String(review.root ?? this.projectRoot ?? ".")),
      review.source ?? "unknown",
      review.status ?? "open",
      review.severity ?? "medium",
      review.summary ?? "",
      asJson(review.gapTypes ?? []),
      asJson(review.actions ?? []),
      asJson(review.evidence ?? {}),
      updatedAt
    );
  }

  getLatestWorkflowGapReview(root = null) {
    const resolvedRoot = root ? path.resolve(String(root)) : path.resolve(String(this.projectRoot ?? "."));
    const row = this.db.prepare(`
      SELECT *
      FROM workflow_gap_reviews
      WHERE root = ?
      ORDER BY updated_at DESC, run_id DESC
      LIMIT 1
    `).get(resolvedRoot);
    if (!row) {
      return null;
    }
    return {
      runId: row.run_id,
      root: row.root,
      source: row.source,
      status: row.status,
      severity: row.severity,
      summary: row.summary,
      gapTypes: parseJson(row.gap_types_json, []),
      actions: parseJson(row.actions_json, []),
      evidence: parseJson(row.evidence_json, {}),
      updatedAt: row.updated_at
    };
  }

  appendWorkspaceMutation(mutation) {
    const startedAt = mutation.startedAt ?? nowIso();
    const completedAt = mutation.completedAt ?? startedAt;
    const root = path.resolve(String(mutation.root ?? this.projectRoot ?? "."));
    const id = mutation.id ?? stableId("workspace-mutation", root, mutation.operation, completedAt, asJson(mutation.changedFiles ?? []));

    this.db.prepare(`
      INSERT INTO workspace_mutations (
        id,
        root,
        operation,
        status,
        before_dirty,
        after_dirty,
        changed_files_json,
        details_json,
        started_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        before_dirty = excluded.before_dirty,
        after_dirty = excluded.after_dirty,
        changed_files_json = excluded.changed_files_json,
        details_json = excluded.details_json,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at
    `).run(
      id,
      root,
      mutation.operation,
      mutation.status ?? "completed",
      mutation.beforeDirty ? 1 : 0,
      mutation.afterDirty ? 1 : 0,
      asJson(mutation.changedFiles ?? []),
      asJson(mutation.details ?? {}),
      startedAt,
      completedAt
    );

    return id;
  }

  listWorkspaceMutations({ root = null, limit = 50 } = {}) {
    const clauses = [];
    const values = [];
    if (root) {
      clauses.push("root = ?");
      values.push(path.resolve(String(root)));
    }

    const boundedLimit = Math.max(1, Number(limit ?? 50) || 50);
    const query = `
      SELECT *
      FROM workspace_mutations
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY completed_at DESC, started_at DESC, id DESC
      LIMIT ?
    `;

    return this.db.prepare(query).all(...values, boundedLimit).map((row) => ({
      id: row.id,
      root: row.root,
      operation: row.operation,
      status: row.status,
      beforeDirty: Boolean(row.before_dirty),
      afterDirty: Boolean(row.after_dirty),
      changedFiles: parseJson(row.changed_files_json, []),
      details: parseJson(row.details_json, {}),
      startedAt: row.started_at,
      completedAt: row.completed_at
    }));
  }

  getLatestWorkspaceMutation(root = null) {
   return this.listWorkspaceMutations({ root: root ?? this.projectRoot, limit: 1 })[0] ?? null;
  }

  upsertAssessment(assessment) {
   const now = nowIso();
   this.db.prepare(`
    INSERT INTO assessments (id, target_type, target_id, status, scope, plan_json, criticism_json, result_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
     status = excluded.status,
     scope = excluded.scope,
     plan_json = excluded.plan_json,
     criticism_json = excluded.criticism_json,
     result_json = excluded.result_json,
     updated_at = excluded.updated_at
   `).run(
    assessment.id,
    assessment.targetType,
    assessment.targetId,
    assessment.status ?? "pending",
    assessment.scope ?? "general",
    asJson(assessment.plan),
    asJson(assessment.criticism),
    asJson(assessment.result),
    assessment.createdAt ?? now,
    now
   );
  }

  getAssessmentById(id) {
   const row = this.db.prepare("SELECT * FROM assessments WHERE id = ?").get(id);
   if (!row) return null;
   return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    scope: row.scope,
    plan: parseJson(row.plan_json),
    criticism: parseJson(row.criticism_json),
    result: parseJson(row.result_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
   };
  }

  listAssessments(filters = {}) {
   const clauses = [];
   const values = [];
   if (filters.targetType) {
    clauses.push("target_type = ?");
    values.push(filters.targetType);
   }
   if (filters.targetId) {
    clauses.push("target_id = ?");
    values.push(filters.targetId);
   }
   if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
   }
   const query = `
    SELECT * FROM assessments
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    ORDER BY created_at DESC
   `;
   return this.db.prepare(query).all(...values).map(row => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    scope: row.scope,
    plan: parseJson(row.plan_json),
    criticism: parseJson(row.criticism_json),
    result: parseJson(row.result_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
   }));
  }

  upsertGuidelineBlock(block) {
   const now = nowIso();
   this.db.prepare(`
    INSERT INTO guideline_blocks (id, source_file, category, tags, title, body, checksum, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
     category = excluded.category,
     tags = excluded.tags,
     title = excluded.title,
     body = excluded.body,
     checksum = excluded.checksum,
     updated_at = excluded.updated_at
   `).run(
    block.id,
    block.sourceFile,
    block.category ?? "general",
    block.tags ?? "",
    block.title,
    block.body,
    block.checksum,
    now
   );
  }

  listGuidelineBlocks(filters = {}) {
   const clauses = [];
   const values = [];
   if (filters.sourceFile) {
    clauses.push("source_file = ?");
    values.push(filters.sourceFile);
   }
   if (filters.category) {
    clauses.push("category = ?");
    values.push(filters.category);
   }
   const query = `
    SELECT * FROM guideline_blocks
    ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
   `;
   return this.db.prepare(query).all(...values).map(row => ({
    id: row.id,
    sourceFile: row.source_file,
    category: row.category,
    tags: row.tags,
    title: row.title,
    body: row.body,
    checksum: row.checksum,
    updatedAt: row.updated_at
   }));
  }

  pruneGuidelineBlocks(sourceFile, keepIds) {
   const ids = Array.from(keepIds);
   if (!ids.length) {
    this.db.prepare("DELETE FROM guideline_blocks WHERE source_file = ?").run(sourceFile);
    return;
   }
   const placeholders = ids.map(() => "?").join(", ");
   this.db.prepare(`DELETE FROM guideline_blocks WHERE source_file = ? AND id NOT IN (${placeholders})`).run(sourceFile, ...ids);
  }
  }
function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function renderSymbolSearchTitle(symbol) {
  return `${symbol.kind} ${symbol.name}`;
}

function renderSymbolSearchBody(filePath, symbol) {
  const metadata = symbol.metadata ?? {};
  const signature = String(metadata.signature ?? "").trim();
  const lineText = symbol.line ? `${filePath}:${symbol.line}` : filePath;
  const exportText = symbol.exported ? "exported" : "local";
  return [lineText, `${exportText} ${symbol.kind}`, signature].filter(Boolean).join("\n");
}
