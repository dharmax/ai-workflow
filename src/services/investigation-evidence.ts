/** Collect and inspect attributable investigation evidence; discoveries grant no edit authority. */
import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowStore } from '../graph/store.ts';
import type { InvestigationOptions, TicketDossier, OperationResult } from '../ticket-operation-types.ts';
import {
  Ticket,
  WorkflowEntity,
  Epic,
  Feature,
  UserStory,
  Flow,
  Goal,
  Concept,
  Aspect,
  TestNode,
  FileNode,
  SymbolNode,
  Lesson,
  Decision,
  Artifact,
} from '../model/ontology.ts';
import { countEngineering, visitMetricArtifact } from '../performance-metrics.ts';

import { resolveTicketGovernance, readVerificationReceipt } from '../ticket-operation-types.ts';
import { collectProductMeaning } from '../product/context.ts';
import { getExactSymbolSource } from '../change/symbol-source.ts';

function evidenceBody(entity: WorkflowEntity): string | undefined {
  const narrative = entity as WorkflowEntity & {
    body?: string;
    story?: string;
    decision?: string;
    context?: string;
    consequences?: string;
  };
  if (entity instanceof Decision)
    return [
      narrative.decision,
      narrative.context ? `Context: ${narrative.context}` : '',
      narrative.consequences ? `Consequences: ${narrative.consequences}` : '',
      narrative.body,
    ]
      .filter(Boolean)
      .join('\n\n');
  if (entity instanceof Aspect)
    return [
      narrative.body,
      entity.acceptanceCriteria?.length
        ? 'Acceptance Criteria:\n' + entity.acceptanceCriteria.map((criterion) => '- ' + criterion).join('\n')
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  if (entity instanceof UserStory)
    return JSON.stringify({
      actor: entity.actor,
      intent: entity.intent,
      initialState: entity.initialState,
      action: entity.action,
      expectedResult: entity.expectedResult,
      exceptions: entity.exceptions,
      bounds: entity.bounds,
    });
  return narrative.body || narrative.story;
}

export function addEvidence(
  store: WorkflowStore,
  dossier: TicketDossier,
  entity: WorkflowEntity,
  provenance: string,
  required = true,
) {
  if (dossier.evidence.some((e) => e.id === store.localId(entity.id))) return;
  if (
    ['Ticket', 'Epic', 'Feature', 'UserStory', 'Flow', 'Goal', 'Concept', 'Module', 'Idea', 'Artifact'].includes(
      entity.typeName(),
    )
  )
    visitMetricArtifact(store.localId(entity.id));
  if (entity instanceof Aspect) {
    required = entity.status === 'accepted';
    provenance = required ? 'Governing Aspect' : 'Applicable Aspect (candidate)';
  }
  if (
    entity instanceof Artifact &&
    store.localId(entity.id) === `VERIFY-${dossier.ticket.id}` &&
    !readVerificationReceipt(entity.body)
  )
    provenance = 'Historical acceptance receipt (legacy/unassessed)';
  const body = evidenceBody(entity);
  const evidence = {
    id: store.localId(entity.id),
    kind: entity.typeName(),
    title: entity.title ?? store.localId(entity.id),
    body,
    mandatory: required,
    provenance,
  };
  dossier.evidence.push(evidence);
  return evidence;
}

export async function collectAuthoredEvidence(store: WorkflowStore, current: Ticket, dossier: TicketDossier) {
  const mandatory = new Map<string, WorkflowEntity>();
  const add = (entity: WorkflowEntity, provenance: string, required = true) => {
    if (addEvidence(store, dossier, entity, provenance, required)?.mandatory) mandatory.set(entity.id, entity);
  };
  add(current, 'Ticket contract');
  const neighbors = [...(await store.getIncoming(current.id)), ...(await store.getOutgoing(current.id))];
  for (const edge of neighbors) {
    const otherId = edge.sourceId === current.id ? edge.targetId : edge.sourceId;
    const entity = await store.getEntity(otherId);
    if (
      entity &&
      [
        'contains',
        'implements',
        'addresses',
        'targets',
        'modifies',
        'governs',
        'blocks',
        'depends_on',
        'verifies',
      ].includes(edge.predicateName)
    )
      add(entity, `Ticket ${edge.predicateName}`,
        edge.sourceId === current.id || ['verifies', 'governs'].includes(edge.predicateName));
  }
  // Expand authored Product Intent so implementation sees the actor journey and reason behind the work.
  const semanticSeeds = [...mandatory.values()].filter(
    (entity) =>
      entity instanceof Ticket ||
      entity instanceof Epic ||
      entity instanceof Feature ||
      entity instanceof UserStory ||
      entity instanceof Flow ||
      entity instanceof Goal ||
      entity instanceof Concept,
  );
  const requiredScopes = new Set(mandatory.keys());
  for (const { entity, provenance } of await collectProductMeaning(semanticSeeds, store)) {
    add(entity, provenance);
    if (entity instanceof UserStory) requiredScopes.add(entity.id);
  }
  // Governing definitions remain mandatory context. Their broader verification
  // belongs here only when the Ticket actually undertakes that scope's work.
  for (const item of [...mandatory.values()]) {
    if (!requiredScopes.has(item.id)) continue;
    if (!(item instanceof Epic || item instanceof Feature || item instanceof UserStory || item instanceof Flow))
      continue;
    for (const edge of await store.getIncoming(item.id, 'verifies')) {
      const test = await store.getEntity<TestNode>(edge.sourceId, TestNode.dcr);
      if (test) add(test, 'Scope verification');
    }
  }
  for (const concern of dossier.aspects.aspects) {
    const aspect = await store.getEntity<Aspect>(concern.id, Aspect.dcr);
    if (aspect) add(aspect, 'Applicable Aspect');
    for (const evidenceId of [...concern.tests, ...concern.artifacts, ...concern.decisions]) {
      const entity = await store.getEntity(evidenceId);
      if (entity) add(entity, 'Aspect evidence');
    }
  }

  return { mandatory, neighbors };
}

async function attachSymbolSource(
  store: WorkflowStore,
  symbol: SymbolNode,
  evidence: TicketDossier['evidence'][number],
) {
  const name = symbol.containerName ? symbol.containerName + '.' + symbol.title : symbol.title!;
  const source = await getExactSymbolSource(store.root, symbol.filePath!, name);
  Object.assign(evidence, {
    source: source.code,
    exact: true,
    symbolName: symbol.title,
    containerName: symbol.containerName,
    symbolKind: source.kind,
  });
  countEngineering('sourceReads');
  countEngineering('exactSymbolReads');
}

export async function inspectAuthoredSources(
  store: WorkflowStore,
  dossier: TicketDossier,
  mandatory: Map<string, WorkflowEntity>,
): Promise<OperationResult<Set<string>>> {
  const id = dossier.ticket.id;
  const codePaths = new Set<string>();
  for (const entity of mandatory.values()) {
    if (!(entity instanceof FileNode || entity instanceof SymbolNode)) continue;
    const filePath = entity instanceof SymbolNode ? entity.filePath! : store.localId(entity.id);
    codePaths.add(filePath);
    const evidence = dossier.evidence.find((e) => e.id === store.localId(entity.id))!;
    evidence.filePath = filePath;
    if (!fs.existsSync(path.resolve(store.root, filePath))) {
      const details = entity instanceof FileNode ? await entity.fullDto<Record<string, unknown>>() : null;
      if (details && (details.metadata as { plannedCreation?: unknown } | undefined)?.plannedCreation === true) {
        // Only explicitly planned creation may be missing; an ordinary indexed stub is not creation authority.
        evidence.body = 'Planned file; no source content exists yet.';
        continue;
      }
      return {
        status: 'needs_input',
        artifactId: id,
        required: [
          {
            question: `Restore or replace missing code target '${filePath}'.`,
            why: 'The authored code anchor no longer exists on disk.',
            target: 'Ticket code target relation',
            choices: [filePath],
          },
        ],
      };
    }
    if (entity instanceof SymbolNode) {
      try {
        await attachSymbolSource(store, entity, evidence);
      } catch (error) {
        return {
          status: 'needs_input',
          artifactId: id,
          required: [
            {
              question: `Confirm stale symbol target '${store.localId(entity.id)}': ${String(error)}`,
              why: 'Exact language tooling cannot resolve the authored target.',
              target: 'Ticket code target relation',
            },
          ],
        };
      }
    }
  }

  return { status: 'complete', artifactId: id, value: codePaths };
}

export async function collectGovernanceEvidence(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  codePaths: Set<string>,
) {
  const add = (entity: WorkflowEntity, provenance: string) => addEvidence(store, dossier, entity, provenance);
  // Lessons on linked files are mandatory; optional candidates can never prune them.
  for (const lesson of await store.listEntities<Lesson>(Lesson.dcr)) {
    if (codePaths.has((lesson as Lesson & { filePath?: string }).filePath ?? ''))
      add(lesson, 'Lesson on authored code target');
  }
  // The same effective snapshot reaches producers, acceptance and proof closure.
  dossier.governance = await resolveTicketGovernance(store, current);
  for (const rule of dossier.governance.rules) {
    const examplesBody = rule.examples.length
      ? ['\nExamples:', ...rule.examples.map((ex) => `[${ex.kind}] ${ex.description} -> Lesson: ${ex.lesson}`)].join(
          '\n',
        )
      : '';
    dossier.evidence.push({
      id: rule.ruleId,
      kind: 'Rule',
      title: rule.title ?? rule.ruleId,
      body: `${rule.rule}${examplesBody}${rule.references.length ? '\n' + (await import('../rules/references.ts')).renderRuleReferences(rule.references) : ''}`,
      mandatory: rule.importance >= 8,
      provenance: `Engineering Doctrine (${rule.scope.kind})`,
    });
  }
}

async function inspectSourceCandidates(store: WorkflowStore, dossier: TicketDossier, signal?: AbortSignal) {
  const { commandRegistry } = await import('../tools/registry.ts');
  const readContext = { store, projectRoot: store.root, signal, executionAuthority: 'read-only' as const };
  for (const evidence of dossier.evidence.filter((item) => ['FileNode', 'SymbolNode'].includes(item.kind))) {
    const entity = await store.getEntity(evidence.id);
    const filePath =
      entity instanceof SymbolNode
        ? entity.filePath
        : entity instanceof FileNode
          ? ((entity as FileNode & { path?: string }).path ?? store.localId(entity.id))
          : undefined;
    if (!filePath || filePath.startsWith('@')) continue;
    evidence.filePath = filePath;
    try {
      if (!evidence.source) {
        if (entity instanceof SymbolNode) {
          await attachSymbolSource(store, entity, evidence);
        } else {
          evidence.source = (await commandRegistry.execute('read_workspace_file', { filePath }, readContext)).content;
          countEngineering('sourceReads');
        }
      }
      dossier.findings!.push(
        `Inspected ${filePath}${evidence.symbolName ? '#' + evidence.symbolName : ''}; current source is attached as ${evidence.id}.`,
      );
    } catch (error) {
      dossier.uncertainties!.push(`Could not inspect candidate ${filePath}: ${String(error)}`);
    }
  }
}

async function inspectRegressionTests(store: WorkflowStore, dossier: TicketDossier, max: number, signal?: AbortSignal) {
  const { commandRegistry } = await import('../tools/registry.ts');
  const { verifyingTestsForTargets } = await import('../graph/test-artifacts.ts');
  const readContext = { store, projectRoot: store.root, signal, executionAuthority: 'read-only' as const };
  const inspected = dossier.evidence.filter((item) => item.filePath && item.source);
  const related = await verifyingTestsForTargets(
    store,
    inspected.map((item) => item.id),
    inspected.map((item) => item.filePath!),
  );
  for (const test of related.tests.slice(0, max))
    addEvidence(store, dossier, test, 'Test covering inspected source', false);
  for (const evidence of dossier.evidence.filter((item) => item.kind === 'TestNode').slice(0, max)) {
    const test = await store.getEntity<TestNode>(evidence.id, TestNode.dcr);
    if (!test) continue;
    evidence.filePath = test.filePath || test.targetPath;
    evidence.body = JSON.stringify({
      command: test.command,
      lastRun: test.lastRun,
      passed: test.passed,
      output: test.output,
    });
    if (!evidence.filePath) continue;
    try {
      evidence.source = (
        await commandRegistry.execute('read_workspace_file', { filePath: evidence.filePath }, readContext)
      ).content;
      countEngineering('sourceReads');
      dossier.findings!.push(
        `Inspected regression ${evidence.filePath}; stored executions are historical until freshness is checked.`,
      );
    } catch (error) {
      dossier.uncertainties!.push(`Could not inspect test ${evidence.filePath}: ${String(error)}`);
    }
  }

  return inspected;
}

export async function inspectInvestigationEvidence(
  store: WorkflowStore,
  current: Ticket,
  dossier: TicketDossier,
  selected: SymbolNode[],
  codeMentions: string,
  report: string,
  max: number,
  options: InvestigationOptions,
) {
  const { initializeTools } = await import('../tools/index.ts');
  initializeTools();
  dossier.findings = [];
  dossier.uncertainties =
    current.kind === 'bug'
      ? ['Reproduction is reported by the developer; this read-only investigation has not executed it.']
      : [];
  if (!options.mandatoryEvidenceOnly)
    await collectContractEvidence(store, dossier, selected, codeMentions, max, options.signal);
  // Error/stack paths are clues, never mutation authority. Read only indexed local files.
  const reportedFiles = (await store.listEntities<FileNode>(FileNode.dcr))
    .filter((file) => report.includes(String((file as FileNode & { path?: string }).path ?? store.localId(file.id))))
    .slice(0, max);
  for (const file of reportedFiles) addEvidence(store, dossier, file, 'File identified in work evidence', false);

  await inspectSourceCandidates(store, dossier, options.signal);
  return inspectRegressionTests(store, dossier, max, options.signal);
}

/** Optional source discovery provides evidence, never permission to edit a discovered file. */
async function collectContractEvidence(
  store: WorkflowStore,
  dossier: TicketDossier,
  symbols: SymbolNode[],
  codeMentions: string,
  max: number,
  signal?: AbortSignal,
) {
  await collectSymbolReferences(store, dossier, symbols, max, signal);
  await collectLiteralEvidence(store, dossier, symbols, codeMentions, max, signal);
}

async function collectSymbolReferences(
  store: WorkflowStore,
  dossier: TicketDossier,
  symbols: SymbolNode[],
  max: number,
  signal?: AbortSignal,
) {
  const { commandRegistry } = await import('../tools/registry.ts');
  const context = { store, projectRoot: store.root, signal, executionAuthority: 'read-only' as const };
  const inspectedFiles = new Set<string>();
  for (const symbol of symbols.slice(0, Math.min(max, 8))) {
    if (!symbol.filePath || symbol.line === undefined || symbol.column === undefined) continue;
    try {
      if (!inspectedFiles.has(symbol.filePath)) {
        inspectedFiles.add(symbol.filePath);
        const impact = await commandRegistry.execute('analyze_blast_radius', { target: symbol.filePath }, context);
        for (const filePath of impact.affectedFiles.slice(0, max)) {
          const file = await store.getEntity<FileNode>(filePath, FileNode.dcr);
          if (file && !dossier.evidence.some((evidence) => evidence.id === store.localId(file.id)))
            dossier.evidence.push({
              id: store.localId(file.id),
              kind: 'FileNode',
              title: file.title ?? filePath,
              filePath,
              mandatory: false,
              provenance: 'Structural import impact candidate; not exact semantic usage or edit authority',
            });
        }
        if (impact.affectedFiles.length > max)
          dossier.uncertainties!.push('Structural impact exceeded maxArtifacts; additional consumers need follow-up.');
      }
      const result = await commandRegistry.execute(
        'get_exact_references',
        { filePath: symbol.filePath, line: symbol.line - 1, character: symbol.column - 1 },
        context,
      );
      dossier.evidence.push({
        id: 'references:' + store.localId(symbol.id),
        kind: 'SemanticReferences',
        title: symbol.title ?? '',
        mandatory: false,
        provenance: 'TypeScript LSP; project scope is explicit',
        body: JSON.stringify({
          coverage: result.coverage,
          referenceCount: result.references.length,
          references: result.references.slice(0, max * 4),
        }),
      });
      if (result.references.length > max * 4)
        dossier.uncertainties!.push(
          `Reference evidence for ${symbol.title} is bounded; ${result.references.length} references require follow-up.`,
        );
      if (result.coverage.scope === 'inferred-project') dossier.uncertainties!.push(result.coverage.completeness);
    } catch (error) {
      dossier.uncertainties!.push(
        `Semantic references unavailable for ${symbol.filePath}#${symbol.title}: ${String(error)}`,
      );
    }
  }
  if (symbols.length > 8)
    dossier.uncertainties!.push(
      'Semantic discovery inspected at most eight optional symbols; other declarations may require follow-up.',
    );
}

async function collectLiteralEvidence(
  store: WorkflowStore,
  dossier: TicketDossier,
  symbols: SymbolNode[],
  codeMentions: string,
  max: number,
  signal?: AbortSignal,
) {
  const { commandRegistry } = await import('../tools/registry.ts');
  const context = { store, projectRoot: store.root, signal, executionAuthority: 'read-only' as const };
  const terms = [
    ...new Set(
      codeMentions
        .split(/\s+/)
        .filter((term) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(term))
        .map((term) => term.split('.').at(-1)!)
        .concat(symbols.map((symbol) => symbol.title!).filter(Boolean)),
    ),
  ];
  let remaining = max;
  for (const term of terms.slice(0, 4)) {
    const result = await commandRegistry.execute(
      'search_workspace_text',
      { text: term, limit: Math.min(300, max * 8) },
      context,
    );
    const byFile = new Map<string, string[]>();
    for (const match of result.matches)
      byFile.set(match.filePath, [
        ...(byFile.get(match.filePath) ?? []),
        `${match.line}:${match.column} ${match.text}`,
      ]);
    for (const [filePath, lines] of byFile) {
      if (remaining-- <= 0) {
        dossier.uncertainties!.push(
          'Optional literal file evidence reached maxArtifacts; follow-up discovery may be needed.',
        );
        break;
      }
      const id = 'literal:' + term + ':' + filePath;
      dossier.evidence.push({
        id,
        kind: 'TextMatch',
        title: filePath,
        filePath,
        mandatory: false,
        provenance: 'Workspace literal candidate; not a semantic reference or edit authority',
        source: lines.join('\n'),
      });
    }
    dossier.findings!.push(
      `Literal ${JSON.stringify(term)}: ${result.matches.length} occurrences; ${result.scope}; excluded directories: ${result.excludedDirectories.join(', ')}.`,
    );
    if (!result.completeWithinScope)
      dossier.uncertainties!.push(
        `Literal ${JSON.stringify(term)} coverage is incomplete: truncated=${result.truncated}; skipped=${result.skippedFiles.join(', ')}.`,
      );
  }
  if (terms.length > 4)
    dossier.uncertainties!.push(
      'Literal discovery inspected at most four identifiers; other contracts may require follow-up.',
    );
}
