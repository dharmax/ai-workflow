/**
 * Responsibility: Two-Tier Intent Routing Engine.
 * Scope: Filters 50+ tool candidates into 1-2 relevant capability buckets (Tier 1),
 * and scores 2-4 candidate tools within the bucket (Tier 2) to prevent LLM context saturation.
 */

import type { ToolDefinition, ToolRegistry } from './registry.ts';

export type ToolBucket =
  | 'ticket'
  | 'graph'
  | 'compiler'
  | 'git'
  | 'os'
  | 'test'
  | 'planning'
  | 'script';

interface BucketRule {
  bucket: ToolBucket;
  keywords: string[];
}

const BUCKET_RULES: BucketRule[] = [
  {
    bucket: 'ticket',
    keywords: ['ticket', 'lease', 'claim', 'release', 'kanban', 'backlog', 'todo', 'done', 'lane', 'task', 'recommend', 'p0', 'p1', 'p2']
  },
  {
    bucket: 'graph',
    keywords: ['symbol', 'ast', 'slice', 'source', 'outline', 'blast radius', 'token budget', 'dependency', 'caller', 'incoming', 'tokens']
  },
  {
    bucket: 'compiler',
    keywords: ['codelet', 'compile', 'patch', 'block patch', 'promote', 'synthesize', 'custom', 'esm']
  },
  {
    bucket: 'git',
    keywords: ['git', 'status', 'diff', 'commit', 'snapshot', 'checkpoint', 'pr', 'branch', 'hotspot', 'uncommitted']
  },
  {
    bucket: 'os',
    keywords: ['command', 'exec', 'run', 'process', 'environment', 'platform', 'root', 'shell']
  },
  {
    bucket: 'test',
    keywords: ['test', 'triage', 'playwright', 'failure', 'spec', 'unit test', 'failing']
  },
  {
    bucket: 'planning',
    keywords: ['adr', 'decision', 'scratchpad', 'note', 'propose', 'architectural']
  },
  {
    bucket: 'script',
    keywords: ['eval', 'script', 'javascript', 'query store', 'raw query']
  }
];

export class TwoTierRouter {
  /**
   * Tier 1: Resolves the most relevant tool bucket from intent.
   */
  resolveBucket(intent: string): ToolBucket {
    const text = intent.toLowerCase();
    let bestBucket: ToolBucket = 'os'; // fallback
    let highestScore = -1;

    for (const rule of BUCKET_RULES) {
      let score = 0;
      for (const kw of rule.keywords) {
        if (text.includes(kw)) score += kw.length;
      }
      if (score > highestScore) {
        highestScore = score;
        bestBucket = rule.bucket;
      }
    }

    return bestBucket;
  }

  /**
   * Tier 2: Selects 2-4 candidate tools from the selected bucket matching intent tokens.
   */
  getCandidateTools(intent: string, registry: ToolRegistry): ToolDefinition[] {
    const bucket = this.resolveBucket(intent);
    const categoryTools = registry.getAll().filter(t => t.category === bucket || t.name.startsWith(bucket));
    
    if (categoryTools.length <= 4) {
      return categoryTools.length > 0 ? categoryTools : registry.getAll().slice(0, 4);
    }

    const text = intent.toLowerCase();
    const scored = categoryTools.map(t => {
      let score = 0;
      const nameParts = t.name.toLowerCase().split('_');
      for (const part of nameParts) {
        if (part.length > 2 && text.includes(part)) score += 5;
      }
      for (const word of t.description.toLowerCase().split(/\s+/)) {
        if (word.length > 3 && text.includes(word)) score += 1;
      }
      return { tool: t, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map(s => s.tool);
  }
}

export const bucketRouter = new TwoTierRouter();
