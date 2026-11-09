/** Shared preview/commit result shape; request and mutation semantics remain with their domains. */
import type {ProductImpact} from '../product/impact.ts';
import type {LspTextEdit} from '../services/typescript/types.ts';

export interface VerificationPlan {
  diagnosticsExpected: boolean;
  typecheck: boolean;
  targetedTests: string[];
  graphChecks: {
    expectedDefinition?: string;
    oldDefinitionRemoved?: boolean;
    migratedAnchor?: {
      oldId: string;
      expectedNewId?: string;
    };
  };
}

export interface ChangePreview<Request, Mutation, Target = never> {
  status?: 'needs_input';
  required?: Array<{question: string; artifactId: string}>;
  fingerprint: string;
  summary: string;
  request: Request;
  resolvedTarget?: Target;
  mutations: Mutation[];
  affectedFiles: string[];
  originalHashes: Record<string, string>;
  affectedProducts?: string[];
  dependents?: Array<{ sourceId: string; predicate: string; targetId: string }>;
  productImpact?: ProductImpact;
  productImpacts?: ProductImpact[];
  verification: VerificationPlan;
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
  requiredArguments?: string[];
}

export interface ChangeApplyResult<Preview = never> {
  /** Source mutation has already committed; distinguish failed postconditions from interrupted reconciliation. */
  status?: 'review_required' | 'needs_input' | 'committed_verification_failed' | 'committed_unreconciled';
  preview?: Preview;
  ok: boolean;
  fingerprint: string;
  filesTouched: string[];
  filesRenamed: Array<{ from: string; to: string }>;
  reindexedFiles: string[];
  migratedAnchors: Array<{ oldId: string; newId: string }>;
  /** Exact guarded filesystem effect; absent for Product mutations. Missing files use the evidence sentinel. */
  effects?: {before: Record<string, string>; after: Record<string, string>; edits: Array<{filePath: string; edits: LspTextEdit[]}>};
  verification: {
    /** Only the checks performed by applyChange; not proof of typechecking or behavior. */
    passed: boolean;
    /** Omitted when diagnostics were not actually checked. */
    diagnosticsOk?: boolean;
    typecheckOk?: boolean;
    testsOk?: boolean;
    errors: string[];
  };
  error?: string;
}
