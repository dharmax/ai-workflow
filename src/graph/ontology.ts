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

import type { InvestigationOptions, TicketDossier, OperationResult, PreparationOptions, PreparedTicket, ResolutionOptions, ResolvedTicket, ResolutionVerificationInput } from '../ticket-operation-types.ts';
import { withArtifactMetrics, cognitionMetrics, countEngineering, visitMetricArtifact, recordMetricCompleteness } from '../performance-metrics.ts';
import type { ProcessOptions, ProcessedIntent, IntentContext } from '../product/process-types.ts';

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

  /** Shared concrete reconciliation for the three Product Intent entities; no workflow state is persisted. */
  static async processIntent(root: Epic | Feature | UserStory, store: WorkflowStore, options: ProcessOptions): Promise<OperationResult<ProcessedIntent>> {
    const rootId = store.localId(root.id);
    return withArtifactMetrics(store.root, `process_${root instanceof UserStory ? 'story' : root instanceof Feature ? 'feature' : 'epic'}`, rootId, options, async () => {
      const { IntentProposalSchema } = await import('../product/process-types.ts');
      const { ArtifactBudget, resolveArtifactCritic } = await import('../artifact-policy.ts');
      const { AiArtifactCritic, CriticResultSchema } = await import('../artifact-critic.ts');
      const { loadConfig } = await import('../config.ts');
      const { getCoverage } = await import('../product/coverage.ts');
      const { getProductImpact } = await import('../product/impact.ts');
      const { CausalChangeEngine } = await import('../change/engine.ts');
      const { createDefaultAsker } = await import('../product/decompose.ts');
      const { LayaSystemOne } = await import('@dharmax/llm-utils');
      const cfg = loadConfig(store.root), budget = new ArtifactBudget(options, 1, cfg.maxArtifacts);
      const created = new Set<string>(), reused = new Set<string>(), processed: string[] = [], knownGaps: string[] = [];
      const queue: Array<{ entity: Epic | Feature | UserStory; depth: number; inherited?: CompletenessLevel }> = [{ entity: root, depth: 0 }];
      const seen = new Set<string>(), rootTarget = (await scopeTarget(root, store, { override: options.completeness })).effective;
      const critic = await resolveArtifactCritic(options.critic, async id => new AiArtifactCritic(id, store.root));
      const reviewInputs: import('../artifact-policy.ts').CriticInput[] = [];
      try {
        while (queue.length) {
          const { entity, depth, inherited } = queue.shift()!, id = store.localId(entity.id);
          if (seen.has(id)) continue;
          if (!budget.visit(id, depth)) continue;
          seen.add(id); visitMetricArtifact(id);
          const completeness = (await scopeTarget(entity, store, { override: depth === 0 ? options.completeness : undefined, inherited, descendant: depth > 0 })).effective;
          const kind = entity instanceof Epic ? 'Epic' : entity instanceof Feature ? 'Feature' : 'UserStory';
          const fields = entity as WorkflowEntity & { body?: string; story?: string; acceptanceCriteria?: string[]; status?: string };
          if (!entity.title?.trim() || !(fields.body?.trim() || fields.story?.trim() || fields.acceptanceCriteria?.length)) return { status: 'needs_input', artifactId: rootId, required: [{ question: `Author observable scope or acceptance for '${id}'.`, why: 'A title alone cannot determine useful work.', target: `${kind} intent` }] };
          const all: Array<Feature | UserStory | Ticket> = [];
          for (const ctor of [Feature, UserStory, Ticket]) all.push(...await store.listEntities(ctor.dcr) as Array<Feature | UserStory | Ticket>);
          const edges = [...await store.getOutgoing(entity.id), ...await store.getIncoming(entity.id)];
          const linked = new Set(edges.map(edge => edge.sourceId === entity.id ? edge.targetId : edge.sourceId));
          const optional = all.filter(item => !linked.has(item.id) && item.id !== entity.id).slice(0, cfg.maxArtifacts);
          const aspects = await applicableAspects(entity, store);
          const candidates = (await store.listEntities<Aspect>(Aspect.dcr)).filter(a => !aspects.some(existing => existing.id === a.id) && a.status !== 'deprecated').slice(0, cfg.maxArtifacts);
          const assessment = await (options.systemOne ?? new LayaSystemOne()).assess({ kind, title: entity.title, completeness, candidates: optional.map(item => ({ id: store.localId(item.id), title: item.title })), aspects: candidates.map(a => ({ id: store.localId(a.id), title: a.title })) },
            Object.fromEntries([...optional, ...candidates].map(item => [store.localId(item.id), { type: 'choice' as const, instructions: 'Keep material reuse/Aspect candidates; omit only clearly irrelevant candidates.', criteria: { keep: 'Relevant or uncertain', omit: 'Clearly irrelevant' } }])), cognitionMetrics()).catch(() => null);
          countEngineering('systemOneCalls'); countEngineering('optionalCandidates', optional.length + candidates.length);
          const keep = (item: WorkflowEntity) => !(assessment?.quality === 'high' && assessment.answers[store.localId(item.id)]?.choice === 'omit' && (typeof assessment.answers[store.localId(item.id)]?.prob === 'number' && Number(assessment.answers[store.localId(item.id)]?.prob) >= .8));
          const selected = [...all.filter(item => linked.has(item.id)), ...optional.filter(keep)];
          countEngineering('optionalSelected', optional.filter(keep).length + candidates.filter(keep).length);
          const context: IntentContext = { id, kind, title: entity.title!, body: fields.body || fields.story || '', acceptanceCriteria: fields.acceptanceCriteria ?? [], completeness, depth,
            existing: selected.map(item => ({ id: store.localId(item.id), kind: item.typeName(), title: item.title,
              ...((item as Ticket).acceptanceCriteria?.length ? { acceptanceCriteria: (item as Ticket).acceptanceCriteria } : { body: (item as Ticket).body }),
              status: (item as Ticket).status, lane: (item as Ticket).lane, linked: linked.has(item.id) })),
            applicableAspects: aspects.map(a => store.localId(a.id)), candidateAspects: candidates.filter(keep).map(a => ({ id: store.localId(a.id), title: a.title!, criteria: a.acceptanceCriteria ?? [] })),
            coverage: await getCoverage(store, id), impact: await getProductImpact(store, id), aspectAssessment: await assessAspects(entity, store, aspects) };
          // Verification and governing evidence is mandatory, never System-1 optional pruning.
          const evidence = new Map<string, Record<string, unknown>>();
          for (const subject of [entity, ...all.filter(item => linked.has(item.id))]) {
            for (const edge of await store.getIncoming(subject.id)) {
              if (!['verifies', 'governs'].includes(edge.predicateName)) continue;
              const record = await store.getEntity<WorkflowEntity>(edge.sourceId);
              if (!(record instanceof TestNode || record instanceof Artifact || record instanceof Decision)) continue;
              const data = record as WorkflowEntity & { body?: string; filePath?: string; status?: string };
              evidence.set(store.localId(record.id), { id: store.localId(record.id), kind: record.typeName(), title: record.title, body: data.body, filePath: data.filePath, status: data.status, verifies: store.localId(subject.id) });
            }
          }
          context.existing.push(...evidence.values());
          const propose = options.propose ?? (async (input: IntentContext, findings: readonly { message: string }[]) => {
            const asker = createDefaultAsker(store.root); if (!asker) throw new Error('Product reasoning provider unavailable.'); countEngineering('reasoningCalls');
            const response = await asker.json(`Reconcile Product Intent into ONLY necessary next-layer work for current kind '${kind}'. Permitted child kinds: Epic -> Feature or Ticket; Feature -> UserStory or Ticket; UserStory -> Ticket ONLY (never UserStory). Reuse stable existing Features/Stories/Tickets, including work outside this root. Never manufacture Stories for technical work, duplicate work, expand completed work, delete valid work, or add counts to satisfy completeness. Raising completeness adds only real missing contracts/work. Each proposed item must have executable acceptance. Return existing IDs to reuse. aspectIds names existing materially missing Aspects to apply to this scope, never invented IDs. gaps lists actual unresolved semantic concerns, required asks only genuine ambiguities. depth=0 is review only: describe gaps, propose no expansion. This is a read-only proposal; an independent Critic reviews it. Context: ${JSON.stringify(input)} Findings: ${JSON.stringify(findings)}`, IntentProposalSchema, { model: cfg.modelRoutes?.design ?? cfg.model, temperature: 0, timeoutMs: 60000, ...cognitionMetrics() });
            if (!response.ok) throw new Error(`Product proposal failed: ${response.failure?.message}`); return IntentProposalSchema.parse(response.data);
          });
          let accepted = false, findings: Array<{ message: string }> = [];
          for (let attempt = 0; attempt < 3; attempt++) {
            const beforeProposal = new Set(budget.visited);
            const proposal = IntentProposalSchema.parse(await propose(context, findings));
            if (proposal.required.length) return { status: 'needs_input', artifactId: rootId, required: proposal.required };
            const mutations: import('../product/mutation.ts').ProductMutation[] = [], childIds: string[] = [], batchCreated: string[] = [], batchReused: string[] = [];
            const batchTitles = new Set<string>();
            for (const item of proposal.items) {
              if (kind === 'UserStory' && item.kind !== 'Ticket' || kind === 'Feature' && item.kind === 'Feature') throw new Error(`Invalid next layer: ${kind} → ${item.kind}.`);
              const identity = `${item.kind}:${item.title.trim().toLowerCase()}`;
              if (batchTitles.has(identity)) throw new Error(`Duplicate intent/work contract '${item.title}'.`); batchTitles.add(identity);
              const sameId = await store.getEntity<WorkflowEntity>(item.id);
              const matches = all.filter(existing => existing.typeName() === item.kind && existing.title?.trim().toLowerCase() === item.title.trim().toLowerCase());
              if (matches.length > 1 || sameId && (sameId.typeName() !== item.kind || sameId.title?.trim().toLowerCase() !== item.title.trim().toLowerCase())) return { status: 'needs_input', artifactId: rootId, required: [{ question: `Choose the existing identity for '${item.title}'.`, why: 'The proposed identity collides with different or ambiguous intent.', target: item.id }] };
              const match = sameId ?? matches[0], childId = match ? store.localId(match.id) : item.id;
              if (!budget.visit(childId, depth + 1)) { knownGaps.push(`Expansion budget stopped '${childId}'.`); continue; }
              childIds.push(childId);
              if (match) batchReused.push(childId);
              else {
                batchCreated.push(childId);
                const criteria = item.acceptanceCriteria?.length ? item.acceptanceCriteria : [item.title];
                mutations.push({ kind: 'product_create', entityType: item.kind, id: childId, fields: item.kind === 'UserStory' ? { title: item.title, actor: item.actor ?? 'Caller', story: item.story ?? item.body, acceptanceCriteria: criteria, status: 'proposed' } : { title: item.title, body: item.body, acceptanceCriteria: criteria, ...(item.kind === 'Ticket' ? { lane: 'Backlog' as const } : { status: 'proposed' }) } });
              }
              const link = item.kind === 'Ticket' && kind !== 'Epic' ? { sourceId: childId, predicate: kind === 'Feature' ? 'implements' : 'addresses', targetId: id } : { sourceId: id, predicate: kind === 'Epic' && item.kind !== 'Ticket' ? 'targets' : 'contains', targetId: childId };
              if (!(await store.getOutgoing(link.sourceId, link.predicate)).some(edge => store.localId(edge.targetId) === link.targetId)) mutations.push({ kind: 'product_link', ...link });
            }
            for (const aspectId of proposal.aspectIds) {
              if (aspects.some(a => store.localId(a.id) === aspectId)) continue;
              if (!candidates.some(a => store.localId(a.id) === aspectId)) throw new Error(`Unreviewed/unknown candidate Aspect '${aspectId}'.`);
              mutations.push({ kind: 'product_link', sourceId: aspectId, predicate: 'applies_to', targetId: id });
            }
            const reviewInput = { artifactId: id, intent: context.body, neighborhood: [...context.existing, ...context.candidateAspects], proposal: mutations,
              applicableAspects: context.applicableAspects, candidateAspects: context.candidateAspects.map(a => a.id), completeness, depth,
              acceptanceCriteria: context.acceptanceCriteria, evidence: [JSON.stringify(context.coverage), JSON.stringify(context.aspectAssessment)] };
            if (critic) {
              countEngineering('criticRounds'); const review = CriticResultSchema.parse(await critic.review(reviewInput));
              if (review.verdict === 'needs_input') return { status: 'needs_input', artifactId: rootId, required: review.required.map(item => ({ ...item, why: 'Independent Product Critic needs a semantic decision.', target: id })) };
              if (review.verdict === 'reject') return { status: 'blocked', artifactId: rootId, blockers: review.findings.map(item => ({ reason: item.message })) };
              if (review.verdict === 'revise') {
                for (const candidate of budget.visited) if (!beforeProposal.has(candidate)) budget.visited.delete(candidate);
                countEngineering('criticRevisions'); findings = review.findings; continue;
              }
            }
            if (mutations.length) {
              const engine = new CausalChangeEngine({ store, projectRoot: store.root }), request = { action: 'product_change' as const, mutations };
              const preview = await engine.previewChange(request); if (preview.blocked) throw new Error(preview.blockReason);
              const result = await engine.applyChange(request, preview.fingerprint); if (!result.ok || !result.verification.passed) throw new Error('Product batch verification failed.');
            }
            batchCreated.forEach(child => created.add(child)); batchReused.forEach(child => reused.add(child));
            countEngineering('artifactsCreated', batchCreated.length); countEngineering('artifactsReused', batchReused.length);
            knownGaps.push(...proposal.gaps); reviewInputs.push(reviewInput); processed.push(id); accepted = true;
            const outgoing = await store.getOutgoing(entity.id), incoming = await store.getIncoming(entity.id);
            const descendants = [...childIds, ...outgoing.filter(e => ['targets', 'contains'].includes(e.predicateName)).map(e => store.localId(e.targetId)), ...incoming.filter(e => e.predicateName === (kind === 'Feature' ? 'implements' : 'addresses')).map(e => store.localId(e.sourceId))];
            for (const childId of new Set(descendants)) {
              const child = await store.getEntity(childId);
              if (!child || !(child instanceof Feature || child instanceof UserStory || child instanceof Ticket)) continue;
              if (!budget.visit(childId, depth + 1)) continue;
              if (child instanceof Ticket) { if (child.lane !== 'Done' || child.status !== 'verified') budget.remaining.add(childId); }
              else if (budget.depth === 'all' || depth + 1 < budget.depth) queue.push({ entity: child, depth: depth + 1, inherited: completeness });
              else { budget.stoppedAtDepth = true; budget.remaining.add(childId); }
            }
            break;
          }
          if (!accepted) return { status: 'blocked', artifactId: rootId, blockers: findings.map(item => ({ reason: `Product Critic revision exhausted: ${item.message}` })) };
        }
        if (critic && ['advanced', 'production'].includes(rootTarget) && (budget.depth === 'all' || budget.depth > 1)) {
          countEngineering('criticRounds');
          const final = CriticResultSchema.parse(await critic.review({ artifactId: rootId, intent: (root as WorkflowEntity & { body?: string }).body ?? root.title!, neighborhood: reviewInputs.map(input => ({ ...input })), proposal: [], applicableAspects: (await applicableAspects(root, store)).map(a => store.localId(a.id)), candidateAspects: [], completeness: rootTarget, depth: 0, acceptanceCriteria: (root as WorkflowEntity & { acceptanceCriteria?: string[] }).acceptanceCriteria ?? [], evidence: [JSON.stringify(await getCoverage(store, rootId)), JSON.stringify(await assessAspects(root, store))] }));
          if (final.verdict !== 'accept') return final.verdict === 'needs_input' ? { status: 'needs_input', artifactId: rootId, required: final.required.map(item => ({ ...item, why: 'Final cross-layer review requires input.', target: rootId })) } : { status: 'blocked', artifactId: rootId, blockers: final.findings.map(item => ({ reason: `Final cross-layer review: ${item.message}` })) };
        }
        return { status: 'complete', artifactId: rootId, value: { created: [...created], reused: [...reused], processed, remaining: [...budget.remaining], stoppedAtDepth: budget.stoppedAtDepth, stoppedAtMaxArtifacts: budget.stoppedAtMaxArtifacts, artifactComplete: !knownGaps.length && !budget.remaining.size, knownGaps, coverage: await getCoverage(store, rootId), impact: await getProductImpact(store, rootId), aspectAssessment: await assessAspects(root, store) } };
      } catch (error) { return { status: 'blocked', artifactId: rootId, blockers: [{ reason: `Product processing failed: ${String(error)}` }] }; }
      finally { const { exportProjections } = await import('./projections.ts'); await exportProjections(store); }
    });
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
  process(store: WorkflowStore, options: ProcessOptions = {}) { return WorkflowEntity.processIntent(this, store, options); }
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
  process(store: WorkflowStore, options: ProcessOptions = {}) { return WorkflowEntity.processIntent(this, store, options); }
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
  process(store: WorkflowStore, options: ProcessOptions = {}) { return WorkflowEntity.processIntent(this, store, options); }
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
    return withArtifactMetrics(store.root, 'investigate_ticket', store.localId(this.id), options, () => withAstSnapshot(async () => {
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
      recordMetricCompleteness(dossier.completeness);
      const add = (entity: WorkflowEntity, provenance: string, required = true) => {
        if (dossier.evidence.some(e => e.id === store.localId(entity.id))) return;
        if (['Ticket', 'Epic', 'Feature', 'UserStory', 'Module', 'Idea', 'Artifact'].includes(entity.typeName())) visitMetricArtifact(store.localId(entity.id));
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
            countEngineering('sourceReads'); countEngineering('exactSymbolReads');
            evidence.source = source.code; evidence.exact = true; evidence.symbolKind = source.kind;
            evidence.symbolName = entity.title; evidence.containerName = entity.containerName;
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
      countEngineering('optionalCandidates', optional.length); countEngineering('systemOneCalls');
      const assessment = await (options.systemOne ?? new LayaSystemOne()).assess(
        { ticket: { title: current.title, criteria: current.acceptanceCriteria, scopes: [...mandatory.values()].map(e => ({ id: store.localId(e.id), kind: e.typeName() })) }, candidates: optional.map(s => ({ id: store.localId(s.id), name: s.title, file: s.filePath })) },
        { workKind: { type: 'choice', instructions: 'Classify the work kind.', criteria: { code: 'Source implementation/refactor', docs: 'Documentation', product: 'Intent/work structure', unknown: 'Unclear' } },
          atomicity: { type: 'choice', instructions: 'Does the acceptance define one coherent executable unit?', criteria: { atomic: 'One independently verifiable change', split: 'Several independently verifiable changes', unknown: 'Unclear' } },
          scope: { type: 'choice', instructions: 'Are authored Product/code scopes sufficient?', criteria: { grounded: 'Scopes are explicit or valid technical work', ambiguous: 'Missing ownership or target decision' } },
          context: { type: 'choice', instructions: 'Which optional context family is relevant?', criteria: { code: 'Implementation symbols', intent: 'Product meaning', none: 'Mandatory evidence is sufficient' } },
          depth: { type: 'choice', instructions: 'Is semantic reasoning necessary?', criteria: { deterministic: 'Existing contract/evidence is sufficient', reasoning: 'Unresolved meaning or contradiction' } },
          ...Object.fromEntries(optional.map(s => [store.localId(s.id), { type: 'choice' as const, instructions: `Include optional symbol ${s.title}?`, criteria: { include: 'Relevant', omit: 'Irrelevant' } }])) }, cognitionMetrics()).catch(() => null);
      if (assessment) dossier.provenance.systemOne = { backendId: assessment.backendId, quality: assessment.quality };
      const routes: Record<string, string[]> = { workKind: ['code', 'docs', 'product', 'unknown'], atomicity: ['atomic', 'split', 'unknown'], scope: ['grounded', 'ambiguous'], context: ['code', 'intent', 'none'], depth: ['deterministic', 'reasoning'] };
      const confident = assessment?.quality === 'high' && Object.entries(routes).every(([key, choices]) => {
        const answer = assessment.answers[key]; return answer?.choice && choices.includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8;
      }) && optional.every(s => { const answer = assessment.answers[store.localId(s.id)]; return answer?.choice && ['include', 'omit'].includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8; });
      const selected = optional.filter(s => !confident || assessment?.answers[store.localId(s.id)]?.choice !== 'omit');
      for (const candidate of selected) add(candidate, 'Bounded optional code candidate', false);
      dossier.provenance.optionalSelected = selected.length;
      countEngineering('optionalSelected', selected.length);
      const unresolved = !current.acceptanceCriteria?.length || Boolean(assessment && (!confident || assessment.answers.scope?.choice === 'ambiguous' || assessment.answers.depth?.choice === 'reasoning' || assessment.answers.atomicity?.choice === 'unknown' || (assessment.answers.workKind?.choice === 'docs' && codePaths.size > 0)));
      if (!current.acceptanceCriteria?.length || assessment?.answers.atomicity?.choice === 'split') dossier.disposition = 'needs_preparation';
      if (unresolved) {
        try {
          const reason = options.reason ?? (async (input: TicketDossier) => {
            const { createDefaultAsker } = await import('../product/decompose.ts');
            const asker = createDefaultAsker(store.root); if (!asker) throw new Error('Reasoning provider unavailable.');
            const cfg = loadConfig(store.root);
            const response = await asker.json(`Investigate this grounded Ticket dossier. Return a disposition and rationale, proposed acceptance criteria when missing, or precise required inputs. Do not mutate state or invent Product ownership. ${JSON.stringify(input)}`, InvestigationJudgmentSchema, { model: cfg.modelRoutes?.design ?? cfg.model, temperature: 0, timeoutMs: 60000, ...cognitionMetrics() });
            if (!response.ok) throw new Error(`Investigation provider failed: ${response.failure?.kind ?? 'unknown'}: ${response.failure?.message ?? 'No validated result.'}`);
            return InvestigationJudgmentSchema.parse(response.data);
          });
          countEngineering('reasoningCalls');
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
    }));
  }

  async prepare(store: WorkflowStore, options: PreparationOptions = {}): Promise<OperationResult<PreparedTicket>> {
    return withArtifactMetrics(store.root, 'prepare_ticket', store.localId(this.id), options, async () => {
    const investigation = await this.investigate(store, options);
    if (investigation.status !== 'complete') return investigation;
    const dossier = investigation.value, id = dossier.ticket.id;
    recordMetricCompleteness(dossier.completeness);
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
        countEngineering('artifactsReused', existing.length);
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
        countEngineering('reasoningCalls');
        const proposal = await asker.json(`Make this Ticket executable. Preserve an atomic unit unless independently verifiable boundaries genuinely justify children. Never create a Story for technical work. Use ordinary Ticket children with stable IDs prefixed '${id}/', meaningful bodies and acceptance criteria, relevant relations to known IDs, and dependencies only for real ordering. Reuse existing work. Do not add ceremony, downgrade completeness or mutate state. Return no children if atomic. Dossier: ${JSON.stringify(input)} Existing children: ${JSON.stringify(children.map(child => ({ id: store.localId(child.id), title: child.title, body: child.body, acceptanceCriteria: child.acceptanceCriteria })))} Critic findings: ${JSON.stringify(findings)}`, TicketPreparationProposalSchema, { model: cfg.modelRoutes?.design ?? cfg.model, temperature: 0, timeoutMs: 60000, ...cognitionMetrics() });
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
          countEngineering('criticRounds');
          const review = CriticResultSchema.parse(await critic.review(input));
          if (review.verdict === 'needs_input') return { status: 'needs_input', artifactId: id, required: review.required.map(required => ({ ...required, why: 'Independent Critic requires a semantic decision.', target: 'Ticket preparation contract' })) };
          if (review.verdict === 'reject') return { status: 'blocked', artifactId: id, blockers: review.findings.map(finding => ({ reason: finding.message, artifactId: finding.artifactId })) };
          if (review.verdict === 'revise') { countEngineering('criticRevisions'); findings = review.findings; continue; }
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
          countEngineering('artifactsCreated', created.length); countEngineering('artifactsReused', reused.length);
          if (held) { const { exportProjections } = await import('./projections.ts'); await exportProjections(store); }
          return { status: 'complete', artifactId: id, value: { dossier, children: [...new Set([...existing, ...identities.values()])], created, reused, applied: true, criticRounds: critic ? attempt + 1 : 0, rationale: proposal.rationale } };
        } finally { if (acquired) { await store.releaseTicket(id); const { exportProjections } = await import('./projections.ts'); await exportProjections(store); } }
      }
      return { status: 'blocked', artifactId: id, blockers: findings.map(finding => ({ reason: `Critic revision limit: ${finding.message}`, artifactId: finding.artifactId })) };
    } catch (error) { return { status: 'blocked', artifactId: id, blockers: [{ reason: `Ticket preparation failed: ${String(error)}` }] }; }
    });
  }

  async resolve(store: WorkflowStore, options: ResolutionOptions = {}): Promise<OperationResult<ResolvedTicket>> {
    return withArtifactMetrics(store.root, 'resolve_ticket', store.localId(this.id), { ...options, depth: options.depth ?? 'all' }, async () => {
      const { ResolutionProposalSchema, ExactImplementationSchema, AcceptanceVerificationSchema } = await import('../ticket-operation-types.ts');
      const { ArtifactBudget } = await import('../artifact-policy.ts');
      const { CausalChangeEngine } = await import('../change/engine.ts');
      const { workspacePath } = await import('../change/workspace-path.ts');
      const { createDefaultAsker } = await import('../product/decompose.ts');
      const { loadConfig } = await import('../config.ts');
      const { applyProductMutations } = await import('../product/mutation.ts');
      const { initializeTools, registry } = await import('../tools/index.ts');
      const { z } = await import('zod');
      const { LLMActor, LayaSystemOne } = await import('@dharmax/llm-utils');
      const fs = await import('node:fs'), path = await import('node:path');
      const crypto = await import('node:crypto');
      initializeTools();
      const cfg = loadConfig(store.root), agentId = options.agentId ?? cfg.defaultAgentId, rootId = store.localId(this.id);
      const acquired = new Set<string>(), ownedFiles = new Set<string>(), allFiles = new Set<string>(), resolved: string[] = [];
      const ownedHashes = new Map<string, string>();
      let executingTicket: Ticket = this;
      const maxRepairs = z.number().int().min(0).max(3).parse(options.maxRepairs ?? 2);
      const budget = new ArtifactBudget(options, 'all', cfg.maxArtifacts), work = new Map<string, Ticket>(), dossiers = new Map<string, TicketDossier>();
      const tests: ResolutionVerificationInput['tests'] = [];
      let repairs = 0, acceptance: import('../ticket-operation-types.ts').AcceptanceVerification = { criteria: [], aspects: [] };
      const ctx = { store, projectRoot: store.root };
      const blocked = (reason: string): OperationResult<ResolvedTicket> => ({ status: 'blocked', artifactId: rootId, blockers: [{ reason }] });
      const needs = (question: string, why: string, target: string): OperationResult<ResolvedTicket> => ({ status: 'needs_input', artifactId: rootId, required: [{ question, why, target }] });
      const lease = async (ticket: Ticket) => {
        const fresh = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!, active = fresh.claim && Date.parse(fresh.claim.expiresAt) > Date.now();
        if (active) return fresh.claim!.agentId === agentId ? null : `Ticket '${store.localId(ticket.id)}' is leased by '${fresh.claim!.agentId}'.`;
        const claim = await store.claimTicket(store.localId(ticket.id), agentId, cfg.defaultLeaseMinutes, false);
        if (claim.success) { acquired.add(store.localId(ticket.id)); return null; } return claim.message ?? 'Lease unavailable.';
      };
      const guardFiles = (files: string[]) => {
        const status = Bun.spawnSync(['git', 'status', '--porcelain=v1', '-z'], { cwd: store.root, stderr: 'pipe' });
        if (!status.success) throw new Error('Workspace Git status unavailable; edits require an inspectable repository.');
        const dirty = new Set<string>(), entries = status.stdout.toString().split('\0');
        for (let i = 0; i < entries.length; i++) if (entries[i]) { dirty.add(entries[i].slice(3)); if (/[RC]/.test(entries[i].slice(0, 2))) dirty.add(entries[++i]); }
        for (const file of files) {
          const relative = workspacePath(store.root, file);
          const currentHash = fs.existsSync(path.resolve(store.root, relative)) ? crypto.createHash('sha256').update(fs.readFileSync(path.resolve(store.root, relative))).digest('hex') : 'missing';
          if (ownedHashes.has(relative) && ownedHashes.get(relative) !== currentHash) return relative;
          if (dirty.has(relative) && !ownedFiles.has(relative) && !options.allowDirtyTargets?.includes(relative)) return relative;
        }
        return null;
      };
      const apply = async (request: import('../change/types.ts').ChangeRequest, fingerprint?: string) => {
        const leaseError = await lease(executingTicket); if (leaseError) throw new Error(leaseError);
        if (request.action === 'product_change') throw new Error('Implementation cannot mutate Product/Ticket semantics through code tools.');
        const engine = new CausalChangeEngine(ctx), preview = await engine.previewChange(request);
        if (preview.blocked) throw new Error(preview.blockReason ?? 'Change preview blocked.');
        const conflict = guardFiles(preview.affectedFiles); if (conflict) throw new Error(`Dirty target requires input: ${conflict}`);
        await applyProductMutations(store, [{ kind: 'product_update', entityType: 'Ticket', id: store.localId(executingTicket.id), fields: { lane: 'In Progress' } }]);
        const result = await engine.applyChange(request, fingerprint ?? preview.fingerprint);
        for (const file of [...result.filesTouched, ...result.filesRenamed.flatMap(rename => [rename.from, rename.to])]) {
          ownedFiles.add(file); allFiles.add(file);
          ownedHashes.set(file, fs.existsSync(path.resolve(store.root, file)) ? crypto.createHash('sha256').update(fs.readFileSync(path.resolve(store.root, file))).digest('hex') : 'missing');
        }
        countEngineering('codeEdits'); countEngineering('filesTouched', result.filesTouched.length);
        if (!result.ok || !result.verification.passed) throw new Error(`Change verification failed: ${JSON.stringify(result.verification)}`);
        return result;
      };
      try {
        // Prepare a bounded closure first, then execute a single dependency order.
        const queue: Array<{ ticket: Ticket; depth: number }> = [{ ticket: this, depth: 0 }];
        while (queue.length) {
          const { ticket, depth } = queue.shift()!, id = store.localId(ticket.id);
          if (work.has(id)) continue;
          if (!budget.visit(id, depth)) return needs(`Increase depth/maxArtifacts to include '${id}'.`, 'The work closure exceeds the explicit operation budget.', 'Operation depth/maxArtifacts');
          const investigation = await ticket.investigate(store, options); if (investigation.status !== 'complete') return investigation;
          if (investigation.value.disposition === 'rejectable') return needs(`Review rejection evidence for '${id}': ${investigation.value.rationale}`, 'Rejection is grounded but requires explicit disposition approval.', 'Ticket lifecycle');
          const leaseError = await lease(ticket); if (leaseError) return blocked(leaseError);
          const prepared = await ticket.prepare(store, { ...options, agentId }); if (prepared.status !== 'complete') return prepared;
          const fresh = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!;
          const grounded = prepared.value.applied ? await fresh.investigate(store, options) : investigation;
          if (grounded.status !== 'complete') return grounded;
          work.set(id, fresh); dossiers.set(id, grounded.value); visitMetricArtifact(id);
          for (const child of prepared.value.children) queue.push({ ticket: (await store.getEntity<Ticket>(child, Ticket.dcr))!, depth: depth + 1 });
        }
        const order: string[] = [], visiting = new Set<string>(), visited = new Set<string>();
        const visit = async (id: string): Promise<void> => {
          if (visiting.has(id)) throw new Error(`Work containment/dependency cycle at '${id}'.`); if (visited.has(id)) return;
          visiting.add(id);
          for (const edge of await store.getOutgoing(work.get(id)!.id)) if (['contains', 'depends_on'].includes(edge.predicateName)) {
            const target = await store.getEntity<Ticket>(edge.targetId, Ticket.dcr); if (!target) continue;
            const targetId = store.localId(target.id);
            if (work.has(targetId)) await visit(targetId);
            else if (edge.predicateName === 'depends_on' && !(target.lane === 'Done' && target.status === 'verified')) throw new Error(`Unresolved prerequisite '${targetId}' outside the bounded work set.`);
          }
          visiting.delete(id); visited.add(id); order.push(id);
        };
        await visit(rootId);
        for (const id of order) {
          const ticket = work.get(id)!, dossier = dossiers.get(id)!; executingTicket = ticket; recordMetricCompleteness(dossier.completeness);
          const signature = crypto.createHash('sha256').update(JSON.stringify({ ticket: { title: ticket.title, body: ticket.body, criteria: ticket.acceptanceCriteria }, aspects: dossier.aspects.aspects.map(aspect => ({ id: aspect.id, criteria: aspect.criteria })), completeness: dossier.completeness })).digest('hex');
          const receipt = await store.getEntity<Artifact>(`VERIFY-${id}`, Artifact.dcr);
          if (ticket.lane === 'Done' && ticket.status === 'verified' && receipt) {
            const proof = JSON.parse((receipt as Artifact & { body: string }).body) as { signature: string; hashes: Record<string, string>; acceptance: import('../ticket-operation-types.ts').AcceptanceVerification };
            const expectedFiles = [...(options.testCommands ?? []).flat().filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg)), ...dossier.evidence.filter(item => item.mandatory && item.filePath).map(item => item.filePath!)];
            const verifiedContract = dossier.ticket.acceptanceCriteria.every(criterion => proof.acceptance.criteria.some(check => check.criterion === criterion && check.passed)) && dossier.aspects.aspects.every(aspect => proof.acceptance.aspects.some(check => check.id === aspect.id && check.passed));
            if (proof.signature === signature && verifiedContract && expectedFiles.every(file => file in proof.hashes) && Object.entries(proof.hashes).every(([file, hash]) => fs.existsSync(path.resolve(store.root, file)) && crypto.createHash('sha256').update(fs.readFileSync(path.resolve(store.root, file))).digest('hex') === hash)) {
              acceptance = AcceptanceVerificationSchema.parse(proof.acceptance);
              acceptance.aspects = acceptance.aspects.filter(check => dossier.aspects.aspects.some(aspect => aspect.id === check.id));
              for (const file of Object.keys(proof.hashes)) allFiles.add(file);
              resolved.push(id); countEngineering('artifactsReused'); continue;
            }
          }
          if (ticket.lane === 'Done') await applyProductMutations(store, [{ kind: 'product_update', entityType: 'Ticket', id, fields: { lane: 'In Progress' } }]);
          if (!dossier.ticket.acceptanceCriteria.length) return needs(`Author executable acceptance criteria for '${id}'.`, 'Completion cannot be verified without a contract.', 'Ticket acceptanceCriteria');
          const children = (await store.getOutgoing(ticket.id, 'contains')).filter(edge => work.has(store.localId(edge.targetId))).map(edge => store.localId(edge.targetId));
          const verify = options.verify ?? (async (input: ResolutionVerificationInput) => {
            const asker = createDefaultAsker(store.root); if (!asker) throw new Error('Independent acceptance verifier unavailable.');
            const sourceFiles = new Set([...input.files, ...input.dossier.evidence.filter(item => item.mandatory && item.filePath).map(item => item.filePath!)]);
            const sources = [...sourceFiles].filter(file => fs.existsSync(path.resolve(store.root, file))).map(file => ({ file, source: fs.readFileSync(path.resolve(store.root, file), 'utf8') }));
            const testSources = input.tests.flatMap(test => test.command.filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg) && fs.existsSync(path.resolve(store.root, arg))).map(file => ({ file, source: fs.readFileSync(path.resolve(store.root, file), 'utf8') })));
            const reviewDossier = { ...input.dossier, evidence: input.dossier.evidence.map(({ source: _beforeImplementation, ...evidence }) => evidence) };
            countEngineering('sourceReads', sources.length + testSources.length); countEngineering('reasoningCalls');
            const response = await asker.json(`Independently verify EVERY required Ticket acceptance criterion and EVERY material applicable Aspect. Copy each exact authored criterion string verbatim into its criterion field, and each exact Aspect ID into its id field; never paraphrase identifiers. Requirements are not evidence. sources/testSources are current disk contents AFTER implementation; use them and successful executions, not original investigation snapshots. If proof is absent mark passed=false. Cite the concrete assertion/result for each claim. Do not accept a producer's completion statement. Context: ${JSON.stringify({ ...input, dossier: reviewDossier, sources, testSources })}`, AcceptanceVerificationSchema, { model: cfg.modelRoutes?.critic ?? cfg.modelRoutes?.design ?? cfg.model, temperature: 0, timeoutMs: 60000, ...cognitionMetrics() });
            if (!response.ok) throw new Error(`Acceptance verification failed: ${response.failure?.message}`); return AcceptanceVerificationSchema.parse(response.data);
          });
          let feedback: string[] = [];
          for (let attempt = 0; attempt <= maxRepairs; attempt++) {
            if (attempt) { repairs++; countEngineering('repairs'); }
            const current = attempt ? await ticket.investigate(store, options) : null;
            if (current && current.status !== 'complete') return current;
            const implementationDossier = current?.status === 'complete' ? current.value : dossier;
            let proposedTests = options.testCommands ?? [];
            if (!children.length && ticket.lane !== 'Done') {
              const implementation = options.implement ?? (async (input: TicketDossier, findings: readonly string[]) => {
                const asker = createDefaultAsker(store.root); if (!asker) throw new Error('Implementation provider unavailable.');
                const exact = input.evidence.filter(item => item.source && item.exact && [6, 12].includes(item.symbolKind ?? 0));
                const mechanism = await (options.systemOne ?? new LayaSystemOne()).assess({ criterionCount: input.ticket.acceptanceCriteria.length, exactTargets: exact.length, repair: findings.length > 0, failure: findings.join('\n').slice(0, 1000) }, {
                  mechanism: { type: 'choice', instructions: 'Choose the least interactive implementation mechanism.', criteria: { synthesis: 'Exact targets are sufficient for a pure change proposal', interactive: 'Bounded navigation/tool interaction is needed', unknown: 'Unclear' } },
                  modelTier: { type: 'choice', instructions: 'Suggest a configured reasoning tier; this is only a hint.', criteria: { configured: 'Normal implementation route is sufficient', stronger: 'Use the configured stronger design route if available', unknown: 'Unclear' } },
                  ...(findings.length ? { failureKind: { type: 'choice' as const, instructions: 'Classify observed verification failure.', criteria: { code: 'Implementation defect', test: 'Assertion mismatch', tool: 'Tool or stale target failure', environment: 'Missing capability or provider', unknown: 'Unclear' } } } : {})
                }, cognitionMetrics());
                countEngineering('systemOneCalls');
                const model = mechanism?.quality === 'high' && mechanism.answers.modelTier?.choice === 'stronger' ? cfg.modelRoutes?.design ?? cfg.modelRoutes?.dev ?? cfg.model : cfg.modelRoutes?.dev ?? cfg.model;
                if (exact.length === 1 && !(mechanism?.quality === 'high' && mechanism.answers.mechanism?.choice === 'interactive')) {
                  countEngineering('reasoningCalls');
                  const response = await asker.json(`Implement the one exact authored function/method target. Use replace_symbol to change its body while preserving its name/signature unless the Ticket explicitly requests a rename. For an explicit rename use rename_symbol. The existing target identity is fixed by AIWF; do not invent another target or alter tests to weaken assertions. Return only action, replacement or newName, and targeted test command argument arrays. Dossier: ${JSON.stringify(input)} Verification feedback: ${JSON.stringify(findings)}`, ExactImplementationSchema, { model, temperature: 0, timeoutMs: 60000, ...cognitionMetrics() });
                  if (!response.ok) throw new Error(`Implementation synthesis failed: ${response.failure?.message}`);
                  const proposal = ExactImplementationSchema.parse(response.data), target = { type: 'symbol' as const, filePath: exact[0].filePath!, symbolName: exact[0].symbolName!, containerName: exact[0].containerName };
                  return { changes: [proposal.action === 'replace_symbol' ? { action: proposal.action, target, replacement: proposal.replacement } : { action: proposal.action, target, newName: proposal.newName }], testCommands: proposal.testCommands };
                }
                const names = ['find_symbol', 'get_symbol_source', 'get_file_outline', 'search_graph', 'get_exact_references', 'preview_change', 'apply_change'];
                const actor = new LLMActor(asker, { maxSteps: 16, system: 'Implement only the leased Ticket. Navigate surgically, then use preview_change/apply_change for edits. Never modify unrelated files or canonical Ticket/Product semantics. Return finalAnswer as JSON matching {changes:[],testCommands:[["bun","test","tests/target.test.ts"]]} after tool edits; propose unexecuted changes only in changes. Return required inputs when uncertain.' });
                for (const name of names) {
                  const tool = registry.get(name); if (!tool) continue;
                  actor.registerTool({ name, description: tool.description, parameters: tool.parameters, execute: async params => {
                    if (name === 'apply_change') { countEngineering('toolCalls'); const value = params as { request: import('../change/types.ts').ChangeRequest; fingerprint: string }; return apply(value.request, value.fingerprint); }
                    if (name === 'get_symbol_source') { countEngineering('sourceReads'); countEngineering('exactSymbolReads'); }
                    return registry.execute(name, params, ctx);
                  } });
                }
                const output = await actor.run(`Ticket dossier: ${JSON.stringify(input)} Verification feedback: ${JSON.stringify(findings)}`, { ...cognitionMetrics(), askOptions: { model, timeoutMs: 60000 } });
                if (!output.ok) throw new Error(`Implementation Actor halted: ${output.haltReason}: ${output.error}`);
                return ResolutionProposalSchema.parse(JSON.parse(output.finalText));
              });
              const proposal = ResolutionProposalSchema.parse(await implementation(implementationDossier, feedback));
              if (proposal.required?.length) return { status: 'needs_input', artifactId: id, required: proposal.required };
              let changeBlocked = false;
              for (const request of proposal.changes) {
                const preview = await new CausalChangeEngine(ctx).previewChange(request);
                if (preview.blocked) { feedback = [preview.blockReason ?? 'Change preview blocked']; changeBlocked = true; break; }
                const conflict = guardFiles(preview.affectedFiles); if (conflict) return needs(`Allow edits to dirty target '${conflict}', or restore it before retrying.`, 'The target contains uncommitted work present before this operation.', 'Operation allowDirtyTargets');
                const leaseError = await lease(ticket); if (leaseError) return blocked(leaseError);
                await apply(request, preview.fingerprint);
              }
              if (changeBlocked) continue;
              if (!options.testCommands?.length && proposal.testCommands.length) proposedTests = proposal.testCommands;
            }
            if (!proposedTests.length) {
              for (const file of allFiles) { const target = await registry.execute('resolve_test_target', { filePath: file }, ctx); if (target.found) proposedTests.push(['bun', 'test', target.testFile]); }
              if (!proposedTests.length) proposedTests.push(['bun', 'test']);
            }
            const currentTests: ResolutionVerificationInput['tests'] = [];
            for (const command of proposedTests) {
              if (command[0] !== 'bun' || !['test', 'run'].includes(command[1] ?? '') || command[1] === 'run' && !['typecheck', 'build'].includes(command[2] ?? '')) return needs(`Supply a project test/typecheck/build command for '${id}'.`, 'Verification commands must be bounded engineering checks.', 'Operation testCommands');
              const process = Bun.spawn(command, { cwd: store.root, stdout: 'pipe', stderr: 'pipe' });
              const timeout = setTimeout(() => process.kill(), 60000);
              const [stdout, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
              clearTimeout(timeout);
              countEngineering('testsRun'); if (exit !== 0) countEngineering('testFailures');
              currentTests.push({ command, passed: exit === 0, output: (stdout + '\n' + stderr).slice(-16000) });
            }
            tests.push(...currentTests);
            if (currentTests.some(test => !test.passed)) { feedback = currentTests.filter(test => !test.passed).map(test => test.output); continue; }
            acceptance = AcceptanceVerificationSchema.parse(await verify({ dossier, files: [...allFiles], tests: currentTests, children }));
            acceptance.criteria = acceptance.criteria.filter(check => dossier.ticket.acceptanceCriteria.includes(check.criterion));
            acceptance.aspects = acceptance.aspects.filter(check => dossier.aspects.aspects.some(aspect => aspect.id === check.id));
            const missing = [...dossier.ticket.acceptanceCriteria.filter(criterion => !acceptance.criteria.some(check => check.criterion === criterion && check.passed)), ...dossier.aspects.aspects.map(aspect => aspect.id).filter(aspect => !acceptance.aspects.some(check => check.id === aspect && check.passed))];
            if (missing.length) { feedback = missing.map(item => `Unverified required acceptance/Aspect: ${item}`); continue; }
            const leaseError = await lease(ticket); if (leaseError) return blocked(leaseError);
            const hashes = Object.fromEntries([...new Set([...allFiles, ...dossier.evidence.filter(item => item.filePath).map(item => item.filePath!), ...currentTests.flatMap(test => test.command.filter(arg => /\.test\.[cm]?[jt]sx?$/.test(arg)))])].filter(file => fs.existsSync(path.resolve(store.root, file))).map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.resolve(store.root, file))).digest('hex')]));
            const proof = await store.upsertEntity<Artifact>(Artifact.dcr, { id: `VERIFY-${id}`, title: `Verified acceptance for ${id}`, body: JSON.stringify({ signature, hashes, acceptance, tests: currentTests.map(test => ({ command: test.command, passed: test.passed })), children, verifiedAt: new Date().toISOString() }), status: 'verified' });
            await store.relate(proof, 'verifies', ticket);
            await applyProductMutations(store, [{ kind: 'product_update', entityType: 'Ticket', id, fields: { lane: 'Done', status: 'verified' } }]);
            resolved.push(id); break;
          }
          if (!resolved.includes(id)) return blocked(`Bounded repair exhausted for '${id}': ${feedback.join('\n')}`);
        }
        return { status: 'complete', artifactId: rootId, value: { verification: true, resolved, files: [...allFiles], repairs, acceptance } };
      } catch (error) {
        const message = String(error);
        if (message.includes('Dirty target requires input:')) return needs(message, 'The Actor selected a target with existing uncommitted work.', 'Operation allowDirtyTargets');
        return blocked(`Ticket resolution failed: ${message}`);
      } finally {
        for (const id of acquired) await store.releaseTicket(id);
        const { exportProjections } = await import('./projections.ts'); await exportProjections(store);
      }
    });
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
