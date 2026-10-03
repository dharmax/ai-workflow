import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Epic, Feature, UserStory, Ticket, Aspect, TestNode, Artifact, Decision } from '../src/graph/ontology.ts';
import type { ProcessOptions, IntentProposal } from '../src/product/process-types.ts';
import type { ArtifactCritic, CriticInput } from '../src/artifact-policy.ts';
import { initializeTools, registry } from '../src/tools/index.ts';

const empty = (patch: Partial<IntentProposal> = {}): IntentProposal => ({ items: [], aspectIds: [], gaps: [], required: [], rationale: 'Only necessary work', ...patch });
const item = (id: string, kind: 'Feature' | 'UserStory' | 'Ticket', title = id) => ({ id, kind, title, body: 'Concrete behavior', acceptanceCriteria: ['Concrete outcome has regression proof'] });
describe('entity-owned Product Intent processing', () => {
  let root: string, store: WorkflowStore;
  const reviews: CriticInput[] = [];
  const critic: ArtifactCritic = { id: 'test', review: async input => { reviews.push(input); return { verdict: 'accept' }; } };
  const options: ProcessOptions = { critic, systemOne: { assess: async () => null } };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-process-')); store = new WorkflowStore(root); reviews.length = 0; });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const epic = () => store.upsertEntity<Epic>(Epic.dcr, { id: 'E', title: 'Technical change', body: 'Migrate storage safely', status: 'active' });
  const feature = () => store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Storage', body: 'Durable operations', acceptanceCriteria: ['Durable operations work'] });
  const story = () => store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Caller stores data', story: 'Caller can save and retrieve data', acceptanceCriteria: ['Roundtrip survives restart'] });

  it('reuses stable Feature/Story identities across Epics without ownership or duplicate creation', async () => {
    const e = await epic(), f = await feature(), s = await story();
    const propose = async () => empty({ items: [item('new-f', 'Feature', 'Storage'), item('new-s', 'UserStory', 'Caller stores data')] });
    const result = await e.process(store, { ...options, propose }); expect(result.status).toBe('complete');
    if (result.status === 'complete') { expect(result.value.created).toEqual([]); expect(result.value.reused).toEqual(['F', 'S']); expect(result.value.artifactComplete).toBe(false); expect(result.value.stoppedAtDepth).toBe(true); }
    expect((await store.getOutgoing(e.id, 'targets')).length).toBe(2); expect(await store.getOutgoing(e.id, 'contains')).toEqual([]);
    expect((await e.process(store, { ...options, propose })).status).toBe('complete');
    expect((await store.listEntities(Feature.dcr)).length).toBe(1); expect((await store.listEntities(UserStory.dcr)).length).toBe(1);
    expect((await store.getOutgoing(e.id, 'targets')).map(edge => edge.targetId)).toContain(f.id); expect(s).toBeDefined();
  });

  it('creates direct technical Epic Tickets and useful Story work with executable criteria, then reuses it', async () => {
    const e = await epic(), s = await story();
    const technical = await e.process(store, { ...options, propose: async () => empty({ items: [item('T', 'Ticket', 'Migrate storage')] }) });
    expect(technical.status).toBe('complete'); expect((await store.listEntities(UserStory.dcr)).length).toBe(1);
    expect((await store.getOutgoing(e.id, 'contains')).length).toBe(1);
    const propose = async () => empty({ items: [item('R', 'Ticket', 'Roundtrip regression')] });
    expect((await s.process(store, { ...options, propose })).status).toBe('complete');
    expect((await s.process(store, { ...options, propose })).status).toBe('complete');
    const r = (await store.getEntity<Ticket>('R', Ticket.dcr))!; expect(r.acceptanceCriteria?.length).toBe(1); expect(r.lane).toBe('Backlog');
    expect((await store.getOutgoing(r.id, 'addresses')).map(edge => edge.targetId)).toEqual([s.id]);
    expect(reviews.some(review => review.artifactId === 'S')).toBe(true);
  });

  it('upgrades POC to production by adding only missing work and lowering never deletes valid work', async () => {
    const f = await feature();
    const propose: ProcessOptions['propose'] = async context => empty({ items: context.completeness === 'production' ? [item('B', 'Ticket', 'Restart regression')] : [item('A', 'Ticket', 'Basic roundtrip')] });
    await f.process(store, { ...options, completeness: 'poc', propose });
    const upgrade = await f.process(store, { ...options, completeness: 'production', propose }); expect(upgrade.status).toBe('complete');
    await f.process(store, { ...options, completeness: 'production', propose }); await f.process(store, { ...options, completeness: 'poc', propose });
    expect((await store.listEntities(Ticket.dcr)).length).toBe(2); expect((await store.getIncoming(f.id, 'implements')).length).toBe(2);
    expect((await store.getEntity<Feature>('F', Feature.dcr))!.completenessTarget).toBeUndefined();
  });

  it('halts ambiguous identity and malformed/ceremonial layers without mutation', async () => {
    const f = await feature(); await store.upsertEntity(Ticket.dcr, { id: 'A', title: 'Same', body: 'First', acceptanceCriteria: ['a'] }); await store.upsertEntity(Ticket.dcr, { id: 'B', title: 'Same', body: 'Second', acceptanceCriteria: ['b'] });
    const result = await f.process(store, { ...options, propose: async () => empty({ items: [item('C', 'Ticket', 'Same')] }) }); expect(result.status).toBe('needs_input'); expect(await store.getEntity('C')).toBeNull();
    const s = await story(); const invalid = await s.process(store, { ...options, propose: async () => empty({ items: [item('N', 'Feature')] }) }); expect(invalid.status).toBe('blocked'); expect(await store.getEntity('N')).toBeNull();
    const unclear = await store.upsertEntity<Feature>(Feature.dcr, { id: 'U', title: 'Unclear' }); expect((await unclear.process(store, options)).status).toBe('needs_input');
  });

  it('depth zero reviews only; depth two processes children once and gives production final cross-layer review', async () => {
    const e = await epic(); let calls: string[] = [];
    const propose: ProcessOptions['propose'] = async context => { calls.push(context.id); return empty({ items: [item(context.kind === 'Epic' ? 'F' : 'T', context.kind === 'Epic' ? 'Feature' : 'Ticket')] }); };
    const zero = await e.process(store, { ...options, depth: 0, propose }); expect(zero.status).toBe('complete'); expect(await store.getEntity('F')).toBeNull();
    calls = []; const deep = await e.process(store, { ...options, completeness: 'production', depth: 2, propose }); expect(deep.status).toBe('complete'); expect(calls).toEqual(['E', 'F']);
    expect(reviews.at(-1)?.artifactId).toBe('E'); expect(reviews.at(-1)?.neighborhood.length).toBe(2);
    if (deep.status === 'complete') { expect(deep.value.remaining).toContain('T'); expect(deep.value.artifactComplete).toBe(false); }
  });

  it('honors explicit descendant completeness and breadth while Aspect review consumes no depth', async () => {
    const e = await epic(), f = await feature(); await store.upsertEntity(Feature.dcr, { id: 'F', completenessTarget: 'poc' }); await store.relate(e, 'targets', f);
    const a = await Aspect.create(store, { id: 'A', title: 'Durability', acceptanceCriteria: ['Restart safe'] });
    const targets: string[] = [];
    const result = await e.process(store, { ...options, completeness: 'production', depth: 2, propose: async context => { targets.push(`${context.id}:${context.completeness}`); return empty({ aspectIds: context.id === 'E' ? ['A'] : [] }); } });
    expect(result.status).toBe('complete'); expect(targets).toEqual(['E:production', 'F:poc']); expect((await store.getOutgoing(a.id, 'applies_to')).length).toBe(1);
    const limited = await e.process(store, { ...options, maxArtifacts: 1, propose: async () => empty({ items: [item('X', 'Ticket')] }) }); expect(limited.status).toBe('complete'); expect(await store.getEntity('X')).toBeNull();
    if (limited.status === 'complete') { expect(limited.value.stoppedAtMaxArtifacts).toBe(true); expect(limited.value.remaining).toContain('X'); }
  });

  it('Critic revision precedes canonical apply and rejection leaves graph unchanged', async () => {
    const s = await story(); let rounds = 0;
    const revised = await s.process(store, { ...options, critic: { id: 'revise', review: async () => ++rounds === 1 ? { verdict: 'revise', findings: [{ message: 'Missing restart proof' }] } : { verdict: 'accept' } }, propose: async (_context, findings) => empty({ items: [item(findings.length ? 'GOOD' : 'BAD', 'Ticket')] }) });
    expect(revised.status).toBe('complete'); expect(await store.getEntity('BAD')).toBeNull(); expect(await store.getEntity('GOOD')).not.toBeNull();
    const reject = await s.process(store, { ...options, critic: { id: 'reject', review: async () => ({ verdict: 'reject', findings: [{ message: 'Duplicate ceremony' }] }) }, propose: async () => empty({ items: [item('NO', 'Ticket')] }) });
    expect(reject.status).toBe('blocked'); expect(await store.getEntity('NO')).toBeNull();
  });

  it('requires the explicit root contract in final production cross-layer review', async () => {
    const f = await feature(); let rounds = 0;
    const result = await f.process(store, { ...options, completeness: 'production', depth: 2,
      propose: async () => empty(), critic: { id: 'root', review: async input => {
        rounds++; expect(input.acceptanceCriteria).toEqual(['Durable operations work']);
        return rounds === 1 ? { verdict: 'accept' } : { verdict: 'reject', findings: [{ message: 'Root durable outcome is unproved' }] };
      } } });
    expect(rounds).toBe(2); expect(result.status).toBe('blocked');
  });

  it('keeps linked verification and governing evidence mandatory even when optional candidates are pruned', async () => {
    const f = await feature(); const t = await store.upsertEntity(Ticket.dcr, { id: 'T', title: 'Verified implementation', acceptanceCriteria: ['Durable operations work'], lane: 'Done', status: 'verified' }); await store.relate(t, 'implements', f);
    const report = await store.upsertEntity(Artifact.dcr, { id: 'PROOF', title: 'Restart proof', body: 'Actual restart regression and typecheck passed', status: 'verified' }); await store.relate(report, 'verifies', t);
    const test = await store.upsertEntity(TestNode.dcr, { id: 'TEST', title: 'Durability regression', filePath: 'tests/storage.test.ts', status: 'verified' }); await store.relate(test, 'verifies', f);
    const decision = await store.upsertEntity(Decision.dcr, { id: 'DECISION', title: 'Preserve durable contract', body: 'Do not weaken restart behavior' }); await store.relate(decision, 'governs', f);
    const result = await f.process(store, { ...options, propose: async context => { expect(context.existing.map(item => item.id)).toContain('PROOF'); return empty(); }, critic: { id: 'evidence', review: async input => {
      expect(input.neighborhood.map(item => item.id)).toEqual(expect.arrayContaining(['PROOF', 'TEST', 'DECISION'])); expect(input.neighborhood.find(item => item.id === 'PROOF')?.body).toContain('Actual restart regression'); return { verdict: 'accept' };
    } } }); expect(result.status).toBe('complete');
  });

  it('thin registry adapters use the same entity path and preserve read-only completion targets', async () => {
    const s = await story(); initializeTools(); const original = UserStory.prototype.process;
    try { UserStory.prototype.process = async function (_store, opts) { expect(this.id).toBe(s.id); expect(opts).toMatchObject({ completeness: 'production', depth: 0, critic: 'none' }); return { status: 'blocked', artifactId: 'S', blockers: [{ reason: 'adapter proof' }] }; };
      const result = await registry.execute('process_story', { storyId: 'S', completeness: 'production', depth: 0, critic: 'none' }, { store, projectRoot: root }); expect(result.status).toBe('blocked');
    } finally { UserStory.prototype.process = original; }
  });
});
