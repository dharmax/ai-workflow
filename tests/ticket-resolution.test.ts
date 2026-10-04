import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { CompletionEngine } from '@dharmax/llm-utils';
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
import { registry } from '../src/tools/registry.ts';
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
      expect(prompts[1]).not.toContain('return a - b'); expect(prompts[1]).toContain('return a + b');
      expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].cognition.llm.calls).toBe(2);
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);
  it('sends current authored source to the default independent verifier for a no-edit review', async () => {
    const t = await ticket(); fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }');
    let prompt = '';
    const server = Bun.serve({ port: 0, fetch: async request => {
      const body = await request.json() as { messages: Array<{ content: string }> }; prompt = body.messages[0].content;
      return Response.json({ message: { content: JSON.stringify({ criteria: [{ criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'Actual source addition and tests signed assertions passed' }], aspects: [] }) } });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture' });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', implement: async () => ({ changes: [], testCommands: [] }), testCommands: [['bun', 'test', 'tests/add.test.ts']] });
      expect(result.status).toBe('complete'); expect(prompt).toContain('"source":"export function add(a: number, b: number) { return a + b; }"'); expect(prompt).toContain('"testSources":');
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);
  for (const mode of ['zero', 'continue', 'ordinary', 'limit', 'error', 'failed-edit', 'no-op'] as const) it(`bounds real implementation Actor tranches: ${mode}`, async () => {
    const t = await ticket();
    const targetFile = mode === 'ordinary' ? 'package.json' : 'src/add.ts';
    if (mode === 'ordinary') {
      fs.writeFileSync(path.join(root, targetFile), '{"scripts":{"test":"pending"}}\n');
      fs.writeFileSync(path.join(root, 'tests/package.test.ts'), 'import {test,expect} from "bun:test"; import fs from "node:fs"; test("Consuela runnable test script",()=>expect(JSON.parse(fs.readFileSync("package.json","utf8")).scripts.test).toBe("bun test"));');
      git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'ordinary target');
      await store.relate(t, 'modifies', await store.upsertEntity(FileNode.dcr, { id: targetFile, filePath: targetFile }));
    } else {
      const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/add.ts' && s.title === 'add')!;
      await store.relate(t, 'modifies', symbol);
    }
    const completes = mode === 'continue' || mode === 'ordinary';
    let calls = 0;
    const refreshed: string[] = [];
    const interactive = { assess: async (_input: unknown, spec: Record<string, unknown>) => 'mechanism' in spec
      ? { quality: 'high' as const, backendId: 'fixture', latencyMs: 0, answers: { mechanism: { choice: 'interactive' } } } : null };
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const tranche = Math.floor(calls / 16), step = calls++ % 16;
      if (!step) refreshed.push(prompt);
      if (mode === 'error') return { model, ok: false, text: '', failure: { kind: 'invalid_response', message: 'fixture provider failed', retryable: false, fatal: false } };
      const oldText = mode === 'ordinary' ? (tranche === 0 ? 'pending' : 'bun test --todo') : tranche === 0 ? 'a - b' : tranche === 1 ? 'a + b + 0' : 'a + b + 0 + 0';
      const newText = mode === 'no-op' ? oldText : mode === 'ordinary' ? (tranche === 0 ? 'bun test --todo' : 'bun test') : mode === 'continue' && tranche === 1 ? 'a + b' : oldText.replace('a - b', 'a + b') + ' + 0';
      const request = { action: 'replace_text' as const, filePath: targetFile, oldText: mode === 'failed-edit' ? 'absent' : oldText, newText };
      let decision: unknown;
      if (completes && tranche === 1 && step === 3) decision = { thought: 'Complete', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', mode === 'ordinary' ? 'tests/package.test.ts' : 'tests/add.test.ts']] }) };
      else {
        let name = 'read_workspace_file', parameters: Record<string, unknown> = { filePath: targetFile };
        if (step >= 3 || mode === 'zero') { name = 'find_symbol'; parameters = { name: `distinct_observation_${step}` }; }
        if (mode !== 'zero' && step === 1) { name = 'preview_change'; parameters = request; }
        if (mode !== 'zero' && step === 2) {
          name = 'apply_change'; parameters = { request, fingerprint: (await new CausalChangeEngine({ store, projectRoot: root }).previewChange(request)).fingerprint };
        }
        decision = { thought: 'Bounded fixture work', action: 'tool_call', toolCalls: [{ name, parameters }] };
      }
      return { model, ok: true, text: JSON.stringify(decision) };
    });
    try {
      const result = await t.resolve(store, { systemOne: interactive, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe(completes ? 'complete' : 'blocked');
      expect(calls).toBe(completes ? 20 : mode === 'limit' ? 48 : mode === 'error' ? 1 : 16);
      if (mode === 'ordinary') {
        expect(refreshed[1]).toContain('bun test --todo');
        expect(JSON.parse(fs.readFileSync(path.join(root, targetFile), 'utf8')).scripts.test).toBe('bun test');
      } else if (mode === 'continue' || mode === 'limit') {
        expect(refreshed[0]).toContain('return a - b');
        expect(refreshed[1]).toContain('return a + b + 0');
        expect(refreshed[1]).not.toContain('return a - b');
        expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain(mode === 'continue' ? 'return a + b;' : 'return a + b + 0 + 0 + 0;');
      } else expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('return a - b');
      if (result.status === 'blocked') {
        expect(result.blockers[0].reason).toContain(mode === 'error' ? 'error' : 'max_steps_exceeded');
        expect(result.blockers[0].reason).toContain('recent observations:');
        if (mode === 'zero') expect(result.blockers[0].reason).toContain('find_symbol');
      }
    } finally { completion.mockRestore(); }
  }, 30000);

  it('rejects repeated unchanged navigation and permits re-reading after a real edit', async () => {
    const t = await ticket(); let calls = 0;
    const request = { action: 'replace_text' as const, filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b' };
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const step = calls++;
      if (step === 2) expect(prompt).toContain('Stalled navigation: this identical observation');
      if (step === 5) {
        expect(prompt).toContain('return a + b');
        return { model, ok: true, text: JSON.stringify({ thought: 'Done', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }) }) };
      }
      const name = step === 2 ? 'preview_change' : step === 3 ? 'apply_change' : 'read_workspace_file';
      const parameters = step === 2 ? request : step === 3
        ? { request, fingerprint: (await new CausalChangeEngine({ store, projectRoot: root }).previewChange(request)).fingerprint }
        : { filePath: 'src/add.ts' };
      return { model, ok: true, text: JSON.stringify({ thought: 'Inspect or edit', action: 'tool_call', toolCalls: [{ name, parameters }] }) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('complete'); expect(calls).toBe(6);
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a + b');
    } finally { completion.mockRestore(); }
  }, 30000);

  for (const name of ['get_file_outline', 'read_workspace_file']) {
    it(`stops identical ${name} observations after three steps and executes once`, async () => {
      const t = await ticket(); let calls = 0, executions = 0;
      const original = registry.execute.bind(registry);
      const execution = spyOn(registry, 'execute').mockImplementation(async (tool, params, ctx) => {
        if (tool === name) executions++;
        return original(tool, params, ctx);
      });
      const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
        if (calls === 2) expect(prompt).toContain('Replan using existing evidence');
        calls++;
        return { model, ok: true, text: JSON.stringify({ thought: 'Inspect', action: 'tool_call', toolCalls: [{ name, parameters: { filePath: 'src/add.ts' } }] }) };
      });
      try {
        const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
        expect(result.status).toBe('blocked'); expect(JSON.stringify(result)).toContain('Stalled navigation');
        expect(calls).toBe(3); expect(executions).toBe(1);
        expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a - b');
      } finally { completion.mockRestore(); execution.mockRestore(); }
    }, 30000);
  }

  it('allows different observations and rejects reordered canonical parameters', async () => {
    const t = await ticket(); let calls = 0, reads = 0;
    const original = registry.execute.bind(registry);
    const execution = spyOn(registry, 'execute').mockImplementation(async (name, params, ctx) => {
      if (name === 'find_symbol') reads++;
      return original(name, params, ctx);
    });
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const step = calls++;
      if (step === 3) expect(prompt).toContain('Stalled navigation: this identical observation');
      const parameters = step === 0 ? { name: 'add', filePath: 'src/add.ts' }
        : step === 1 ? { name: 'different', filePath: 'src/add.ts' }
        : { filePath: 'src/add.ts', name: 'add' };
      return { model, ok: true, text: JSON.stringify({ thought: 'Inspect', action: 'tool_call', toolCalls: [{ name: 'find_symbol', parameters }] }) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('blocked'); expect(calls).toBe(4); expect(reads).toBe(2);
    } finally { completion.mockRestore(); execution.mockRestore(); }
  }, 30000);

  it('keeps the three-tranche total across acceptance repair attempts', async () => {
    const t = await ticket(); let calls = 0;
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (_prompt, model) => {
      calls++;
      const oldText = calls === 1 ? 'a - b' : 'a + b' + ' + 0'.repeat(calls - 2);
      return { model, ok: true, text: JSON.stringify({ thought: 'Propose exact edit', action: 'final_answer', finalAnswer: JSON.stringify({
        changes: [{ action: 'replace_text', filePath: 'src/add.ts', oldText, newText: calls === 1 ? 'a + b' : oldText + ' + 0' }],
        testCommands: [['bun', 'test', 'tests/add.test.ts']]
      }) }) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', maxRepairs: 3, verify: async () => ({ criteria: [], aspects: [] }) });
      expect(result.status).toBe('blocked'); expect(calls).toBe(3);
      if (result.status === 'blocked') expect(result.blockers[0].reason).toContain('tranche limit');
    } finally { completion.mockRestore(); }
  }, 30000);

  it('grounds dependency work before edits and sends the complete Actor catalog through Ollama with explicit context', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), '{"dependencies":{}}');
    fs.writeFileSync(path.join(root, 'tests/package.test.ts'), 'import {test,expect} from "bun:test"; import fs from "node:fs"; test("local context-manager dependency",()=>expect(JSON.parse(fs.readFileSync("package.json","utf8")).dependencies["@dharmax/context-manager"]).toBe("file:../context-manager"));');
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'dependency fixture');
    await indexCodebase(store, root);
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'DEPENDENCY', title: 'Add context-manager dependency', body: 'The package is not installed yet. Add the existing local sibling as a dependency in package.json.', lane: 'Todo', acceptanceCriteria: ['The package references the local context-manager sibling'] });
    let calls = 0;
    const request = { action: 'replace_text' as const, filePath: 'package.json', oldText: '"dependencies":{}', newText: '"dependencies":{"@dharmax/context-manager":"file:../context-manager"}' };
    const server = Bun.serve({ port: 0, fetch: async incoming => {
      const body = await incoming.json() as { options: { num_ctx?: number }; messages: Array<{ role: string; content: string }> };
      calls++;
      expect(body.options.num_ctx).toBe(32768);
      const system = body.messages.find(message => message.role === 'system')!.content;
      const goal = body.messages.find(message => message.role === 'user')!.content;
      expect(system).not.toContain('product_change'); expect(system).not.toContain('ProductMutation');
      expect(system).toContain('"$defs"'); expect(system.length).toBeLessThan(30000);
      expect(goal).toContain(root); expect(goal).toContain('"package.json"'); expect(goal).toContain('a package that needs adding will not yet have indexed symbols');
      if (calls === 2) { expect(goal).toContain('RECOVERY / REPLANNING TURN'); expect(goal).toContain('contents are not indexed symbols: use read_workspace_file'); }
      if (calls === 4) { expect(goal).toContain('RECOVERY / REPLANNING TURN'); expect(goal).toContain('Change preview blocked'); expect(goal).toContain('replace an existing anchor'); }
      let decision: unknown;
      if (calls === 7) {
        const observations = [...goal.matchAll(/- read_workspace_file\(.*\) -> Result: (.*)/g)];
        expect(JSON.parse(observations.at(-1)![1]!).content).toContain('"@dharmax/context-manager":"file:../context-manager"');
        decision = { thought: 'Completed dependency edit', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', 'tests/package.test.ts']] }) };
      }
      else if (calls === 6) decision = { thought: 'Verify current disk after the apply', action: 'tool_call', toolCalls: [{ name: 'read_workspace_file', parameters: { filePath: 'package.json' } }] };
      else if (calls === 5) {
        const observation = JSON.parse([...goal.matchAll(/- preview_change\(.*\) -> Result: (.*)/g)].at(-1)![1]!);
        expect(observation.applied).toBe(false); expect(observation.blocked).toBe(false);
        expect(observation.nextCall).toMatchObject({ toolName: 'apply_change', parameters: { request } });
        expect(observation.nextCall.parameters.fingerprint).toMatch(/^[a-f0-9]{64}$/);
        expect(observation.mutations).toBeUndefined(); expect(observation.originalHashes).toBeUndefined();
        expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe('{"dependencies":{}}');
        decision = { thought: 'The preview has not applied anything; execute its next call', action: 'tool_call', toolCalls: [{ name: observation.nextCall.toolName, parameters: observation.nextCall.parameters }] };
      }
      else if (calls === 3) decision = { thought: 'Incorrect insertion anchor', action: 'tool_call', toolCalls: [{ name: 'preview_change', parameters: { ...request, oldText: '"@dharmax/context-manager":"file:../context-manager"' } }] };
      else decision = { thought: 'Use the existing relative target', action: 'tool_call', toolCalls: [{
        name: calls === 1 ? 'find_symbol' : calls === 2 ? 'read_workspace_file' : 'preview_change',
        parameters: calls === 1 ? { name: '@dharmax/context-manager', filePath: 'package.json' } : calls === 2 ? { filePath: 'package.json' } : request
      }] };
      return Response.json({ message: { content: JSON.stringify(decision) } });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture' });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('complete'); expect(calls).toBe(7);
      expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['@dharmax/context-manager']).toBe('file:../context-manager');
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);

  it('treats a missing symbol slice as a recovery observation instead of successful source', async () => {
    const t = await ticket(); let calls = 0;
    const request = { action: 'replace_text' as const, filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b' };
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      calls++;
      if (calls === 2) {
        expect(prompt).toContain('RECOVERY / REPLANNING TURN');
        expect(prompt).toContain("Symbol 'InventedTarget' was not found in 'src/add.ts'");
        expect(prompt).toContain('Use get_file_outline for actual declaration names');
      }
      const name = calls === 1 ? 'get_symbol_source' : calls === 2 ? 'get_file_outline' : calls === 3 ? 'preview_change' : 'apply_change';
      const parameters = calls === 1 ? { filePath: 'src/add.ts', symbolName: 'InventedTarget' } : calls === 2 ? { filePath: 'src/add.ts' } : calls === 3 ? request : { request, fingerprint: (await new CausalChangeEngine({ store, projectRoot: root }).previewChange(request)).fingerprint };
      const decision = calls === 5 ? { thought: 'Verified tool edit', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }) } : { thought: 'Use grounded observations', action: 'tool_call', toolCalls: [{ name, parameters }] };
      return { model, ok: true, text: JSON.stringify(decision) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('complete'); expect(calls).toBe(5);
    } finally { completion.mockRestore(); }
  }, 30000);

});
