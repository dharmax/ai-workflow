import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonical } from './kb/canonical.ts';
import type { WorkflowStore } from './graph/store.ts';
import type { Ticket, WorkflowEntity } from './graph/ontology.ts';
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
  governance?: TicketGovernance;
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
export const RuleEvaluationSchema = z.object({
  ruleId: z.string().min(1), revision: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  verdict: z.enum(['pass', 'fail', 'not_applicable', 'inconclusive']),
  evidence: z.string().trim().min(1), evidenceIds: z.array(z.string().trim().min(1)).min(1),
  limitations: z.array(z.string()).default([])
});
export const AcceptanceVerificationSchema = z.object({
  criteria: z.array(z.object({ criterion: z.string(), passed: z.boolean(), evidence: z.string().trim().min(1) })),
  aspects: z.array(z.object({ id: z.string(), passed: z.boolean(), evidence: z.string().trim().min(1) })),
  rules: z.array(RuleEvaluationSchema).default([])
}).superRefine((value, ctx) => {
  for (const [field, keys] of [['criteria', value.criteria.map(check => check.criterion)], ['aspects', value.aspects.map(check => check.id)], ['rules', value.rules.map(check => check.ruleId)]] as const) {
    if (new Set(keys).size !== keys.length) ctx.addIssue({code: 'custom', path: [field], message: 'Acceptance checks must identify each requirement exactly once.'});
  }
});
export type AcceptanceVerification = z.infer<typeof AcceptanceVerificationSchema>;
export interface ResolutionVerificationInput { dossier: TicketDossier; files: string[]; tests: Array<{ command: string[]; passed: boolean; output: string }>; children: string[]; testNodes: Awaited<ReturnType<typeof import('./graph/test-artifacts.ts').currentTestEvidence>> }
export interface ResolutionOptions extends PreparationOptions {
  /** Cumulative implementation Actor token budget override. Explicit values are treated as hard caps. */
  maxActorTokens?: number;
  maxRepairs?: number; allowDirtyTargets?: string[]; testCommands?: string[][];
  implement?: (dossier: TicketDossier, feedback: readonly string[]) => Promise<ResolutionProposal>;
  verify?: (input: ResolutionVerificationInput) => Promise<z.input<typeof AcceptanceVerificationSchema>>;
}
export interface ResolvedTicket { verification: boolean; resolved: string[]; files: string[]; repairs: number; acceptance: AcceptanceVerification }

// Receipts are untrusted persisted data. Invalid/legacy receipts trigger verification.
export const DOCTRINE_VERIFIER_VERSION = 1;
export const VerificationReceiptSchema = z.object({
  governanceVersion: z.literal(DOCTRINE_VERIFIER_VERSION), governanceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
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

export interface TicketGovernance {
  fingerprint: string;
  rules: Array<import('./rules/types.ts').RuleModel & { fingerprint: string }>;
  decisions: Array<{ id: string; decision?: string; context?: string; consequences?: string; body?: string; status?: string }>;
}

/** One effective Ticket governance view for investigation, production, verification and proof reuse. */
export async function resolveTicketGovernance(store: WorkflowStore, ticket: Ticket): Promise<TicketGovernance> {
  const { FileNode, SymbolNode, ModuleNode, Decision } = await import('./graph/ontology.ts');
  const { RuleStore } = await import('./rules/store.ts');
  const { collectProductMeaning } = await import('./product/context.ts');
  const { loadConfig } = await import('./config.ts');
  const { ensureAstFresh } = await import('./graph/indexer.ts');
  const { renderAcceptancePrompt } = await import('./ticket/prompts.ts');
  const { renderRuleReferences } = await import('./rules/references.ts');
  await ensureAstFresh(store);
  const neighbors = [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)];
  const entities: WorkflowEntity[] = [];
  for (const edge of neighbors) {
    if (!['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'verifies'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    if (entity) entities.push(entity);
  }
  const meaning = await collectProductMeaning([ticket, ...entities], store);
  const aspects = await ticket.assessAspects(store);
  const decisions = new Map<string, TicketGovernance['decisions'][number]>();
  for (const entity of [...entities, ...meaning.map(item => item.entity),
    ...await Promise.all(aspects.aspects.flatMap(aspect => aspect.decisions).map(id => store.getEntity(id)))]) {
    if (!(entity instanceof Decision)) continue;
    const data = entity as import('./graph/ontology.ts').Decision & { body?: string; status?: string };
    decisions.set(store.localId(entity.id), { id: store.localId(entity.id), decision: data.decision,
      context: data.context, consequences: data.consequences, body: data.body, status: data.status });
  }
  const explicitModules = entities.filter(entity => entity instanceof ModuleNode).map(entity => store.localId(entity.id));
  const contexts = new Map<string, { moduleId?: string; language?: string }>();
  for (const entity of entities) {
    if (!(entity instanceof FileNode || entity instanceof SymbolNode)) continue;
    const filePath = entity instanceof SymbolNode ? entity.filePath! : store.localId(entity.id);
    const file = await store.getEntity(filePath, FileNode.dcr);
    const language = /\.[cm]?tsx?$/.test(filePath) ? 'typescript' : /\.[cm]?jsx?$/.test(filePath) ? 'javascript'
      : /\.py$/.test(filePath) ? 'python' : /\.rs$/.test(filePath) ? 'rust' : /\.go$/.test(filePath) ? 'go'
      : /\.md$/.test(filePath) ? 'markdown' : /\.txt$/.test(filePath) ? 'text'
      : /\.json$/.test(filePath) ? 'json' : (file as (import('./graph/ontology.ts').FileNode & { language?: string }) | null)?.language;
    const modules = new Set(explicitModules);
    if (file) {
      for (const edge of await store.getIncoming(file.id, 'contains')) {
        const owner = await store.getEntity(edge.sourceId);
        if (owner instanceof ModuleNode) modules.add(store.localId(owner.id));
      }
    }
    for (const moduleId of modules.size ? [...modules].sort() : [undefined]) {
      const context = { moduleId, language };
      contexts.set(canonical(context), context);
    }
  }
  if (!contexts.size) {
    for (const moduleId of explicitModules.length ? explicitModules.sort() : [undefined])
      contexts.set(canonical({ moduleId }), { moduleId });
  }
  const cfg = loadConfig(store.root);
  const checker = { version: DOCTRINE_VERIFIER_VERSION, model: cfg.modelRoutes?.critic ?? cfg.modelRoutes?.design ?? cfg.model,
    promptFingerprint: createHash('sha256').update(renderAcceptancePrompt('')).digest('hex') };
  const ruleStore = new RuleStore(store);
  const rules = new Map<string, TicketGovernance['rules'][number]>();
  for (const context of contexts.values()) {
    for (const resolved of await ruleStore.resolveAllRules({ ...context, forGovernance: true })) {
      if (resolved.isDisabled) continue;
      const storedRule = resolved.effective;
      if (storedRule.importance >= 8 && storedRule.references.some(reference => reference.required && !reference.snapshot?.approved))
        throw new Error(`Mandatory Rule '${storedRule.ruleId}' requires approved reference evidence.`);
      const rule = {...storedRule, references: storedRule.references.map(reference =>
        reference.snapshot?.approved ? reference : {...reference, snapshot: undefined})};
      for (const reference of rule.references) if (reference.snapshot && reference.revision !== reference.snapshot.revision)
        throw new Error('Reference does not match its pinned revision.');
      const approvedReferences = rule.references.filter(reference => reference.snapshot?.approved);
      const referenceEvidence = renderRuleReferences(approvedReferences);
      if (rule.importance >= 8 && rule.languages?.length && !context.language)
        throw new Error(`Specify the target language for mandatory Rule '${rule.ruleId}'.`);
      const fingerprint = createHash('sha256').update(canonical({
        ruleId: rule.ruleId, scope: rule.scope, type: rule.type, languages: rule.languages,
        importance: rule.importance, status: rule.status, revision: rule.revision,
        rule: rule.rule, examples: rule.examples, test: rule.test, checker,
        ...(approvedReferences.length ? {referenceEvidence} : {})
      })).digest('hex');
      const prior = rules.get(rule.ruleId);
      if (prior && prior.fingerprint !== fingerprint && Math.max(prior.importance, rule.importance) >= 8)
        throw new Error(`Ambiguous mandatory Rule '${rule.ruleId}' across authored scopes; split or clarify the Ticket scope.`);
      if (!prior) rules.set(rule.ruleId, { ...rule, fingerprint });
    }
  }
  const selectedRules = [...rules.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const selectedDecisions = [...decisions.values()].sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash('sha256').update(canonical({
    checker, rules: selectedRules.filter(rule => rule.importance >= 8).map(rule => ({ ruleId: rule.ruleId, fingerprint: rule.fingerprint })),
    decisions: selectedDecisions, aspects: aspects.aspects.map(aspect => ({ id: aspect.id, status: aspect.status, criteria: aspect.criteria }))
  })).digest('hex');
  return { fingerprint, rules: selectedRules, decisions: selectedDecisions };
}


/** A required Rule assessment failed; the existing resolver may perform its bounded repair. */
export class RuleAcceptanceError extends Error {
  constructor(readonly failures: string[]) { super(failures.join('\n')); }
}

/** Assessments must name the pinned Rule and cite current source or executed tests. */
export function ruleAcceptanceFailures(
  governance: TicketGovernance, acceptance: AcceptanceVerification, evidenceIds: readonly string[]
): string[] {
  const required = governance.rules.filter(rule => rule.importance >= 8);
  const failures = acceptance.rules.filter(check => !required.some(rule => rule.ruleId === check.ruleId))
    .map(check => `Unknown Rule assessment '${check.ruleId}'.`);
  for (const rule of required) {
    const check = acceptance.rules.find(item => item.ruleId === rule.ruleId);
    if (!check) {
      failures.push(`Mandatory Rule '${rule.ruleId}' lacks an independent assessment.`);
      continue;
    }
    if (check.revision !== rule.revision || check.fingerprint !== rule.fingerprint)
      failures.push(`Mandatory Rule '${rule.ruleId}' assessment does not match the pinned effective Rule.`);
    const unknownEvidence = check.evidenceIds.filter(id => !evidenceIds.includes(id));
    if (unknownEvidence.length)
      failures.push(`Mandatory Rule '${rule.ruleId}' cites unknown or unsupplied evidence: ${unknownEvidence.join(', ')}.`);
    if (!['pass', 'not_applicable'].includes(check.verdict))
      failures.push(`Mandatory Rule '${rule.ruleId}': ${check.verdict}: ${check.evidence}`);
  }
  return failures;
}

/** Fingerprint the authored contract and applicable governance, not unrelated advisory records. */
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
    targets: [...targets].sort(), aspects, completeness: await ticket.getCompletenessContext(store, completeness),
    governance: (await resolveTicketGovernance(store, ticket)).fingerprint
  })).digest('hex');
}
