import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, FileNode, Aspect, SymbolNode } from '../src/graph/ontology.ts';
import { saveConfig } from '../src/config.ts';
import { indexCodebase } from '../src/graph/indexer.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';
import type { ResolutionVerificationInput, ResolutionOptions } from '../src/ticket-operation-types.ts';
import { queryPerformance } from '../src/performance-metrics.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';

describe('Ticket-owned bounded resolution', () => {
  let root: string, store: WorkflowStore;
  const systemOne = { assess: async () => null };
  const verify = async (input: ResolutionVerificationInput) => ({ criteria: input.dossier.ticket.acceptanceCriteria.map(criterion => ({ criterion, passed: input.tests.every(test => test.passed), evidence: 'Authored deterministic assertions passed' })), aspects: input.dossier.aspects.aspects.map(aspect => ({ id: aspect.id, passed: input.tests.every(test => test.passed), evidence: 'Explicit material regression passed' })) });
  const git = (...args: string[]) => { const result = Bun.spawnSync(['git', ...args], { cwd: root, stderr: 'pipe' }); if (!result.success) throw Error(result.stderr.toString()); };
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-resolve-')); fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'tests'));
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ai-workflow\n*.md\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', types: ['bun'], skipLibCheck: true }, include: ['src/**/*.ts', 'tests/**/*.ts'] }));
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a - b; }\n');
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test"; import {add} from "../src/add"; test("adds positives and negatives",()=>{expect(add(2,3)).toBe(5);expect(add(-2,3)).toBe(1);});\n');
    git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    store = new WorkflowStore(root); await indexCodebase(store, root);
  });
  afterEach(async () => { await closeAllTsLspClients(); await closeAllTs6RefactorClients(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const ticket = async (id = 'T', title = 'Fix addition') => {
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id, title, body: 'Use arithmetic addition, preserving signed values.', lane: 'Todo', acceptanceCriteria: ['Positive and negative inputs add correctly'] });
    await store.relate(t, 'modifies', (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!); return t;
  };
  const fix: ResolutionOptions = { systemOne, critic: 'none', verify, implement: async () => ({ changes: [{ action: 'replace_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, replacement: 'export function add(a: number, b: number) { return a + b; }' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] }) };

  it('surgically fixes a function, verifies material Aspects, records proof/metrics and reuses only matching proof', async () => {
    const t = await ticket(); const a = await Aspect.create(store, { id: 'A', title: 'Signed arithmetic', acceptanceCriteria: ['Preserve signed inputs'] }); await store.relate(t, 'addresses', a);
    const result = await t.resolve(store, fix); expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result));
    expect(result.value).toMatchObject({ verification: true, resolved: ['T'], repairs: 0 }); expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('return a + b');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!).toMatchObject({ lane: 'Done', status: 'verified', claim: null });
    expect(await store.getEntity('VERIFY-T')).not.toBeNull(); expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].verification).toBe(true);
    const rerun = await t.resolve(store, { ...fix, implement: async () => { throw Error('must reuse verified work'); } }); expect(rerun.status).toBe('complete');
    expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[1].counters.artifactsReused).toBe(1);
  }, 30000);

  it('allows and preserves unrelated dirty files but stops before editing a dirty target', async () => {
    const t = await ticket(); fs.writeFileSync(path.join(root, 'notes.txt'), 'user work');
    const result = await t.resolve(store, fix); expect(result.status).toBe('complete'); expect(fs.readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('user work');
    const another = await ticket('U', 'Preserve user-edited addition'); fs.appendFileSync(path.join(root, 'src/add.ts'), '// user work\n');
    const dirty = fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8');
    const blocked = await another.resolve(store, fix); expect(blocked.status).toBe('needs_input'); expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toBe(dirty);
    expect((await store.getEntity<Ticket>('U', Ticket.dcr))!.claim).toBeNull(); expect((await store.getEntity<Ticket>('U', Ticket.dcr))!.lane).toBe('Todo');
  }, 30000);

  it('invalidates Done when the authored test oracle changes', async () => {
    const t = await ticket(); expect((await t.resolve(store, fix)).status).toBe('complete');
    fs.appendFileSync(path.join(root, 'tests/add.test.ts'), 'test("changed contract",()=>{expect(add(1,1)).toBe(3);});\n');
    const result = await t.resolve(store, { ...fix, maxRepairs: 0, testCommands: [['bun', 'test', 'tests/add.test.ts']], implement: async () => { throw Error('Done proof must be checked again'); } });
    expect(result.status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
  }, 30000);

  it('reverifies a broader authored source scope instead of reusing narrower proof', async () => {
    const t = await ticket(); expect((await t.resolve(store, fix)).status).toBe('complete');
    fs.writeFileSync(path.join(root, 'src/consumer.ts'), 'export const contract = "new scope";');
    const file = await store.upsertEntity(FileNode.dcr, { id: 'src/consumer.ts', filePath: 'src/consumer.ts' }); await store.relate(t, 'modifies', file);
    let verifications = 0;
    const result = await t.resolve(store, { ...fix, implement: async () => { throw Error('Done code should be verified, not changed'); }, verify: async input => { verifications++; return verify(input); } });
    expect(result.status).toBe('complete'); expect(verifications).toBe(1);
    const proof = await store.getEntity('VERIFY-T') as unknown as { body: string }; expect(JSON.parse(proof.body).hashes['src/consumer.ts']).toBeDefined();
  }, 30000);

  it('repairs a real failing test exactly once and never marks failed acceptance Done', async () => {
    const t = await ticket(); let attempts = 0;
    const result = await t.resolve(store, { ...fix, implement: async (_dossier, feedback) => { attempts++; if (attempts > 1) expect(feedback.join('\n')).toContain('Expected: 5'); return { changes: [{ action: 'replace_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, replacement: attempts === 1 ? 'export function add(a: number, b: number) { return a + b + 1; }' : 'export function add(a: number, b: number) { return a + b; }' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] }; } });
    expect(result.status).toBe('complete'); if (result.status === 'complete') expect(result.value.repairs).toBe(1); expect(attempts).toBe(2);
    const u = await ticket('U', 'Verify a new unsupported outcome'); await store.upsertEntity(Ticket.dcr, { id: 'U', acceptanceCriteria: ['Unproved outcome'] });
    const unverified = await u.resolve(store, { ...fix, maxRepairs: 0, allowDirtyTargets: ['src/add.ts'], implement: async () => ({ changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }), verify: async () => ({ criteria: [], aspects: [] }) });
    expect(unverified.status).toBe('blocked'); expect((await store.getEntity<Ticket>('U', Ticket.dcr))!.lane).not.toBe('Done');
  }, 30000);

  it('resolves bounded ordinary children in dependency order and verifies the parent separately', async () => {
    const p = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'P', title: 'Parent', body: 'Fix arithmetic then verify its consumer.', lane: 'Todo', acceptanceCriteria: ['Arithmetic and consumer both verified'] });
    const a = await ticket('A', 'Fix arithmetic');
    const b = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'B', title: 'Verify consumer', body: 'Check the consumer after arithmetic is fixed.', lane: 'Backlog', acceptanceCriteria: ['Consumer sees correct results'] });
    await store.relate(p, 'contains', a); await store.relate(p, 'contains', b); await store.relate(b, 'depends_on', a);
    const order: string[] = [];
    const result = await p.resolve(store, { ...fix, testCommands: [['bun', 'test', 'tests/add.test.ts']], implement: async dossier => { order.push(dossier.ticket.id); return dossier.ticket.id === 'A' ? await fix.implement!(dossier, []) : { changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }; } });
    expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result)); expect(order).toEqual(['A', 'B']); expect(result.value.resolved).toEqual(['A', 'B', 'P']);
    for (const id of ['A', 'B', 'P']) expect((await store.getEntity<Ticket>(id, Ticket.dcr))!).toMatchObject({ lane: 'Done', claim: null });
  }, 30000);

  it('runs a safe TypeScript rename through the normal fingerprint boundary and targeted assertions', async () => {
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }\n'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'correct arithmetic');
    const t = await ticket();
    const result = await t.resolve(store, { ...fix, implement: async () => ({ changes: [{ action: 'rename_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, newName: 'sum' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] }), verify: async input => { expect(fs.readFileSync(path.join(root, 'tests/add.test.ts'), 'utf8')).toContain('sum'); return verify(input); } });
    expect(result.status).toBe('complete'); expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('function sum');
  }, 30000);

  it('returns precise missing-input and prerequisite/lease/budget blockers without leaked leases', async () => {
    const t = await ticket();
    const required = await t.resolve(store, { ...fix, implement: async () => ({ changes: [], testCommands: [], required: [{ question: 'Which rounding contract applies?', why: 'No authored rule', target: 'Ticket acceptanceCriteria' }] }) });
    expect(required.status).toBe('needs_input'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
    const other = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'OTHER', title: 'Prerequisite', body: 'Define rounding', acceptanceCriteria: ['Rounding defined'], lane: 'Todo' }); await store.relate(t, 'depends_on', other);
    const dependency = await t.resolve(store, fix); expect(dependency.status).toBe('blocked'); if (dependency.status === 'blocked') expect(dependency.blockers[0].reason).toContain('Unresolved prerequisite');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
    await store.unrelate(t.id, 'depends_on', other.id); await store.claimTicket('T', 'other-agent', 30, false);
    expect((await t.resolve(store, { ...fix, agentId: 'resolver' })).status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim!.agentId).toBe('other-agent');
  });

  it('creates missing source through Causal Change, refuses overwrite and rejects symlink/path escapes', async () => {
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const request = { action: 'create_file' as const, filePath: 'src/new.ts', content: 'export function fresh() { return 1; }\n' };
    const preview = await engine.previewChange(request); expect(preview.blocked).toBe(false); expect(fs.existsSync(path.join(root, 'src/new.ts'))).toBe(false);
    expect((await engine.applyChange(request, preview.fingerprint)).verification.passed).toBe(true);
    expect((await engine.previewChange(request)).blocked).toBe(true);
    expect((await engine.previewChange({ ...request, filePath: '../escape.ts' })).blocked).toBe(true);
    fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
    expect((await engine.previewChange({ ...request, filePath: 'outside/escape.ts' })).blocked).toBe(true);
  }, 30000);

  it('binds synthesis to the exact authored target and uses an independent verification call', async () => {
    const t = await ticket();
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/add.ts' && s.title === 'add')!; await store.relate(t, 'modifies', symbol);
    const prompts: string[] = [];
    const server = Bun.serve({ port: 0, fetch: async request => {
      const body = await request.json() as { messages: Array<{ content: string }> }; const prompt = body.messages[0].content; prompts.push(prompt);
      const reply = prompt.startsWith('Implement the one exact') ? { action: 'replace_symbol', replacement: 'export function add(a: number, b: number) { return a + b; }', testCommands: [['bun', 'test', 'tests/add.test.ts']] } : { criteria: [{ criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'tests/add.test.ts asserts 5 and 1; command passed' }], aspects: [] };
      return Response.json({ message: { content: JSON.stringify(reply) }, prompt_eval_count: 10, eval_count: 5 });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture' });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', testCommands: [['bun', 'test', 'tests/add.test.ts']] });
      expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result));
      expect(prompts).toHaveLength(2); expect(prompts[0]).toContain('"symbolName":"add"'); expect(prompts[1]).toContain('Independently verify EVERY');
      expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].cognition.llm.calls).toBe(2);
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);
});
