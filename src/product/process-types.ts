import { z } from 'zod';
import type { SystemOne } from '@dharmax/llm-utils';
import type { ArtifactOperationOptions, CompletenessLevel } from '../artifact-policy.ts';

export const IntentProposalSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1), kind: z.enum(['Feature', 'UserStory', 'Ticket']), title: z.string().min(1),
    body: z.string().default(''), actor: z.string().optional(), story: z.string().optional(),
    acceptanceCriteria: z.array(z.string().min(1)).min(1)
  })).default([]),
  aspectIds: z.array(z.string()).default([]), gaps: z.array(z.string()).default([]),
  required: z.array(z.object({ question: z.string(), why: z.string(), target: z.string() })).default([]),
  rationale: z.string().min(1)
});
export type IntentProposal = z.infer<typeof IntentProposalSchema>;
export interface IntentContext {
  id: string; kind: 'Epic' | 'Feature' | 'UserStory'; title: string; body: string; acceptanceCriteria: string[];
  completeness: CompletenessLevel; depth: number; existing: Array<Record<string, unknown>>;
  applicableAspects: string[]; candidateAspects: Array<{ id: string; title: string; criteria: string[] }>;
  coverage: unknown; impact: unknown; aspectAssessment: unknown;
}
export interface ProcessOptions extends ArtifactOperationOptions {
  systemOne?: SystemOne;
  propose?: (context: IntentContext, findings: readonly { message: string }[]) => Promise<IntentProposal>;
}
export interface ProcessedIntent {
  created: string[]; reused: string[]; processed: string[]; remaining: string[];
  stoppedAtDepth: boolean; stoppedAtMaxArtifacts: boolean; artifactComplete: boolean;
  knownGaps: string[]; coverage: unknown; impact: unknown; aspectAssessment: unknown;
}
