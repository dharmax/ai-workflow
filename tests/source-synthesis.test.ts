import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket } from '../src/model/ontology.ts';
import { applyProductMutations } from '../src/product/mutation.ts';
import { buildSynthesisContext } from '../src/helpers/synthesis/context-builder.ts';
import { HostSourceSynthesizer } from '../src/helpers/synthesis/synthesizer.ts';

function createMockAsker(payload: any) {
  const recorded = { lastUserPrompt: undefined as string | undefined, lastSystemPrompt: undefined as string | undefined };
  return {
    recorded,
    asker: {
      json: async (_prompt: string, _schema: any, options?: any) => {
        recorded.lastUserPrompt = _prompt;
        recorded.lastSystemPrompt = options?.system;
        return { ok: true, data: payload };
      }
    } as any
  };
}

describe('Graph-Grounded Source Synthesis (J3.4 - Gate 0 & Gate 1)', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-synthesis-test-'));
    store = new WorkflowStore(tmpDir, true);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds small, provenance-bearing SynthesisContext from Ticket investigation dossier', async () => {
    await applyProductMutations(store, [
      {
        kind: 'product_create',
        entityType: 'Ticket',
        id: 'TKT-TEST-SYNTHESIS',
        fields: {
          title: 'Implement calculateBonus calculation',
          body: 'Calculate annual performance bonus accurately according to rate',
          acceptanceCriteria: [
            'calculateBonus returns salary multiplied by rate when rate is positive',
            'returns 0 when rate is 0 or negative'
          ]
        }
      }
    ]);

    const ticket = (await store.getEntity('TKT-TEST-SYNTHESIS', Ticket.dcr)) as Ticket;
    const res = await ticket.investigate(store);
    expect(res.status).toBe('complete');
    if (res.status !== 'complete') return;
    const dossier = res.value;

    expect(() => buildSynthesisContext({ dossier: { ...dossier, evidence: [] } })).toThrow('no exact synthesis target');
    expect(() => buildSynthesisContext({ dossier: { ...dossier, evidence: [{
      id: 'file', title: 'bonus.ts', kind: 'FileNode', filePath: 'src/bonus.ts', mandatory: true, provenance: 'authored'
    }] } })).toThrow('no exact synthesis target');

    const exactTarget = { id: 'bonus', title: 'bonus', kind: 'SymbolNode', filePath: 'src/bonus.ts',
      symbolName: 'bonus', source: 'export function bonus() { return 0; }', exact: true, mandatory: true, provenance: 'authored' };
    expect(buildSynthesisContext({ dossier: { ...dossier, evidence: [exactTarget] } }).target.kind).toBe('existing_symbol');
    expect(() => buildSynthesisContext({ dossier: { ...dossier, evidence: [exactTarget, { ...exactTarget, id: 'other', symbolName: 'other' }] } })).toThrow('no exact synthesis target');

    const optionalTarget = { ...exactTarget, id: 'discovered', mandatory: false, symbolName: 'reuse' };
    expect(() => buildSynthesisContext({ dossier: { ...dossier, evidence: [optionalTarget] } })).toThrow('requires exactly one mandatory exact symbol');
    expect(buildSynthesisContext({ dossier: { ...dossier, evidence: [exactTarget, optionalTarget] } }).target).toMatchObject({
      filePath: 'src/bonus.ts', symbolName: 'bonus', existingSource: exactTarget.source
    });
    for (const incomplete of [
      { ...exactTarget, filePath: undefined },
      { ...exactTarget, symbolName: undefined },
      { ...exactTarget, source: undefined },
      { ...exactTarget, exact: false },
      { ...exactTarget, kind: 'FileNode' }
    ]) {
      expect(() => buildSynthesisContext({ dossier: { ...dossier, evidence: [incomplete] } })).toThrow('no exact synthesis target');
    }

    const ctx = buildSynthesisContext({
      dossier,
      target: {
        kind: 'existing_symbol',
        filePath: 'src/bonus.ts',
        symbolName: 'calculateBonus',
        existingSource: 'export function calculateBonus(salary: number, rate: number): number {\n  return 0;\n}'
      }
    });

    expect(ctx.target.kind).toBe('existing_symbol');
    expect(ctx.target.filePath).toBe('src/bonus.ts');
    if (ctx.target.kind === 'existing_symbol') {
      expect(ctx.target.symbolName).toBe('calculateBonus');
      expect(ctx.target.existingSource).toContain('return 0;');
    }
    expect(ctx.intent.acceptanceCriteria.length).toBe(2);
    expect(ctx.verification.length).toBe(2);
    expect(ctx.verification[0].criterion).toContain('calculateBonus returns salary multiplied by rate');
    expect(ctx.verification[0].provenance).toContain('Ticket acceptance criterion 1');
  });

  it('HostSourceSynthesizer synthesizes candidate source without ungrounded guessing', async () => {
    const { asker, recorded } = createMockAsker({
      source: 'export function calculateBonus(salary: number, rate: number): number {\n  return rate > 0 ? salary * rate : 0;\n}',
      assumptions: ['salary and rate are non-negative floats']
    });

    const synthesizer = new HostSourceSynthesizer(asker);
    const synthesisCtx = {
      intent: {
        summary: 'Implement calculateBonus',
        acceptanceCriteria: ['calculateBonus returns salary * rate for positive rate, 0 otherwise']
      },
      target: {
        kind: 'existing_symbol' as const,
        filePath: 'src/bonus.ts',
        symbolName: 'calculateBonus',
        existingSource: 'export function calculateBonus(salary: number, rate: number): number { return 0; }'
      },
      evidence: [
        {
          id: 'ev-1',
          role: 'constraint' as const,
          fact: 'Rate is a float between 0 and 1',
          provenance: 'Business policy'
        }
      ],
      verification: [
        {
          id: 'ac-1',
          criterion: 'calculateBonus returns salary * rate for positive rate, 0 otherwise',
          mandatory: true,
          provenance: 'Ticket contract'
        }
      ]
    };

    const candidate = await synthesizer.synthesize(synthesisCtx);
    expect(candidate.source).toBe('export function calculateBonus(salary: number, rate: number): number {\n  return rate > 0 ? salary * rate : 0;\n}');
    expect(candidate.assumptions).toContain('salary and rate are non-negative floats');
    expect(candidate.target.filePath).toBe('src/bonus.ts');
    expect(recorded.lastSystemPrompt).toContain('You are the AIWF Grounded Source Synthesizer');
    expect(recorded.lastSystemPrompt).toContain('Existing source:');
    expect(recorded.lastUserPrompt).not.toContain('rename_symbol');
    expect(recorded.lastUserPrompt).not.toContain('replace_symbol');
    expect(candidate).not.toHaveProperty('action');
    expect(candidate).not.toHaveProperty('replacement');
    expect(candidate).not.toHaveProperty('testCommands');
  });

  it('rejects mutation responses instead of synthesizing source', async () => {
    const { asker } = createMockAsker({ action: 'replace_symbol', replacement: 'export const guessed = 1;' });
    await expect(new HostSourceSynthesizer(asker).synthesize({
      intent: { summary: 'Implement bonus', acceptanceCriteria: [] },
      target: { kind: 'existing_symbol', filePath: 'src/bonus.ts', symbolName: 'bonus', existingSource: 'export function bonus() { return 0; }' },
      evidence: [], verification: []
    })).rejects.toThrow();
  });

  it('repairs an actionable test failure rather than reporting it as missing input', async () => {
    const prompts: string[] = [];
    const replies = [
      {source: '', unresolvedBlocker: "greet returns 'Hello, ADA' without the required exclamation mark"},
      {source: "export function greet(name: string): string { return 'Hello, ' + name.toUpperCase() + '!'; }"}
    ];
    const asker = {json: async (prompt: string) => {
      prompts.push(prompt);
      return {ok: true, data: replies[prompts.length - 1]};
    }} as any;
    const result = await new HostSourceSynthesizer(asker).synthesize({
      intent: {summary: 'Correct greeting', acceptanceCriteria: ["greet('Ada') is 'Hello, ADA!'"]},
      target: {kind: 'existing_symbol', filePath: 'src/greet.ts', symbolName: 'greet',
        existingSource: "export function greet(name: string): string { return 'Hello, ' + name; }"},
      evidence: [], verification: [{id: 'ac-1', criterion: "greet('Ada') is 'Hello, ADA!'",
        mandatory: true, provenance: 'Story acceptance'}]
    }, {feedback: [{stage: 'project_compatibility', message: "Expected: 'Hello, ADA!' Received: 'Hello, ADA'"}]});
    expect(result.source).toContain("name.toUpperCase() + '!'");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('Correction to prior response');
    expect(prompts[1]).toContain('verificationFeedback');
  });

  it('still halts after one repair retry when a genuine blocker remains', async () => {
    let calls = 0;
    const asker = {json: async () => {
      calls++;
      return {ok: true, data: {source: '', unresolvedBlocker: 'Unknown mandatory encryption key'}};
    }} as any;
    await expect(new HostSourceSynthesizer(asker).synthesize({
      intent: {summary: 'Encrypt the output', acceptanceCriteria: ['Use required external key']},
      target: {kind: 'existing_symbol', filePath: 'src/crypto.ts', symbolName: 'encrypt',
        existingSource: 'export function encrypt() { return ""; }'},
      evidence: [], verification: []
    }, {feedback: [{stage: 'project_compatibility', message: 'Wrong encryption key'}]}))
      .rejects.toThrow('Unknown mandatory encryption key');
    expect(calls).toBe(2);
  });

  it('halts with error when synthesizer returns unresolved blocker', async () => {
    const { asker } = createMockAsker({
      source: '',
      unresolvedBlocker: 'Ambiguous schema: salary unit undefined (USD vs EUR)'
    });

    const synthesizer = new HostSourceSynthesizer(asker);
    const synthesisCtx = {
      intent: {
        summary: 'Ambiguous task',
        acceptanceCriteria: ['Do something']
      },
      target: {
        kind: 'new_source' as const,
        filePath: 'src/calc.ts'
      },
      evidence: [],
      verification: []
    };

    expect(synthesizer.synthesize(synthesisCtx)).rejects.toThrow('Synthesis halted on unresolved blocker: Ambiguous schema');
  });
});
