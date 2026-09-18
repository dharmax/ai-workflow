import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ModelRadar,
  computeParetoScore,
  BASELINE_MODELS,
  DEFAULT_RECOMMENDATIONS,
  type RadarData
} from '../src/actor/radar.ts';

describe('Model Radar & Pareto Benchmark Engine', () => {
  let tempDir: string;
  let cacheFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-radar-test-'));
    cacheFile = path.join(os.homedir(), '.cache', 'aiwf', 'model-radar.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should compute correct Pareto Value Scores based on Elo and pricing', () => {
    // 1. Zero cost (local models) should yield max score 9999
    expect(computeParetoScore(1220, 0, 0)).toBe(9999);

    // 2. DeepSeek-V3 ($0.14 input, $0.28 output, Elo 1340)
    const deepseekScore = computeParetoScore(1340, 0.14, 0.28);
    expect(deepseekScore).toBeGreaterThan(1000);

    // 3. Claude 3.7 Sonnet ($3.00 input, $15.00 output, Elo 1385)
    const claudeScore = computeParetoScore(1385, 3.0, 15.0);
    expect(claudeScore).toBeLessThan(deepseekScore); // DeepSeek is dramatically more cost-efficient

    // 4. Same cost, higher Elo -> higher score
    const elo1300 = computeParetoScore(1300, 1.0, 1.0);
    const elo1400 = computeParetoScore(1400, 1.0, 1.0);
    expect(elo1400).toBeGreaterThan(elo1300);
  });

  it('should provide default baseline models and recommendations synchronously', () => {
    const radar = new ModelRadar({ projectRoot: tempDir });
    const recs = radar.getRecommendations();

    expect(recs.design).toBe(DEFAULT_RECOMMENDATIONS.design);
    expect(recs.dev).toBe(DEFAULT_RECOMMENDATIONS.dev);
    expect(recs.triage).toBe(DEFAULT_RECOMMENDATIONS.triage);
    expect(recs.product).toBe(DEFAULT_RECOMMENDATIONS.product);

    const data = radar.getData();
    expect(data.models.length).toBeGreaterThanOrEqual(5);
    expect(data.models.some((m) => m.id.includes('deepseek'))).toBe(true);
    expect(data.models.some((m) => m.provider === 'ollama')).toBe(true);
  });

  it('should cache radar data to disk and respect TTL', () => {
    const radar = new ModelRadar({ projectRoot: tempDir, probeIntervalDays: 3 });

    const dummyData: RadarData = {
      lastUpdated: new Date().toISOString(),
      source: 'cache',
      models: [...BASELINE_MODELS],
      recommendations: {
        design: 'deepseek/deepseek-r1',
        dev: 'deepseek/deepseek-chat',
        triage: 'google/gemini-2.5-flash',
        product: 'google/gemini-2.5-flash'
      }
    };

    radar.saveCache(dummyData);
    const loaded = radar.loadCache();
    expect(loaded).not.toBeNull();
    expect(loaded?.source).toBe('cache');
    expect(loaded?.recommendations.dev).toBe('deepseek/deepseek-chat');

    // Simulate expired cache (e.g. 5 days ago)
    const expiredDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    radar.saveCache({ ...dummyData, lastUpdated: expiredDate });

    const expiredLoaded = radar.loadCache();
    expect(expiredLoaded).toBeNull();
  });

  it('should handle probe gracefully with offline fallback', async () => {
    const radar = new ModelRadar({ projectRoot: tempDir });
    // probe should never throw, even if offline or network fails
    const result = await radar.probe();
    expect(result).toBeDefined();
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.recommendations).toBeDefined();
  });
});
