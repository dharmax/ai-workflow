import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Aspect, Feature, FileNode } from '../src/graph/ontology.ts';
import type { ArtifactCritic } from '../src/artifact-policy.ts';
import type { TicketPreparationProposal } from '../src/ticket-operation-types.ts';
import type { SystemOne } from '@dharmax/llm-utils';
import { applyProductMutations } from '../src/product/mutation.ts';
import { AiArtifactCritic } from '../src/artifact-critic.ts';
import { saveConfig } from '../src/config.ts';

describe('reviewed Ticket preparation', () => {
  let root: string, store: WorkflowStore;
  const unavailable: SystemOne = { assess: async () => null };
  it('keeps source import cycles separate from Ticket work-cycle validation', async () => {
    const a = await store.upsertEntity(FileNode.dcr, { id: 'a.ts', filePath: 'a.ts' });
    const b = await store.upsertEntity(FileNode.dcr, { id: 'b.ts', filePath: 'b.ts' });
    await store.relate(a, 'depends_on', b); await store.relate(b, 'depends_on', a);
    await store.upsertEntity(Ticket.dcr, { id: 'WORK', title: 'Change source', acceptanceCriteria: ['Source changes safely'] });
    await applyProductMutations(store, [{ kind: 'product_link', sourceId: 'WORK', predicate: 'modifies', targetId: 'a.ts' }, { kind: 'product_link', sourceId: 'WORK', predicate: 'modifies', targetId: 'b.ts' }]);
    expect((await store.getOutgoing('WORK', 'modifies')).length).toBe(2);
  });
  const split: SystemOne = { assess: async () => ({ backendId: 'fixture', quality: 'high', latencyMs: 0, answers: Object.fromEntries(Object.entries({ workKind: 'code', scope: 'grounded', context: 'none', atomicity: 'split', depth: 'deterministic' }).map(([id, choice]) => [id, { choice, probabilities: { [choice]: 0.99 } }])) }) };
  const accept: ArtifactCritic = { id: 'independent-fixture', review: async () => ({ verdict: 'accept' }) };
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-prepare-')); store = new WorkflowStore(root); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const parent = () => store.upsertEntity<Ticket>(Ticket.dcr, { id: 'P', title: 'Persist jobs and migrate records', body: 'Persist new jobs; migrate historical records separately.', lane: 'Todo', acceptanceCriteria: ['Restart retains jobs', 'Old records migrate safely'] });
  const proposal = (): TicketPreparationProposal => ({ rationale: 'Persistence and migration have distinct verifiable outcomes.', children: [
    { id: 'P/persist', title: 'Persist jobs', body: 'Write and reload queued jobs.', acceptanceCriteria: ['Restart retains queued jobs'], relations: [], dependsOn: [] },
    { id: 'P/migrate', title: 'Migrate records', body: 'Migrate historical records into the durable format.', acceptanceCriteria: ['Migration preserves historical records'], relations: [], dependsOn: ['P/persist'] }
  ] });

  it('keeps an atomic technical Ticket unchanged without a fake Story, Critic call or lease', async () => {
    const t = await parent(); let calls = 0;
    const result = await t.prepare(store, { systemOne: unavailable, critic: { id: 'unused', review: async () => { calls++; throw Error('unnecessary'); } }, propose: async () => { calls++; throw Error('unnecessary'); } });
    expect(result.status).toBe('complete'); if (result.status === 'complete') expect(result.value).toMatchObject({ applied: false, children: [], criticRounds: 0 });
    expect(calls).toBe(0); expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.claim).toBeUndefined(); expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1);
  });

  it('creates meaningful ordinary children with real ordering, holds a lease only during apply and reuses on rerun', async () => {
    const t = await parent();
    const a = await Aspect.create(store, { id: 'A', title: 'Robust persistence', acceptanceCriteria: ['Preserve jobs'] }); await store.relate(t, 'addresses', a);
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Durable jobs', completenessTarget: 'production' }); await store.relate(t, 'implements', f);
    let calls = 0;
    const options = { systemOne: split, critic: { id: 'custom', review: async (input: Parameters<ArtifactCritic['review']>[0]) => { calls++; expect(input.applicableAspects).toContain('A'); expect(input.completeness).toBe('production'); expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.claim).toBeUndefined(); return { verdict: 'accept' as const }; } }, propose: async () => { const p = proposal(); for (const child of p.children) child.relations.push({ predicate: 'implements', targetId: 'F' }); return p; } };
    const result = await t.prepare(store, options);
    expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result));
    expect(result.value.created).toEqual(['P/persist', 'P/migrate']); expect(result.value.criticRounds).toBe(1);
    expect((await store.getOutgoing('P/migrate', 'depends_on')).map(e => store.localId(e.targetId))).toEqual(['P/persist']);
    expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.claim).toBeNull(); expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.lane).toBe('Todo');
    expect((await (await store.getEntity<Ticket>('P/persist', Ticket.dcr))!.applicableAspects(store)).map(a => store.localId(a.id))).toContain('A');
    const rerun = await t.prepare(store, options); expect(rerun.status).toBe('complete'); if (rerun.status === 'complete') { expect(rerun.value.applied).toBe(false); expect(rerun.value.reused.sort()).toEqual(['P/migrate', 'P/persist']); }
    expect(calls).toBe(1); expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(3);
  });

  it('feeds omission findings back to the producer and converges before writing', async () => {
    const t = await parent(); let reviews = 0, proposals = 0;
    const result = await t.prepare(store, { systemOne: split, critic: { id: 'independent', review: async input => { reviews++; expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1); return input.proposal.filter(m => m.kind === 'product_create').length === 1 ? { verdict: 'revise', findings: [{ message: 'Migration acceptance is omitted.' }] } : { verdict: 'accept' }; } }, propose: async (_dossier, findings) => { proposals++; const p = proposal(); if (!findings.length) p.children.pop(); else expect(findings[0].message).toContain('Migration'); return p; } });
    expect(result.status).toBe('complete'); expect(reviews).toBe(2); expect(proposals).toBe(2);
  });

  it('rejects dependency cycles even with critic none and preserves the entire unapplied batch', async () => {
    const t = await parent();
    const result = await t.prepare(store, { systemOne: split, critic: 'none', propose: async () => { const p = proposal(); p.children[0].dependsOn = ['P/migrate']; return p; } });
    expect(result.status).toBe('blocked'); if (result.status === 'blocked') expect(result.blockers[0].reason).toContain('cycle');
    expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1); expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.claim).toBeUndefined();
    await store.upsertEntity(Ticket.dcr, { id: 'X', title: 'X' }); await store.upsertEntity(Ticket.dcr, { id: 'Y', title: 'Y' });
    await applyProductMutations(store, [{ kind: 'product_link', sourceId: 'X', predicate: 'depends_on', targetId: 'Y' }]);
    await expect(applyProductMutations(store, [{ kind: 'product_link', sourceId: 'Y', predicate: 'depends_on', targetId: 'X' }])).rejects.toThrow('cycle');
  });

  it('stops ceremony, duplicate contracts, exhausted revision and missing inputs before applying', async () => {
    const t = await parent();
    for (const verdict of ['reject', 'revise', 'needs_input'] as const) {
      const result = await t.prepare(store, { systemOne: split, propose: async () => proposal(), critic: { id: 'strict', review: async () => verdict === 'needs_input' ? { verdict, required: [{ question: 'Which migration compatibility contract applies?' }] } : { verdict, findings: [{ message: 'Unnecessary ceremonial child or duplicated acceptance.' }] } } });
      expect(result.status).toBe(verdict === 'needs_input' ? 'needs_input' : 'blocked');
      expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1);
    }
    const duplicate = await t.prepare(store, { systemOne: split, critic: 'none', propose: async () => { const p = proposal(); p.children[1] = { ...p.children[0], id: 'P/duplicate' }; return p; } });
    expect(duplicate.status).toBe('blocked');
    const bounded = await t.prepare(store, { systemOne: split, critic: accept, depth: 0, propose: async () => proposal() }); expect(bounded.status).toBe('needs_input');
    expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.claim).toBeUndefined();
  });

  it('preserves caller-owned leases and refuses a concurrent owner', async () => {
    const t = await parent(); await store.claimTicket('P', 'owner', 30, false);
    const blocked = await t.prepare(store, { agentId: 'other', systemOne: split, critic: 'none', propose: async () => proposal() }); expect(blocked.status).toBe('blocked');
    expect((await store.listEntities<Ticket>(Ticket.dcr)).length).toBe(1);
    const result = await t.prepare(store, { agentId: 'owner', systemOne: split, critic: 'none', propose: async () => proposal() }); expect(result.status).toBe('complete');
    expect((await store.getEntity<Ticket>('P', Ticket.dcr))!.claim?.agentId).toBe('owner');
  });

  it('keeps requirements separate from evidence in the real Critic adapter and refuses unsupported acceptance', async () => {
    let prompt = '';
    const server = Bun.serve({ port: 0, fetch: async request => {
      const body = await request.json() as { messages: Array<{ content: string }> }; prompt = body.messages[0].content;
      return Response.json({ message: { content: JSON.stringify({ criteria: [{ criterion: 'Restart retains jobs', covered: true, evidence: 'Persist jobs child' }], aspects: [], review: { verdict: 'accept' } }) } });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString();
    saveConfig(root, { model: 'ollama/fixture' });
    try {
      const result = await new AiArtifactCritic('auto', root).review({ artifactId: 'P', intent: 'Persist jobs and migrate records.', neighborhood: [], proposal: [{ title: 'Persist jobs' }], applicableAspects: [], candidateAspects: [], completeness: 'production', depth: 1, acceptanceCriteria: ['Restart retains jobs', 'Old records migrate safely'], evidence: [] });
      expect(result.verdict).toBe('revise'); if (result.verdict === 'revise') expect(result.findings[0].message).toContain('Old records migrate safely');
      expect(prompt).toContain('acceptanceCriteria describes REQUIRED outcomes'); expect(prompt).toContain('"evidence":[]');
      await expect(new AiArtifactCritic('unconfigured', root).review({ artifactId: 'P', intent: '', neighborhood: [], proposal: [], applicableAspects: [], candidateAspects: [], completeness: 'production', depth: 1, evidence: [] })).rejects.toThrow('configured model route');
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  });
});
