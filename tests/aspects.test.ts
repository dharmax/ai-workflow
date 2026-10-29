import {createAspect,updateProduct} from './product-review.ts';
import {acceptProduct} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Aspect, Epic, Feature, UserStory, Ticket, ModuleNode, TestNode, Artifact, Decision, FileNode } from '../src/model/ontology.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { exportProjections, importProjections } from '../src/services/projection-service.ts';
import type { SystemOne } from '@dharmax/llm-utils';

describe('first-class Aspects', () => {
  let root: string, store: WorkflowStore;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-aspects-')); store = new WorkflowStore(root); initializeTools(); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const aspect = (id: string) => createAspect(store,{ id, title: id, status: 'accepted', acceptanceCriteria: ['Relevant evidence supports the concern'] });

  it('keeps Epic concerns on its work, inherits Feature concerns into Story work, and deduplicates Module/parent paths', async () => {
    const e = await store.upsertEntity<Epic>(Epic.dcr, { id: 'E', title: 'Epic' });
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature' });
    const s = await store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Story' });
    const m = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, { id: 'M', title: 'Module' });
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Parent', lane: 'Todo' });
    const c = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'C', title: 'Child', lane: 'Todo' });
    const initiative = await aspect('initiative'), robust = await aspect('robust'), module = await aspect('module');
    await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(initiative.id),predicate:"applies_to",targetId:store.localId(e.id)}]); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(robust.id),predicate:"applies_to",targetId:store.localId(f.id)}]); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(robust.id),predicate:"applies_to",targetId:store.localId(s.id)}]); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(module.id),predicate:"applies_to",targetId:store.localId(m.id)}]);
    await store.relate(e, 'targets', f); await store.relate(f, 'contains', s); await store.relate(e, 'contains', t);
    await store.relate(t, 'implements', f); await store.relate(t, 'addresses', s); await store.relate(t, 'targets', m); await store.relate(t, 'contains', c);
    expect((await f.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['robust']);
    expect((await s.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['robust']);
    expect((await c.applicableAspects(store)).map(a => store.localId(a.id))).toEqual(['initiative', 'module', 'robust']);
    await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(robust.id),predicate:"applies_to",targetId:store.localId(t.id)}]);
    expect((await robust.view(store)).scopes).toContain('T');
    await store.relate(c, 'contains', t);
    await expect(c.applicableAspects(store)).rejects.toThrow('containment cycle');
    await expect(acceptProduct(store, [{kind:"product_link",sourceId:store.localId(robust.id),predicate:"applies_to",targetId:store.localId(t.id)}])).rejects.toThrow('cycle');
  });

  it('accepts work, code, tests, reports and Decisions as evidence without manufacturing dedicated work', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature' });
    const a = await aspect('robust'); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(a.id),predicate:"applies_to",targetId:store.localId(f.id)}]);
    const entities = [
      await store.sp.createEntity<Ticket>(Ticket.dcr, { id:store.formatId(Ticket.dcr,'T'), _id:store.formatId(Ticket.dcr,'T'), title: 'Existing work', lane: 'Done', status:'verified' },true,false),
      await store.upsertEntity<TestNode>(TestNode.dcr, { id: 'TEST', title: 'Regression' }),
      await store.upsertEntity<Artifact>(Artifact.dcr, { id: 'REPORT', title: 'Benchmark', artifactKind: 'report' }),
      await store.sp.createEntity<Decision>(Decision.dcr, { id:store.formatId(Decision.dcr,"DEC"),_id:store.formatId(Decision.dcr,"DEC"), title: 'Constraint' },true,false)
    ];
    // Existing proof is fixture state, not permission for generic authoring to mint it.
    await store.withTestArtifactWrite(entities[1].id,()=>store.relate(entities[1],'verifies',a));
    await store.sp.createPredicate(entities[2],store.sp.ontology.pdcr('verifies'),a);
    for (const i of [0,3]) await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(entities[i].id),predicate:i===0?'addresses':'governs',targetId:'robust'}]);
    const code = await store.upsertEntity<FileNode>(FileNode.dcr, { id: 'src/unit.ts', title: 'unit.ts' });
    await store.relate(entities[0], 'modifies', code);
    const assessment = await f.assessAspects(store);
    expect(assessment.aspects[0]).toMatchObject({ tickets: ['T'], tests: ['TEST'], artifacts: ['REPORT'], decisions: ['DEC'], code: ['src/unit.ts'], gaps: [] });
    expect(assessment.knownGaps).toEqual([]);
    expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1);
  });

  it('uses the same preview/fingerprint boundary for Aspect mutation and rejects invalid later links before writes', async () => {
    await store.sp.createEntity<Decision>(Decision.dcr, { id:store.formatId(Decision.dcr,"D"),_id:store.formatId(Decision.dcr,"D"), title: 'Engineering decision' },true,false);
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const bad = { action: 'product_change' as const, mutations: [
      { kind: 'product_create' as const, entityType: 'Aspect' as const, id: 'A', fields: { title: 'Concern', status: 'accepted' } },
      { kind: 'product_link' as const, sourceId: 'A', predicate: 'applies_to', targetId: 'D' }
    ] };
    expect((await engine.previewChange(bad)).blocked).toBe(true);
    expect(await store.getEntity('A', Aspect.dcr)).toBeNull();
    const a = await aspect('A');
    const request = { action: 'product_change' as const, mutations: [{ kind: 'product_update' as const, entityType: 'Aspect' as const, id: 'A', fields: { title: 'Updated concern' } }] };
    const preview = await engine.previewChange(request);
    await updateProduct(store, "Aspect", {id:store.localId(a.id),body: 'Concurrent change'});
    await expect(engine.applyChange(request, preview.fingerprint)).rejects.toThrow('fingerprint');
  });

  it('does not rewrite unchanged Aspect projections but updates changed definitions', async () => {
    await aspect('A');
    await exportProjections(store, root);
    const file = path.join(root, 'aspects.md');
    const original = fs.readFileSync(file, 'utf8');
    const previous = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(file, previous, previous);
    const mtime = fs.statSync(file).mtimeMs;
    await exportProjections(store, root);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
    await updateProduct(store, 'Aspect', {id: 'A', body: 'Updated description'});
    await exportProjections(store, root);
    expect(fs.readFileSync(file, 'utf8')).not.toBe(original);
  });

  it('round trips owned scopes while ignoring edits to rendered evidence', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature' });
    const a = await aspect('A'); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(a.id),predicate:"applies_to",targetId:store.localId(f.id)}]);
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
    const a = await aspect('mandatory'); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(a.id),predicate:"applies_to",targetId:store.localId(f.id)}]);
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
