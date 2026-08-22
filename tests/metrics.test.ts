import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { WorkflowStore } from '../src/store.ts';
import { MetricsCollector } from '../src/metrics.ts';
import { packTicketContext } from '../src/context.ts';

describe('ai-workflow Metrics & Telemetry Tests', () => {
  let tempDir: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'aiwf-metrics-test-'));
    store = new WorkflowStore(tempDir);
  });

  afterEach(async () => {
    store.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  test('MetricsCollector records context packing and computes compression ratio', () => {
    const collector = new MetricsCollector(store);
    const m = collector.recordContextPacking({
      ticketId: 'TKT-TEST-001',
      rawTokens: 1000,
      packedTokens: 250,
      durationMs: 12.5
    });

    expect(m.savedTokens).toBe(750);
    expect(m.compressionRatio).toBe(75);

    const summary = collector.getSummary();
    expect(summary.totalContextPacks).toBe(1);
    expect(summary.totalTokensSaved).toBe(750);
    expect(summary.averageCompressionRatio).toBe(75);
  });

  test('packTicketContext automatically records real telemetry', async () => {
    store.upsertEntity({
      id: 'TKT-PACK-001',
      type: 'ticket',
      title: 'Telemetry Auto-Record Test',
      lane: 'In Progress',
      body: 'Verify telemetry recording during context packing.'
    });

    const res = await packTicketContext(store, 'TKT-PACK-001');
    expect(res.rawTokens).toBeGreaterThan(0);
    expect(res.tokenCount).toBeGreaterThan(0);

    const collector = new MetricsCollector(store);
    const summary = collector.getSummary();
    expect(summary.totalContextPacks).toBeGreaterThan(0);
  });

  test('MetricsCollector records operation latency and failure rates', () => {
    const collector = new MetricsCollector(store);
    collector.recordOperation({ operation: 'sync', durationMs: 15.2, status: 'success' });
    collector.recordOperation({ operation: 'sync', durationMs: 25.8, status: 'failure' });

    const summary = collector.getSummary();
    expect(summary.operationsSummary['sync'].count).toBe(2);
    expect(summary.operationsSummary['sync'].failureRate).toBe(0.5);
  });
});
