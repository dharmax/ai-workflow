import {describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LayaSystemOne, type SystemOne, type SystemOneAnswer} from '@dharmax/llm-utils';
import {CausalChangeEngine} from '../src/change/engine.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {validateProductMutations, assessCharterAlignment, type ProductMutation} from '../src/product/mutation.ts';
import {screenCharter, clearlyAlignedToCharter} from '../src/product/charter-screen.ts';

const charter = {
  purpose: 'Assist software developers.\n\nSupport correct engineering.',
  actors: ['Developer', 'Verifier'],
  scope: 'Engineering tools:\n- Inspect code\n- Diagnose faults',
  nonGoals: ['Generate general-purpose poetry', 'Make consequential decisions without developer approval'],
  bounds: '1. Respect source authority.\n2. Preserve existing work.',
};
const target = {id: 'F', kind: 'Feature',
  fields: {title: 'Diagnostics', body: 'Help developers diagnose compiler errors'}};

function score(probability: number): SystemOneAnswer {
  const probabilities = {'0': 1 - probability, '1': 0, '2': 0, '3': 0, '4': probability};
  return {type: 'score', score: probability * 4, probabilities};
}

function model(
  answer: (key: string, state: unknown) => SystemOneAnswer = () => score(0.98),
  tokenCount = 180,
  seen: Array<{key: string; state: unknown}> = [],
): SystemOne {
  return {assess: async (state, questions) => {
    const key = Object.keys(questions)[0]!;
    seen.push({key, state});
    return {backendId: 'fixture', quality: 'high', latencyMs: 0,
      usage: {input_tokens: tokenCount}, answers: {[key]: answer(key, state)}};
  }};
}

describe('Product charter System-1 clause screening', () => {
  it('preserves every clause under canonical IDs, without synthesizing new model IDs', async () => {
    const seen: Array<{key: string; state: unknown}> = [];
    const result = await screenCharter(charter, [target], model(undefined, 140, seen));
    expect(result.complete).toBe(true);
    expect(Object.keys(result.judgments)).toEqual(['F']);
    expect(Object.keys(result.judgments.F!)).toEqual([
      'purpose.0', 'purpose.1', 'actors.0', 'actors.1',
      'scope.0', 'scope.1', 'nonGoals.0', 'nonGoals.1',
      'bounds.0', 'bounds.1', 'definition',
    ]);
    expect(seen.map(x => x.key)).toEqual(Object.keys(result.judgments.F!));
    expect(result.judgments.F!['scope.0']?.backend).toBe('fixture');
    expect(seen.find(x => x.key === 'scope.0')?.state).toMatchObject({
      product: {scope: expect.stringContaining('Inspect code')},
    });
  });

  it('keeps wrapped bullet clauses intact rather than treating fragments as independent rules', async () => {
    const wrapped = {...charter, scope: 'Engineering tools:\n- Inspect code\n  without changing source\n- Diagnose faults'};
    const seen: string[] = [];
    const reviewer: SystemOne = {assess: async (state, questions) => {
      const key = Object.keys(questions)[0]!;
      if (key.startsWith('scope.')) {
        seen.push((state as {product: {scope: string}}).product.scope);
      }
      return {backendId: 'fixture', quality: 'high', latencyMs: 0,
        usage: {input_tokens: 130}, answers: {[key]: score(0.98)}};
    }};
    expect((await screenCharter(wrapped, [target], reviewer)).complete).toBe(true);
    expect(seen).toEqual([
      'Engineering tools: - Inspect code without changing source',
      'Engineering tools: - Diagnose faults',
    ]);
  });

  it('requires at least one matching actor and scope option, not every option', async () => {
    const answers = model((key) =>
      key === 'actors.1' || key === 'scope.1' ? score(0.02) : score(0.98));
    expect(await clearlyAlignedToCharter(charter, [target], answers)).toBe(true);
    const noScope = model((key) => key.startsWith('scope.') ? score(0.02) : score(0.98));
    expect(await clearlyAlignedToCharter(charter, [target], noScope)).toBe(false);
    const noActor = model((key) => key.startsWith('actors.') ? score(0.02) : score(0.98));
    expect(await clearlyAlignedToCharter(charter, [target], noActor)).toBe(false);
  });

  it('enforces every non-goal and bound; does not average away a breach', async () => {
    for (const id of ['nonGoals.0', 'nonGoals.1', 'bounds.0', 'bounds.1', 'purpose.1', 'definition']) {
      expect(await clearlyAlignedToCharter(charter, [target],
        model(key => key === id ? score(0.02) : score(0.98)))).toBe(false);
    }
  });

  it('routes only oversized Laya clauses to Jev and preserves backend provenance', async () => {
    const calls = {local: [] as string[], remote: [] as string[]};
    const local: SystemOne = {assess: async (_state, questions) => {
      const key = Object.keys(questions)[0]!;
      calls.local.push(key);
      return {backendId: 'laya', quality: 'low', latencyMs: 0,
        usage: {input_tokens: key === 'bounds.1' ? 512 : 140},
        answers: {[key]: score(0.98)}};
    }};
    const remote: SystemOne = {assess: async (_state, questions) => {
      const key = Object.keys(questions)[0]!;
      calls.remote.push(key);
      return {backendId: 'jev', quality: 'high', latencyMs: 0,
        usage: {input_tokens: 1200}, answers: {[key]: score(0.98)}};
    }};
    const result = await screenCharter(charter, [target], local, remote);
    expect(result.complete).toBe(true);
    expect(calls.remote).toEqual(['bounds.1']);
    expect(calls.local).toHaveLength(11);
    expect(result.judgments.F!['bounds.1']?.backend).toBe('jev');
    expect(result.judgments.F!['bounds.0']?.backend).toBe('laya');
  });

  it('does not use Jev to overrule a genuine adverse Laya assessment', async () => {
    let remoteCalls = 0;
    const remote: SystemOne = {assess: async () => {
      remoteCalls++;
      return {backendId: 'jev', quality: 'high', latencyMs: 0,
        answers: {}};}};
    const result = await screenCharter(charter, [target], model((key) =>
      key === 'nonGoals.1' ? score(0.02) : score(0.98)), remote);
    expect(result.complete).toBe(true);
    expect(remoteCalls).toBe(0);
    expect(await clearlyAlignedToCharter(charter, [target], model((key) =>
      key === 'nonGoals.1' ? score(0.02) : score(0.98)), remote)).toBe(false);
  });

  it('falls back to Jev on unavailable local inference; fails closed if both fail', async () => {
    const unavailable: SystemOne = {assess: async () => null};
    const success = await screenCharter(charter, [target], unavailable, model());
    expect(success.complete).toBe(true);
    const failure = await screenCharter(charter, [target], unavailable, unavailable);
    expect(failure.complete).toBe(false);
  });

  it('rejects invalid scores, invented answer keys, and partial results', async () => {
    const invalid: SystemOne = {assess: async (_state, questions) => {
      const key = Object.keys(questions)[0]!;
      return {backendId: 'fixture', quality: 'high', latencyMs: 0,
        usage: {input_tokens: 110}, answers: {[key]: {type: 'score', score: 4}, extra: score(0.98)}};
    }};
    expect((await screenCharter(charter, [target], invalid, invalid)).complete).toBe(false);
    expect((await screenCharter(charter, [target])).complete).toBe(false);
    expect((await screenCharter(charter, [])).complete).toBe(false);
    const duplicate = await screenCharter(charter, [target, target], model());
    expect(duplicate.complete).toBe(false);
  });

  it('keeps hostile artifact IDs safe and excludes untrusted lifecycle fields', async () => {
    const special = await screenCharter(charter,
      [{...target, id: '__proto__', fields: {...target.fields, kind: 'Spoofed', status: 'accepted'}}],
      model((_key, state) => {
        expect((state as {proposed: Record<string, unknown>}).proposed.kind).toBe('Feature');
        expect((state as {proposed: Record<string, unknown>}).proposed.status).toBeUndefined();
        return score(0.98);
      }));
    expect(special.complete).toBe(true);
    expect(Object.keys(special.judgments)).toEqual(['__proto__']);
  });

  it('can use an injected System-1 at the Product boundary without writing a graph', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-charter-screen-'));
    const store = new WorkflowStore(root);
    try {
      const mutations: ProductMutation[] = [
        {kind: 'product_create', entityType: 'Product', id: 'PRODUCT',
          fields: {title: 'Engineering assistant', ...charter, status: 'accepted'}},
        {kind: 'product_create', entityType: 'Feature', id: 'F',
          fields: {title: 'Diagnostics', body: 'Help developers diagnose compiler errors', status: 'accepted'}},
      ];
      const validated = await validateProductMutations(store, mutations);
      await assessCharterAlignment(store, mutations, validated,
        {action: 'product_change', mutations}, model());
      expect(await store.getEntity('F')).toBeNull();
    } finally {
      store.close();
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('automatically uses local System-1 in ordinary preview and approved commit', async () => {
    // Exercise the public engine without an explicit System-1 argument or a cloud Critic.
    const originalAssess = LayaSystemOne.prototype.assess;
    let calls = 0;
    LayaSystemOne.prototype.assess = async (_state, questions) => {
      const key = Object.keys(questions)[0]!;
      calls++;
      return {backendId: 'laya', quality: 'high', latencyMs: 0,
        usage: {input_tokens: 160}, answers: {[key]: score(0.98)}};
    };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-charter-production-'));
    const store = new WorkflowStore(root);
    try {
      const mutations: ProductMutation[] = [
        {kind: 'product_create', entityType: 'Product', id: 'PRODUCT',
          fields: {title: 'Engineering assistant', ...charter, status: 'accepted'}},
        {kind: 'product_create', entityType: 'Feature', id: 'F',
          fields: {title: 'Diagnostics', body: 'Help developers diagnose compiler errors', status: 'accepted'}},
      ];
      const request = {action: 'product_change' as const, mutations};
      const engine = new CausalChangeEngine({store, projectRoot: root});
      const preview = await engine.previewChange(request);
      expect(preview.blocked).toBe(false);
      expect(calls).toBeGreaterThan(0);
      expect(await store.getEntity('F')).toBeNull();
      const previewCalls = calls;
      const result = await store.withExecutionContext('project-write', undefined,
        () => engine.applyChange(request, preview.fingerprint), preview.fingerprint);
      expect(result.ok).toBe(true);
      expect(calls).toBeGreaterThan(previewCalls);
      expect(await store.getEntity('F')).not.toBeNull();
    } finally {
      LayaSystemOne.prototype.assess = originalAssess;
      store.close();
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

});
