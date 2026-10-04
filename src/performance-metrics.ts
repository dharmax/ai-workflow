import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { InMemoryMetricsStore, LlmMetrics, childMetricsContext, type MetricsContext, type MetricsSink } from '@dharmax/llm-utils';
import { loadConfig } from './config.ts';
import type { ArtifactOperationOptions, TicketCompletenessContext } from './artifact-policy.ts';

export type EngineeringCounter = 'artifactVisits' | 'artifactsCreated' | 'artifactsReused' | 'toolCalls' | 'sourceReads' | 'exactSymbolReads' | 'codeEdits' | 'filesTouched' | 'testsRun' | 'testFailures' | 'repairs' | 'criticRounds' | 'criticRevisions' | 'systemOneCalls' | 'reasoningCalls' | 'optionalCandidates' | 'optionalSelected' | 'humanInterventions';
export interface OperationSummary {
  traceId: string; spanId?: string; parentSpanId?: string; operation: string; artifactId: string;
  startedAt: string; durationMs: number; outcome: string;
  policy: { completeness?: string; depth: number | 'all'; maxArtifacts: number; critic: string };
  tags: Record<string, string | number | boolean>; version: string; aiwfRevision: string; llmUtilsVersion: string;
  project: { revisionBefore: string; revisionAfter: string; branch: string; dirtyBefore: boolean; dirtyAfter: boolean };
  runtime: { bun: string; platform: string };
  counters: Partial<Record<EngineeringCounter, number>>;
  cognition: {
    llm: ReturnType<LlmMetrics['totals']>; costAvailable: boolean; models: string[];
    systemOne: { calls: number; latencyMs: number; unavailable: number; backends: string[] };
    actor: { runs: number; steps: number; toolCalls: number; toolFailures: number; missingToolRecoveries: number };
    termination: { llmFailureKinds: Record<string, number>; finishReasons: Record<string, number>; actorHaltReasons: Record<string, number> };
  };
  verification?: boolean;
  acceptance?: { criteriaPassed: number; criteriaTotal: number; aspectsPassed: number; aspectsTotal: number };
  completenessContext?: TicketCompletenessContext;
}
interface MetricScope { root: string; context: MetricsContext; sink: MetricsSink; store: InMemoryMetricsStore; counters: OperationSummary['counters']; visited: Set<string>; completenessContext?: TicketCompletenessContext; parent?: MetricScope }
const active = new AsyncLocalStorage<MetricScope>();

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

export function cognitionMetrics(): { metrics?: MetricsContext; metricsSink?: MetricsSink } {
  const scope = active.getStore(); return scope ? { metrics: scope.context, metricsSink: scope.sink } : {};
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
  const context: MetricsContext = { ...(parent ? childMetricsContext(parent.context) : { traceId: crypto.randomUUID(), spanId: crypto.randomUUID() }), taskClass: operation, tags: { ...parent?.context.tags, ...options.tags } };
  const scope: MetricScope = { root, context, store, counters: {}, visited: new Set(), parent, sink: { append: event => {
    // Events are transient; persisted summaries contain aggregates only.
    for (let current: MetricScope | undefined = scope; current; current = current.parent) current.store.append(event);
  } } };
  const startedAt = new Date().toISOString(), start = performance.now();
  const projectBefore = gitEvidence(root);
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
        const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, '../package.json'), 'utf8')) as { version: string };
        const dependency = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, '../node_modules/@dharmax/llm-utils/package.json'), 'utf8')) as { version: string };
        const aiwfGit = gitEvidence(path.resolve(import.meta.dir, '..')), projectAfter = gitEvidence(root);
        const summary: OperationSummary = { ...context, operation, artifactId, startedAt, durationMs: performance.now() - start, outcome,
          policy: { completeness: options.completeness, depth: options.depth ?? 1, maxArtifacts: options.maxArtifacts ?? cfg.maxArtifacts, critic: typeof options.critic === 'object' ? options.critic.id : options.critic ?? 'auto' },
          tags: context.tags ?? {}, version: pkg.version, aiwfRevision: aiwfGit.revision, llmUtilsVersion: dependency.version,
          project: { revisionBefore: projectBefore.revision, revisionAfter: projectAfter.revision, branch: projectBefore.branch, dirtyBefore: projectBefore.dirty, dirtyAfter: projectAfter.dirty },
          runtime: { bun: Bun.version, platform: process.platform },
          counters: scope.counters, verification, acceptance, completenessContext: scope.completenessContext,
          cognition: {
            llm: llm.totals(), costAvailable: llmEvents.some(event => event.costUsd !== undefined), models: [...new Set(llm.list().map(event => `${event.providerId}/${event.modelId}`))],
            systemOne: { calls: systemOne.length, latencyMs: systemOne.reduce((sum, event) => sum + event.latencyMs, 0), unavailable: systemOne.filter(event => !event.available).length, backends: [...new Set(systemOne.map(event => `${event.backendId}/${event.quality}`))] },
            actor: {
              runs: actors.length,
              steps: actors.reduce((sum, event) => sum + event.steps, 0),
              toolCalls: actors.reduce((sum, event) => sum + event.toolCalls, 0),
              toolFailures: actors.reduce((sum, event) => sum + event.toolFailures, 0),
              missingToolRecoveries: actors.reduce((sum, event) => sum + event.missingToolRecoveries, 0)
            },
            termination: {
              llmFailureKinds: countValues(llmEvents.map(event => event.failureKind)),
              finishReasons: countValues(llmEvents.map(event => event.finishReason)),
              actorHaltReasons: countValues(actors.map(event => event.haltReason))
            }
          }
        };
        fs.mkdirSync(path.join(root, '.ai-workflow'), { recursive: true });
        fs.appendFileSync(path.join(root, '.ai-workflow/metrics.jsonl'), JSON.stringify(summary) + '\n');
      } catch { /* Measurement/persistence failure must not fail engineering work. */ }
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
  return {
    runs: rows.length, medianMs: percentile(0.5), p95Ms: percentile(0.95),
    outcomes: rows.reduce<Record<string, number>>((counts, row) => { counts[row.outcome] = (counts[row.outcome] ?? 0) + 1; return counts; }, {}),
    totalTokens: rows.reduce((total, row) => total + row.cognition.llm.totalTokens, 0),
    totalCostUsd: rows.reduce((total, row) => total + row.cognition.llm.totalCostUsd, 0),
    costAvailableRuns: rows.filter(row => row.cognition.costAvailable).length,
    repairs: sum('repairs'), criticRounds: sum('criticRounds'), criticRevisions: sum('criticRevisions'), humanInterventions: sum('humanInterventions'),
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
