import { z } from 'zod';
import { loadConfig } from './config.ts';
import { createDefaultAsker } from './model-runtime.ts';
import type { ArtifactCritic, CriticInput, CriticResult } from './artifact-policy.ts';
import { cognitionMetrics } from './performance-metrics.ts';

/** Charter reviews classify observations separately from actionable concerns.
 * General Critic consumers retain their existing findings/verdict contract. */
export const CharterAlignmentSchema = z.object({
  status: z.enum(['aligned', 'conflict', 'uncertain']),
  explanation: z.string().trim().min(1),
  observations: z.array(z.object({artifactId: z.string(), message: z.string().trim().min(1)})),
  conflicts: z.array(z.object({
    artifactId: z.string().min(1), message: z.string().trim().min(1),
    charterEvidence: z.string().trim().min(1), definitionEvidence: z.string().trim().min(1),
    question: z.string().trim().min(1)
  }))
}).strict();
export type CharterAlignment = z.infer<typeof CharterAlignmentSchema>;
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
function criticAssessmentSchema(input: CriticInput) {
  const schema = input.charterAlignment ? AiReviewSchema.extend({alignment: CharterAlignmentSchema}) : AiReviewSchema;
  return schema.superRefine((assessment, ctx) => {
    // Preserve a grounded charter conflict; it already blocks acceptance.
    if ('alignment' in assessment && CharterAlignmentSchema.parse(assessment.alignment).conflicts.length) return;
    for (const criterion of input.acceptanceCriteria ?? [])
      if (!assessment.criteria.some(check => check.criterion === criterion))
        ctx.addIssue({code:'custom',path:['criteria'],message:'Missing exact criterion assessment: '+criterion});
    for (const check of assessment.criteria)
      if (!(input.acceptanceCriteria ?? []).includes(check.criterion))
        ctx.addIssue({code:'custom',path:['criteria'],message:'Unknown criterion assessment: '+check.criterion});
    for (const id of input.applicableAspects)
      if (!assessment.aspects.some(check => check.id === id))
        ctx.addIssue({code:'custom',path:['aspects'],message:'Missing Aspect assessment: '+id});
    for (const check of assessment.aspects)
      if (!input.applicableAspects.includes(check.id))
        ctx.addIssue({code:'custom',path:['aspects'],message:'Unknown Aspect assessment: '+check.id});
  });
}

export class AiArtifactCritic implements ArtifactCritic {
  constructor(readonly id: string, private readonly projectRoot: string, private readonly signal?: AbortSignal) {}
  async review(input: CriticInput): Promise<CriticResult> {
    const cfg = loadConfig(this.projectRoot);
    const model = this.id === 'auto' ? cfg.modelRoutes?.critic ?? cfg.modelRoutes?.design ?? cfg.model : cfg.modelRoutes?.[`critic:${this.id}`];
    if (!model) throw new Error(`Critic '${this.id}' has no configured model route.`);
    const asker = createDefaultAsker(this.projectRoot);
    if (!asker) throw new Error('Independent Critic provider unavailable.');
    const alignmentInstruction = input.charterAlignment
      ? ' This is a charter-alignment review. Return alignment with status (aligned, conflict or uncertain), a substantive explanation, observations and conflicts. Classify EVERY review.findings entry exactly once in observations or conflicts, preserving artifactId and message. Positive/explanatory observations are not warnings. Conflicts include material ambiguity/drift and require artifactId, message, charterEvidence and definitionEvidence quoting both actual definitions, and a developer question. An aligned assessment has no conflicts or required input. Missing evidence or uncertainty must never be called aligned. Review proposed UserStories for a coherent complete effective definition (Actor, Intent, Initial State, Action, Expected Result), sufficient to derive tests without inventing behavior. Do not demand implementation evidence for definition acceptance.'
      : '';
    const schema = criticAssessmentSchema(input);
    const result = await asker.json(`${alignmentInstruction}Independently review this engineering proposal at ${input.completeness} completeness. You are read-only. acceptanceCriteria describes REQUIRED outcomes, never proof they are already met. First evaluate EVERY parent acceptanceCriteria entry, and EVERY applicable Aspect. For each, report whether proposed or existing work explicitly covers it and cite the actual work that does so. An unrelated criterion is not coverage. Requirements in intent are not implementation evidence. If any material criterion or Aspect is missing, the review MUST revise or reject with specific findings. Then check duplicate work, unnecessary ceremony, executable acceptance, real dependency ordering, Decisions and reuse versus creation. Higher completeness requires stronger evidence, never more artifacts by itself. Do not accept based only on whether one proposed child looks reasonable. Return criteria, aspects and review. Review context: ${JSON.stringify(input)}`, schema, { model, temperature: 0, timeoutMs: 180000, signal: this.signal, maxRetries: 1, maxTokens: cfg.llmOutputTokens, ...cognitionMetrics({phase: 'critic_review'}) });
    if (!result.ok) throw new Error(`Independent Critic failed: ${result.failure?.kind ?? 'unknown'}: ${result.failure?.message ?? 'No validated result.'}`);
    const assessment = schema.parse(result.data);
    const alignment = 'alignment' in assessment ? CharterAlignmentSchema.parse(assessment.alignment) : undefined;
    if (input.charterAlignment && alignment) {
      const ids = input.charterAlignment.artifactIds;
      if (alignment.conflicts.some(item => !ids.includes(item.artifactId)))
        throw Error('Charter assessment references an unknown artifact.');
      // A grounded conflict already blocks acceptance. Do not replace its warning
      // with a formatting error when the general Critic paraphrases the concern.
      if (!alignment.conflicts.length && assessment.review.findings.some(finding =>
        alignment.observations.filter(item => item.artifactId === finding.artifactId && item.message === finding.message).length !== 1))
        throw Error('Charter assessment has unclassified or contradictory findings.');
    }
    const missing = [...(input.acceptanceCriteria ?? []).filter(criterion => !assessment.criteria.some(check => check.criterion === criterion && check.covered && check.evidence.trim())),
      ...input.applicableAspects.filter(id => !assessment.aspects.some(check => check.id === id && check.covered && check.evidence.trim()))];
    if (missing.length && assessment.review.verdict === 'accept') return { ...(alignment ? {alignment} : {}), verdict: 'revise', findings: [...(assessment.review.findings ?? []), ...missing.map(item => ({ message: `Independent review has no explicit coverage for '${item}'.` }))] };
    return {...assessment.review, ...(alignment ? {alignment} : {})};
  }
}
