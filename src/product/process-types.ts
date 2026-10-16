import { z } from 'zod';
import type { ChangePreview } from '../change/types.ts';
import type { SystemOne } from '@dharmax/llm-utils';
import type { ArtifactOperationOptions, CompletenessLevel } from '../artifact-policy.ts';

export const IntentProposalSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1), kind: z.enum(['Epic', 'Feature', 'UserStory', 'Ticket']), title: z.string().min(1),
    priority: z.union([z.number(), z.enum(['P0','P1','P2','P3'])]).optional(),
    storyIds: z.array(z.string()).optional(), scopeIds: z.array(z.string()).optional(),
    revise: z.boolean().optional(),
    body: z.string().default(''), actor: z.string().optional(), story: z.string().optional(),
    intent: z.string().optional(), initialState: z.string().optional(), action: z.string().optional(),
    expectedResult: z.string().optional(), exceptions: z.string().optional(), bounds: z.string().optional(),
    acceptanceCriteria: z.array(z.string().min(1)).default([])
  })).default([]),
  aspectIds: z.array(z.string()).default([]), gaps: z.array(z.string()).default([]),
  required: z.array(z.object({ question: z.string(), why: z.string(), target: z.string() })).default([]),
  rationale: z.string().min(1)
});
export type IntentProposal = z.infer<typeof IntentProposalSchema>;
export interface IntentContext {
  id: string; kind: 'Epic' | 'Feature' | 'UserStory'; title: string; body: string; acceptanceCriteria: string[];
  originalRequest?: string; priority?: number;
  completeness: CompletenessLevel; depth: number; existing: Array<Record<string, unknown>>;
  applicableAspects: string[]; candidateAspects: Array<{ id: string; title: string; criteria: string[] }>;
  coverage: unknown; impact: unknown; aspectAssessment: unknown;
}
export interface ProcessOptions extends ArtifactOperationOptions {
  originalRequest?: string;
  proposal?: IntentProposal;
  requireWorkScope?: boolean;
  systemOne?: SystemOne;
  propose?: (context: IntentContext, findings: readonly { message: string }[]) => Promise<IntentProposal>;
}
export interface ProcessedIntent {
  proposals: ChangePreview[];
  created: string[]; reused: string[]; processed: string[]; remaining: string[];
  stoppedAtDepth: boolean; stoppedAtMaxArtifacts: boolean; artifactComplete: boolean;
  knownGaps: string[]; coverage: unknown; impact: unknown; aspectAssessment: unknown;
}
