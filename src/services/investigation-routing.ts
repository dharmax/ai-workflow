/** Advisory workload routing and bounded semantic interpretation; neither grants source authority. */
import type { WorkflowStore } from '../graph/store.ts';
import type { InvestigationOptions, TicketDossier, OperationResult } from '../ticket-operation-types.ts';
import { Ticket, WorkflowEntity, SymbolNode } from '../model/ontology.ts';
import { countEngineering, traceResolution } from '../performance-metrics.ts';

import { cognitionMetrics } from '../performance-metrics.ts';
import { InvestigationJudgmentSchema } from '../ticket-operation-types.ts';
import { renderInvestigationPrompt } from '../ticket/prompts.ts';
import { loadConfig } from './config-service.ts';

const routingQuestions = {
  workKind: {
    type: 'choice',
    instructions: 'Classify the work kind.',
    criteria: {
      code: 'Source implementation/refactor',
      docs: 'Documentation',
      product: 'Intent/work structure',
      unknown: 'Unclear',
    },
  },
  atomicity: {
    type: 'choice',
    instructions: 'Does the acceptance define one coherent executable unit?',
    criteria: {
      atomic: 'One independently verifiable change',
      split: 'Several independently verifiable changes',
      unknown: 'Unclear',
    },
  },
  scope: {
    type: 'choice',
    instructions: 'Are authored Product/code scopes sufficient?',
    criteria: {
      grounded: 'Scopes are explicit or valid technical work',
      ambiguous: 'Missing ownership or target decision',
    },
  },
  context: {
    type: 'choice',
    instructions: 'Which optional context family is relevant?',
    criteria: {
      code: 'Implementation symbols',
      intent: 'Product meaning',
      none: 'Mandatory evidence is sufficient',
    },
  },
  depth: {
    type: 'choice',
    instructions: 'Is semantic reasoning necessary?',
    criteria: {
      deterministic: 'Existing contract/evidence is sufficient',
      reasoning: 'Unresolved meaning or contradiction',
    },
  },
} as const;

export async function discoverInvestigationCandidates(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  mandatory: Map<string, WorkflowEntity>,
  max: number,
  options: InvestigationOptions,
) {
  const report = [
    current.title,
    current.body,
    ...Object.values(current.defect ?? {}).flat(),
    ...dossier.evidence
      .filter((item) => ['UserStory', 'TestNode'].includes(item.kind))
      .map((item) => item.body ?? item.title),
  ].join('\n');
  const codeMentions = [...(current.body ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]).join(' ');
  const words = new Set(
    `${current.title} ${codeMentions} ${current.kind === 'bug' ? report : ''}`.match(/[A-Za-z_$][\w$]{2,}/g) ?? [],
  );
  const optional = options.mandatoryEvidenceOnly
    ? []
    : (await store.listEntities<SymbolNode>(SymbolNode.dcr))
        .filter(
          (s) =>
            s.filePath &&
            /\.[cm]?[jt]sx?$/.test(s.filePath) &&
            !s.filePath.startsWith('@') &&
            s.status !== 'deprecated' &&
            s.kind !== 'call-candidate' &&
            s.kind !== 'export' &&
            words.has(s.title ?? '') &&
            !mandatory.has(s.id),
        )
        .slice(0, max);

  return { optional, report, codeMentions };
}

async function assessRouting(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  mandatory: Map<string, WorkflowEntity>,
  optional: SymbolNode[],
  options: InvestigationOptions,
) {
  const { LayaSystemOne } = await import('@dharmax/llm-utils');
  dossier.provenance.optionalCandidates = optional.length;
  countEngineering('optionalCandidates', optional.length);
  if (!options.mandatoryEvidenceOnly) countEngineering('systemOneCalls');
  traceResolution(
    `investigation System-1 start: ${optional.length} optional symbols, ${mandatory.size} required entities`,
  );
  const assessment = options.mandatoryEvidenceOnly
    ? null
    : await (options.systemOne ?? new LayaSystemOne())
        .assess(
          {
            ticket: {
              title: current.title,
              criteria: current.acceptanceCriteria,
              scopes: [...mandatory.values()].map((e) => ({ id: store.localId(e.id), kind: e.typeName() })),
            },
            candidates: optional.map((s) => ({ id: store.localId(s.id), name: s.title, file: s.filePath })),
          },
          {
            ...routingQuestions,
            ...Object.fromEntries(
              optional.map((s) => [
                store.localId(s.id),
                {
                  type: 'choice' as const,
                  instructions: `Include optional symbol ${s.title}?`,
                  criteria: { include: 'Relevant', omit: 'Irrelevant' },
                },
              ]),
            ),
          },
          cognitionMetrics(),
        )
        .catch((error) => {
          traceResolution('investigation System-1 failed: ' + String(error));
          return null;
        });
  traceResolution('investigation System-1 finished: ' + (assessment ? assessment.quality : 'unavailable'));
  if (assessment) dossier.provenance.systemOne = { backendId: assessment.backendId, quality: assessment.quality };

  return assessment;
}

export async function selectInvestigationCandidates(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  mandatory: Map<string, WorkflowEntity>,
  optional: SymbolNode[],
  options: InvestigationOptions,
) {
  const assessment = await assessRouting(store, current, dossier, mandatory, optional, options);
  const routes: Record<string, string[]> = {
    workKind: ['code', 'docs', 'product', 'unknown'],
    atomicity: ['atomic', 'split', 'unknown'],
    scope: ['grounded', 'ambiguous'],
    context: ['code', 'intent', 'none'],
    depth: ['deterministic', 'reasoning'],
  };
  const confident =
    assessment?.quality === 'high' &&
    Object.entries(routes).every(([key, choices]) => {
      const answer = assessment.answers[key];
      return answer?.choice && choices.includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8;
    }) &&
    optional.every((s) => {
      const answer = assessment.answers[store.localId(s.id)];
      return (
        answer?.choice &&
        ['include', 'omit'].includes(answer.choice) &&
        (answer.probabilities?.[answer.choice] ?? 0) >= 0.8
      );
    });
  // Routing confidence cannot discard concrete Bug clues or stand in for source inspection.
  const selected = optional.filter(
    (s) => current.kind === 'bug' || !confident || assessment?.answers[store.localId(s.id)]?.choice !== 'omit',
  );

  return { assessment, confident, selected };
}

async function requestInvestigationJudgment(store: WorkflowStore, input: TicketDossier, options: InvestigationOptions) {
  const { createDefaultAsker } = await import('./model-service.ts');
  const asker = createDefaultAsker(store.root);
  if (!asker) throw new Error('Reasoning provider unavailable.');
  const cfg = loadConfig(store.root);
  const response = await asker.json(renderInvestigationPrompt(input), InvestigationJudgmentSchema, {
    model: cfg.modelRoutes?.reasoning ?? cfg.model,
    temperature: 0,
    signal: options.signal,
    maxRetries: 1,
    maxTokens: cfg.llmOutputTokens,
    ...cognitionMetrics(),
  });
  if (!response.ok)
    throw new Error(
      `Investigation provider failed: ${response.failure?.kind ?? 'unknown'}: ${response.failure?.message ?? 'No validated result.'}`,
    );
  return InvestigationJudgmentSchema.parse(response.data);
}

export async function judgeInvestigation(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  inspected: TicketDossier['evidence'],
  codePaths: Set<string>,
  routing: Awaited<ReturnType<typeof selectInvestigationCandidates>>,
  options: InvestigationOptions,
): Promise<OperationResult<TicketDossier>> {
  const id = dossier.ticket.id,
    { assessment, confident, selected } = routing;
  if (current.kind === 'bug' && !inspected.length) {
    dossier.disposition = 'needs_preparation';
    dossier.rationale =
      'Cause unknown: no current source location could be resolved from the Bug reproduction, actual error, indexed symbols or linked scope. Reproduction has not been executed. Supply an implicated local symbol, stack location or diagnostic evidence; do not infer a root cause from routing confidence.';
    dossier.uncertainties!.push(dossier.rationale);
    return { status: 'complete', artifactId: id, value: dossier };
  }
  if (inspected.length) dossier.rationale = dossier.findings!.join(' ');
  dossier.provenance.optionalSelected = selected.length;
  countEngineering('optionalSelected', selected.length);
  const unresolved =
    current.kind === 'bug' ||
    !current.acceptanceCriteria?.length ||
    Boolean(
      assessment &&
      (!confident ||
        assessment.answers.scope?.choice === 'ambiguous' ||
        assessment.answers.depth?.choice === 'reasoning' ||
        assessment.answers.atomicity?.choice === 'unknown' ||
        (assessment.answers.workKind?.choice === 'docs' && codePaths.size > 0)),
    );
  if (!current.acceptanceCriteria?.length || assessment?.answers.atomicity?.choice === 'split')
    dossier.disposition = 'needs_preparation';
  if (unresolved) {
    try {
      const reason = options.reason ?? ((input: TicketDossier) => requestInvestigationJudgment(store, input, options));
      countEngineering('reasoningCalls');
      traceResolution('investigation semantic reasoning start');
      const judgment = InvestigationJudgmentSchema.parse(await reason(dossier));
      traceResolution('investigation semantic reasoning finished');
      dossier.provenance.reasoningUsed = true;
      if (judgment.required?.length) return { status: 'needs_input', artifactId: id, required: judgment.required };
      dossier.disposition = judgment.disposition;
      dossier.rationale = judgment.rationale;
      dossier.proposedEnrichments.acceptanceCriteria = judgment.acceptanceCriteria;
      if (!current.acceptanceCriteria?.length && dossier.disposition === 'ready')
        dossier.disposition = 'needs_preparation';
    } catch (error) {
      return {
        status: 'blocked',
        artifactId: id,
        blockers: [{ reason: `Bounded investigation reasoning failed: ${String(error)}` }],
      };
    }
  }

  return { status: 'complete', artifactId: id, value: dossier };
}
