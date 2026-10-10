import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryMetricsStore, LlmMetrics, LLM_UTILS_VERSION, childMetricsContext, type MetricsContext, type MetricsSink, type ExecutionUsage } from '@dharmax/llm-utils';
import packageJson from '../package.json' with { type: 'json' };

declare const AIWF_BUILD_REVISION: string;
declare const AIWF_BUILD_DIRTY: boolean;
declare const LLM_UTILS_BUILD_REVISION: string;
declare const LLM_UTILS_BUILD_DIRTY: boolean;
import { loadConfig } from './config.ts';
import type { ArtifactOperationOptions, TicketCompletenessContext } from './artifact-policy.ts';

export type EngineeringCounter = 'artifactVisits' | 'artifactsCreated' | 'artifactsReused' | 'toolCalls' | 'sourceReads' | 'exactSymbolReads' | 'codeEdits' | 'filesTouched' | 'testsRun' | 'testFailures' | 'repairs' | 'criticRounds' | 'criticRevisions' | 'systemOneCalls' | 'reasoningCalls' | 'optionalCandidates' | 'optionalSelected' | 'humanInterventions';
export type ResolutionStage = 'preparation' | 'implementation' | 'verification' | 'acceptance'
export interface OperationSummary {
  traceId: string; spanId?: string; parentSpanId?: string; operation: string; artifactId: string;
  startedAt: string; durationMs: number; outcome: string;
  policy: { completeness?: string; depth: number | 'all'; maxArtifacts: number; critic: string };
  tags: Record<string, string | number | boolean>; version: string; aiwfRevision: string; aiwfDirty: boolean; llmUtilsVersion: string; llmUtilsRevision: string; llmUtilsDirty: boolean;
  project: { revisionBefore: string; revisionAfter: string; branch: string; dirtyBefore: boolean; dirtyAfter: boolean };
  runtime: { bun: string; platform: string };
  counters: Partial<Record<EngineeringCounter, number>>;
  cognition: {
    llm: ReturnType<LlmMetrics['totals']>; costAvailable: boolean; structuredRepairs: number; models: string[];
    byModel?: ReturnType<LlmMetrics['byModel']>;
    modelConfigs: Array<{
      providerId: string
      modelId: string
      maxTokens?: number
      contextWindow?: number
      temperature?: number
      providerOptionKeys?: string[]
      providerOptionsHash?: string
    }>;
    phases: Record<string, ReturnType<LlmMetrics['totals']>>;
    systemOne: { calls: number; latencyMs: number; unavailable: number; backends: string[] };
    actor: { runs: number; steps: number; toolCalls: number; toolFailures: number; toolFailureCategories?: Record<string, number>; missingToolRecoveries: number };
    termination: { llmFailureKinds: Record<string, number>; finishReasons: Record<string, number>; actorHaltReasons: Record<string, number> };
  };
  resolution?: { stage: ResolutionStage; outcome: string };
  verification?: boolean;
  acceptance?: { criteriaPassed: number; criteriaTotal: number; aspectsPassed: number; aspectsTotal: number };
  completenessContext?: TicketCompletenessContext;
}
interface MetricScope { root: string; context: MetricsContext; sink: MetricsSink; store: InMemoryMetricsStore; counters: OperationSummary['counters']; visited: Set<string>; completenessContext?: TicketCompletenessContext; resolution?: OperationSummary['resolution']; parent?: MetricScope }
const active = new AsyncLocalStorage<MetricScope>();

function aiwfBuildEvidence(): {revision: string; dirty: boolean} {
  if (typeof AIWF_BUILD_REVISION !== 'undefined') return {revision: AIWF_BUILD_REVISION, dirty: typeof AIWF_BUILD_DIRTY !== 'undefined' ? AIWF_BUILD_DIRTY : true};
  const evidence = gitEvidence(path.resolve(import.meta.dir, '..'));
  return {revision: evidence.revision, dirty: evidence.dirty};
}

function llmUtilsBuildEvidence(): {revision: string; dirty: boolean} {
  if (typeof LLM_UTILS_BUILD_REVISION !== 'undefined') return {revision: LLM_UTILS_BUILD_REVISION, dirty: typeof LLM_UTILS_BUILD_DIRTY !== 'undefined' ? LLM_UTILS_BUILD_DIRTY : true};
  const evidence = gitEvidence(path.resolve(import.meta.dir, '../../llm-utils'));
  return {revision: evidence.revision, dirty: evidence.dirty};
}

function gitEvidence(cwd: string): { revision: string; branch: string; dirty: boolean } {
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd, stderr: 'ignore' });
  const branch = Bun.spawnSync(['git', 'branch', '--show-current'], { cwd, stderr: 'ignore' });
  const status = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd, stderr: 'ignore' });
  return {
    revision: revision.success ? revision.stdout.toString().trim() : 'unavailable',
    branch: branch.success ? branch.stdout.toString().trim() || 'detached' : 'unavailable',
    dirty: status.success ? Boolean(status.stdout.toString().trim()) : false
  };
}

function countValues(values: Array<string | undefined>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) if (value) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export function cognitionMetrics(tags?: Record<string, string | number | boolean>): { metrics?: MetricsContext; metricsSink?: MetricsSink } {
  const scope = active.getStore();
  if (!scope) return {};
  const phase = scope.context.taskClass === 'investigate_ticket' ? 'investigation' : scope.context.taskClass === 'prepare_ticket' ? 'preparation' : undefined;
  tags = {...(phase ? {phase} : {}), ...tags};
  if (!Object.keys(tags).length) return { metrics: scope.context, metricsSink: scope.sink };
  const metrics = childMetricsContext(scope.context);
  metrics.tags = { ...scope.context.tags, ...tags };
  return { metrics, metricsSink: scope.sink };
}
export function recordResolutionStage(stage: ResolutionStage, outcome = ''): void {
  const scope = active.getStore();
  if (scope) scope.resolution = {stage, outcome};
}

export function countEngineering(name: EngineeringCounter, amount = 1): void {
  for (let scope = active.getStore(); scope; scope = scope.parent) scope.counters[name] = (scope.counters[name] ?? 0) + amount;
}
export function visitMetricArtifact(id: string): void {
  for (let scope = active.getStore(); scope; scope = scope.parent) if (!scope.visited.has(id)) { scope.visited.add(id); scope.counters.artifactVisits = scope.visited.size; }
}
export function recordMetricCompleteness(context: TicketCompletenessContext): void { const scope = active.getStore(); if (scope) scope.completenessContext = context; }

/** Telemetry scope only: never owns engineering state, writes or continuation. */
export async function withArtifactMetrics<T>(root: string, operation: string, artifactId: string, options: ArtifactOperationOptions & { tags?: Record<string, string | number | boolean> }, run: () => Promise<T>): Promise<T> {
  const parent = active.getStore(), cfg = loadConfig(root), store = new InMemoryMetricsStore();
  const requireEvidence = !parent && typeof options.tags?.study === 'string' && Boolean(options.tags.study);
  const context: MetricsContext = { ...(parent ? childMetricsContext(parent.context) : { traceId: crypto.randomUUID(), spanId: crypto.randomUUID() }), taskClass: operation, tags: { ...parent?.context.tags, ...options.tags } };
  const scope: MetricScope = { root, context, store, counters: {}, visited: new Set(), parent, sink: { append: event => {
    // Events are transient; persisted summaries contain aggregates only.
    for (let current: MetricScope | undefined = scope; current; current = current.parent) current.store.append(event);
  } } };
  const startedAt = new Date().toISOString(), start = performance.now();
  const projectBefore = gitEvidence(root), engineBefore = aiwfBuildEvidence(), llmUtilsBefore = llmUtilsBuildEvidence();
  if (requireEvidence) {
    if ([engineBefore.revision, llmUtilsBefore.revision, projectBefore.revision].includes('unavailable')) throw new Error('Benchmark provenance preflight failed: revision unavailable.');
    if (engineBefore.dirty || llmUtilsBefore.dirty || projectBefore.dirty) throw new Error('Benchmark provenance preflight failed: AIWF, llm-utils and target baseline must be clean.');
  }
  let outcome = 'error', verification: boolean | undefined;
  let acceptance: OperationSummary['acceptance'];
  return active.run(scope, async () => {
    visitMetricArtifact(artifactId);
    try {
      const result = await run();
      if (result && typeof result === 'object') {
        const control = result as { status?: string; value?: { verification?: boolean; dossier?: { disposition?: string }; disposition?: string } };
        outcome = control.status ?? 'complete';
        if (control.value?.disposition === 'rejectable' || control.value?.dossier?.disposition === 'rejectable') outcome = 'rejected';
        verification = control.value?.verification;
        const accepted = (control.value as any)?.acceptance;
        if (accepted?.criteria || accepted?.aspects) {
          const criteria = Array.isArray(accepted.criteria) ? accepted.criteria : [];
          const aspects = Array.isArray(accepted.aspects) ? accepted.aspects : [];
          acceptance = {
            criteriaPassed: criteria.filter((item: any) => item?.passed).length,
            criteriaTotal: criteria.length,
            aspectsPassed: aspects.filter((item: any) => item?.passed).length,
            aspectsTotal: aspects.length
          };
        }
      } else outcome = 'complete';
      return result;
    } finally {
      try {
        const events = store.query(), llm = new LlmMetrics(store);
        const llmEvents = llm.list();
        const systemOne = events.filter(event => event.kind === 'system1'), actors = events.filter(event => event.kind === 'actor');
        const projectAfter = gitEvidence(root);
        const modelConfigs = [...new Map(llmEvents.map(event => {
          const maxTokens = typeof event.metadata?.maxTokens === 'number' ? event.metadata.maxTokens : undefined;
          const contextWindow = typeof event.metadata?.contextWindow === 'number' ? event.metadata.contextWindow : undefined;
          const temperature = typeof event.metadata?.temperature === 'number' ? event.metadata.temperature : undefined;
          const providerOptionKeys = Array.isArray(event.metadata?.providerOptionKeys) ? event.metadata.providerOptionKeys.filter((value): value is string => typeof value === 'string') : undefined;
          const providerOptionsHash = typeof event.metadata?.providerOptionsHash === 'string' ? event.metadata.providerOptionsHash : undefined;
          const key = `${event.providerId}/${event.modelId}/${maxTokens ?? ''}/${contextWindow ?? ''}/${temperature ?? ''}/${providerOptionsHash ?? ''}`;
          return [key, {
            providerId: event.providerId,
            modelId: event.modelId,
            ...(maxTokens !== undefined ? {maxTokens} : {}),
            ...(contextWindow !== undefined ? {contextWindow} : {}),
            ...(temperature !== undefined ? {temperature} : {}),
            ...(providerOptionKeys?.length ? {providerOptionKeys} : {}),
            ...(providerOptionsHash ? {providerOptionsHash} : {})
          }] as const;
        })).values()];
        const phases = Object.fromEntries([...new Set(llmEvents.map(event => event.tags?.phase).filter((phase): phase is string => typeof phase === 'string'))].map(phase => [phase,
          new LlmMetrics(new InMemoryMetricsStore({initialEvents: llmEvents.filter(event => event.tags?.phase === phase)})).totals()
        ]));
        const summary: OperationSummary = { ...context, operation, artifactId, startedAt, durationMs: performance.now() - start, outcome,
          policy: { completeness: options.completeness, depth: options.depth ?? 1, maxArtifacts: options.maxArtifacts ?? cfg.maxArtifacts, critic: typeof options.critic === 'object' ? options.critic.id : options.critic ?? 'auto' },
          tags: context.tags ?? {}, version: packageJson.version, aiwfRevision: engineBefore.revision, aiwfDirty: engineBefore.dirty, llmUtilsVersion: LLM_UTILS_VERSION, llmUtilsRevision: llmUtilsBefore.revision, llmUtilsDirty: llmUtilsBefore.dirty,
          project: { revisionBefore: projectBefore.revision, revisionAfter: projectAfter.revision, branch: projectBefore.branch, dirtyBefore: projectBefore.dirty, dirtyAfter: projectAfter.dirty },
          runtime: { bun: Bun.version, platform: process.platform },
          counters: scope.counters, verification, acceptance,
          ...(scope.resolution ? {resolution: {...scope.resolution, outcome: scope.resolution.outcome || `${outcome}_${scope.resolution.stage}`}} : {}), completenessContext: scope.completenessContext,
          cognition: {
            llm: llm.totals(), byModel: llm.byModel(), costAvailable: llmEvents.length > 0 && llmEvents.every(event => typeof event.costUsd === 'number' && Number.isFinite(event.costUsd) && event.costUsd >= 0), structuredRepairs: llmEvents.filter(event => (event.attempt ?? 1) > 1).length, models: [...new Set(llm.list().map(event => `${event.providerId}/${event.modelId}`))],
            modelConfigs,
            phases,
            systemOne: { calls: systemOne.length, latencyMs: systemOne.reduce((sum, event) => sum + event.latencyMs, 0), unavailable: systemOne.filter(event => !event.available).length, backends: [...new Set(systemOne.map(event => `${event.backendId}/${event.quality}`))] },
            actor: {
              runs: actors.length,
              steps: actors.reduce((sum, event) => sum + event.steps, 0),
              toolCalls: actors.reduce((sum, event) => sum + event.toolCalls, 0),
              toolFailures: actors.reduce((sum, event) => sum + event.toolFailures, 0),
              toolFailureCategories: actors.reduce<Record<string, number>>((counts, event) => {
                const categories = event.toolFailureCategories ?? {unclassified: event.toolFailures};
                for (const [category, count] of Object.entries(categories)) counts[category] = (counts[category] ?? 0) + count;
                return counts;
              }, {}),
              missingToolRecoveries: actors.reduce((sum, event) => sum + event.missingToolRecoveries, 0)
            },
            termination: {
              llmFailureKinds: countValues(llmEvents.map(event => event.failureKind)),
              finishReasons: countValues(llmEvents.map(event => event.finishReason)),
              actorHaltReasons: countValues(actors.map(event => event.haltReason))
            }
          }
        };
        if (requireEvidence && [summary.aiwfRevision, summary.llmUtilsRevision, summary.project.revisionBefore, summary.project.revisionAfter].includes('unavailable')) {
          throw new Error('Benchmark provenance is incomplete.');
        }
        fs.mkdirSync(path.join(root, '.ai-workflow'), { recursive: true });
        fs.appendFileSync(path.join(root, '.ai-workflow/metrics.jsonl'), JSON.stringify(summary) + '\n');
      } catch (error) {
        if (requireEvidence) throw new Error(`Benchmark evidence persistence failed after '${operation}': ${String(error)}`);
        /* Ordinary telemetry must not fail engineering work. */
      }
    }
  });
}

export interface PerformanceQuery { operation?: string; artifactId?: string; traceId?: string; since?: string; tag?: string; includeNested?: boolean }
export function performanceQueryArgs(args: string[]): PerformanceQuery {
  const query: PerformanceQuery = {};
  const flags: Record<string, keyof Omit<PerformanceQuery, 'includeNested'>> = { '--operation': 'operation', '--ticket': 'artifactId', '--artifact': 'artifactId', '--trace': 'traceId', '--since': 'since', '--tag': 'tag' };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--include-nested') { query.includeNested = true; continue; }
    const key = flags[args[index]], value = args[++index];
    if (!key || !value || value.startsWith('--')) throw new Error('metrics accepts --operation, --ticket/--artifact, --trace, --since, --tag and --include-nested.');
    query[key] = value;
  }
  return query;
}
function sumUsage(usage: ExecutionUsage[]): ExecutionUsage {
  return usage.reduce((sum, row) => ({calls: sum.calls + row.calls, promptTokens: sum.promptTokens + row.promptTokens,
    completionTokens: sum.completionTokens + row.completionTokens, totalTokens: sum.totalTokens + row.totalTokens,
    totalLatencyMs: sum.totalLatencyMs + row.totalLatencyMs, knownCostUsd: sum.knownCostUsd + row.knownCostUsd,
    costKnownCalls: sum.costKnownCalls + row.costKnownCalls, unknownCostTokens: sum.unknownCostTokens + row.unknownCostTokens}),
    {calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalLatencyMs: 0, knownCostUsd: 0, costKnownCalls: 0, unknownCostTokens: 0});
}

function legacyUsage(row: OperationSummary): ExecutionUsage {
  const llm = row.cognition.llm;
  return {calls: llm.calls, promptTokens: llm.promptTokens, completionTokens: llm.completionTokens, totalTokens: llm.totalTokens,
    totalLatencyMs: llm.totalLatencyMs, knownCostUsd: row.cognition.costAvailable ? llm.totalCostUsd ?? 0 : 0,
    costKnownCalls: row.cognition.costAvailable ? llm.calls : 0, unknownCostTokens: row.cognition.costAvailable ? 0 : llm.totalTokens};
}

export function queryPerformance(root: string, query: PerformanceQuery = {}) {
  const file = path.join(root, '.ai-workflow/metrics.jsonl');
  const since = query.since && /^\d+d$/.test(query.since) ? Date.now() - Number(query.since.slice(0, -1)) * 86400000 : query.since ? Date.parse(query.since) : undefined;
  if (since !== undefined && !Number.isFinite(since)) throw new Error('since must be an ISO date or a number of days such as 7d.');
  const rows: OperationSummary[] = [];
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as OperationSummary;
      if (!query.includeNested && row.parentSpanId) continue;
      if (query.operation && row.operation !== query.operation || query.artifactId && row.artifactId !== query.artifactId || query.traceId && row.traceId !== query.traceId) continue;
      if (since !== undefined && Date.parse(row.startedAt) < since) continue;
      if (query.tag) { const [key, ...value] = query.tag.split('='); if (String(row.tags[key]) !== value.join('=')) continue; }
      rows.push(row);
    } catch { /* Ignore an interrupted trailing write. */ }
  }
  const durations = rows.map(row => row.durationMs).sort((a, b) => a - b);
  const percentile = (p: number) => durations.length ? durations[Math.max(0, Math.ceil(durations.length * p) - 1)] : null;
  const sum = (name: EngineeringCounter) => rows.reduce((total, row) => total + (row.counters[name] ?? 0), 0);
  const mergeCounts = (select: (row: OperationSummary) => Record<string, number>) => rows.reduce<Record<string, number>>((all, row) => {
    for (const [key, value] of Object.entries(select(row))) all[key] = (all[key] ?? 0) + value;
    return all;
  }, {});
  const execution = Object.fromEntries((['local', 'remote', 'unknown'] as const).map(locality => [locality, sumUsage(rows.map(row => {
    if (row.cognition.llm.execution) return row.cognition.llm.execution[locality];
    if (locality !== 'unknown') return sumUsage([]);
    return legacyUsage(row);
  }))])) as Record<'local' | 'remote' | 'unknown', ExecutionUsage>;
  const models = new Map<string, {providerId: string; modelId: string; usage: ExecutionUsage[]}>();
  const phases = new Map<string, ExecutionUsage[]>();
  for (const row of rows) {
    const measuredModels = row.cognition.byModel?.map(model => ({providerId: model.providerId, modelId: model.modelId, usage: sumUsage(Object.values(model.metrics.execution))}));
    const soleModel = row.cognition.models.length === 1 ? row.cognition.models[0].split('/') : [];
    const attributable = measuredModels ?? (soleModel.length > 1 ? [{providerId: soleModel[0], modelId: soleModel.slice(1).join('/'), usage: legacyUsage(row)}] : []);
    for (const model of attributable) {
      const key = `${model.providerId}/${model.modelId}`, group = models.get(key) ?? {providerId: model.providerId, modelId: model.modelId, usage: []};
      group.usage.push(model.usage); models.set(key, group);
    }
    for (const [phase, usage] of Object.entries(row.cognition.phases ?? {})) if (usage.execution) {
      const group = phases.get(phase) ?? []; group.push(sumUsage(Object.values(usage.execution))); phases.set(phase, group);
    }
  }
  return {
    execution,
    byPhase: Object.fromEntries([...phases].map(([phase, usage]) => [phase, sumUsage(usage)])),
    byModel: [...models.values()].map(({providerId, modelId, usage}) => ({providerId, modelId, ...sumUsage(usage)})),
    legacyUnattributedModelTokens: rows.filter(row => !row.cognition.byModel && row.cognition.models.length !== 1).reduce((sum, row) => sum + row.cognition.llm.totalTokens, 0),
    knownRemoteCostUsd: execution.remote.costKnownCalls ? execution.remote.knownCostUsd : null,
    unknownPriceRemoteTokens: execution.remote.unknownCostTokens,
    resolutionOutcomes: rows.reduce<Record<string, number>>((counts, row) => { if (row.resolution) counts[row.resolution.outcome] = (counts[row.resolution.outcome] ?? 0) + 1; return counts; }, {}),
    toolFailureCategories: mergeCounts(row => row.cognition.actor.toolFailureCategories ?? {unclassified: row.cognition.actor.toolFailures}),
    runs: rows.length, medianMs: percentile(0.5), p95Ms: percentile(0.95),
    outcomes: rows.reduce<Record<string, number>>((counts, row) => { counts[row.outcome] = (counts[row.outcome] ?? 0) + 1; return counts; }, {}),
    totalTokens: rows.reduce((total, row) => total + row.cognition.llm.totalTokens, 0),
    totalCostUsd: rows.length > 0 && rows.every(row => row.cognition.costAvailable)
      ? rows.reduce((total, row) => total + (row.cognition.llm.totalCostUsd ?? 0), 0)
      : null,
    knownCostUsd: rows.some(row => row.cognition.llm.costKnownCalls || row.cognition.costAvailable) ? rows.reduce((total, row) => total + (row.cognition.llm.knownCostUsd ?? (row.cognition.costAvailable ? row.cognition.llm.totalCostUsd ?? 0 : 0)), 0) : null,
    costAvailableRuns: rows.filter(row => row.cognition.costAvailable).length,
    structuredRepairs: rows.reduce((total, row) => total + row.cognition.structuredRepairs, 0),
    repairs: sum('repairs'), criticRounds: sum('criticRounds'), criticRevisions: sum('criticRevisions'),
    humanInterventions: rows.some(row => row.counters.humanInterventions !== undefined) ? sum('humanInterventions') : null,
    humanInterventionMeasuredRuns: rows.filter(row => row.counters.humanInterventions !== undefined).length,
    optionalCandidates: sum('optionalCandidates'), optionalSelected: sum('optionalSelected'), evidenceReduction: sum('optionalCandidates') ? 1 - sum('optionalSelected') / sum('optionalCandidates') : null,
    verifiedRuns: rows.filter(row => row.verification === true).length,
    firstPassVerification: rows.filter(row => row.verification === true && !(row.counters.repairs ?? 0)).length,
    llmFailureKinds: mergeCounts(row => row.cognition.termination?.llmFailureKinds ?? {}),
    finishReasons: mergeCounts(row => row.cognition.termination?.finishReasons ?? {}),
    actorHaltReasons: mergeCounts(row => row.cognition.termination?.actorHaltReasons ?? {}),
    systemOneCalls: rows.reduce((total, row) => total + row.cognition.systemOne.calls, 0),
    rows
  };
}

export interface PerformanceEvidenceBundle {
  schemaVersion: 1;
  exportedAt: string;
  query: PerformanceQuery;
  summary: Omit<ReturnType<typeof queryPerformance>, 'rows'>;
  runs: OperationSummary[];
}

export function performanceEvidenceBundle(root: string, query: PerformanceQuery = {}): PerformanceEvidenceBundle {
  const { rows, ...summary } = queryPerformance(root, query);
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), query, summary, runs: rows };
}
