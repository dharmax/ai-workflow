/** Investigate current authored work through canonical evidence, advisory routing and explicit readiness. */
import type { WorkflowStore } from '../graph/store.ts';
import type { InvestigationOptions, TicketDossier, OperationResult } from '../ticket-operation-types.ts';
import { Ticket, Feature, UserStory } from '../model/ontology.ts';

import { withArtifactMetrics, recordMetricCompleteness } from '../performance-metrics.ts';
import { ensureAstFresh, withAstSnapshot } from '../graph/indexer.ts';
import { ArtifactTransportOptionsSchema } from '../artifact-policy.ts';
import { loadConfig } from './config-service.ts';
import {
  addEvidence,
  collectAuthoredEvidence,
  inspectAuthoredSources,
  collectGovernanceEvidence,
  inspectInvestigationEvidence,
} from './investigation-evidence.ts';
import {
  discoverInvestigationCandidates,
  selectInvestigationCandidates,
  judgeInvestigation,
} from './investigation-routing.ts';

async function createDossier(store: WorkflowStore, current: Ticket, options: InvestigationOptions) {
  const id = store.localId(current.id);
  const dossier: TicketDossier = {
    ticket: {
      id,
      title: current.title ?? id,
      body: current.body,
      kind: current.kind ?? 'task',
      defect: current.defect,
      lane: current.lane,
      acceptanceCriteria: current.acceptanceCriteria ?? [],
    },
    history: await (await import('./journal-service.ts')).ticketHistoryContext(store, current.id),
    disposition: 'ready',
    rationale: 'Existing acceptance and mandatory evidence define executable work.',
    evidence: [],
    completeness: await current.getCompletenessContext(store, options.completeness),
    aspects: await current.assessAspects(store),
    proposedEnrichments: { relations: [] },
    provenance: {
      systemOne: null,
      reasoningUsed: false,
      optionalCandidates: 0,
      optionalSelected: 0,
      freshnessReconciliations: 1,
    },
  };

  recordMetricCompleteness(dossier.completeness);
  return dossier;
}

async function contractDisposition(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  authored: Awaited<ReturnType<typeof collectAuthoredEvidence>>,
  max: number,
): Promise<OperationResult<TicketDossier> | undefined> {
  const id = dossier.ticket.id,
    { neighbors, mandatory } = authored;
  const blockers = neighbors.filter((e) => e.predicateName === 'blocks' && e.targetId === current.id);
  if (blockers.length)
    return {
      status: 'blocked',
      artifactId: id,
      blockers: blockers.map((e) => ({ artifactId: store.localId(e.sourceId), reason: 'Explicit graph blocker' })),
    };
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const duplicate = (await store.listEntities<Ticket>(Ticket.dcr)).find(
    (t) =>
      t.id !== current.id &&
      same(t.title ?? '', current.title ?? '') &&
      same(t.body, current.body) &&
      JSON.stringify(t.acceptanceCriteria ?? []) === JSON.stringify(current.acceptanceCriteria ?? []),
  );
  if (duplicate) {
    addEvidence(store, dossier, duplicate, 'Identical existing work contract');
    dossier.disposition = 'rejectable';
    dossier.rationale = `Equivalent work is already represented by '${store.localId(duplicate.id)}'.`;
    return { status: 'complete', artifactId: id, value: dossier };
  }
  const explicitProduct = [...mandatory.values()].some((e) => e instanceof Feature || e instanceof UserStory);
  const productCandidates = explicitProduct
    ? []
    : (await store.listEntities<Feature>(Feature.dcr))
        .filter((f) => {
          const title = f.title?.trim().toLowerCase();
          return title && title.length > 2 && `${current.title} ${current.body}`.toLowerCase().includes(title);
        })
        .slice(0, Math.max(2, max));
  if (productCandidates.length > 1)
    return {
      status: 'needs_input',
      artifactId: id,
      required: [
        {
          question: 'Which Feature owns this work?',
          why: 'Multiple existing Features match the Ticket intent; ownership cannot be guessed.',
          target: 'Ticket implements Feature',
          choices: productCandidates.map((f) => store.localId(f.id)),
        },
      ],
    };
  if (productCandidates.length === 1)
    dossier.proposedEnrichments.relations.push({
      sourceId: id,
      predicate: 'implements',
      targetId: store.localId(productCandidates[0].id),
    });
}

export async function investigateTicket(
  ticket: Ticket,
  store: WorkflowStore,
  options: InvestigationOptions = {},
): Promise<OperationResult<TicketDossier>> {
  options.signal?.throwIfAborted();
  return withArtifactMetrics(store.root, 'investigate_ticket', store.localId(ticket.id), options, () =>
    withAstSnapshot(async () => {
      await ensureAstFresh(store);
      ArtifactTransportOptionsSchema.pick({ completeness: true, depth: true, maxArtifacts: true }).parse(options);
      const current = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!;
      const max = options.maxArtifacts ?? loadConfig(store.root).maxArtifacts;
      const dossier = await createDossier(store, current, options);
      const authored = await collectAuthoredEvidence(store, current, dossier);
      const anchors = await inspectAuthoredSources(store, dossier, authored.mandatory);
      if (anchors.status !== 'complete') return anchors;
      await collectGovernanceEvidence(store, current, dossier, anchors.value);
      const disposition = await contractDisposition(store, current, dossier, authored, max);
      if (disposition) return disposition;
      const candidates = await discoverInvestigationCandidates(
        store,
        current,
        dossier,
        authored.mandatory,
        max,
        options,
      );
      const routing = await selectInvestigationCandidates(
        store,
        current,
        dossier,
        authored.mandatory,
        candidates.optional,
        options,
      );
      for (const candidate of routing.selected)
        addEvidence(store, dossier, candidate, 'Bounded optional code candidate', false);
      const inspected = await inspectInvestigationEvidence(
        store,
        current,
        dossier,
        routing.selected,
        candidates.codeMentions,
        candidates.report,
        max,
        options,
      );
      if (options.mandatoryEvidenceOnly) return { status: 'complete', artifactId: dossier.ticket.id, value: dossier };
      return judgeInvestigation(store, current, dossier, inspected, anchors.value, routing, options);
    }),
  );
}
