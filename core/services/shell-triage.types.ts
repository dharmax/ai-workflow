/**
 * Responsibility: Provide types and interfaces for the Three-Tier Shell Routing system.
 */

export enum ShellTier {
  /** Deterministic, zero-cost commands. */
  Tier1 = "tier1",
  /** RAG-based tool-use assistant. */
  Tier2 = "tier2",
  /** Orchestrator/Compiler for complex flows. */
  Tier3 = "tier3"
}

export interface ShellIntent {
  tier: ShellTier;
  confidence: number;
  reason: string;
  extracted?: {
    primitive?: string;
    taskClass?: string;
    subject?: string;
    isMutation: boolean;
  };
}

export interface TriageResult {
  intent: ShellIntent;
  fastPathPlan?: any; // To allow Tier 1 to return a plan immediately
}
