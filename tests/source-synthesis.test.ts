import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket } from '../src/graph/ontology.ts';
import { applyProductMutations } from '../src/product/mutation.ts';
import { buildSynthesisContext } from '../src/synthesis/context-builder.ts';
import { HostSourceSynthesizer } from '../src/synthesis/synthesizer.ts';

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
