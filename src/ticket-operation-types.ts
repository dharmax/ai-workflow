import { z } from 'zod';
import { canonical } from './kb/canonical.ts';
import type { SystemOne } from '@dharmax/llm-utils';
import type { ArtifactOperationOptions, RequiredInput, TicketCompletenessContext, CriticFinding } from './artifact-policy.ts';
import type { AspectAssessment } from './services/assessment-service.ts';
import { ChangeRequestSchema } from './tools/change-request.ts';

export type OperationResult<T> =
  | { status: 'complete'; artifactId: string; value: T }
  | { status: 'needs_input'; artifactId: string; required: Array<RequiredInput & { why: string; target: string; choices?: string[] }> }
  | { status: 'blocked'; artifactId: string; blockers: Array<{ reason: string; artifactId?: string }> };
export interface TicketEvidence {
  id: string; kind: string; title: string; body?: string; mandatory: boolean; provenance: string;
  filePath?: string; source?: string; exact?: boolean;
  symbolName?: string; containerName?: string; symbolKind?: number;
}
export const InvestigationJudgmentSchema = z.object({
  disposition: z.enum(['ready', 'needs_preparation', 'rejectable']),
  rationale: z.string(),
  acceptanceCriteria: z.array(z.string()).optional(),
  required: z.array(z.object({ question: z.string(), why: z.string(), target: z.string(), choices: z.array(z.string()).optional() })).optional()
});
export type InvestigationJudgment = z.infer<typeof InvestigationJudgmentSchema>;
export interface TicketDossier {
  history?: Awaited<ReturnType<typeof import('./services/journal-service.ts').ticketHistoryContext>>;
  ticket: { id: string; title: string; body: string; lane: string; acceptanceCriteria: string[]; kind?: 'task'|'bug'; defect?: import('./model/ticket.ts').TicketDefect };
  disposition: InvestigationJudgment['disposition']; rationale: string;
  evidence: TicketEvidence[];
  findings?: string[];
  uncertainties?: string[];
  completeness: TicketCompletenessContext;
  aspects: AspectAssessment;
  governance?: TicketGovernance;
  scope?: GovernedChangeScope;
  proposedEnrichments: { acceptanceCriteria?: string[]; relations: Array<{ sourceId: string; predicate: string; targetId: string }> };
  provenance: { systemOne: { backendId: string; quality: string } | null; reasoningUsed: boolean; optionalCandidates: number; optionalSelected: number; freshnessReconciliations: number };
}
export interface InvestigationOptions extends ArtifactOperationOptions {
  /** Obtain mandatory reviewed evidence for guarded source admission; skip optional cognitive enrichment. */
  mandatoryEvidenceOnly?: boolean;
  systemOne?: SystemOne;
  reason?: (dossier: TicketDossier) => Promise<InvestigationJudgment>;
}

export const TicketPreparationProposalSchema = z.object({
  rationale: z.string(),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).optional(),
  children: z.array(z.object({
    id: z.string().min(1), title: z.string().min(1), body: z.string().min(1),
    acceptanceCriteria: z.array(z.string().min(1)).min(1),
    relations: z.array(z.object({ predicate: z.enum(['implements', 'addresses', 'targets', 'modifies']), targetId: z.string().min(1) })).default([]),
    dependsOn: z.array(z.string().min(1)).default([])
  })).default([])
});
export type TicketPreparationProposal = z.infer<typeof TicketPreparationProposalSchema>;
export interface PreparationOptions extends InvestigationOptions {
  /** Exact enclosing execution lease; never supplied by the model transport. */
  owner?: import("./model/ticket.ts").TicketClaim;
  agentId?: string;
  propose?: (dossier: TicketDossier, findings: readonly CriticFinding[]) => Promise<TicketPreparationProposal>;
}
export interface PreparedTicket {
  dossier: TicketDossier; children: string[]; created: string[]; reused: string[];
  applied: boolean; criticRounds: number; rationale: string;
}

export const ResolutionProposalSchema = z.object({
  changes: z.array(ChangeRequestSchema).default([]), testCommands: z.array(z.array(z.string().min(1)).min(1)).default([]),
  required: z.array(z.object({ question: z.string(), why: z.string(), target: z.string() })).optional()
});
export type ResolutionProposal = z.infer<typeof ResolutionProposalSchema>;
export const ExactImplementationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('replace_symbol'), replacement: z.string().min(1), testCommands: z.array(z.array(z.string()).min(1)).default([]) }),
  z.object({ action: z.literal('rename_symbol'), newName: z.string().min(1), testCommands: z.array(z.array(z.string()).min(1)).default([]) })
]);
export const RuleEvaluationSchema = z.object({
  ruleId: z.string().min(1), revision: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  verdict: z.enum(['pass', 'fail', 'not_applicable', 'inconclusive']),
  evidence: z.string().trim().min(1), evidenceIds: z.array(z.string().trim().min(1)).min(1),
  limitations: z.array(z.string()).default([])
});
export const AcceptanceAssessmentSchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), passed: z.boolean(), evidence: z.string().trim().min(1) })),
  aspects: z.array(z.object({ id: z.string(), passed: z.boolean(), evidence: z.string().trim().min(1) })),
  rules: z.array(RuleEvaluationSchema).default([])
}).superRefine((value, ctx) => {
  for (const [field, keys] of [['criteria', value.criteria.map(check => check.criterion)], ['aspects', value.aspects.map(check => check.id)], ['rules', value.rules.map(check => canonical([check.ruleId, check.fingerprint]))]] as const) {
    if (new Set(keys).size !== keys.length) ctx.addIssue({code: 'custom', path: [field], message: 'Acceptance checks must identify each requirement exactly once.'});
  }
});
export const AcceptanceVerificationSchema = AcceptanceAssessmentSchema.safeExtend({
  /** Exact reviewed adequacy binding used for deterministic criteria; absent on older receipts. */
  technicalProofHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  scopeReviews:z.array(z.object({id:z.string(),bindingHash:z.string(),projectRoot:z.string(),testId:z.string(),
    sourceIds:z.array(z.string()),hashes:z.record(z.string(),z.string()),execution:z.object({lastRun:z.string(),hashes:z.record(z.string(),z.string())}),characters:z.number().int().nonnegative(),assessment:AcceptanceAssessmentSchema})).optional()
});
export type AcceptanceVerification = z.infer<typeof AcceptanceVerificationSchema>;
export interface ResolutionVerificationInput { dossier: TicketDossier; files: string[]; tests: Array<{ command: string[]; passed: boolean; output: string }>; children: string[]; testNodes: Awaited<ReturnType<typeof import('./graph/test-artifacts.ts').currentTestEvidence>> }
export interface ResolutionOptions extends PreparationOptions {
  /** Host source constraint; does not forbid non-code project operations. */
  codeMutationAllowed?: boolean;
  /** Cumulative implementation Actor token budget override. Explicit values are treated as hard caps. */
  maxActorTokens?: number;
  /** Verify existing work without source implementation or repair; independent acceptance remains mandatory. */
  verifyOnly?: boolean;
  maxRepairs?: number; allowDirtyTargets?: string[]; testCommands?: string[][];
  /** Exact local check argv explicitly safe to repeat, including external effects. Never inferred from sandbox authority. */
  repeatableChecks?: string[][];
  /** Explicit per-Ticket authorization for files outside authored source targets, including new/rename endpoints. */
  authorizedFiles?: Record<string, string[]>;
  implement?: (dossier: TicketDossier, feedback: readonly string[]) => Promise<ResolutionProposal>;
  verify?: (input: ResolutionVerificationInput) => Promise<z.input<typeof AcceptanceVerificationSchema>>;
}
export interface ResolvedTicket { verification: boolean; resolved: string[]; files: string[]; repairs: number; acceptance: AcceptanceVerification }

// Receipts are untrusted persisted data. Invalid/legacy receipts trigger verification.
export const DOCTRINE_VERIFIER_VERSION = 3;
export const VerificationReceiptSchema = z.object({
  governanceVersion: z.literal(DOCTRINE_VERIFIER_VERSION), governanceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  scope: z.object({ticketId: z.string(), intent: z.object({title: z.string(), body: z.string(), acceptanceCriteria: z.array(z.string())}),
    authoredTargets: z.array(z.object({id: z.string(), kind: z.string(), filePath: z.string().optional(), symbolName: z.string().optional()})),
    governance: z.object({targets: z.array(z.object({filePath: z.string(), moduleIds: z.array(z.string()), language: z.string().optional(), exists: z.boolean()})),
      decisions: z.array(z.object({id: z.string()}))}), revision: z.number().int().nonnegative(),
    authoredFiles: z.array(z.string()), authorizedFiles: z.array(z.string()), files: z.array(z.string()), baselines: z.record(z.string(), z.string()),
    effects: z.array(z.object({fingerprint: z.string(), edits: z.array(z.object({filePath: z.string(), edits: z.array(z.object({
      range: z.object({start: z.object({line: z.number(), character: z.number()}), end: z.object({line: z.number(), character: z.number()})}), newText: z.string()}))})),
      before: z.record(z.string(), z.string().nullable()),
      after: z.record(z.string(), z.string().nullable()), renames: z.array(z.object({from: z.string(), to: z.string()}))}))}),
  signature: z.string(), hashes: z.record(z.string(), z.string()), acceptance: AcceptanceVerificationSchema,
  tests: z.array(z.object({command: z.array(z.string()), passed: z.boolean()})),
  testNodes: z.array(z.object({id: z.string(), hashes: z.record(z.string(), z.string())}))
}).refine(proof => proof.testNodes.length > 0 || proof.tests.some(test => test.passed &&
  test.command[0] === 'bun' && test.command[1] === 'run' && ['typecheck', 'build'].includes(test.command[2] ?? '')),
  'A receipt requires current TestNode evidence or an independently assessed engineering check.');
export function readVerificationReceipt(body: unknown) {
  try {
    const parsed = VerificationReceiptSchema.safeParse(JSON.parse(String(body)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** One value per Ticket/revision, coordinated by resolve; no separate persisted tracker. */
export interface GovernedChangeScope {
  readonly ticketId: string;
  readonly intent: Readonly<Pick<TicketDossier['ticket'], 'title' | 'body' | 'acceptanceCriteria'>>;
  readonly authoredTargets: readonly Pick<TicketEvidence, 'id' | 'kind' | 'filePath' | 'symbolName'>[];
  readonly revision: number;
  readonly authoredFiles: readonly string[];
  readonly authorizedFiles: readonly string[];
  readonly files: readonly string[];
  readonly baselines: Readonly<Record<string, string>>;
  readonly effects: readonly {fingerprint: string; edits: readonly {filePath: string; edits: readonly import('./services/typescript/types.ts').LspTextEdit[]}[]; before: Readonly<Record<string, string | null>>;
    after: Readonly<Record<string, string | null>>; renames: readonly {from: string; to: string}[]}[];
  readonly governance: TicketGovernance;
}

export interface TicketGovernance {
  fingerprint: string;
  rules: Array<import('./model/rule.ts').RuleModel & { fingerprint: string }>;
  decisions: Array<{ id: string; decision?: string; context?: string; consequences?: string; body?: string; status?: string }>;
  aspects: import('./services/assessment-service.ts').AspectAssessment;
  targets: Array<{filePath: string; moduleIds: string[]; language?: string; exists: boolean}>;
}
