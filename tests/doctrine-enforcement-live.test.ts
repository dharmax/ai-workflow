import { expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Artifact, FileNode, Ticket } from '../src/graph/ontology.ts';
import { RuleStore } from '../src/rules/store.ts';
import type { RuleModel } from '../src/rules/types.ts';
import { indexCodebase } from '../src/graph/indexer.ts';
import { currentTestEvidence } from '../src/graph/test-artifacts.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { loadConfig, saveConfig } from '../src/config.ts';
import { readVerificationReceipt, type ResolutionOptions } from '../src/ticket-operation-types.ts';
import { verifyTicketAcceptance } from '../src/ticket/verification.ts';
import { queryPerformance } from '../src/performance-metrics.ts';

it.skipIf(process.env.AIWF_DOCTRINE_LIVE !== '1')('OpenRouter rejects a real redundant registry despite passing tests, accepts its guarded repair, invalidates proof and rejects a governance race', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-doctrine-live-'));
  let store: WorkflowStore | undefined;
  const critic = loadConfig(path.resolve(import.meta.dir, '..')).modelRoutes?.critic ?? 'openrouter/openai/gpt-4o-mini';
  if (!critic.startsWith('openrouter/')) throw Error('Live doctrine acceptance requires an explicit OpenRouter route.');
  const evidence: Record<string, unknown> = { provider: 'openrouter', model: critic.slice('openrouter/'.length) };
  const evidenceFile = path.join(os.tmpdir(), `g3-live-adversarial-${path.basename(root)}.json`);
  const record = (phase: string, result: unknown) => {
    evidence[phase] = result;
    const content = JSON.stringify(evidence, null, 2) + '\n';
    fs.writeFileSync(evidenceFile, content);
    fs.writeFileSync(path.join(os.tmpdir(), 'g3-live-adversarial.json'), content);
    console.log(`Live doctrine evidence recorded: ${phase}`);
  };
  try {
    fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'tests'));
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ai-workflow\n*.md\n');
    const source = 'export function add(a: number, b: number) { return a + b; }\n';
    const redundant = 'export class AdditionRegistry { private readonly operations = new Map([["add", add]]); calculate(a: number, b: number) { return this.operations.get("add")!(a, b); } }\n';
    fs.writeFileSync(path.join(root, 'src/add.ts'), source);
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test"; import {add} from "../src/add"; test("signed sums",()=>{expect(add(2,3)).toBe(5);expect(add(-2,3)).toBe(1)});\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', types: ['bun'], skipLibCheck: true } }));
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']]) {
      const result = Bun.spawnSync(['git', ...args], { cwd: root, stderr: 'pipe' });
      if (!result.success) throw Error(result.stderr.toString());
    }
    saveConfig(root, { gateway: 'openrouter', model: critic, modelRoutes: { critic }, llmOutputTokens: 4096 });
    store = new WorkflowStore(root); await indexCodebase(store, root);
    const rules = new RuleStore(store);
    const rule: RuleModel = {
      id: 'one-owner', ruleId: 'engineering.one-owner', title: 'No redundant addition registry',
      scope: { kind: 'universal' }, type: 'architecture', importance: 10, status: 'active', revision: 1, provenance: 'authored',
      rule: 'Reuse the existing direct add function. Do not introduce another registry or dispatch wrapper for its responsibility. An unused AdditionRegistry alongside add is a redundant owner and violates this Rule, even when arithmetic tests pass.',
      examples: [{ kind: 'negative', description: 'A second AdditionRegistry maps the existing add function and forwards calls to it without any independent responsibility or consumer.', lesson: 'Remove the redundant owner and use add directly.' }],
      references: [], test: { kind: 'llm', instruction: 'Inspect the actual source and cite any redundant registry. Passing arithmetic tests cannot excuse unnecessary ownership.' }
    };
    await rules.saveRule(rule);
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'LIVE-G3', title: 'Preserve one arithmetic owner', body: 'Keep signed addition in its existing function.', lane: 'Todo', acceptanceCriteria: ['add returns signed sums'] });
    await store.relate(ticket, 'modifies', (await store.getEntity('src/add.ts', FileNode.dcr))!);
    const options: ResolutionOptions = { critic: 'none', maxRepairs: 0, signal: AbortSignal.timeout(180000), testCommands: [['bun', 'test', 'tests/add.test.ts']] };
    const violating = await ticket.resolve(store, { ...options,
      implement: async () => ({ changes: [{ action: 'replace_text', filePath: 'src/add.ts', oldText: source, newText: source + redundant }], testCommands: [] })
    });
    const passingTests = await currentTestEvidence(store, ['test:tests/add.test.ts']);
    record('violating', { result: violating, tests: passingTests.map(test => ({ id: test.id, passed: test.passed, command: test.command })), source: fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8') });
    expect(violating.status).toBe('blocked');
    if (violating.status !== 'blocked') throw Error('Real adversarial implementation unexpectedly completed');
    expect(violating.blockers.map(item => item.reason).join('\n')).toContain("Mandatory Rule 'engineering.one-owner': fail");
    expect(passingTests[0].passed).toBe(true);
    expect((await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!.lane).not.toBe('Done');
    expect(await store.getEntity('VERIFY-LIVE-G3', Artifact.dcr)).toBeNull();

    const repaired = await ticket.resolve(store, { ...options, allowDirtyTargets: ['src/add.ts'],
      implement: async () => ({ changes: [{ action: 'replace_text', filePath: 'src/add.ts', oldText: redundant, newText: '' }], testCommands: [] })
    });
    record('repaired', repaired);
    expect(repaired.status).toBe('complete');
    const receipt = (await store.getEntity<Artifact & { body: string }>('VERIFY-LIVE-G3', Artifact.dcr))!;
    const firstProof = readVerificationReceipt(receipt.body)!;
    expect(firstProof.acceptance.rules[0]).toMatchObject({ ruleId: rule.ruleId, verdict: 'pass' });

    const stronger = { ...rule, revision: 2, rule: rule.rule + ' Preserve this single owner during future changes.' };
    await rules.saveRule(stronger);
    const renewed = await ticket.resolve(store, { ...options, implement: async () => ({ changes: [], testCommands: [] }) });
    record('renewed', renewed);
    expect(renewed.status).toBe('complete');
    const renewedReceipt = (await store.getEntity<Artifact & { body: string }>('VERIFY-LIVE-G3', Artifact.dcr))!;
    const renewedBody = renewedReceipt.body;
    const renewedProof = readVerificationReceipt(renewedBody)!;
    expect(renewedProof.governanceFingerprint).not.toBe(firstProof.governanceFingerprint);
    expect(renewedProof.acceptance.rules[0].revision).toBe(2);

    await rules.saveRule({ ...stronger, revision: 3 });
    const activeStore = store;
    const race = await ticket.resolve(store, { ...options, implement: async () => ({ changes: [], testCommands: [] }),
      verify: async input => {
        const pending = verifyTicketAcceptance(activeStore, input, options, loadConfig(root));
        try { await rules.saveRule({ ...stronger, revision: 4, importance: 1 }); }
        catch (error) { await pending; throw error; }
        return pending;
      }
    });
    record('race', race);
    expect(race.status).toBe('blocked');
    expect(JSON.stringify(race)).toContain('Governance admission conflict');
    expect((await rules.getRule(rule.ruleId, rule.scope))!.revision).toBe(3);
    expect((await rules.getRule(rule.ruleId, rule.scope))!.importance).toBe(10);
    expect((await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!.lane).not.toBe('Done');
    expect((await store.getEntity<Artifact & { body: string }>('VERIFY-LIVE-G3', Artifact.dcr))!.body).toBe(renewedBody);
    const metrics = queryPerformance(root, { operation: 'resolve_ticket' });
    record('metrics', metrics.rows.map(row => ({ outcome: row.resolution, models: row.cognition.models, usage: row.cognition.llm, counters: row.counters })));
    expect(metrics.rows.filter(row => row.resolution?.outcome === 'proof_reused')).toHaveLength(0);
    record('completed', { adversarialTestsPassed: true, noMocks: true, scope: 'isolated actual AIWF Ticket; native checks and real OpenRouter acceptance' });
  } finally {
    await closeAllTsLspClients(); store?.close(); fs.rmSync(root, { recursive: true, force: true });
  }
}, 180000);
