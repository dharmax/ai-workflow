import {createAspect,updateProduct} from './product-review.ts';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Artifact, Aspect, Decision, FileNode, ModuleNode, Ticket, SymbolNode, TestNode } from '../src/model/ontology.ts';
import { indexCodebase } from '../src/graph/indexer.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { RuleStore } from '../src/rules/store.ts';
import type { RuleModel } from '../src/rules/types.ts';
import { loadConfig, saveConfig } from '../src/services/config-service.ts';
import {
  AcceptanceVerificationSchema, DOCTRINE_VERIFIER_VERSION, readVerificationReceipt, resolveTicketGovernance,
  ticketVerificationSignature, type AcceptanceVerification, type ResolutionOptions, type ResolutionVerificationInput
} from '../src/ticket-operation-types.ts';
import { verifyTicketAcceptance } from '../src/ticket/verification.ts';
import { currentTestEvidence } from '../src/graph/test-artifacts.ts';
import { buildVerificationContext } from '../src/helpers/verification-context.ts';

describe('Doctrine Gate 3 deterministic enforcement contracts', () => {
  let root: string, store: WorkflowStore, rules: RuleStore, ticket: Ticket;
  const rule: RuleModel = {
    id: 'no-registry', ruleId: 'engineering.no-registry', title: 'One arithmetic owner',
    scope: { kind: 'universal' }, type: 'architecture', importance: 10,
    rule: 'Do not introduce a second registry for addition; add must perform arithmetic directly.',
    status: 'active', revision: 1, provenance: 'authored',
    examples: [{ kind: 'negative', description: 'An unused AdditionRegistry next to add.', lesson: 'The direct function already owns addition.' }],
    references: [], test: { kind: 'llm' }
  };
  const options = (): ResolutionOptions => ({
    systemOne: { assess: async () => null }, critic: 'none', maxRepairs: 0,
    testCommands: [['bun', 'test', 'tests/add.test.ts']],
    implement: async () => ({ changes: [], testCommands: [] })
  });
  // These injected verdicts test controller contracts; live semantic acceptance is run separately.
  const assessments = (input: ResolutionVerificationInput): AcceptanceVerification => ({
    criteria: input.dossier.ticket.acceptanceCriteria.map(criterion => ({ criterion, passed: true, evidence: 'Deterministic controller fixture; actual arithmetic test execution is checked separately.' })),
    aspects: [],
    rules: input.dossier.governance!.rules.filter(rule => rule.importance >= 8).map(rule => ({
      ruleId: rule.ruleId, revision: rule.revision, fingerprint: rule.fingerprint, verdict: 'pass',
      evidence: 'Deterministic Rule assessment fixture for the current arithmetic source.',
      evidenceIds: ['src/add.ts'], limitations: []
    }))
  });
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-doctrine-g3-'));
    fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'tests'));
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ai-workflow\n*.md\n');
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test"; import {add} from "../src/add"; test("signed sums",()=>{expect(add(2,3)).toBe(5);expect(add(-2,3)).toBe(1)});\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', skipLibCheck: true, types: ['bun'] } }));
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']]) {
      const result = Bun.spawnSync(['git', ...args], { cwd: root, stderr: 'pipe' });
      if (!result.success) throw Error(result.stderr.toString());
    }
    store = new WorkflowStore(root); await indexCodebase(store, root); rules = new RuleStore(store);
    await rules.saveRule(rule);
    ticket = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Preserve direct addition', body: 'Keep signed addition in its existing function.', lane: 'Todo', acceptanceCriteria: ['add returns signed sums'] });
    await store.relate(ticket, 'modifies', (await store.getEntity('src/add.ts', FileNode.dcr))!);
  });
  afterEach(async () => {
    await closeAllTsLspClients(); store.close(); fs.rmSync(root, { recursive: true, force: true });
  });

  const invalid = [
    { name: 'missing', change: (r: AcceptanceVerification) => { r.rules = []; } },
    { name: 'duplicate', change: (r: AcceptanceVerification) => { r.rules.push({ ...r.rules[0] }); } },
    { name: 'unknown', change: (r: AcceptanceVerification) => { r.rules.push({ ...r.rules[0], ruleId: 'invented' }); } },
    { name: 'wrong revision', change: (r: AcceptanceVerification) => { r.rules[0].revision++; } },
    { name: 'wrong fingerprint', change: (r: AcceptanceVerification) => { r.rules[0].fingerprint = '0'.repeat(64); } },
    { name: 'invented citation', change: (r: AcceptanceVerification) => { r.rules[0].evidenceIds = ['imaginary-source.ts']; } },
    { name: 'invented symbol in a real file', change: (r: AcceptanceVerification) => { r.rules[0].evidenceIds = ['src/add.ts#invented:1:1']; } },
    { name: 'empty citations', change: (r: AcceptanceVerification) => { r.rules[0].evidenceIds = []; } },
    { name: 'empty evidence', change: (r: AcceptanceVerification) => { r.rules[0].evidence = ' '; } },
    { name: 'failed', change: (r: AcceptanceVerification) => { r.rules[0].verdict = 'fail'; } },
    { name: 'inconclusive', change: (r: AcceptanceVerification) => { r.rules[0].verdict = 'inconclusive'; } }
  ];
  for (const scenario of invalid) it(`refuses ${scenario.name} Rule assessments despite passing tests and critic=none`, async () => {
    const result = await ticket.resolve(store, { ...options(), verify: async input => {
      const result = assessments(input); scenario.change(result); return result;
    } });
    expect(result.status).toBe('blocked');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
    expect(await store.getEntity('VERIFY-T', Artifact.dcr)).toBeNull();
    expect((await currentTestEvidence(store, ['test:tests/add.test.ts']))[0].passed).toBe(true);
  });

  it('accepts authored source Symbol citations and reuses their current proof', async () => {
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(item => item.filePath === 'src/add.ts' && item.title === 'add')!;
    await store.relate(ticket, 'modifies', symbol);
    const result = await ticket.resolve(store, { ...options(), verify: async input => {
      const accepted = assessments(input);
      accepted.rules[0].evidenceIds = [store.localId(symbol.id)];
      return accepted;
    } });
    expect(result.status).toBe('complete');
    expect((await ticket.resolve(store, { ...options(), verify: async () => { throw Error('Current Symbol proof must be reused'); } })).status).toBe('complete');
  });

  it('records pinned assessments and reuses only current governance proof', async () => {
    expect((await ticket.resolve(store, { ...options(), verify: async input => assessments(input) })).status).toBe('complete');
    const receipt = (await store.getEntity<Artifact & { body: string }>('VERIFY-T', Artifact.dcr))!;
    const proof = readVerificationReceipt(receipt.body)!;
    expect(proof.governanceVersion).toBe(DOCTRINE_VERIFIER_VERSION);
    expect(readVerificationReceipt(JSON.stringify({...proof, governanceVersion: DOCTRINE_VERIFIER_VERSION - 1}))).toBeNull();
    expect(proof.governanceFingerprint).toBe((await resolveTicketGovernance(store, ticket)).fingerprint);
    expect(proof.acceptance.rules[0]).toMatchObject({ ruleId: rule.ruleId, verdict: 'pass' });
    const reuse = await ticket.resolve(store, { ...options(), verify: async () => { throw Error('Current proof must be reused'); } });
    expect(reuse.status).toBe('complete');
    await rules.saveRule({ ...rule, rule: rule.rule + ' Keep one owner even after refactoring.' });
    let reviews = 0;
    const renewed = await ticket.resolve(store, { ...options(), verify: async input => { reviews++; return assessments(input); } });
    expect(renewed.status).toBe('complete'); expect(reviews).toBe(1);
  });

  it('requires fresh verification for legacy receipts without changing historical Done state on read', async () => {
    await ticket.resolve(store, { ...options(), verify: async input => assessments(input) });
    const receipt = (await store.getEntity<Artifact & { body: string }>('VERIFY-T', Artifact.dcr))!;
    const historical: Record<string, unknown> = JSON.parse(receipt.body);
    delete historical.governanceVersion; delete historical.governanceFingerprint;
    const legacyBody = JSON.stringify(historical);
    // Historical fixture injection deliberately bypasses authoring; production receipt writes remain owner-only.
    const artifacts = await store.sp.collectionForEntityType(Artifact.dcr);
    await artifacts.updateDocument(receipt.id, {body: legacyBody}, receipt.version);
    expect(readVerificationReceipt(legacyBody)).toBeNull();
    const investigation = await ticket.investigate(store, options());
    expect(investigation.status).toBe('complete');
    if (investigation.status === 'complete')
      expect(investigation.value.evidence.find(e => e.id === 'VERIFY-T')?.provenance).toContain('legacy/unassessed');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).toBe('Done');
    let reviews = 0;
    expect((await ticket.resolve(store, { ...options(), verify: async input => { reviews++; return assessments(input); } })).status).toBe('complete');
    expect(reviews).toBe(1);
  });

  it('invalidates proof on actual normative, example, checker, Decision and Aspect changes, but ignores unrelated advisory content', async () => {
    const baseline = await ticketVerificationSignature(store, ticket);
    await rules.saveRule({ ...rule, id: 'advice', ruleId: 'advice', importance: 3 });
    await rules.saveRule({ ...rule, id: 'python', ruleId: 'python', languages: ['python'] });
    expect(await ticketVerificationSignature(store, ticket)).toBe(baseline);
    for (const change of [
      { rule: 'Use the direct arithmetic function only.' }, { revision: 2 },
      { importance: 9 }, { examples: [{ kind: 'positive' as const, description: 'return a + b', lesson: 'One owner.' }] },
      { test: { kind: 'llm' as const, instruction: 'Inspect all immediate contracts.' } }
    ]) {
      await rules.saveRule({ ...rule, ...change });
      expect(await ticketVerificationSignature(store, ticket)).not.toBe(baseline);
      await rules.saveRule(rule);
    }
    const decision = await store.sp.createEntity<Decision>(Decision.dcr, { id:store.formatId(Decision.dcr,"D"),_id:store.formatId(Decision.dcr,"D"), title: 'Arithmetic owner', decision: 'Use the add function.', context: 'Preserve one owner.', consequences: 'No second registry.' },true,false);
    await store.relate(decision, 'governs', ticket);
    const governed = await ticketVerificationSignature(store, ticket);
    await (await store.sp.collectionForEntityType(Decision.dcr)).updateDocument(decision.id,{consequences:'Reject redundant registries explicitly.'},decision.version);
    expect(await ticketVerificationSignature(store, ticket)).not.toBe(governed);
    const aspect = await createAspect(store,{ id: 'A', title: 'Signed arithmetic', status: 'accepted', acceptanceCriteria: ['Signed inputs remain supported'] });
    await store.relate(ticket, 'addresses', aspect);
    const concerned = await ticketVerificationSignature(store, ticket);
    await updateProduct(store, "Aspect", {id:store.localId(aspect.id),acceptanceCriteria: ['Also support zero']});
    expect(await ticketVerificationSignature(store, ticket)).not.toBe(concerned);
    const checked = await ticketVerificationSignature(store, ticket);
    saveConfig(root, { modelRoutes: { critic: 'openrouter/changed-checker' } });
    expect(await ticketVerificationSignature(store, ticket)).not.toBe(checked);
  });

  for (const stage of ['implementation', 'acceptance'] as const) it(`rejects governance weakening during ${stage} without a receipt`, async () => {
    let reviews = 0;
    const result = await ticket.resolve(store, { ...options(),
      implement: async () => { if (stage === 'implementation') await rules.saveRule({ ...rule, importance: 1 }); return { changes: [], testCommands: [] }; },
      verify: async input => { reviews++; const result = assessments(input); if (stage === 'acceptance') await rules.saveRule({ ...rule, status: 'disabled' }); return result; }
    });
    expect(result.status).toBe('blocked');
    expect(JSON.stringify(result)).toContain('Governance admission conflict');
    expect((await rules.getRule(rule.ruleId, rule.scope))!.importance).toBe(10);
    expect((await rules.getRule(rule.ruleId, rule.scope))!.status).toBe('active');
    if (stage === 'implementation') expect(reviews).toBe(0);
    expect(await store.getEntity('VERIFY-T', Artifact.dcr)).toBeNull();
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
  });

  it('does not let the producer mutate its dossier to drop privately pinned obligations', async () => {
    const result = await ticket.resolve(store, { ...options(),
      implement: async dossier => { dossier.governance!.rules[0].importance = 1; return { changes: [], testCommands: [] }; },
      verify: async input => assessments(input)
    });
    expect(result.status).toBe('blocked');
    expect((await rules.resolveRule(rule.ruleId))!.effective.importance).toBe(10);
    expect(await store.getEntity('VERIFY-T', Artifact.dcr)).toBeNull();
  });

  it('rejects source-change attempts into canonical governance storage before writing', async () => {
    const target = '.ai-workflow/state/weakening.json';
    const result = await ticket.resolve(store, { ...options(),
      implement: async () => ({ changes: [{ action: 'create_file', filePath: target, content: '{"importance":1}' }], testCommands: [] }),
      verify: async input => assessments(input)
    });
    expect(result.status).toBe('blocked');
    expect(fs.existsSync(path.join(root, target))).toBe(false);
    expect((await rules.resolveRule(rule.ruleId))!.effective.importance).toBe(10);
  });

  it('keeps Rule failure feedback in the existing bounded repair loop', async () => {
    const extra = 'class AdditionRegistry {}\n';
    fs.appendFileSync(path.join(root, 'src/add.ts'), extra);
    let attempts = 0;
    const result = await ticket.resolve(store, { ...options(), maxRepairs: 1, allowDirtyTargets: ['src/add.ts'],
      implement: async (_dossier, feedback) => {
        attempts++;
        if (!feedback.length) return { changes: [], testCommands: [] };
        expect(feedback.join('\n')).toContain(rule.ruleId);
        return { changes: [{ action: 'replace_text', filePath: 'src/add.ts', oldText: extra, newText: '' }], testCommands: [] };
      },
      verify: async input => {
        const result = assessments(input);
        if (fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8').includes('class AdditionRegistry')) {
          result.rules[0].verdict = 'fail'; result.rules[0].evidence = 'src/add.ts adds an unused registry next to the existing owner.';
        }
        return result;
      }
    });
    expect(result.status).toBe('complete'); expect(attempts).toBe(2);
    expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).not.toContain('AdditionRegistry');
  });

  it('rejects unknown mandatory language and preserves distinct module obligations', async () => {
    const unknown = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'UNKNOWN', title: 'Unanchored work', body: 'Target undecided', acceptanceCriteria: ['Work is defined'] });
    await rules.saveRule({ ...rule, languages: ['typescript'] });
    await expect(resolveTicketGovernance(store, unknown)).rejects.toThrow('Specify the target language');
    await rules.saveRule(rule);
    const module = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, { id: 'OTHER', title: 'Other owner' });
    await store.relate(ticket, 'targets', module);
    await rules.saveRule({ ...rule, scope: { kind: 'module', moduleId: 'OTHER' }, rule: 'Use a different owner.' });
    const governance = await resolveTicketGovernance(store, ticket);
    expect(governance.rules.filter(item => item.ruleId === rule.ruleId)).toHaveLength(2);
    expect(new Set(governance.rules.map(item => item.fingerprint)).size).toBe(2);
    const input = {criteria: [], aspects: [], rules: [{ruleId: rule.ruleId, revision: rule.revision,
      fingerprint: governance.rules[0].fingerprint, verdict: 'pass' as const,
      evidence: 'One context checked', evidenceIds: ['src/add.ts'], limitations: []}]};
    const {ruleAcceptanceFailures} = await import('../src/ticket-operation-types.ts');
    expect(ruleAcceptanceFailures(governance, input, ['src/add.ts'])).toHaveLength(1);
  });

  it('refuses an unavailable mandatory codelet checker before requesting an LLM verdict', async () => {
    await rules.saveRule({ ...rule, test: { kind: 'codelet', codeletName: 'missing-checker' } });
    const investigation = await ticket.investigate(store, { systemOne: { assess: async () => null } });
    expect(investigation.status).toBe('complete');
    if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
    await expect(verifyTicketAcceptance(store, { dossier: investigation.value, files: [], tests: [], children: [], testNodes: [] }, options(), loadConfig(root))).rejects.toThrow('unsupported codelet checker');
  });


  it('supplies complete small authored files for structural absence while preserving exact-symbol scope', async () => {
    const registry = 'export class AdditionRegistry {}\n';
    fs.appendFileSync(path.join(root, 'src/add.ts'), registry);
    await indexCodebase(store, root);
    const tests = [(await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr))!];
    const investigation = await ticket.investigate(store, options());
    if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
    const whole = await buildVerificationContext(store, root, { dossier: investigation.value, files: [], testNodes: tests });
    const file = whole.files.find(item => item.file === 'src/add.ts')!;
    expect(file.snippets).toHaveLength(1);
    expect(file.snippets[0].label).toBe('complete authored file');
    expect(file.snippets[0].source).toBe(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8'));

    const regression = {
      id: 'REGRESSION', kind: 'TestNode', title: 'Large regression suite', mandatory: true,
      filePath: 'tests/large.test.ts', provenance: 'Graph verifies code target'
    };
    fs.writeFileSync(path.join(root, regression.filePath), '// unrelated regression context\n'.repeat(400));
    const narrowed = await buildVerificationContext(store, root, {
      dossier: { ...investigation.value, evidence: [...investigation.value.evidence, regression] }, files: [], testNodes: tests
    });
    expect(narrowed.files.some(item => item.file === regression.filePath)).toBe(false);

    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(item => item.filePath === 'src/add.ts' && item.title === 'add')!;
    const scoped = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'EXACT', title: 'Review exact add', body: 'Review only the add declaration.', acceptanceCriteria: ['add returns signed sums'] });
    await store.relate(scoped, 'modifies', symbol);
    const exactInvestigation = await scoped.investigate(store, options());
    if (exactInvestigation.status !== 'complete') throw Error(JSON.stringify(exactInvestigation));
    const exact = await buildVerificationContext(store, root, { dossier: exactInvestigation.value, files: [], testNodes: tests });
    expect(exact.files.find(item => item.file === 'src/add.ts')!.snippets.map(item => item.source).join('\n')).not.toContain('AdditionRegistry');
    expect(exact.files.find(item => item.file === 'src/add.ts')!.outline).toEqual([]);
    await store.relate(scoped, 'modifies', (await store.getEntity('src/add.ts', FileNode.dcr))!);
    const combined = await scoped.investigate(store, options());
    if (combined.status !== 'complete') throw Error(JSON.stringify(combined));
    const full = await buildVerificationContext(store, root, { dossier: combined.value, files: [], testNodes: tests });
    expect(full.files.find(item => item.file === 'src/add.ts')!.snippets[0].source).toContain('AdditionRegistry');
  });


  it('supplies the entire authored file even when a linked test provides only one symbol', async () => {
    fs.appendFileSync(path.join(root, 'src/add.ts'), '\n' + '// padding\n'.repeat(900) + 'export class HiddenRegistry {}\n');
    await indexCodebase(store, root);
    const investigation = await ticket.investigate(store, options());
    if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
    const tests = [(await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr))!];
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(item => item.filePath === 'src/add.ts' && item.title === 'add')!;
    await store.withTestArtifactWrite(tests[0].id,()=>store.relate(tests[0], 'verifies', symbol));
    const context = await buildVerificationContext(store, root, {dossier: investigation.value, files: [], testNodes: tests});
    const file = context.files.find(item => item.file === 'src/add.ts')!;
    expect(file.snippets).toHaveLength(1);
    expect(file.snippets[0].source).toBe(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8'));
    await expect(buildVerificationContext(store, root, {dossier: investigation.value, files: [], testNodes: tests}, 8000))
      .rejects.toThrow('Verification context exceeds');
  });

  it('supplies caller-scoped whole files without resolving inferred call anchors as declarations', async () => {
    fs.appendFileSync(path.join(root, 'src/add.ts'), '\nexport class BoundAddition { constructor() { const bound = add.bind(null); } }\n');
    await indexCodebase(store, root);
    const inferred = await store.upsertEntity<SymbolNode>(SymbolNode.dcr, {id: 'legacy-bind', title: 'bind', kind: 'function'});
    await store.relate((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!, 'calls', inferred, {state: 'legacy-heuristic'});
    expect(inferred).toBeDefined();
    // An unresolved call has a caller edge, not a declaration in the caller's file.
    expect((await store.getOutgoing('src/add.ts', 'calls')).some(edge => edge.targetId === inferred.id)).toBe(true);
    const investigation = await ticket.investigate(store, options());
    if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
    const dossier = {...investigation.value, evidence: investigation.value.evidence.filter(item => item.kind !== 'FileNode' && item.kind !== 'SymbolNode')};
    const context = await buildVerificationContext(store, root, {dossier, files: ['src/add.ts'], testNodes: [{id: 'test:tests/add.test.ts', filePath: 'tests/add.test.ts', verifies: [inferred.id]}]});
    const file = context.files.find(item => item.file === 'src/add.ts')!;
    expect(file.snippets).toHaveLength(1);
    expect(file.snippets[0].source).toBe(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8'));
    expect(file.outline).toEqual([]);
  });

  it('fails when one of several required exact declarations cannot be supplied', async () => {
    const investigation = await ticket.investigate(store, options());
    if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
    const dossier = {...investigation.value, evidence: investigation.value.evidence.filter(item => item.kind !== 'FileNode')};
    for (const symbolName of ['add', 'missing']) dossier.evidence.push({
      id: symbolName, kind: 'SymbolNode', title: symbolName, mandatory: true,
      provenance: 'Ticket modifies', filePath: 'src/add.ts', symbolName
    });
    // Await native I/O before asserting: Bun 1.4.3's rejects matcher stalls repeated LSP requests.
    const failure = await buildVerificationContext(store, root, {dossier, files: [], testNodes: []})
      .then(() => null, error => error as Error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure!.message).toContain("Required verification symbol 'missing'");
    expect(failure!.cause).toBeInstanceOf(Error);
    expect(String(failure!.cause)).toContain("Expected one exact declaration for 'missing', found 0");
  });

  it('uses JavaScript applicability instead of silently treating JavaScript targets as TypeScript', async () => {
    fs.writeFileSync(path.join(root, 'src/worker.js'), 'export function work() { return 1; }\n');
    await indexCodebase(store, root);
    const js = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'JS', title: 'Review JavaScript', body: 'Keep the JavaScript worker direct.', acceptanceCriteria: ['work returns one'] });
    await store.relate(js, 'modifies', (await store.getEntity('src/worker.js', FileNode.dcr))!);
    await rules.saveRule({ ...rule, languages: ['javascript'] });
    expect((await resolveTicketGovernance(store, js)).rules.map(item => item.ruleId)).toContain(rule.ruleId);
    expect((await resolveTicketGovernance(store, ticket)).rules.map(item => item.ruleId)).not.toContain(rule.ruleId);
  });

  it('surfaces an expected Rule violation without treating it as unknown or blocking completion', async () => {
    await rules.saveRule({...rule, id: 'expected', ruleId: 'engineering.expected', importance: 6});
    const result = await ticket.resolve(store, {...options(), verify: async input => {
      const acceptance = assessments(input);
      const expected = input.dossier.governance!.rules.find(item => item.ruleId === 'engineering.expected')!;
      acceptance.rules.push({
        ruleId: expected.ruleId, revision: expected.revision, fingerprint: expected.fingerprint,
        verdict: 'fail', evidence: 'Expected improvement is not satisfied; this deviation is nonblocking.',
        evidenceIds: ['src/add.ts'], limitations: []
      });
      return acceptance;
    }});
    expect(result.status).toBe('complete');
    const receipt = (await store.getEntity<Artifact & {body: string}>('VERIFY-T', Artifact.dcr))!;
    expect(readVerificationReceipt(receipt.body)!.acceptance.rules.find(item => item.ruleId === 'engineering.expected')!.verdict).toBe('fail');
  });

  it('invalidates a receipt when an applicable expected Rule changes', async () => {
    const expected = {...rule, id: 'expected', ruleId: 'engineering.expected', importance: 6};
    await rules.saveRule(expected);
    expect((await ticket.resolve(store, {...options(), verify: async input => assessments(input)})).status).toBe('complete');
    await rules.saveRule({...expected, revision: 2, rule: expected.rule + ' Keep error ownership explicit.'});
    let reviews = 0;
    const result = await ticket.resolve(store, {...options(), verify: async input => {
      reviews++;
      return assessments(input);
    }});
    expect(result.status).toBe('complete');
    expect(reviews).toBe(1);
  });

  it('delivers expected Rules to the default verifier and retains their nonblocking deviations', async () => {
    await rules.saveRule({...rule, id: 'expected', ruleId: 'engineering.expected', importance: 6});
    let prompt = '';
    let acceptance: AcceptanceVerification;
    const server = Bun.serve({port: 0, fetch: async request => {
      const body = await request.json() as {messages: Array<{content: string}>};
      prompt = body.messages[0].content;
      return Response.json({message: {content: JSON.stringify(acceptance)}});
    }});
    const previous = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = server.url.toString();
    try {
      saveConfig(root, {model: 'ollama/fixture', modelRoutes: {critic: 'ollama/fixture'}, ollamaUrl: server.url.toString()});
      const investigation = await ticket.investigate(store, options());
      if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
      const input = {dossier: investigation.value, files: [], tests: [], testNodes: [], children: []};
      acceptance = assessments(input);
      const expected = input.dossier.governance!.rules.find(item => item.ruleId === 'engineering.expected')!;
      acceptance.rules.push({
        ruleId: expected.ruleId, revision: expected.revision, fingerprint: expected.fingerprint,
        verdict: 'fail', evidence: 'Nonblocking fixture deviation.',
        evidenceIds: ['src/add.ts'], limitations: []
      });
      const result = await verifyTicketAcceptance(store, input, options(), loadConfig(root));
      expect(prompt).toContain('engineering.expected');
      expect(result.rules.find(item => item.ruleId === expected.ruleId)!.verdict).toBe('fail');
    } finally {
      server.stop(true);
      if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous;
    }
  });

  for (const defect of ['missing Rule', 'invalid citation', 'missing criterion', 'exhausted correction', 'malformed then incomplete', 'failed Rule', 'inconclusive Rule'] as const) {
    it(`corrects response-contract errors once and preserves rejection: ${defect}`, async () => {
      const prompts: string[] = [];
      let acceptance: AcceptanceVerification;
      const server = Bun.serve({port: 0, fetch: async request => {
        const body = await request.json() as {messages: Array<{content: string}>};
        prompts.push(body.messages[0].content);
        if (defect === 'malformed then incomplete' && prompts.length === 1)
          return Response.json({message: {content: '{'}});
        const response = structuredClone(acceptance);
        if (prompts.length === 1 || ['exhausted correction', 'malformed then incomplete'].includes(defect)) {
          if (defect === 'invalid citation') response.rules[0].evidenceIds = ['invented.ts'];
          else if (defect === 'missing criterion') response.criteria = [];
          else if (defect === 'failed Rule') response.rules[0].verdict = 'fail';
          else if (defect === 'inconclusive Rule') response.rules[0].verdict = 'inconclusive';
          else response.rules = [];
        }
        return Response.json({message: {content: JSON.stringify(response)}});
      }});
      const previous = process.env.OLLAMA_HOST;
      process.env.OLLAMA_HOST = server.url.toString();
      try {
        saveConfig(root, {model: 'ollama/fixture', modelRoutes: {critic: 'ollama/fixture'}, ollamaUrl: server.url.toString()});
        const investigation = await ticket.investigate(store, options());
        if (investigation.status !== 'complete') throw Error(JSON.stringify(investigation));
        const input = {dossier: investigation.value, files: [], tests: [], testNodes: [], children: []};
        acceptance = assessments(input);
        const result = verifyTicketAcceptance(store, input, options(), loadConfig(root));
        if (['failed Rule', 'inconclusive Rule'].includes(defect)) {
          await expect(result).rejects.toThrow(defect === 'failed Rule' ? ': fail:' : ': inconclusive:');
          expect(prompts).toHaveLength(1);
        } else if (['exhausted correction', 'malformed then incomplete'].includes(defect)) {
          await expect(result).rejects.toThrow('lacks an independent assessment');
          expect(prompts).toHaveLength(2);
        } else {
          expect(await result).toEqual(acceptance);
          expect(prompts).toHaveLength(2);
          expect(prompts[1]).toContain(defect === 'invalid citation' ? 'invented.ts' : defect === 'missing criterion' ? 'Missing criterion assessment' : 'lacks an independent assessment');
          expect(prompts[1]).toContain('Previous response failed validation');
          expect(prompts[0]).toContain('validEvidenceIds');
          expect(prompts[0]).toContain('src/add.ts');
        }
      } finally {
        server.stop(true);
        if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous;
      }
    });
  }

  it('requires exact Rule identifiers and nonempty cited evidence in the schema', () => {
    expect(AcceptanceVerificationSchema.safeParse({ criteria: [], aspects: [], rules: [{ ruleId: rule.ruleId, revision: 1, fingerprint: '0'.repeat(64), verdict: 'pass', evidence: '', evidenceIds: [] }] }).success).toBe(false);
  });
});
