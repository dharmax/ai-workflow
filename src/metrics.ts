import { WorkflowStore } from './store.ts';

export interface ContextMetric {
  id?: number;
  ticketId?: string;
  rawTokens: number;
  packedTokens: number;
  savedTokens: number;
  compressionRatio: number;
  durationMs: number;
  createdAt?: string;
}

export interface OperationMetric {
  id?: number;
  operation: string;
  durationMs: number;
  status: 'success' | 'failure';
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface MetricsSummary {
  totalContextPacks: number;
  totalTokensSaved: number;
  averageCompressionRatio: number;
  averageContextPackDurationMs: number;
  operationsSummary: Record<string, { count: number; avgDurationMs: number; failureRate: number }>;
}

const METRICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS context_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT,
  raw_tokens INTEGER NOT NULL,
  packed_tokens INTEGER NOT NULL,
  saved_tokens INTEGER NOT NULL,
  compression_ratio REAL NOT NULL,
  duration_ms REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_context_metrics_ticket ON context_metrics(ticket_id);
CREATE INDEX IF NOT EXISTS idx_op_metrics_op ON operation_metrics(operation);
`;

export class MetricsCollector {
  private store: WorkflowStore;

  constructor(store: WorkflowStore) {
    this.store = store;
    this.store.db.exec(METRICS_SCHEMA);
  }

  recordContextPacking(metric: { ticketId?: string; rawTokens: number; packedTokens: number; durationMs: number }): ContextMetric {
    const raw = Math.max(0, metric.rawTokens);
    const packed = Math.max(0, metric.packedTokens);
    const saved = Math.max(0, raw - packed);
    const ratio = raw > 0 ? ((saved / raw) * 100) : 0;
    const now = new Date().toISOString();

    const stmt = this.store.db.prepare(`
      INSERT INTO context_metrics (ticket_id, raw_tokens, packed_tokens, saved_tokens, compression_ratio, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(metric.ticketId ?? null, raw, packed, saved, Math.round(ratio * 10) / 10, metric.durationMs, now);

    return {
      ticketId: metric.ticketId,
      rawTokens: raw,
      packedTokens: packed,
      savedTokens: saved,
      compressionRatio: Math.round(ratio * 10) / 10,
      durationMs: metric.durationMs,
      createdAt: now
    };
  }

  recordOperation(metric: { operation: string; durationMs: number; status?: 'success' | 'failure'; metadata?: Record<string, any> }): OperationMetric {
    const now = new Date().toISOString();
    const status = metric.status ?? 'success';

    const stmt = this.store.db.prepare(`
      INSERT INTO operation_metrics (operation, duration_ms, status, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(metric.operation, metric.durationMs, status, JSON.stringify(metric.metadata ?? {}), now);

    return {
      operation: metric.operation,
      durationMs: metric.durationMs,
      status,
      metadata: metric.metadata,
      createdAt: now
    };
  }

  getSummary(): MetricsSummary {
    const contextRows: any[] = this.store.db.prepare(`
      SELECT 
        COUNT(*) as total_packs,
        COALESCE(SUM(saved_tokens), 0) as total_saved,
        COALESCE(AVG(compression_ratio), 0) as avg_ratio,
        COALESCE(AVG(duration_ms), 0) as avg_duration
      FROM context_metrics
    `).all();

    const opRows: any[] = this.store.db.prepare(`
      SELECT 
        operation,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failures
      FROM operation_metrics
      GROUP BY operation
    `).all();

    const operationsSummary: Record<string, { count: number; avgDurationMs: number; failureRate: number }> = {};
    for (const row of opRows) {
      operationsSummary[row.operation] = {
        count: row.count,
        avgDurationMs: Math.round((row.avg_duration || 0) * 100) / 100,
        failureRate: row.count > 0 ? Math.round((row.failures / row.count) * 100) / 100 : 0
      };
    }

    const c = contextRows[0] || {};
    return {
      totalContextPacks: c.total_packs || 0,
      totalTokensSaved: c.total_saved || 0,
      averageCompressionRatio: Math.round((c.avg_ratio || 0) * 10) / 10,
      averageContextPackDurationMs: Math.round((c.avg_duration || 0) * 10) / 10,
      operationsSummary
    };
  }
}
