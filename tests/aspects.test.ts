import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Aspect, Goal, Flow, Epic, Feature, UserStory, Ticket, ModuleNode, TestNode, Artifact, Decision, FileNode } from '../src/graph/ontology.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { exportProjections, importProjections } from '../src/graph/projections.ts';
import type { SystemOne } from '@dharmax/llm-utils';

describe('first-class Aspects', () => {
  let root: string, store: WorkflowStore;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-aspects-')); store = new WorkflowStore(root); initializeTools(); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const aspect = (id: string) => Aspect.create(store, { id, title: id, status: 'accepted', acceptanceCriteria: ['Relevant evidence supports the concern'] });

  it('inherits Goal concerns through Flow/Story while keeping Feature concerns capability-scoped', async () => {
    const goal = await store.upsertEntity<Goal>(Goal.dcr, { id: 'G', title: 'Goal' });
    const flow = await store.upsertEntity<Flow>(Flow.dcr, { id: 'FL', title: 'Flow', actor: 'Developer' });
    const e = await store.upsertEntity<Epic>(Epic.dcr, { id: 'E', title: 'Epic' });
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature' });
    const story = await store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Story' });
    const m = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, { id: 'M', title: 'Module' });
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Parent', lane: 'Todo' });
    const c = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'C', title: 'Child', lane: 'Todo' });
    const initiative = await aspect('initiative'), outcome = await aspect('outcome'), robust = await aspect('robust'), module = await aspect('module');
    await initiative.applyTo(e, store); await outcome.applyTo(goal, store); await robust.applyTo(f, store); await module.applyTo(m, store);
    await store.relate(flow, 'serves', goal); await store.relate(flow, 'contains', story); await store.relate(f, 'enables', story);
    await store.relate(e, 'targets', f); await store.relate(e, 'contains', t);
    await store.relate(t, 'implements', f); await store.relate(t, 'addresses', story); await store.relate(t, 'targets', m); await store.relate(t, 'contains', c);
    expect((await f.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['robust']);
    expect((await story.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['outcome']);
    expect((await c.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['initiative', 'module', 'outcome', 'robust']);
    await store.relate(c, 'contains', t);
    await expect(c.applicableAspects(store)).rejects.toThrow('containment cycle');
    await expect(robust.applyTo(t, store)).rejects.toThrow('not allowed');
  });

  it('accepts work, code, tests, reports and Decisions as evidence without manufacturing dedicated work', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature' });
    const a = await aspect('robust'); await a.applyTo(f, store);
    const entities = [
      await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Existing work', lane: 'Done' }),
      await store.upsertEntity<TestNode>(TestNode.dcr, { id: 'TEST', title: 'Regression' }),
      await store.upsertEntity<Artifact>(Artifact.dcr, { id: 'REPORT', title: 'Benchmark', artifactKind: 'report' }),
      await store.upsertEntity<Decision>(Decision.dcr, { id: 'DEC', title: 'Constraint' })
    ];
    for (let i = 0; i < entities.length; i++) await registry.execute('link_product', { sourceId: store.localId(entities[i].id), predicate: ['addresses', 'verifies', 'verifies', 'governs'][i], targetId: 'robust' }, { store, projectRoot: root });
    const code = await store.upsertEntity<FileNode>(FileNode.dcr, { id: 'src/unit.ts', title: 'unit.ts' });
    await store.relate(entities[0], 'modifies', code);
    const assessment = await f.assessAspects(store);
    expect(assessment.aspects[0]).toMatchObject({ tickets: ['T'], tests: ['TEST'], artifacts: ['REPORT'], decisions: ['DEC'], code: ['src/unit.ts'], gaps: [] });
    expect(assessment.knownGaps).toEqual([]);
    expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1);
  });

  it('uses the same preview/fingerprint boundary for Aspect mutation and rejects invalid later links before writes', async () => {
    await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Work', lane: 'Todo' });
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const bad = { action: 'product_change' as const, mutations: [
      { kind: 'product_create' as const, entityType: 'Aspect' as const, id: 'A', fields: { title: 'Concern', status: 'accepted' } },
      { kind: 'product_link' as const, sourceId: 'A', predicate: 'applies_to', targetId: 'T' }
    ] };
    expect((await engine.previewChange(bad)).blocked).toBe(true);
    expect(await store.getEntity('A', Aspect.dcr)).toBeNull();
    const a = await aspect('A');
    const request = { action: 'product_change' as const, mutations: [{ kind: 'product_update' as const, entityType: 'Aspect' as const, id: 'A', fields: { title: 'Updated concern' } }] };
    const preview = await engine.previewChange(request);
    await a.revise(store, { body: 'Concurrent change' });
    await expect(engine.applyChange(request, preview.fingerprint)).rejects.toThrow('fingerprint');
  });

  it('round trips owned scopes while ignoring edits to rendered evidence', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature' });
    const a = await aspect('A'); await a.applyTo(f, store);
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Existing work', lane: 'Todo' });
    await store.relate(t, 'addresses', a); await exportProjections(store, root);
    const file = path.join(root, 'aspects.md');
    const text = fs.readFileSync(file, 'utf8').replace('**Scopes**: `F`', '**Scopes**: None').replace('Tickets: T', 'Tickets: invented');
    fs.writeFileSync(file, text); fs.utimesSync(file, new Date(Date.now() + 1000), new Date(Date.now() + 1000));
    await importProjections(store, root);
    expect((await store.getOutgoing(a.id, 'applies_to')).length).toBe(0);
    expect((await store.getIncoming(a.id, 'addresses')).map(e => store.localId(e.sourceId))).toEqual(['T']);
    store.close(); store = new WorkflowStore(root);
    expect((await store.getEntity<Aspect>('A', Aspect.dcr))!.acceptanceCriteria).toEqual(['Relevant evidence supports the concern']);
  });

  it('shortlists only optional candidates and lets independent review catch omission and ceremony without writes', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Reliable persistent queue' });
    const a = await aspect('mandatory'); await a.applyTo(f, store);
    const systemOne: SystemOne = { assess: async () => ({ answers: { persistence: { choice: 'omit' }, localization: { choice: 'consider' } }, backendId: 'fixture', quality: 'high', latencyMs: 0 }) };
    const result = await f.reviewMissingAspects(store, { completeness: 'production', systemOne,
      candidates: [{ id: 'mandatory', title: 'Required concern' }, { id: 'persistence', title: 'Persistence' }, { id: 'localization', title: 'Localization' }],
      critic: { id: 'independent', review: async input => {
        expect(input.applicableAspects).toContain('mandatory'); expect(input.candidateAspects).toContain('persistence');
        expect(input.proposal.map(p => p.id)).toEqual(['localization']);
        return { verdict: 'revise', findings: [{ message: 'Persistence was omitted' }, { message: 'Localization is ceremonial here' }] };
      } } });
    expect(result.review.verdict).toBe('revise');
    expect((await store.listEntities<Aspect>(Aspect.dcr)).length).toBe(1);
    const fallback = await f.reviewMissingAspects(store, { completeness: 'production', candidates: [{ id: 'persistence', title: 'Persistence' }], systemOne: { assess: async () => null }, critic: { id: 'review', review: async () => ({ verdict: 'accept' }) } });
    expect(fallback.shortlisted.length).toBe(1);
  });
});
