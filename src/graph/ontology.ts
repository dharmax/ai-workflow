/**
 * Responsibility: Define Semantika Entity and Predicate descriptors for the AST+ Semantic Graph.
 * Scope: Complete ontological graph model connecting code, architecture, roadmap, and artifacts.
 */

import {
  AbstractEntity,
  EntityDcr,
  PredicateDcr,
  RawOntology
} from '@dharmax/semantika';

import { CompletenessSchema, scopeTarget, ticketCompleteness, type CompletenessLevel } from '../artifact-policy.ts';
import type { WorkflowStore } from './store.ts';

import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts';

import type { InvestigationOptions, TicketDossier, OperationResult, PreparationOptions, PreparedTicket } from '../ticket-operation-types.ts';

const completenessValidator = { validate: (v: unknown) => ({ value: v == null ? undefined : CompletenessSchema.parse(v) }) };

const anyValidator = { validate: (v: any) => ({ value: v }) };

const baseTemplate = {
  id: anyValidator,
  _id: anyValidator,
  title: anyValidator,
  status: { validate: (v: any) => ({ value: v ?? 'implemented' }) },
  body: { validate: (v: any) => ({ value: v ?? '' }) },
  metadata: { validate: (v: any) => ({ value: v ?? {} }) },
  createdAt: anyValidator,
  updatedAt: anyValidator
};

// -----------------------------------------------------------------------------
// Durable Domain Entities (aiwf-durable)
// -----------------------------------------------------------------------------

export abstract class WorkflowEntity extends AbstractEntity {
  declare title?: string;
  static readonly dcr: EntityDcr;

  override typeName(): string {
    return (this.constructor as typeof WorkflowEntity).dcr?.name || this.constructor.name;
  }

  override get descriptor(): EntityDcr {
    return (this.constructor as typeof WorkflowEntity).dcr || super.descriptor;
  }
}

export class Idea extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  static template = {
    ...baseTemplate,
    feasibility: anyValidator,
    impact: anyValidator
  };
  static readonly dcr = new EntityDcr(Idea, Idea.template, 'Idea');
}

export class Epic extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(Epic.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    priority: { validate: (v: any) => ({ value: v ?? 1 }) }
  };
  static readonly dcr = new EntityDcr(Epic, Epic.template, 'Epic');
}

export class Feature extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(Feature.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    acceptanceCriteria: anyValidator
  };
  static readonly dcr = new EntityDcr(Feature, Feature.template, 'Feature');
}

export class UserStory extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(UserStory.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    status: { validate: (v: any) => ({ value: v ?? 'draft' }) },
    actor: anyValidator,
    story: anyValidator,
    context: anyValidator,
    acceptanceCriteria: anyValidator,
    sla: anyValidator
  };
  static readonly dcr = new EntityDcr(UserStory, UserStory.template, 'UserStory');
}

export class Aspect extends WorkflowEntity {
  declare title: string;
  declare body: string;
  declare status: 'draft' | 'proposed' | 'accepted' | 'deprecated';
  declare acceptanceCriteria?: string[];
  static template = { ...baseTemplate, status: { validate: (v: unknown) => ({ value: v ?? 'draft' }) }, acceptanceCriteria: anyValidator };
  static readonly dcr = new EntityDcr(Aspect, Aspect.template, 'Aspect');
  static async create(store: WorkflowStore, data: { id: string; title: string; body?: string; status?: 'draft' | 'proposed' | 'accepted' | 'deprecated'; acceptanceCriteria?: string[] }) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    const { id, ...fields } = data;
    await applyProductMutations(store, [{ kind: 'product_create', entityType: 'Aspect', id, fields }]);
    return (await store.getEntity<Aspect>(id, Aspect.dcr))!;
  }
  async revise(store: WorkflowStore, fields: { title?: string; body?: string; status?: 'draft' | 'proposed' | 'accepted' | 'deprecated'; acceptanceCriteria?: string[] }) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    await applyProductMutations(store, [{ kind: 'product_update', entityType: 'Aspect', id: store.localId(this.id), fields }]);
    return (await store.getEntity<Aspect>(this.id, Aspect.dcr))!;
  }
  async view(store: WorkflowStore) {
    const scopes = (await store.getOutgoing(this.id, 'applies_to')).map(e => store.localId(e.targetId)).sort();
    return { id: store.localId(this.id), title: this.title, body: this.body, status: this.status, acceptanceCriteria: this.acceptanceCriteria ?? [], scopes,
      assessment: (await assessAspects(this, store, [this])).aspects[0] };
  }
  async applyTo(scope: WorkflowEntity, store: WorkflowStore) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    await applyProductMutations(store, [{ kind: 'product_link', sourceId: store.localId(this.id), predicate: 'applies_to', targetId: store.localId(scope.id) }]);
  }
  async removeFrom(scope: WorkflowEntity, store: WorkflowStore) {
    const { applyProductMutations } = await import('../product/mutation.ts');
    await applyProductMutations(store, [{ kind: 'product_unlink', sourceId: store.localId(this.id), predicate: 'applies_to', targetId: store.localId(scope.id) }]);
  }
  assess(scope: WorkflowEntity, store: WorkflowStore) { return assessAspects(scope, store, [this]); }
}

export class Ticket extends WorkflowEntity {
  declare body: string;
  declare lane: import('./types.ts').TicketLane;
  declare status: import('./types.ts').TicketStatus;
  declare acceptanceCriteria?: string[];
  declare claim?: import('./types.ts').TicketClaim | null;
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  getCompletenessContext(store: WorkflowStore, override?: CompletenessLevel) { return ticketCompleteness(this, store, override); }
  async investigate(store: WorkflowStore, options: InvestigationOptions = {}): Promise<OperationResult<TicketDossier>> {
    const { ensureAstFresh, withAstSnapshot } = await import('./indexer.ts');
    const { LayaSystemOne } = await import('@dharmax/llm-utils');
    const { InvestigationJudgmentSchema } = await import('../ticket-operation-types.ts');
    const { loadConfig } = await import('../config.ts');
    const { getExactSymbolSource } = await import('../change/symbol-source.ts');
    const fs = await import('node:fs');
    const path = await import('node:path');
    return withAstSnapshot(async () => {
      await ensureAstFresh(store);
      const id = store.localId(this.id);
      const current = (await store.getEntity<Ticket>(this.id, Ticket.dcr))!;
      const max = options.maxArtifacts ?? loadConfig(store.root).maxArtifacts;
      const { ArtifactTransportOptionsSchema } = await import('../artifact-policy.ts');
      ArtifactTransportOptionsSchema.pick({ completeness: true, depth: true, maxArtifacts: true }).parse(options);
      const dossier: TicketDossier = {
        ticket: { id, title: current.title ?? id, body: current.body, lane: current.lane, status: current.status, acceptanceCriteria: current.acceptanceCriteria ?? [] },
        disposition: 'ready', rationale: 'Existing acceptance and mandatory evidence define executable work.',
        evidence: [], completeness: await current.getCompletenessContext(store, options.completeness), aspects: await current.assessAspects(store),
        proposedEnrichments: { relations: [] }, provenance: { systemOne: null, reasoningUsed: false, optionalCandidates: 0, optionalSelected: 0, freshnessReconciliations: 1 }
      };
      const mandatory = new Map<string, WorkflowEntity>();
      const add = (entity: WorkflowEntity, provenance: string, required = true) => {
        if (dossier.evidence.some(e => e.id === store.localId(entity.id))) return;
        dossier.evidence.push({ id: store.localId(entity.id), kind: entity.typeName(), title: entity.title ?? store.localId(entity.id), body: (entity as WorkflowEntity & { body?: string }).body, mandatory: required, provenance });
        if (required) mandatory.set(entity.id, entity);
      };
      add(current, 'Ticket contract');
      const neighbors = [...await store.getIncoming(current.id), ...await store.getOutgoing(current.id)];
      for (const edge of neighbors) {
        const otherId = edge.sourceId === current.id ? edge.targetId : edge.sourceId;
        const entity = await store.getEntity(otherId);
        if (entity && ['contains', 'implements', 'addresses', 'targets', 'modifies', 'governs', 'blocks', 'depends_on', 'verifies'].includes(edge.predicateName)) add(entity, `Ticket ${edge.predicateName}`);
      }
      for (const item of [...mandatory.values()]) if (item instanceof UserStory) {
        for (const edge of await store.getIncoming(item.id, 'contains')) {
          const parent = await store.getEntity<Feature>(edge.sourceId, Feature.dcr); if (parent) add(parent, 'Story containing Feature');
        }
      }
      for (const item of [...mandatory.values()]) {
        if (!(item instanceof Epic || item instanceof Feature || item instanceof UserStory)) continue;
        for (const edge of await store.getIncoming(item.id)) {
          const entity = await store.getEntity(edge.sourceId);
          if (entity instanceof Decision && edge.predicateName === 'governs') add(entity, 'Scope governing Decision');
          if (entity instanceof TestNode && edge.predicateName === 'verifies') add(entity, 'Scope verification');
        }
      }
      for (const concern of dossier.aspects.aspects) {
        const aspect = await store.getEntity<Aspect>(concern.id, Aspect.dcr); if (aspect) add(aspect, 'Applicable Aspect');
        for (const evidenceId of [...concern.tests, ...concern.artifacts, ...concern.decisions]) {
          const entity = await store.getEntity(evidenceId); if (entity) add(entity, 'Aspect evidence');
        }
      }
      const codePaths = new Set<string>();
      for (const entity of mandatory.values()) {
        if (!(entity instanceof FileNode || entity instanceof SymbolNode)) continue;
        const filePath = entity instanceof SymbolNode ? entity.filePath! : store.localId(entity.id);
        codePaths.add(filePath);
        if (!fs.existsSync(path.resolve(store.root, filePath))) return { status: 'needs_input', artifactId: id, required: [{ question: `Restore or replace missing code target '${filePath}'.`, why: 'The authored code anchor no longer exists on disk.', target: 'Ticket code target relation', choices: [filePath] }] };
        const evidence = dossier.evidence.find(e => e.id === store.localId(entity.id))!;
        evidence.filePath = filePath;
        if (entity instanceof SymbolNode) {
          try {
            const name = entity.containerName ? `${entity.containerName}.${entity.title}` : entity.title!;
            const source = await getExactSymbolSource(store.root, filePath, name);
            evidence.source = source.code; evidence.exact = true;
          } catch (error) {
            return { status: 'needs_input', artifactId: id, required: [{ question: `Confirm stale symbol target '${store.localId(entity.id)}': ${String(error)}`, why: 'Exact language tooling cannot resolve the authored target.', target: 'Ticket code target relation' }] };
          }
        }
      }
      // Lessons on linked files are mandatory; optional candidates can never prune them.
      for (const lesson of await store.listEntities<Lesson>(Lesson.dcr)) {
        if (codePaths.has((lesson as Lesson & { filePath?: string }).filePath ?? '')) add(lesson, 'Lesson on authored code target');
      }
      const blockers = neighbors.filter(e => e.predicateName === 'blocks' && e.targetId === current.id);
      if (blockers.length) return { status: 'blocked', artifactId: id, blockers: blockers.map(e => ({ artifactId: store.localId(e.sourceId), reason: 'Explicit graph blocker' })) };
      const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
      const duplicate = (await store.listEntities<Ticket>(Ticket.dcr)).find(t => t.id !== current.id && same(t.title ?? '', current.title ?? '') && same(t.body, current.body) && JSON.stringify(t.acceptanceCriteria ?? []) === JSON.stringify(current.acceptanceCriteria ?? []));
      if (duplicate) {
        add(duplicate, 'Identical existing work contract'); dossier.disposition = 'rejectable'; dossier.rationale = `Equivalent work is already represented by '${store.localId(duplicate.id)}'.`;
        return { status: 'complete', artifactId: id, value: dossier };
      }
      const explicitProduct = [...mandatory.values()].some(e => e instanceof Feature || e instanceof UserStory);
      const productCandidates = explicitProduct ? [] : (await store.listEntities<Feature>(Feature.dcr)).filter(f => {
        const title = f.title?.trim().toLowerCase(); return title && title.length > 2 && `${current.title} ${current.body}`.toLowerCase().includes(title);
      }).slice(0, Math.max(2, max));
      if (productCandidates.length > 1) return { status: 'needs_input', artifactId: id, required: [{ question: 'Which Feature owns this work?', why: 'Multiple existing Features match the Ticket intent; ownership cannot be guessed.', target: 'Ticket implements Feature', choices: productCandidates.map(f => store.localId(f.id)) }] };
      if (productCandidates.length === 1) dossier.proposedEnrichments.relations.push({ sourceId: id, predicate: 'implements', targetId: store.localId(productCandidates[0].id) });
      const codeMentions = [...current.body.matchAll(/`([^`]+)`/g)].map(match => match[1]).join(' ');
      const words = new Set(`${current.title} ${codeMentions}`.match(/[A-Za-z_$][\w$]{2,}/g) ?? []);
      const optional = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).filter(s => s.filePath && /\.[cm]?[jt]sx?$/.test(s.filePath) && !s.filePath.startsWith('@') && ['class', 'function', 'method'].includes(s.kind ?? '') && words.has(s.title ?? '') && !mandatory.has(s.id)).slice(0, max);
      dossier.provenance.optionalCandidates = optional.length;
      const assessment = await (options.systemOne ?? new LayaSystemOne()).assess(
        { ticket: { title: current.title, criteria: current.acceptanceCriteria, scopes: [...mandatory.values()].map(e => ({ id: store.localId(e.id), kind: e.typeName() })) }, candidates: optional.map(s => ({ id: store.localId(s.id), name: s.title, file: s.filePath })) },
        { workKind: { type: 'choice', instructions: 'Classify the work kind.', criteria: { code: 'Source implementation/refactor', docs: 'Documentation', product: 'Intent/work structure', unknown: 'Unclear' } },
          atomicity: { type: 'choice', instructions: 'Does the acceptance define one coherent executable unit?', criteria: { atomic: 'One independently verifiable change', split: 'Several independently verifiable changes', unknown: 'Unclear' } },
          scope: { type: 'choice', instructions: 'Are authored Product/code scopes sufficient?', criteria: { grounded: 'Scopes are explicit or valid technical work', ambiguous: 'Missing ownership or target decision' } },
          context: { type: 'choice', instructions: 'Which optional context family is relevant?', criteria: { code: 'Implementation symbols', intent: 'Product meaning', none: 'Mandatory evidence is sufficient' } },
          depth: { type: 'choice', instructions: 'Is semantic reasoning necessary?', criteria: { deterministic: 'Existing contract/evidence is sufficient', reasoning: 'Unresolved meaning or contradiction' } },
          ...Object.fromEntries(optional.map(s => [store.localId(s.id), { type: 'choice' as const, instructions: `Include optional symbol ${s.title}?`, criteria: { include: 'Relevant', omit: 'Irrelevant' } }])) }).catch(() => null);
      if (assessment) dossier.provenance.systemOne = { backendId: assessment.backendId, quality: assessment.quality };
      const routes: Record<string, string[]> = { workKind: ['code', 'docs', 'product', 'unknown'], atomicity: ['atomic', 'split', 'unknown'], scope: ['grounded', 'ambiguous'], context: ['code', 'intent', 'none'], depth: ['deterministic', 'reasoning'] };
      const confident = assessment?.quality === 'high' && Object.entries(routes).every(([key, choices]) => {
        const answer = assessment.answers[key]; return answer?.choice && choices.includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8;
      }) && optional.every(s => { const answer = assessment.answers[store.localId(s.id)]; return answer?.choice && ['include', 'omit'].includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8; });
      const selected = optional.filter(s => !confident || assessment?.answers[store.localId(s.id)]?.choice !== 'omit');
      for (const candidate of selected) add(candidate, 'Bounded optional code candidate', false);
      dossier.provenance.optionalSelected = selected.length;
      const unresolved = !current.acceptanceCriteria?.length || Boolean(assessment && (!confident || assessment.answers.scope?.choice === 'ambiguous' || assessment.answers.depth?.choice === 'reasoning' || assessment.answers.atomicity?.choice === 'unknown' || (assessment.answers.workKind?.choice === 'docs' && codePaths.size > 0)));
      if (!current.acceptanceCriteria?.length || assessment?.answers.atomicity?.choice === 'split') dossier.disposition = 'needs_preparation';
      if (unresolved) {
        try {
          const reason = options.reason ?? (async (input: TicketDossier) => {
            const { createDefaultAsker } = await import('../product/decompose.ts');
            const asker = createDefaultAsker(store.root); if (!asker) throw new Error('Reasoning provider unavailable.');
            const cfg = loadConfig(store.root);
            const response = await asker.json(`Investigate this grounded Ticket dossier. Return a disposition and rationale, proposed acceptance criteria when missing, or precise required inputs. Do not mutate state or invent Product ownership. ${JSON.stringify(input)}`, InvestigationJudgmentSchema, { model: cfg.modelRoutes?.design ?? cfg.model, temperature: 0, timeoutMs: 60000 });
            if (!response.ok) throw new Error(`Investigation provider failed: ${response.failure?.kind ?? 'unknown'}: ${response.failure?.message ?? 'No validated result.'}`);
            return InvestigationJudgmentSchema.parse(response.data);
          });
          const judgment = InvestigationJudgmentSchema.parse(await reason(dossier));
          dossier.provenance.reasoningUsed = true;
          if (judgment.required?.length) return { status: 'needs_input', artifactId: id, required: judgment.required };
          dossier.disposition = judgment.disposition; dossier.rationale = judgment.rationale;
          dossier.proposedEnrichments.acceptanceCriteria = judgment.acceptanceCriteria;
          if (!current.acceptanceCriteria?.length && dossier.disposition === 'ready') dossier.disposition = 'needs_preparation';
        } catch (error) {
          return { status: 'blocked', artifactId: id, blockers: [{ reason: `Bounded investigation reasoning failed: ${String(error)}` }] };
        }
      }
      return { status: 'complete', artifactId: id, value: dossier };
    });
  }

  async prepare(store: WorkflowStore, options: PreparationOptions = {}): Promise<OperationResult<PreparedTicket>> {
    const investigation = await this.investigate(store, options);
    if (investigation.status !== 'complete') return investigation;
    const dossier = investigation.value, id = dossier.ticket.id;
    const { TicketPreparationProposalSchema } = await import('../ticket-operation-types.ts');
    const { resolveArtifactCritic, ArtifactBudget } = await import('../artifact-policy.ts');
    const { AiArtifactCritic, CriticResultSchema } = await import('../artifact-critic.ts');
    const { loadConfig } = await import('../config.ts');
    const { CausalChangeEngine } = await import('../change/engine.ts');
    const cfg = loadConfig(store.root), agentId = options.agentId ?? cfg.defaultAgentId;
    const children: Ticket[] = [];
    for (const edge of await store.getOutgoing(this.id, 'contains')) {
      const child = await store.getEntity<Ticket>(edge.targetId, Ticket.dcr); if (child) children.push(child);
    }
    const existing = children.map(child => store.localId(child.id));
    const result = (rationale: string): OperationResult<PreparedTicket> => ({ status: 'complete', artifactId: id,
      value: { dossier, children: existing, created: [], reused: existing, applied: false, criticRounds: 0, rationale } });
    if (dossier.disposition === 'rejectable') return result(dossier.rationale);
    if (dossier.ticket.acceptanceCriteria.length && children.length && children.every(child => child.acceptanceCriteria?.length)) {
      try {
        const { validateProductMutations } = await import('../product/mutation.ts');
        await validateProductMutations(store, [{ kind: 'product_update', entityType: 'Ticket', id, fields: {} }]);
        return result('Existing executable children reused.');
      } catch (error) { return { status: 'blocked', artifactId: id, blockers: [{ reason: `Existing child work is invalid: ${String(error)}` }] }; }
    }
    const enrichments = dossier.proposedEnrichments;
    if (dossier.disposition === 'ready' && !enrichments.acceptanceCriteria && !enrichments.relations.length) return result('Existing atomic contract is executable; no decomposition or enrichment needed.');
    try {
      const critic = await resolveArtifactCritic(options.critic, async criticId => new AiArtifactCritic(criticId, store.root));
      const propose = options.propose ?? (async (input: TicketDossier, findings: readonly import('../artifact-policy.ts').CriticFinding[]) => {
        const { createDefaultAsker } = await import('../product/decompose.ts');
        const asker = createDefaultAsker(store.root); if (!asker) throw new Error('Preparation reasoning provider unavailable.');
        const proposal = await asker.json(`Make this Ticket executable. Preserve an atomic unit unless independently verifiable boundaries genuinely justify children. Never create a Story for technical work. Use ordinary Ticket children with stable IDs prefixed '${id}/', meaningful bodies and acceptance criteria, relevant relations to known IDs, and dependencies only for real ordering. Reuse existing work. Do not add ceremony, downgrade completeness or mutate state. Return no children if atomic. Dossier: ${JSON.stringify(input)} Existing children: ${JSON.stringify(children.map(child => ({ id: store.localId(child.id), title: child.title, body: child.body, acceptanceCriteria: child.acceptanceCriteria })))} Critic findings: ${JSON.stringify(findings)}`, TicketPreparationProposalSchema, { model: cfg.modelRoutes?.design ?? cfg.model, temperature: 0, timeoutMs: 60000 });
        if (!proposal.ok) throw new Error(`Preparation provider failed: ${proposal.failure?.kind ?? 'unknown'}: ${proposal.failure?.message ?? 'No validated result.'}`);
        return TicketPreparationProposalSchema.parse(proposal.data);
      });
      let findings: import('../artifact-policy.ts').CriticFinding[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const proposal = TicketPreparationProposalSchema.parse(await propose(dossier, findings));
        const budget = new ArtifactBudget(options, 1, cfg.maxArtifacts); budget.visit(id, 0);
        for (const child of proposal.children) if (!budget.visit(child.id, 1)) return { status: 'needs_input', artifactId: id, required: [{ question: `Allow expansion for child '${child.id}'?`, why: 'The proposed coherent batch exceeds depth/maxArtifacts.', target: 'Operation depth/maxArtifacts' }] };
        const mutations: import('../product/mutation.ts').ProductMutation[] = [];
        const criteria = proposal.acceptanceCriteria ?? enrichments.acceptanceCriteria;
        if (!(criteria ?? dossier.ticket.acceptanceCriteria).length) throw new Error('Preparation requires an explicit parent acceptance contract.');
        if (criteria && JSON.stringify(criteria) !== JSON.stringify(dossier.ticket.acceptanceCriteria)) mutations.push({ kind: 'product_update', entityType: 'Ticket', id, fields: { acceptanceCriteria: criteria } });
        for (const relation of enrichments.relations) mutations.push({ kind: 'product_link', ...relation });
        const allTickets = await store.listEntities<Ticket>(Ticket.dcr), identities = new Map<string, string>(), contracts = new Set<string>(), created: string[] = [], reused: string[] = [];
        for (const child of proposal.children) {
          if (identities.has(child.id)) throw new Error(`Duplicate child ID '${child.id}'.`);
          const contract = JSON.stringify([child.title.trim().toLowerCase(), child.body.trim(), child.acceptanceCriteria]);
          if (contracts.has(contract)) throw new Error('Duplicate child acceptance contract.'); contracts.add(contract);
          const match = allTickets.find(ticket => ticket.id !== this.id && JSON.stringify([(ticket.title ?? '').trim().toLowerCase(), ticket.body.trim(), ticket.acceptanceCriteria ?? []]) === contract);
          const childId = match ? store.localId(match.id) : child.id;
          if (!match && await store.getEntity(childId)) throw new Error(`Child ID '${childId}' already names different work.`);
          identities.set(child.id, childId);
          if (match) reused.push(childId);
          else { created.push(childId); mutations.push({ kind: 'product_create', entityType: 'Ticket', id: childId, fields: { title: child.title, body: child.body, acceptanceCriteria: child.acceptanceCriteria, lane: 'Backlog' } }); }
          mutations.push({ kind: 'product_link', sourceId: id, predicate: 'contains', targetId: childId });
          for (const relation of child.relations) mutations.push({ kind: 'product_link', sourceId: childId, ...relation });
        }
        for (const child of proposal.children) for (const prerequisite of child.dependsOn) mutations.push({ kind: 'product_link', sourceId: identities.get(child.id)!, predicate: 'depends_on', targetId: identities.get(prerequisite) ?? prerequisite });
        if (!mutations.length) return result(proposal.rationale);
        if (critic) {
          // Serialize detached data; a Critic never receives live entities or producer history.
          const input = JSON.parse(JSON.stringify({ artifactId: id, intent: dossier.ticket.body, neighborhood: dossier.evidence,
            proposal: mutations, applicableAspects: dossier.aspects.aspects.map(aspect => aspect.id), candidateAspects: [],
            completeness: dossier.completeness.criticStrength, depth: options.depth === 'all' ? 1 : options.depth ?? 1,
            acceptanceCriteria: dossier.ticket.acceptanceCriteria, evidence: dossier.evidence.filter(item => ['Test', 'Artifact'].includes(item.kind)).map(item => item.id) }));
          const review = CriticResultSchema.parse(await critic.review(input));
          if (review.verdict === 'needs_input') return { status: 'needs_input', artifactId: id, required: review.required.map(required => ({ ...required, why: 'Independent Critic requires a semantic decision.', target: 'Ticket preparation contract' })) };
          if (review.verdict === 'reject') return { status: 'blocked', artifactId: id, blockers: review.findings.map(finding => ({ reason: finding.message, artifactId: finding.artifactId })) };
          if (review.verdict === 'revise') { findings = review.findings; continue; }
        }
        const engine = new CausalChangeEngine({ store, projectRoot: store.root });
        const request = { action: 'product_change' as const, mutations };
        const validated = await engine.previewChange(request);
        if (validated.blocked) return { status: 'blocked', artifactId: id, blockers: [{ reason: `Preparation validation failed: ${validated.blockReason}` }] };
        const current = (await store.getEntity<Ticket>(this.id, Ticket.dcr))!;
        if (current.body !== dossier.ticket.body || current.title !== dossier.ticket.title || JSON.stringify(current.acceptanceCriteria ?? []) !== JSON.stringify(dossier.ticket.acceptanceCriteria)) return { status: 'needs_input', artifactId: id, required: [{ question: 'Review the changed Ticket contract and retry preparation.', why: 'The contract changed during proposal review.', target: 'Ticket body/acceptanceCriteria' }] };
        const held = current.claim && new Date(current.claim.expiresAt).getTime() > Date.now();
        if (held && current.claim!.agentId !== agentId) return { status: 'blocked', artifactId: id, blockers: [{ reason: `Ticket is leased by '${current.claim!.agentId}'.` }] };
        let acquired = false;
        try {
          if (!held) { const lease = await store.claimTicket(id, agentId, cfg.defaultLeaseMinutes, false); if (!lease.success) return { status: 'blocked', artifactId: id, blockers: [{ reason: lease.message ?? 'Ticket lease unavailable.' }] }; acquired = true; }
          // Claim changed the durable fingerprint, so preview again under the lease.
          const preview = await engine.previewChange(request);
          if (preview.blocked) throw new Error(`Preparation changed before apply: ${preview.blockReason}`);
          const applied = await engine.applyChange(request, preview.fingerprint);
          if (!applied.ok || !applied.verification.passed) throw new Error(`Preparation apply verification failed: ${JSON.stringify(applied.verification)}`);
          if (held) { const { exportProjections } = await import('./projections.ts'); await exportProjections(store); }
          return { status: 'complete', artifactId: id, value: { dossier, children: [...new Set([...existing, ...identities.values()])], created, reused, applied: true, criticRounds: critic ? attempt + 1 : 0, rationale: proposal.rationale } };
        } finally { if (acquired) { await store.releaseTicket(id); const { exportProjections } = await import('./projections.ts'); await exportProjections(store); } }
      }
      return { status: 'blocked', artifactId: id, blockers: findings.map(finding => ({ reason: `Critic revision limit: ${finding.message}`, artifactId: finding.artifactId })) };
    } catch (error) { return { status: 'blocked', artifactId: id, blockers: [{ reason: `Ticket preparation failed: ${String(error)}` }] }; }
  }

  static template = {
    ...baseTemplate,
    acceptanceCriteria: anyValidator,
    lane: { validate: (v: any) => ({ value: v ?? 'Backlog' }) },
    priority: { validate: (v: any) => ({ value: v ?? 'P2' }) },
    claim: anyValidator,
    estimateTokens: anyValidator
  };
  static readonly dcr = new EntityDcr(Ticket, Ticket.template, 'Ticket');
}

export class ModuleNode extends WorkflowEntity {
  applicableAspects(store: WorkflowStore) { return applicableAspects(this, store); }
  assessAspects(store: WorkflowStore) { return assessAspects(this, store); }
  reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) { return reviewMissingAspects(this, store, options); }
  declare completenessTarget?: CompletenessLevel | null;
  getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) { return scopeTarget(this, store, options); }
  async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
    return store.upsertEntity(ModuleNode.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) });
  }
  static template = {
    ...baseTemplate,
    completenessTarget: completenessValidator,
    path: anyValidator
  };
  static readonly dcr = new EntityDcr(ModuleNode, ModuleNode.template, 'ModuleNode');
}

export class FileNode extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    path: anyValidator,
    language: anyValidator,
    fileKind: anyValidator,
    size: anyValidator,
    hash: anyValidator,
    mtime: anyValidator
  };
  static readonly dcr = new EntityDcr(FileNode, FileNode.template, 'FileNode');
}

export class SymbolNode extends WorkflowEntity {
  declare title?: string;
  body?: string;
  status?: string;
  filePath?: string;
  kind?: string;
  exported?: boolean;
  line?: number;
  column?: number;
  signature?: string;
  containerName?: string;

  static template = {
    ...baseTemplate,
    filePath: anyValidator,
    kind: anyValidator,
    exported: { validate: (v: any) => ({ value: Boolean(v) }) },
    line: { validate: (v: any) => ({ value: Number(v) || 1 }) },
    column: { validate: (v: any) => ({ value: Number(v) || 0 }) },
    signature: anyValidator,
    containerName: anyValidator
  };
  static readonly dcr = new EntityDcr(SymbolNode, SymbolNode.template, 'SymbolNode');
}

export class TestNode extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    targetPath: anyValidator,
    framework: anyValidator,
    lastRun: anyValidator,
    passed: anyValidator
  };
  static readonly dcr = new EntityDcr(TestNode, TestNode.template, 'TestNode');
}

export class Decision extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    decision: anyValidator,
    context: anyValidator,
    consequences: anyValidator
  };
  static readonly dcr = new EntityDcr(Decision, Decision.template, 'Decision');
}

export class Lesson extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    ticketId: anyValidator,
    filePath: anyValidator,
    noteType: { validate: (v: any) => ({ value: v ?? 'LESSON' }) },
    preventionPattern: anyValidator
  };
  static readonly dcr = new EntityDcr(Lesson, Lesson.template, 'Lesson');
}

export class Artifact extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    action: anyValidator,
    output: anyValidator,
    patchPath: anyValidator,
    reportUrl: anyValidator
  };
  static readonly dcr = new EntityDcr(Artifact, Artifact.template, 'Artifact');
}

// -----------------------------------------------------------------------------
// Ephemeral In-Memory Entities (aiwf-ephemeral)
// -----------------------------------------------------------------------------

export class CallSite extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    callerFile: anyValidator,
    calleeName: anyValidator,
    line: anyValidator,
    column: anyValidator
  };
  static readonly dcr = new EntityDcr(CallSite, CallSite.template, 'CallSite');
}

export class TraceNode extends WorkflowEntity {
  static template = {
    ...baseTemplate,
    traceId: anyValidator,
    step: anyValidator,
    input: anyValidator,
    output: anyValidator,
    durationMs: anyValidator
  };
  static readonly dcr = new EntityDcr(TraceNode, TraceNode.template, 'TraceNode');
}

// Aliases for compatibility
export {
  Idea as IdeaEntity,
  Epic as EpicEntity,
  Feature as FeatureEntity,
  UserStory as UserStoryEntity,
  Ticket as TicketEntity,
  ModuleNode as ModuleEntity,
  FileNode as FileEntity,
  SymbolNode as SymbolEntity,
  TestNode as TestEntity,
  Decision as DecisionEntity,
  Lesson as LessonEntity,
  Artifact as ArtifactEntity
};

export const durableEntityDescriptors = [
  Aspect.dcr,
  Idea.dcr,
  Epic.dcr,
  Feature.dcr,
  UserStory.dcr,
  Ticket.dcr,
  ModuleNode.dcr,
  FileNode.dcr,
  SymbolNode.dcr,
  TestNode.dcr,
  Decision.dcr,
  Lesson.dcr,
  Artifact.dcr
];

export const ephemeralEntityDescriptors = [
  CallSite.dcr,
  TraceNode.dcr
];

export const entityDescriptors = [
  ...durableEntityDescriptors,
  ...ephemeralEntityDescriptors
];

for (const dcr of entityDescriptors) {
  dcr.collectionName = dcr.name;
}

// Predicate payload schema
export const predicatePayloadTemplate = {
  confidence: anyValidator,
  state: anyValidator,
  weight: anyValidator,
  note: anyValidator,
  sourceRange: anyValidator,
  timestamp: anyValidator
};

export const semanticPredicates = {
  applies_to: new PredicateDcr('applies_to', [], { target: ['title'] }, predicatePayloadTemplate),
  contains: new PredicateDcr('contains', [], { target: ['title'] }, predicatePayloadTemplate),
  calls: new PredicateDcr('calls', [], { target: ['title'] }, predicatePayloadTemplate),
  inherits: new PredicateDcr('inherits', [], { target: ['title'] }, predicatePayloadTemplate),
  depends_on: new PredicateDcr('depends_on', [], { target: ['title'] }, predicatePayloadTemplate),
  imports: new PredicateDcr('imports', [], { target: ['title'] }, predicatePayloadTemplate),
  implements: new PredicateDcr('implements', [], { target: ['title'] }, predicatePayloadTemplate),
  addresses: new PredicateDcr('addresses', [], { target: ['title'] }, predicatePayloadTemplate),
  modifies: new PredicateDcr('modifies', [], { target: ['title'] }, predicatePayloadTemplate),
  targets: new PredicateDcr('targets', [], { target: ['title'] }, predicatePayloadTemplate),
  verifies: new PredicateDcr('verifies', [], { target: ['title'] }, predicatePayloadTemplate),
  fuzzy_relates: new PredicateDcr('fuzzy_relates', [], { target: ['title'] }, predicatePayloadTemplate),
  potentially_affects: new PredicateDcr('potentially_affects', [], { target: ['title'] }, predicatePayloadTemplate),
  governs: new PredicateDcr('governs', [], { target: ['title'] }, predicatePayloadTemplate),
  blocks: new PredicateDcr('blocks', [], { target: ['title'] }, predicatePayloadTemplate),
  inspires: new PredicateDcr('inspires', [], { target: ['title'] }, predicatePayloadTemplate),
  generates: new PredicateDcr('generates', [], { target: ['title'] }, predicatePayloadTemplate),
  trace_links: new PredicateDcr('trace_links', [], { target: ['title'] }, predicatePayloadTemplate)
};

export const predicateDescriptors = Object.values(semanticPredicates);

export const durableOntology = new RawOntology(durableEntityDescriptors, predicateDescriptors);
export const ephemeralOntology = new RawOntology(ephemeralEntityDescriptors, predicateDescriptors);
export const graphOntology = new RawOntology(entityDescriptors, predicateDescriptors);
