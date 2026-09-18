/**
 * Responsibility: Dynamic Model Radar, SOTA Benchmark Discovery, and Pareto Efficiency Routing.
 * Scope: Discovers top models via OpenRouter metadata and benchmark ratings, calculates cost/value
 * efficiency scores, and maintains non-blocking disk cache for mode recommendations.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { ShellMode } from './engine.ts';

export interface ModelCandidate {
  id: string; // e.g. "deepseek/deepseek-chat"
  name: string;
  provider: string; // "openrouter" | "anthropic" | "google" | "openai" | "ollama"
  contextLength: number;
  promptPricePer1M: number;
  completionPricePer1M: number;
  codingElo: number;
  paretoScore: number;
  bestFor: ShellMode[];
  description?: string;
}

export interface RadarData {
  lastUpdated: string;
  source: 'live' | 'cache' | 'baseline';
  models: ModelCandidate[];
  recommendations: Record<ShellMode, string>;
}

export const BASELINE_MODELS: ModelCandidate[] = [
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek-V3',
    provider: 'openrouter',
    contextLength: 65536,
    promptPricePer1M: 0.14,
    completionPricePer1M: 0.28,
    codingElo: 1340,
    paretoScore: 1156,
    bestFor: ['dev'],
    description: 'High-speed code synthesis, extreme value Pareto leader'
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek-R1',
    provider: 'openrouter',
    contextLength: 65536,
    promptPricePer1M: 0.55,
    completionPricePer1M: 2.19,
    codingElo: 1365,
    paretoScore: 1040,
    bestFor: ['design'],
    description: 'Frontier chain-of-thought reasoning, math, and architecture'
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'openrouter',
    contextLength: 1048576,
    promptPricePer1M: 0.15,
    completionPricePer1M: 0.60,
    codingElo: 1330,
    paretoScore: 945,
    bestFor: ['triage', 'product'],
    description: '1M+ context window, ultra-fast diagnostic distillation'
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'openrouter',
    contextLength: 200000,
    promptPricePer1M: 3.00,
    completionPricePer1M: 15.00,
    codingElo: 1385,
    paretoScore: 185,
    bestFor: ['dev', 'design'],
    description: 'Top-tier agentic coding and multi-file surgical refactoring'
  },
  {
    id: 'openai/o3-mini',
    name: 'OpenAI o3-mini',
    provider: 'openrouter',
    contextLength: 200000,
    promptPricePer1M: 1.10,
    completionPricePer1M: 4.40,
    codingElo: 1370,
    paretoScore: 680,
    bestFor: ['design'],
    description: 'Fast reasoning, STEM, and formal code verification'
  },
  {
    id: 'ollama/qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B (Local)',
    provider: 'ollama',
    contextLength: 32768,
    promptPricePer1M: 0.0,
    completionPricePer1M: 0.0,
    codingElo: 1220,
    paretoScore: 9999,
    bestFor: ['dev', 'triage'],
    description: 'Fast local zero-cost inference via Ollama'
  }
];

export const DEFAULT_RECOMMENDATIONS: Record<ShellMode, string> = {
  design: 'deepseek/deepseek-r1',
  dev: 'deepseek/deepseek-chat',
  triage: 'google/gemini-2.5-flash',
  product: 'google/gemini-2.5-flash'
};

/**
 * Computes the Pareto Value Score: (Coding Elo - 1000)^2 / ln(Blended Price + 1)
 */
export function computeParetoScore(
  codingElo: number,
  promptPricePer1M: number,
  completionPricePer1M: number
): number {
  const blendedPrice = promptPricePer1M * 0.75 + completionPricePer1M * 0.25;
  if (blendedPrice <= 0) return 9999; // Local / zero-cost
  const eloDelta = Math.max(10, codingElo - 1000);
  const costFactor = Math.log(blendedPrice + 1);
  return Math.round(Math.pow(eloDelta, 2) / (costFactor || 0.1));
}

export class ModelRadar {
  private cachePath: string;
  private ttlMs: number;

  constructor(options: { projectRoot?: string; probeIntervalDays?: number } = {}) {
    const days = options.probeIntervalDays ?? 3;
    this.ttlMs = days * 24 * 60 * 60 * 1000;

    const baseCacheDir = path.join(os.homedir(), '.cache', 'aiwf');
    this.cachePath = path.join(baseCacheDir, 'model-radar.json');
  }

  /**
   * Returns current recommendations synchronously (<1ms) using cache or baseline.
   */
  getRecommendations(): Record<ShellMode, string> {
    const cached = this.loadCache();
    return cached ? cached.recommendations : { ...DEFAULT_RECOMMENDATIONS };
  }

  /**
   * Returns full radar data (models, pricing, scores, and mode recommendations).
   */
  getData(): RadarData {
    const cached = this.loadCache();
    if (cached) return cached;
    return {
      lastUpdated: new Date().toISOString(),
      source: 'baseline',
      models: [...BASELINE_MODELS],
      recommendations: { ...DEFAULT_RECOMMENDATIONS }
    };
  }

  /**
   * Load cache from disk if valid and unexpired.
   */
  loadCache(): RadarData | null {
    try {
      if (fs.existsSync(this.cachePath)) {
        const raw = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
        const age = Date.now() - new Date(raw.lastUpdated).getTime();
        if (age < this.ttlMs) {
          return {
            ...raw,
            source: 'cache'
          };
        }
      }
    } catch {}
    return null;
  }

  /**
   * Save radar data to cache file.
   */
  saveCache(data: RadarData): void {
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Background probe: queries OpenRouter /models API to refresh pricing, limits, and recommendations.
   * Never throws; degrades gracefully to cache or baseline on network failures.
   */
  async probe(force = false): Promise<RadarData> {
    if (!force) {
      const cached = this.loadCache();
      if (cached) return cached;
    }

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'User-Agent': 'ai-workflow/2.0 (ModelRadar)' },
        signal: ctrl.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return this.fallback();
      }

      const json = (await res.json()) as any;
      const apiModels: any[] = json.data || [];

      // Update baseline models with live pricing and context lengths from OpenRouter
      const updatedModels: ModelCandidate[] = BASELINE_MODELS.map((b) => {
        const match = apiModels.find((m) => m.id === b.id || m.id === b.id.replace(':thinking', ''));
        if (match && match.pricing) {
          const promptPrice = (Number(match.pricing.prompt) || 0) * 1_000_000;
          const completionPrice = (Number(match.pricing.completion) || 0) * 1_000_000;
          const contextLength = match.context_length || b.contextLength;
          const paretoScore = computeParetoScore(b.codingElo, promptPrice, completionPrice);
          return {
            ...b,
            contextLength,
            promptPricePer1M: Number(promptPrice.toFixed(4)),
            completionPricePer1M: Number(completionPrice.toFixed(4)),
            paretoScore
          };
        }
        return b;
      });

      // Sort models by pareto score for each mode
      const bestDesign = updatedModels
        .filter((m) => m.bestFor.includes('design') && m.provider !== 'ollama')
        .sort((a, b) => b.paretoScore - a.paretoScore)[0]?.id || DEFAULT_RECOMMENDATIONS.design;

      const bestDev = updatedModels
        .filter((m) => m.bestFor.includes('dev') && m.provider !== 'ollama')
        .sort((a, b) => b.paretoScore - a.paretoScore)[0]?.id || DEFAULT_RECOMMENDATIONS.dev;

      const bestTriage = updatedModels
        .filter((m) => m.bestFor.includes('triage') && m.provider !== 'ollama')
        .sort((a, b) => b.paretoScore - a.paretoScore)[0]?.id || DEFAULT_RECOMMENDATIONS.triage;

      const bestProduct = updatedModels
        .filter((m) => m.bestFor.includes('product') && m.provider !== 'ollama')
        .sort((a, b) => b.paretoScore - a.paretoScore)[0]?.id || DEFAULT_RECOMMENDATIONS.product;

      const data: RadarData = {
        lastUpdated: new Date().toISOString(),
        source: 'live',
        models: updatedModels,
        recommendations: {
          design: bestDesign,
          dev: bestDev,
          triage: bestTriage,
          product: bestProduct
        }
      };

      this.saveCache(data);
      return data;
    } catch {
      return this.fallback();
    }
  }

  private fallback(): RadarData {
    const existing = this.loadCache();
    if (existing) return existing;
    return {
      lastUpdated: new Date().toISOString(),
      source: 'baseline',
      models: [...BASELINE_MODELS],
      recommendations: { ...DEFAULT_RECOMMENDATIONS }
    };
  }
}
