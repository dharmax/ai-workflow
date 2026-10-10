/**
 * Responsibility: Graph-Grounded Source Synthesis Types and Contracts.
 * Scope: Defines SynthesisContext, SynthesisEvidence, VerificationExpectation,
 * SourceSynthesizer, and SynthesisCandidate according to docs/graph-aware-code-synthesis-architecture.md (J3.4).
 */

export type SynthesisEvidenceRole =
  | 'constraint'
  | 'reuse_candidate'
  | 'dependency_contract'
  | 'caller_contract'
  | 'project_convention'
  | 'product_intent'
  | 'decision'
  | 'aspect';

export interface SynthesisEvidence {
  id: string;
  role: SynthesisEvidenceRole;
  fact: string;
  provenance: string;
  source?: string;
  filePath?: string;
  mandatory?: boolean;
}

export interface VerificationExpectation {
  id: string;
  criterion: string;
  command?: string[];
  mandatory: boolean;
  provenance: string;
}

export type SynthesisTarget =
  | {
      kind: 'existing_symbol';
      filePath: string;
      symbolName: string;
      containerName?: string;
      existingSource: string;
    }
  | {
      kind: 'new_source';
      filePath: string;
      moduleContext?: string;
    };

export interface SynthesisContext {
  intent: {
    summary: string;
    acceptanceCriteria: readonly string[];
  };
  target: SynthesisTarget;
  evidence: readonly SynthesisEvidence[];
  verification: readonly VerificationExpectation[];
}

export interface VerificationFailure {
  stage: 'candidate_sanity' | 'project_compatibility' | 'behavioral_acceptance';
  message: string;
  error?: string;
  details?: Record<string, any>;
}

export interface SynthesisCandidate {
  source: string;
  assumptions?: readonly string[];
  target: SynthesisTarget;
}

export interface SourceSynthesizerOptions {
  feedback?: readonly VerificationFailure[];
  signal?: AbortSignal;
  model?: string;
  timeoutMs?: number;
  metrics?: any;
  metricsSink?: any;
}

export interface SourceSynthesizer {
  synthesize(
    context: SynthesisContext,
    options?: SourceSynthesizerOptions
  ): Promise<SynthesisCandidate>;
}
