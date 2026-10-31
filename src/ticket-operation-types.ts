import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonical } from './kb/canonical.ts';
import type { WorkflowStore } from './graph/store.ts';
import type { Ticket, WorkflowEntity } from './model/ontology.ts';
import type { CompletenessLevel } from './artifact-policy.ts';
import type { SystemOne } from '@dharmax/llm-utils';
import type { ArtifactOperationOptions, RequiredInput, TicketCompletenessContext, CriticFinding } from './artifact-policy.ts';
import type { AspectAssessment } from './aspects.ts';
import { ChangeRequestSchema } from './change/request-schema.ts';

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
  testNodes: z.array(z.object({id: z.string(), hashes: z.record(z.string(), z.string())})).min(1)
});
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
  readonly effects: readonly {fingerprint: string; edits: readonly {filePath: string; edits: readonly import('./change/types.ts').LspTextEdit[]}[]; before: Readonly<Record<string, string | null>>;
    after: Readonly<Record<string, string | null>>; renames: readonly {from: string; to: string}[]}[];
  readonly governance: TicketGovernance;
}

export interface TicketGovernance {
  fingerprint: string;
  rules: Array<import('./model/rule.ts').RuleModel & { fingerprint: string }>;
  decisions: Array<{ id: string; decision?: string; context?: string; consequences?: string; body?: string; status?: string }>;
  aspects: import('./aspects.ts').AspectAssessment;
  targets: Array<{filePath: string; moduleIds: string[]; language?: string; exists: boolean}>;
}

/** One effective Ticket governance view for investigation, production, verification and proof reuse. */
export async function resolveTicketGovernance(store: WorkflowStore, ticket: WorkflowEntity, files: readonly string[] = [],
  prior?: Pick<TicketGovernance, 'targets' | 'decisions'>, options: {refreshIndex?: boolean} = {}): Promise<TicketGovernance> {
  const { FileNode, SymbolNode, ModuleNode, Decision } = await import('./model/ontology.ts');
  const { RuleStore } = await import('./rules/store.ts');
  const { collectProductMeaning } = await import('./product/context.ts');
  const { loadConfig } = await import('./services/config-service.ts');
  const { ensureAstFresh, resolveModulePath } = await import('./graph/indexer.ts');
  const { applicableAspects, assessAspects } = await import('./aspects.ts');
  const { renderAcceptancePrompt } = await import('./ticket/prompts.ts');
  const { renderRuleReferences } = await import('./rules/references.ts');
  // Receipt inspection uses the current canonical Graph without mutating it.
  if (options.refreshIndex !== false) await ensureAstFresh(store);
  const neighbors = [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)];
  const entities: WorkflowEntity[] = [];
  for (const edge of neighbors) {
    if (!['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'verifies'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    if (entity) entities.push(entity);
  }
  for (const filePath of files) {
    const file = await store.getEntity<import('./model/ontology.ts').FileNode>(filePath, FileNode.dcr);
    if (file && !entities.some(entity => entity.id === file.id)) entities.push(file);
  }
  const owners = new Map<string, import('./model/ontology.ts').ModuleNode>();
  const ownership = new Map<string, string[]>();
  const sourceFiles = new Map<string, import('./model/ontology.ts').FileNode | null>();
  for (const entity of entities) if (entity instanceof FileNode || entity instanceof SymbolNode) {
    const filePath = entity instanceof FileNode ? store.localId(entity.id) : entity.filePath!;
    sourceFiles.set(filePath, entity instanceof FileNode ? entity : await store.getEntity(filePath, FileNode.dcr));
  }
  for (const filePath of files) if (!sourceFiles.has(filePath)) sourceFiles.set(filePath, await store.getEntity(filePath, FileNode.dcr));
  for (const [filePath, file] of sourceFiles) {
    const modules: string[] = [];
    if (file) for (const edge of await store.getIncoming(file.id, 'contains')) {
      const owner = await store.getEntity<import('./model/ontology.ts').ModuleNode>(edge.sourceId, ModuleNode.dcr);
      if (owner) { owners.set(owner.id, owner); modules.push(store.localId(owner.id)); }
    }
    else {
      // Retain the original ownership of attributable deletion/rename endpoints; resolve Rules live.
      for (const moduleId of prior?.targets.find(target => target.filePath === filePath)?.moduleIds ?? [`mod:${resolveModulePath(filePath)}`]) {
        const owner = await store.getEntity<import('./model/ontology.ts').ModuleNode>(moduleId, ModuleNode.dcr);
        if (!owner && prior?.targets.some(target => target.exists && target.filePath === filePath && target.moduleIds.includes(moduleId)))
          throw Error(`Governed endpoint owner '${moduleId}' disappeared.`);
        if (owner) owners.set(owner.id, owner);
        modules.push(moduleId);
      }
    }
    ownership.set(filePath, [...new Set(modules)].sort());
  }
  const subjects = [ticket, ...entities, ...owners.values()];
  const meaning = await collectProductMeaning(subjects, store);
  const selectedAspects = new Map<string, import('./model/ontology.ts').Aspect>();
  for (const subject of [ticket, ...owners.values()])
    for (const aspect of await applicableAspects(subject, store)) selectedAspects.set(aspect.id, aspect);
  const aspects = await assessAspects(ticket, store, [...selectedAspects.values()].sort((a, b) => a.id.localeCompare(b.id)));
  const codeSubjects = [...entities];
  for (const file of sourceFiles.values()) if (file) for (const edge of await store.getOutgoing(file.id, 'contains')) {
    const symbol = await store.getEntity<import('./model/ontology.ts').SymbolNode>(edge.targetId, SymbolNode.dcr);
    if (symbol) codeSubjects.push(symbol);
  }
  for (const retained of prior?.decisions ?? []) {
    const decision = await store.getEntity<import('./model/ontology.ts').Decision>(retained.id, Decision.dcr);
    if (!decision) throw Error(`Governing Decision '${retained.id}' disappeared.`);
    entities.push(decision);
  }
  for (const subject of [...codeSubjects, ...owners.values()]) for (const edge of await store.getIncoming(subject.id, 'governs')) {
    const decision = await store.getEntity<import('./model/ontology.ts').Decision>(edge.sourceId, Decision.dcr);
    if (decision) entities.push(decision);
  }
  const decisions = new Map<string, TicketGovernance['decisions'][number]>();
  for (const entity of [...entities, ...meaning.map(item => item.entity),
    ...await Promise.all(aspects.aspects.flatMap(aspect => aspect.decisions).map(id => store.getEntity(id)))]) {
    if (!(entity instanceof Decision) || ['draft', 'proposed', 'deprecated', 'disabled'].includes(String((entity as {status?: string}).status))) continue;
    const data = entity as import('./model/ontology.ts').Decision & { body?: string; status?: string };
    decisions.set(store.localId(entity.id), { id: store.localId(entity.id), decision: data.decision,
      context: data.context, consequences: data.consequences, body: data.body, status: data.status });
  }
  const explicitModules = entities.filter(entity => entity instanceof ModuleNode).map(entity => store.localId(entity.id));
  const contexts = new Map<string, {moduleId?: string; language?: string}>();
  const targets: TicketGovernance['targets'] = [];
  const languages: Record<string, string> = {ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', py: 'python', rs: 'rust', go: 'go',
    md: 'markdown', txt: 'text', json: 'json'};
  for (const [filePath, file] of sourceFiles) {
    const language = languages[filePath.split('.').at(-1)!] ?? file?.language;
    const moduleIds = ownership.get(filePath)!;
    targets.push({filePath, moduleIds, language, exists: file !== null});
    for (const moduleId of moduleIds.length ? moduleIds : [undefined]) {
      const context = {moduleId, language};
      contexts.set(canonical(context), context);
    }
  }
  for (const moduleId of explicitModules) if (![...contexts.values()].some(context => context.moduleId === moduleId))
    contexts.set(canonical({moduleId}), {moduleId});
  if (!contexts.size) contexts.set('{}', {});
  const cfg = loadConfig(store.root);
  const checker = { version: DOCTRINE_VERIFIER_VERSION, model: cfg.modelRoutes?.critic ?? cfg.modelRoutes?.reasoning ?? cfg.model,
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
      // Equal effective layers deduplicate; distinct scoped/language obligations coexist.
      rules.set(fingerprint, { ...rule, fingerprint });
    }
  }
  const selectedRules = [...rules.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.fingerprint.localeCompare(b.fingerprint));
  const selectedDecisions = [...decisions.values()].sort((a, b) => a.id.localeCompare(b.id));
  const fingerprint = createHash('sha256').update(canonical({
    checker, rules: selectedRules.filter(rule => rule.importance >= 5).map(rule => ({ ruleId: rule.ruleId, fingerprint: rule.fingerprint })),
    decisions: selectedDecisions, aspects: aspects.aspects.map(aspect => ({ id: aspect.id, status: aspect.status, criteria: aspect.criteria }))
  })).digest('hex');
  return { fingerprint, rules: selectedRules, decisions: selectedDecisions, aspects, targets: targets.sort((a, b) => a.filePath.localeCompare(b.filePath)) };
}


/** A required Rule assessment failed; the existing resolver may perform its bounded repair. */
export class RuleAcceptanceError extends Error {
  constructor(readonly failures: string[]) { super(failures.join('\n')); }
}

/** Assessments must name the pinned Rule and cite current source or executed tests. */
/** Structural review errors can be corrected; substantive negative verdicts cannot. */
export function ruleAssessmentContractFailures(
  governance: TicketGovernance, acceptance: AcceptanceVerification, evidenceIds: readonly string[]
): string[] {
  const failures = acceptance.rules.filter(check => !governance.rules.some(rule => rule.ruleId === check.ruleId && rule.fingerprint === check.fingerprint))
    .map(check => `Unknown Rule assessment '${check.ruleId}'.`);
  for (const rule of governance.rules.filter(rule => rule.importance >= 8)) {
    const check = acceptance.rules.find(item => item.ruleId === rule.ruleId && item.fingerprint === rule.fingerprint);
    if (!check) {
      failures.push(`Mandatory Rule '${rule.ruleId}' lacks an independent assessment.`);
      continue;
    }
    if (check.revision !== rule.revision || check.fingerprint !== rule.fingerprint)
      failures.push(`Mandatory Rule '${rule.ruleId}' assessment does not match the pinned effective Rule.`);
    const unknownEvidence = check.evidenceIds.filter(id => !evidenceIds.includes(id));
    if (unknownEvidence.length)
      failures.push(`Mandatory Rule '${rule.ruleId}' cites unknown or unsupplied evidence: ${unknownEvidence.join(', ')}.`);
  }
  return failures;
}

export function ruleAcceptanceFailures(
  governance: TicketGovernance, acceptance: AcceptanceVerification, evidenceIds: readonly string[]
): string[] {
  const failures = ruleAssessmentContractFailures(governance, acceptance, evidenceIds);
  for (const rule of governance.rules.filter(rule => rule.importance >= 8)) {
    const check = acceptance.rules.find(item => item.ruleId === rule.ruleId && item.fingerprint === rule.fingerprint);
    if (check && !['pass', 'not_applicable'].includes(check.verdict))
      failures.push(`Mandatory Rule '${rule.ruleId}': ${check.verdict}: ${check.evidence}`);
  }
  return failures;
}

/** Fingerprint the authored contract and applicable governance, not unrelated advisory records. */
export async function ticketVerificationSignature(store: WorkflowStore, ticket: Ticket, completeness?: CompletenessLevel, migrations: readonly {oldId: string; newId: string}[] = [], governance?: TicketGovernance) {
  const {FileNode, SymbolNode, UserStory} = await import('./model/ontology.ts');
  const targets = new Set<string>();
  const addressedStories = new Map<string, number | null>();
  for (const edge of [...await store.getOutgoing(ticket.id), ...await store.getIncoming(ticket.id)]) {
    if (!['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'blocks', 'depends_on', 'verifies'].includes(edge.predicateName)) continue;
    const entity = await store.getEntity(edge.sourceId === ticket.id ? edge.targetId : edge.sourceId);
    // Acceptance of an addressed Story is valid only for that Story's reviewed revision.
    if (edge.predicateName === 'addresses' && edge.sourceId === ticket.id)
      addressedStories.set(store.localId(edge.targetId), entity instanceof UserStory ? entity.version : null);
    if (entity instanceof FileNode || entity instanceof SymbolNode) {
      let id = entity.id;
      // Native changes may migrate durable anchors without changing authored scope.
      for (const migration of [...migrations].reverse()) if (id === migration.newId) id = migration.oldId;
      targets.add(id);
    }
  }
  return createHash('sha256').update(canonical({
    ticket: {title: ticket.title, body: await (await import('./services/journal-service.ts')).ticketVerificationBody(store,ticket), criteria: ticket.acceptanceCriteria, kind:ticket.kind??'task', defect:ticket.defect},
    targets: [...targets].sort(), completeness: await ticket.getCompletenessContext(store, completeness),
    ...(addressedStories.size ? {addressedStories: [...addressedStories].sort(([a], [b]) => a.localeCompare(b))} : {}),
    governance: (governance ?? await resolveTicketGovernance(store, ticket)).fingerprint
  })).digest('hex');
}
