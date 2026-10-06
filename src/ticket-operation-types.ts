import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonical } from './kb/canonical.ts';
import type { WorkflowStore } from './graph/store.ts';
import type { Ticket } from './graph/ontology.ts';
import type { CompletenessLevel } from './artifact-policy.ts';
import type { SystemOne } from '@dharmax/llm-utils';
import type { ArtifactOperationOptions, RequiredInput, TicketCompletenessContext, CriticFinding } from './artifact-policy.ts';
import type { AspectAssessment } from './aspects.ts';
import { ChangeRequestSchema } from './tools/change.ts';

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
  ticket: { id: string; title: string; body: string; status: string; lane: string; acceptanceCriteria: string[] };
  disposition: InvestigationJudgment['disposition']; rationale: string;
  evidence: TicketEvidence[];
  completeness: TicketCompletenessContext;
  aspects: AspectAssessment;
  proposedEnrichments: { acceptanceCriteria?: string[]; relations: Array<{ sourceId: string; predicate: string; targetId: string }> };
  provenance: { systemOne: { backendId: string; quality: string } | null; reasoningUsed: boolean; optionalCandidates: number; optionalSelected: number; freshnessReconciliations: number };
}
export interface InvestigationOptions extends ArtifactOperationOptions {
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
export const AcceptanceVerificationSchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), passed: z.boolean(), evidence: z.string().trim().min(1) })),
  aspects: z.array(z.object({ id: z.string(), passed: z.boolean(), evidence: z.string().trim().min(1) }))
}).superRefine((value, ctx) => {
  for (const [field, keys] of [['criteria', value.criteria.map(check => check.criterion)], ['aspects', value.aspects.map(check => check.id)]] as const) {
    if (new Set(keys).size !== keys.length) ctx.addIssue({code: 'custom', path: [field], message: 'Acceptance checks must identify each requirement exactly once.'});
  }
});
export type AcceptanceVerification = z.infer<typeof AcceptanceVerificationSchema>;
export interface ResolutionVerificationInput { dossier: TicketDossier; files: string[]; tests: Array<{ command: string[]; passed: boolean; output: string }>; children: string[]; testNodes: Awaited<ReturnType<typeof import('./graph/test-artifacts.ts').currentTestEvidence>> }
export interface ResolutionOptions extends PreparationOptions {
  maxRepairs?: number; allowDirtyTargets?: string[]; testCommands?: string[][];
  implement?: (dossier: TicketDossier, feedback: readonly string[]) => Promise<ResolutionProposal>;
  verify?: (input: ResolutionVerificationInput) => Promise<AcceptanceVerification>;
}
export interface ResolvedTicket { verification: boolean; resolved: string[]; files: string[]; repairs: number; acceptance: AcceptanceVerification }

// Receipts are untrusted persisted data. Invalid/legacy receipts trigger verification.
export const VerificationReceiptSchema = z.object({
  signature: z.string(), hashes: z.record(z.string(), z.string()), acceptance: AcceptanceVerificationSchema,
  tests: z.array(z.object({command: z.array(z.string()), passed: z.boolean()})),
  testNodes: z.array(z.object({id: z.string(), hashes: z.record(z.string(), z.string())})).min(1)
});
export function readVerificationReceipt(body: unknown) {
  try {
    const parsed = VerificationReceiptSchema.safeParse(JSON.parse(String(body)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** Fingerprint the authored contract, including scope rather than incidental imported bytes. */
export async function ticketVerificationSignature(store: WorkflowStore, ticket: Ticket, completeness?: CompletenessLevel, migrations: readonly {oldId: string; newId: string}[] = []) {
  const {FileNode, SymbolNode} = await import('./graph/ontology.ts');
  const targets = new Set<string>();
  for (const edge of [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)]) {
    if (!['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'blocks', 'depends_on', 'verifies'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    if (entity instanceof FileNode || entity instanceof SymbolNode) {
      let id = entity.id;
      // Native changes may migrate durable anchors without changing authored scope.
      for (const migration of [...migrations].reverse()) if (id === migration.newId) id = migration.oldId;
      targets.add(id);
    }
  }
  const aspects = (await ticket.assessAspects(store)).aspects.map(aspect => ({id: aspect.id, criteria: aspect.criteria})).sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(canonical({
    ticket: {title: ticket.title, body: ticket.body, criteria: ticket.acceptanceCriteria},
    targets: [...targets].sort(), aspects, completeness: await ticket.getCompletenessContext(store, completeness)
  })).digest('hex');
}
