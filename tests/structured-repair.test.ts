import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Asker, CompletionEngine } from '@dharmax/llm-utils';
import { Ticket } from '../src/graph/ontology.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { proposeEpicStructure } from '../src/product/decompose.ts';

describe('AIWF delegates bounded schema correction to Asker.json', () => {
  let root: string, store: WorkflowStore;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-json-')); store = new WorkflowStore(root); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });

  for (const correctionValid of [true, false]) it(`Epic decomposition ${correctionValid ? 'accepts one schema-aware correction' : 'fails honestly after an invalid correction'}`, async () => {
    const completion = new CompletionEngine(), prompts: string[] = [];
    const generate = spyOn(completion, 'generate').mockImplementation(async (prompt, model) => {
      prompts.push(prompt);
      return { model, ok: true, text: prompts.length === 2 && correctionValid ? '{"features":[],"stories":[],"questions":[]}' : '{"features":[{"action":"invent","title":"Invalid"}]}' };
    });
    const asker = new Asker({ completion, providers: { ollama: { id: 'ollama', available: true, local: true } }, defaultModel: 'ollama/fixture' });
    try {
      const operation = proposeEpicStructure(store, { title: 'Infrastructure' }, { asker, model: 'ollama/fixture' });
      if (correctionValid) expect(await operation).toMatchObject({ features: [], stories: [], questions: [] });
      else await expect(operation).rejects.toThrow(/Semantic decomposition failed.*schema validation/i);
      expect(prompts.length).toBe(2);
      expect(prompts[1]).toContain('Previous response failed validation:');
      expect(prompts[1]).toContain('features');
      expect(prompts[1]).toContain('action');
      expect(await store.listEntities(Ticket.dcr)).toHaveLength(0);
    } finally { generate.mockRestore(); }
  });

  it('does not repair transport/provider failures', async () => {
    const completion = new CompletionEngine(); let calls = 0;
    const generate = spyOn(completion, 'generate').mockImplementation(async (_prompt, model) => {
      calls++; return { model, ok: false, text: '', failure: { kind: 'invalid_response', message: 'Provider unavailable', retryable: false, fatal: true } };
    });
    try {
      const asker = new Asker({ completion, providers: { ollama: { id: 'ollama', available: true } } });
      await expect(proposeEpicStructure(store, { title: 'Infrastructure' }, { asker, model: 'ollama/fixture' })).rejects.toThrow('Provider unavailable');
      expect(calls).toBe(1);
    } finally { generate.mockRestore(); }
  });
});
