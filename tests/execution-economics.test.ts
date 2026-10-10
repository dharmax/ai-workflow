import {beforeEach, afterEach, describe, it, expect} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Asker, CompletionEngine} from '@dharmax/llm-utils';
import {withArtifactMetrics, cognitionMetrics, recordResolutionStage, queryPerformance} from '../src/performance-metrics.ts';

describe('persistent execution economics', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-economics-')); });
  afterEach(() => { fs.rmSync(root, {recursive: true, force: true}); });
  it('preserves mixed local/remote model and phase totals, unknown price, and sanitized restart evidence', async () => {
    const completion = new CompletionEngine();
    completion.registerAdapter({id: 'fixture', generate: async ({modelId}) => ({ok: true, text: 'PRIVATE_RESPONSE', model: {providerId: 'fixture', modelId}, usage: {promptTokens: 7, completionTokens: 3, totalTokens: 10, available: true}})});
    const asker = new Asker({providers: {fixture: {id: 'fixture', local: true, apiKey: 'PRIVATE_KEY'}}, completion});
    await withArtifactMetrics(root, 'resolve_ticket', 'T', {}, async () => {
      recordResolutionStage('implementation');
      await asker.ask('PRIVATE_PROMPT', {model: 'fixture/local', ...cognitionMetrics({phase: 'implementation_actor'})});
      await asker.ask('PRIVATE_PROMPT', {model: 'fixture/remote', providerConfig: {id: 'fixture', local: false}, ...cognitionMetrics({phase: 'acceptance_verification'})});
      recordResolutionStage('acceptance', 'verified_no_change');
      return {status: 'complete', value: {verification: true}};
    });
    const report = queryPerformance(root);
    expect(report.execution.local.totalTokens).toBe(10);
    expect(report.execution.remote).toMatchObject({calls: 1, promptTokens: 7, completionTokens: 3, totalTokens: 10, unknownCostTokens: 10});
    expect(report.totalCostUsd).toBeNull(); expect(report.knownRemoteCostUsd).toBeNull();
    expect(report.unknownPriceRemoteTokens).toBe(10);
    expect(report.byModel).toHaveLength(2);
    expect(report.resolutionOutcomes).toEqual({verified_no_change: 1});
    expect(report.rows[0].cognition.phases.acceptance_verification.execution.remote.totalTokens).toBe(10);
    const raw = fs.readFileSync(path.join(root, '.ai-workflow/metrics.jsonl'), 'utf8');
    expect(raw).not.toContain('PRIVATE_');
    expect(JSON.parse(raw).cognition.byModel).toHaveLength(2);
  });
  it('does not present a missing historic locality/pricing split as zero-cost local work', () => {
    fs.mkdirSync(path.join(root, '.ai-workflow'));
    fs.writeFileSync(path.join(root, '.ai-workflow/metrics.jsonl'), JSON.stringify({operation: 'resolve_ticket', artifactId: 'old', startedAt: new Date().toISOString(), durationMs: 7, outcome: 'blocked', counters: {}, tags: {}, cognition: {costAvailable: false, structuredRepairs: 0, llm: {calls: 2, promptTokens: 90, completionTokens: 10, totalTokens: 100, totalLatencyMs: 7, totalCostUsd: 0}, models: ['ollama/old', 'openrouter/old'], systemOne: {calls: 0}, actor: {toolFailures: 2}}})+'\n');
    const report = queryPerformance(root);
    expect(report.execution.local.totalTokens).toBe(0); expect(report.execution.remote.totalTokens).toBe(0);
    expect(report.execution.unknown).toMatchObject({calls: 2, totalTokens: 100, unknownCostTokens: 100});
    expect(report.totalCostUsd).toBeNull(); expect(report.knownRemoteCostUsd).toBeNull();
    expect(report.legacyUnattributedModelTokens).toBe(100);
    expect(report.toolFailureCategories).toEqual({unclassified: 2});
  });
});
