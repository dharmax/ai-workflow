import {createAspect,acceptProduct} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import {CompletionEngine,LayaSystemOne} from '@dharmax/llm-utils';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Feature, UserStory, Aspect, Decision, Lesson, FileNode, SymbolNode, TestNode } from '../src/graph/ontology.ts';
import { indexSingleFile } from '../src/graph/indexer.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import type { SystemOne } from '@dharmax/llm-utils';

describe('grounded Ticket investigation', () => {
  let root: string, store: WorkflowStore;
  const unavailable: SystemOne = { assess: async () => null };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-investigate-')); store = new WorkflowStore(root); initializeTools(); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const ticket = (id = 'T', title = 'Repair queue') => store.upsertEntity<Ticket>(Ticket.dcr, { id, title, body: 'Fix the queue while preserving existing results.', lane: 'Todo', acceptanceCriteria: ['Failed jobs remain recoverable'] });
  const routing = (quality: 'low' | 'high', overrides: Record<string, string> = {}): SystemOne => ({ assess: async (_state, questions) => ({ backendId: 'fixture', quality, latencyMs: 0, answers: Object.fromEntries(Object.keys(questions).map(id => { const choice = overrides[id] ?? ({ workKind: 'code', atomicity: 'atomic', scope: 'grounded', context: 'code', depth: 'deterministic' }[id] ?? 'omit'); return [id, { choice, probabilities: { [choice]: 0.99 } }]; })) }) });

  it('investigates an unanchored Bug using its reproduction, error location and actual source', async () => {
    fs.writeFileSync(path.join(root, 'queue.ts'), 'export function enqueue(job: string) { throw new Error("queue unavailable"); }');
    await indexSingleFile(store, path.join(root, 'queue.ts'), 'queue.ts');
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, {id:'BUG',title:'Jobs cannot be submitted',body:'Restore submission.',kind:'bug',lane:'Todo',
      acceptanceCriteria:['Submitting a job succeeds'],defect:{reproduction:'Call enqueue("job")',expected:'Job is queued',actual:'Error: queue unavailable at queue.ts:1',evidence:['queue.ts:1']}});
    fs.mkdirSync(path.join(root,'tests'));
    fs.writeFileSync(path.join(root,'tests/queue.test.ts'),'import {it,expect} from "bun:test"; import {enqueue} from "../queue"; it("submits a job",()=>expect(()=>enqueue("job")).not.toThrow());');
    const test=await store.withTestArtifactWrite('test:tests/queue.test.ts',()=>store.upsertEntity<TestNode>(TestNode.dcr,{id:'test:tests/queue.test.ts',title:'Submission regression',filePath:'tests/queue.test.ts',command:['bun','test','tests/queue.test.ts']}));
    const file=(await store.getEntity<FileNode>('queue.ts',FileNode.dcr))!;
    await store.withTestArtifactWrite(test.id,()=>store.relate(test,'verifies',file));
    const route=spyOn(LayaSystemOne.prototype,'assess').mockImplementation(routing('high').assess);
    let reasoningCalls=0;
    const provider=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(prompt,model)=>{
      reasoningCalls++;
      expect(prompt).toContain('throw new Error');expect(prompt).toContain('Job is queued');expect(prompt).toContain('tests/queue.test.ts');
      return {model,ok:true,text:JSON.stringify({disposition:'ready',rationale:'Source queue.ts unconditionally throws. Reported enqueue failure is consistent with this candidate cause; runtime reproduction has not been executed. Preserve tests/queue.test.ts as the submission regression.'})};
    });
    let result:Awaited<ReturnType<typeof t.investigate>>;
    try {result=await registry.execute('investigate_ticket',{ticketId:'BUG'},{store,projectRoot:root});}
    finally {provider.mockRestore();route.mockRestore();}
    expect(reasoningCalls).toBe(1);
    expect(result.status).toBe('complete'); if(result.status!=='complete') throw Error(JSON.stringify(result));
    expect(result.value.evidence.some(e => e.filePath==='queue.ts' && e.source?.includes('queue unavailable'))).toBe(true);
    expect(result.value.rationale).toContain('queue.ts');
    expect(result.value.provenance.reasoningUsed).toBe(true);
    expect(result.value.uncertainties?.join(' ')).toContain('has not executed');
    expect(await store.getOutgoing(t.id,'modifies')).toEqual([]);
  });

  it('reports precise investigation uncertainty when a complete Bug has no discoverable source', async () => {
    const t=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'UNKNOWN',title:'Remote submission fails',body:'Remote failure',kind:'bug',lane:'Todo',acceptanceCriteria:['Submission succeeds'],defect:{reproduction:'Submit job remotely',expected:'Job is queued',actual:'Remote service returns 502'}});
    const result=await t.investigate(store,{systemOne:routing('high')});
    expect(result.status).toBe('complete');if(result.status!=='complete')throw Error(JSON.stringify(result));
    expect(result.value.rationale).toMatch(/source|location/i);
    expect(result.value.rationale).toMatch(/unknown|uncertain|not.*reproduc/i);
    expect(result.value.disposition).toBe('needs_preparation');
    expect((await store.getEntity<Ticket>('UNKNOWN',Ticket.dcr))!.lane).toBe('Todo');
    const preparation=await t.prepare(store,{systemOne:routing('high'),propose:async()=>{throw Error('Missing engineering facts cannot be invented in preparation');}});
    expect(preparation.status).toBe('needs_input');
  });

  it('returns mandatory scope, Decision, Lesson, Aspect and test evidence without reasoning or semantic changes', async () => {
    const t = await ticket();
    fs.writeFileSync(path.join(root, 'queue.ts'), 'export const queue = 1;');
    const file = await store.upsertEntity<FileNode>(FileNode.dcr, { id: 'queue.ts', title: 'queue.ts' });
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Queue', completenessTarget: 'production' });
    const story = await store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Recover jobs' });
    const d = await store.sp.createEntity<Decision>(Decision.dcr, { id:store.formatId(Decision.dcr,"D"),_id:store.formatId(Decision.dcr,"D"), title: 'Preserve ordering' },true,false);
    const a = await createAspect(store,{ id: 'A', title: 'Robustness', status: 'accepted', acceptanceCriteria: ['Preserve jobs'] });
    const test = await store.upsertEntity<TestNode>(TestNode.dcr, { id: 'TEST', title: 'Recovery regression' });
    await store.upsertEntity<Lesson>(Lesson.dcr, { id: 'L', title: 'Do not discard jobs', filePath: 'queue.ts' });
    await store.relate(f, 'contains', story); await store.relate(t, 'addresses', story); await store.relate(t, 'modifies', file);
    await store.relate(d, 'governs', f); await store.withTestArtifactWrite(test.id,()=>store.relate(test, 'verifies', a)); await acceptProduct(store, [{kind:"product_link",sourceId:store.localId(a.id),predicate:"applies_to",targetId:store.localId(f.id)}]);
    const before = JSON.stringify({ lane: t.lane, criteria: t.acceptanceCriteria, claim: t.claim, edges: await store.getOutgoing(t.id) });
    let calls = 0;
    const result = await t.investigate(store, { systemOne: unavailable, reason: async () => { calls++; throw Error('unnecessary'); } });
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw Error(JSON.stringify(result));
    expect(result.value.disposition).toBe('ready');
    expect(result.value.evidence.filter(e => e.mandatory).map(e => e.id)).toEqual(expect.arrayContaining(['T', 'F', 'S', 'D', 'A', 'TEST', 'L', 'queue.ts']));
    expect(result.value.completeness.story).toBeDefined();
    expect(result.value.provenance).toMatchObject({ reasoningUsed: false, freshnessReconciliations: 1 });
    expect(calls).toBe(0);
    const after = (await store.getEntity<Ticket>('T', Ticket.dcr))!;
    expect(JSON.stringify({ lane: after.lane, criteria: after.acceptanceCriteria, claim: after.claim, edges: await store.getOutgoing(t.id) })).toBe(before);
  });

  it('discovers Oxc interface properties as optional investigation candidates', async () => {
    const t = await ticket('PRIORITY', 'Repair priority field');
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    const file = path.join(root, 'src', 'options.ts');
    fs.writeFileSync(file, 'export interface Options { priority: number }\n');
    await indexSingleFile(store, file, 'src/options.ts');
    const property = (await store.listEntities<SymbolNode>(SymbolNode.dcr))
      .find(symbol => symbol.filePath === 'src/options.ts' && symbol.title === 'priority');
    expect(property?.kind).toBe('property');
    const result = await t.investigate(store, {systemOne: routing('high', {[store.localId(property!.id)]: 'include'})});
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw Error(JSON.stringify(result));
    expect(result.value.provenance.optionalCandidates).toBeGreaterThan(0);
    expect(result.value.evidence.some(e => e.id === store.localId(property!.id))).toBe(true);
  });
  it('prunes optional candidates only and escalates low confidence and contradictory routing once', async () => {
    const t = await ticket('T', 'Repair queue candidate');
    const optional = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, { id: 'OPTIONAL', title: 'candidate', filePath: 'external.ts', kind: 'function' });
    const a = await createAspect(store,{ id: 'A', title: 'Explicit concern' }); await store.relate(t, 'addresses', a);
    const high = await t.investigate(store, { systemOne: routing('high') });
    expect(high.status).toBe('complete');
    if (high.status !== 'complete') throw Error(JSON.stringify(high));
    expect(high.value.provenance.optionalSelected).toBe(0);
    expect(high.value.evidence.map(e => e.id)).toContain('A');
    expect(high.value.evidence.map(e => e.id)).not.toContain(store.localId(optional.id));
    let calls = 0;
    for (const systemOne of [routing('low'), routing('high', { depth: 'reasoning' })]) {
      const result = await t.investigate(store, { systemOne, reason: async () => { calls++; return { disposition: 'ready', rationale: 'Contract checked independently' }; } });
      expect(result.status).toBe('complete');
    }
    expect(calls).toBe(2);
  });

  it('preserves authored missing file anchors and reports the exact target', async () => {
    const t = await ticket();
    fs.writeFileSync(path.join(root, 'queue.ts'), 'export function queue() { return 1; }');
    await indexSingleFile(store, path.join(root, 'queue.ts'), 'queue.ts');
    const file = (await store.getEntity<FileNode>('queue.ts', FileNode.dcr))!;
    await store.relate(t, 'modifies', file); fs.unlinkSync(path.join(root, 'queue.ts'));
    const result = await t.investigate(store, { systemOne: unavailable });
    expect(result.status).toBe('needs_input');
    if (result.status === 'needs_input') expect(result.required[0].question).toContain('queue.ts');
    expect((await store.getOutgoing(t.id, 'modifies')).map(e => store.localId(e.targetId))).toEqual(['queue.ts']);
  });

  it('retrieves exact linked symbol source and preserves the anchor when the symbol disappears', async () => {
    const t = await ticket();
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext' }, include: ['*.ts'] }));
    const file = path.join(root, 'queue.ts');
    fs.writeFileSync(file, 'export function queue() { return 1; }\n');
    await indexSingleFile(store, file, 'queue.ts');
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.title === 'queue')!;
    await store.relate(t, 'modifies', symbol);
    try {
      const grounded = await t.investigate(store, { systemOne: unavailable });
      expect(grounded.status).toBe('complete');
      if (grounded.status === 'complete') expect(grounded.value.evidence.find(e => e.id === store.localId(symbol.id))).toMatchObject({ exact: true, source: 'export function queue() { return 1; }' });
      fs.writeFileSync(file, 'export function replacement() { return 2; }\n');
      await indexSingleFile(store, file, 'queue.ts');
      const stale = await t.investigate(store, { systemOne: unavailable });
      expect(stale.status).toBe('needs_input');
      if (stale.status === 'needs_input') expect(stale.required[0].question).toContain(store.localId(symbol.id));
      expect(await store.getEntity(symbol.id)).not.toBeNull();
      expect((await store.getOutgoing(t.id, 'modifies')).length).toBe(1);
    } finally { await closeAllTsLspClients(); }
  }, 30000);

  it('asks for ambiguous ownership without guessing and identifies equivalent existing work', async () => {
    const t = await ticket('T', 'Repair queue billing');
    await store.upsertEntity<Feature>(Feature.dcr, { id: 'F1', title: 'queue' });
    await store.upsertEntity<Feature>(Feature.dcr, { id: 'F2', title: 'billing' });
    const ambiguous = await t.investigate(store, { systemOne: unavailable });
    expect(ambiguous.status).toBe('needs_input');
    if (ambiguous.status === 'needs_input') expect(ambiguous.required[0].choices).toEqual(['F1', 'F2']);
    expect(await store.getOutgoing(t.id, 'implements')).toEqual([]);
    await ticket('DUP', 'Repair queue billing');
    const duplicate = await t.investigate(store, { systemOne: unavailable });
    expect(duplicate.status).toBe('complete');
    if (duplicate.status === 'complete') { expect(duplicate.value.disposition).toBe('rejectable'); expect(duplicate.value.evidence.map(e => e.id)).toContain('DUP'); }
  });

  it('centralizes Blocked and rejected states and validates complete mutation batches before writes', async () => {
    const t = await ticket();
    const ctx = { store, projectRoot: root, executionAuthority: 'project-write' as const };
    await registry.execute('update_ticket_state', { ticketId: 'T', lane: 'Blocked' }, ctx);
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).toBe('Blocked');
    await expect(store.upsertEntity(Ticket.dcr, { id: 'R', title: 'Rejected', lane: 'Done', status: 'rejected' })).rejects.toThrow('Ticket.status was removed');
    expect(await store.getEntity('R', Ticket.dcr)).toBeNull();
    const engine = new CausalChangeEngine(ctx);
    const preview = await engine.previewChange({ action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Ticket', id: 'NEW', fields: { title: 'New' } },
      { kind: 'product_update', entityType: 'Ticket', id: 'T', fields: { lane: 'Blocked', status: 'planned' } }
    ] });
    expect(preview.blocked).toBe(true); expect(await store.getEntity('NEW')).toBeNull();
    await expect(store.upsertEntity(Ticket.dcr, { id: 'T', lane: 'Todo', status: 'verified' })).rejects.toThrow('Ticket.status was removed');
    expect((await store.getEntity<Ticket>(t.id, Ticket.dcr))!.lane).toBe('Blocked');
  });

  it('successfully verifies Aspect creation through the shared Causal Change owner', async () => {
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const request = { action: 'product_change' as const, mutations: [{ kind: 'product_create' as const, entityType: 'Aspect' as const, id: 'A', fields: { title: 'Truth', acceptanceCriteria: ['Exact facts'] } }] };
    const preview = await engine.previewChange(request);
    const result = await engine.applyChange(request, preview.fingerprint);
    expect(result.verification.passed).toBe(true);
    expect((await store.getEntity<Aspect>('A', Aspect.dcr))!.acceptanceCriteria).toEqual(['Exact facts']);
  });
});
