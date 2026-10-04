import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket } from '../src/graph/ontology.ts';
import { RemoteSystemOne, Asker, LLMActor } from '@dharmax/llm-utils';
import { saveConfig } from '../src/config.ts';
import { queryPerformance, withArtifactMetrics, cognitionMetrics, countEngineering, performanceQueryArgs, performanceEvidenceBundle } from '../src/performance-metrics.ts';

describe('correlated artifact performance telemetry', () => {
  let root: string, store: WorkflowStore;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-metrics-')); store = new WorkflowStore(root); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('correlates prepare/investigate with shared System-1 and Asker metrics, survives restart and excludes content', async () => {
    const secret = 'PRIVATE_SOURCE_PROMPT_BODY';
    const server = Bun.serve({ port: 0, fetch: async request => {
      if (new URL(request.url).pathname === '/classify') return Response.json({ backendId: 'fixture', quality: 'high', answers: Object.fromEntries(Object.entries({ workKind: 'code', atomicity: 'atomic', scope: 'grounded', context: 'none', depth: 'deterministic' }).map(([id, choice]) => [id, { choice, probabilities: { [choice]: 1 } }])) });
      return Response.json({ message: { content: JSON.stringify({ disposition: 'needs_preparation', rationale: 'Missing authored acceptance', acceptanceCriteria: ['Restart retains jobs'] }) }, prompt_eval_count: 11, eval_count: 7 });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture' });
    try {
      const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Persist jobs', body: secret, lane: 'Todo' });
      const result = await t.prepare(store, { tags: { variant: 'aiwf' }, systemOne: new RemoteSystemOne({ url: server.url.toString() }), critic: 'none', propose: async dossier => ({ rationale: 'Confirm missing criteria', acceptanceCriteria: dossier.proposedEnrichments.acceptanceCriteria, children: [] }) });
      expect(result.status).toBe('complete');
      const all = queryPerformance(root, { includeNested: true });
      expect(all.rows).toHaveLength(2); expect(new Set(all.rows.map(row => row.traceId)).size).toBe(1);
      const investigation = all.rows.find(row => row.operation === 'investigate_ticket')!, preparation = all.rows.find(row => row.operation === 'prepare_ticket')!;
      expect(investigation.parentSpanId).toBe(preparation.spanId);
      expect(preparation.cognition.llm).toMatchObject({ calls: 1, promptTokens: 11, completionTokens: 7, totalTokens: 18 });
      expect(preparation.cognition.systemOne.calls).toBe(1); expect(preparation.counters.artifactVisits).toBe(1);
      expect(preparation.aiwfRevision).toBeString(); expect(preparation.llmUtilsRevision).toBeString(); expect(preparation.project.revisionBefore).toBeString(); expect(preparation.runtime.bun).toBeString();
      expect(queryPerformance(root).totalTokens).toBe(18);
      const raw = fs.readFileSync(path.join(root, '.ai-workflow/metrics.jsonl'), 'utf8'); expect(raw).not.toContain(secret); expect(raw).not.toContain('Restart retains jobs'); expect(raw).not.toContain('Missing authored acceptance');
      store.close(); store = new WorkflowStore(root);
      expect(queryPerformance(root, { tag: 'variant=aiwf', operation: 'prepare_ticket', since: '1d' }).runs).toBe(1);
      expect(queryPerformance(root, { artifactId: 'OTHER' }).runs).toBe(0);
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  });

  it('uses llm-utils Actor events without counting their LLM tokens twice', async () => {
    const server = Bun.serve({ port: 0, fetch: () => Response.json({ message: { content: JSON.stringify({ thought: 'No tools needed', action: 'final_answer', finalAnswer: 'done' }) }, prompt_eval_count: 5, eval_count: 3 }) });
    try {
      const asker = new Asker({ providers: { ollama: { id: 'ollama', host: server.url.toString(), available: true } }, defaultModel: 'ollama/fixture' });
      const actor = new LLMActor(asker, { tools: [], maxSteps: 1 });
      await withArtifactMetrics(root, 'controlled_actor', 'T', {}, async () => actor.run('PRIVATE_ACTOR_TASK', cognitionMetrics()));
      const row = queryPerformance(root).rows[0];
      expect(row.cognition.actor.runs).toBe(1); expect(row.cognition.llm.calls).toBe(1); expect(row.cognition.llm.totalTokens).toBe(8);
      expect(row.cognition.termination.actorHaltReasons.completed).toBe(1); expect(row.cognition.modelConfigs).toBeArray();
      expect(fs.readFileSync(path.join(root, '.ai-workflow/metrics.jsonl'), 'utf8')).not.toContain('PRIVATE_ACTOR_TASK');
    } finally { server.stop(true); }
  });

  it('reports counters/outcomes and isolates telemetry write failures from engineering results', async () => {
    await withArtifactMetrics(root, 'resolve_ticket', 'T', {}, async () => { countEngineering('optionalCandidates', 4); countEngineering('optionalSelected', 1); countEngineering('criticRounds', 2); countEngineering('criticRevisions'); countEngineering('repairs'); return { status: 'complete', value: { verification: true } }; });
    await withArtifactMetrics(root, 'resolve_ticket', 'U', {}, async () => ({ status: 'needs_input' }));
    const summary = queryPerformance(root);
    expect(summary).toMatchObject({ runs: 2, outcomes: { complete: 1, needs_input: 1 }, repairs: 1, criticRounds: 2, criticRevisions: 1, evidenceReduction: 0.75, firstPassVerification: 0 });
    expect(summary.p95Ms).toBeGreaterThanOrEqual(summary.medianMs!);
    expect(performanceQueryArgs(['--operation', 'resolve_ticket', '--tag', 'variant=aiwf', '--ticket', 'T', '--trace', 'trace-1'])).toEqual({ operation: 'resolve_ticket', tag: 'variant=aiwf', artifactId: 'T', traceId: 'trace-1' });
    const bundle = performanceEvidenceBundle(root, { operation: 'resolve_ticket' }); expect(bundle.schemaVersion).toBe(1); expect(bundle.runs).toHaveLength(2); expect(JSON.stringify(bundle)).not.toContain('PRIVATE_SOURCE_PROMPT_BODY');
    const file = path.join(root, '.ai-workflow/metrics.jsonl'); fs.unlinkSync(file); fs.mkdirSync(file);
    expect(await withArtifactMetrics(root, 'controlled', 'T', {}, async () => 42)).toBe(42);
    await expect(withArtifactMetrics(root, 'controlled', 'T', {}, async () => { throw Error('engineering failure'); })).rejects.toThrow('engineering failure');
    expect(() => performanceQueryArgs(['--unknown', 'value'])).toThrow();
  });
});
