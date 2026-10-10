import { z } from 'zod';
import { loadConfig } from './config.ts';
import { createDefaultAsker } from './model-runtime.ts';
import type { ArtifactCritic, CriticInput, CriticResult } from './artifact-policy.ts';
import { cognitionMetrics } from './performance-metrics.ts';

export const CriticResultSchema = z.object({
  verdict: z.enum(['accept', 'revise', 'reject', 'needs_input']),
  findings: z.array(z.object({ message: z.string(), artifactId: z.string().default('') })).default([]),
  required: z.array(z.object({ question: z.string(), artifactId: z.string().default('') })).default([])
});
const AiReviewSchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), covered: z.boolean(), evidence: z.string() })),
  aspects: z.array(z.object({ id: z.string(), covered: z.boolean(), evidence: z.string() })),
  review: CriticResultSchema
});

/** A separate Asker call with review-only context, never producer conversation history. */
export class AiArtifactCritic implements ArtifactCritic {
  constructor(readonly id: string, private readonly projectRoot: string, private readonly signal?: AbortSignal) {}
  async review(input: CriticInput): Promise<CriticResult> {
    const cfg = loadConfig(this.projectRoot);
    const model = this.id === 'auto' ? cfg.modelRoutes?.critic ?? cfg.modelRoutes?.design ?? cfg.model : cfg.modelRoutes?.[`critic:${this.id}`];
    if (!model) throw new Error(`Critic '${this.id}' has no configured model route.`);
    const asker = createDefaultAsker(this.projectRoot);
    if (!asker) throw new Error('Independent Critic provider unavailable.');
    const result = await asker.json(`Independently review this engineering proposal at ${input.completeness} completeness. You are read-only. acceptanceCriteria describes REQUIRED outcomes, never proof they are already met. First evaluate EVERY parent acceptanceCriteria entry, and EVERY applicable Aspect. For each, report whether proposed or existing work explicitly covers it and cite the actual work that does so. An unrelated criterion is not coverage. Requirements in intent are not implementation evidence. If any material criterion or Aspect is missing, the review MUST revise or reject with specific findings. Then check duplicate work, unnecessary ceremony, executable acceptance, real dependency ordering, Decisions and reuse versus creation. Higher completeness requires stronger evidence, never more artifacts by itself. Do not accept based only on whether one proposed child looks reasonable. Return criteria, aspects and review. Review context: ${JSON.stringify(input)}`, AiReviewSchema, { model, temperature: 0, timeoutMs: 60000, signal: this.signal, maxRetries: 1, maxTokens: cfg.llmOutputTokens, ...cognitionMetrics({phase: 'critic_review'}) });
    if (!result.ok) throw new Error(`Independent Critic failed: ${result.failure?.kind ?? 'unknown'}: ${result.failure?.message ?? 'No validated result.'}`);
    const assessment = AiReviewSchema.parse(result.data);
    const missing = [...(input.acceptanceCriteria ?? []).filter(criterion => !assessment.criteria.some(check => check.criterion === criterion && check.covered && check.evidence.trim())),
      ...input.applicableAspects.filter(id => !assessment.aspects.some(check => check.id === id && check.covered && check.evidence.trim()))];
    if (missing.length && assessment.review.verdict === 'accept') return { verdict: 'revise', findings: missing.map(item => ({ message: `Independent review has no explicit coverage for '${item}'.` })) };
    return assessment.review;
  }
}
