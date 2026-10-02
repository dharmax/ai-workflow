import { describe, it, expect, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { getCoverage } from '../src/product/coverage.ts';
import { getProductImpact } from '../src/product/impact.ts';
import { TestNode, Decision } from '../src/graph/ontology.ts';
import type { ChangeRequest } from '../src/change/types.ts';
import { initializeTools, registry } from '../src/tools/index.ts';

const roots: string[] = [];
const stores: WorkflowStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-product-change-'));
  roots.push(root);
  const store = new WorkflowStore(root);
  stores.push(store);
  return { store, engine: new CausalChangeEngine({ store, projectRoot: root }) };
}

describe('Product Intent Causal Change', () => {
  it('previews a coherent create/link set without writing and verifies coverage and impact after apply', async () => {
    const { store, engine } = fixture();
    const request: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'E1', fields: { title: 'Epic', status: 'planned' } },
      { kind: 'product_create', entityType: 'Feature', id: 'F1', fields: { title: 'Feature', status: 'accepted' } },
      { kind: 'product_create', entityType: 'UserStory', id: 'S1', fields: { title: 'Story', status: 'accepted' } },
      { kind: 'product_create', entityType: 'Ticket', id: 'T1', fields: { title: 'Ticket', lane: 'Todo' } },
      { kind: 'product_link', sourceId: 'E1', predicate: 'targets', targetId: 'F1' },
      { kind: 'product_link', sourceId: 'F1', predicate: 'contains', targetId: 'S1' },
      { kind: 'product_link', sourceId: 'E1', predicate: 'contains', targetId: 'T1' },
      { kind: 'product_link', sourceId: 'T1', predicate: 'implements', targetId: 'F1' },
      { kind: 'product_link', sourceId: 'T1', predicate: 'addresses', targetId: 'S1' }
    ] };
    const preview = await engine.previewChange(request);
    expect(preview.blocked).toBe(false);
    expect(await store.getEntity('E1')).toBeNull();
    const result = await engine.applyChange(request, preview.fingerprint);
    expect(result.verification.passed).toBe(true);
    expect((await getCoverage(store, 'E1')).related.features).toEqual(['F1']);
    expect((await getProductImpact(store, 'F1')).tickets).toContain('T1');
    const updates: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'Epic', id: 'E1', fields: { title: 'Epic revised' } },
      { kind: 'product_update', entityType: 'Feature', id: 'F1', fields: { title: 'Feature revised' } },
      { kind: 'product_update', entityType: 'UserStory', id: 'S1', fields: { title: 'Story revised' } },
      { kind: 'product_update', entityType: 'Ticket', id: 'T1', fields: { title: 'Ticket revised' } }
    ] };
    const revised = await engine.previewChange(updates);
    expect(revised.blocked).toBe(false);
    expect((await engine.applyChange(updates, revised.fingerprint)).verification.passed).toBe(true);
    for (const [id, title] of [['E1', 'Epic revised'], ['F1', 'Feature revised'], ['S1', 'Story revised'], ['T1', 'Ticket revised']]) {
      expect((await store.getEntity(id) as any).title).toBe(title);
    }
  });

  it('rejects an invalid later mutation before any write', async () => {
    const { store, engine } = fixture();
    const request: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'E1', fields: { title: 'Epic' } },
      { kind: 'product_create', entityType: 'Feature', id: 'F1', fields: { title: 'Feature' } },
      { kind: 'product_link', sourceId: 'F1', predicate: 'targets', targetId: 'E1' }
    ] };
    const preview = await engine.previewChange(request);
    expect(preview.blocked).toBe(true);
    expect(await store.getEntity('E1')).toBeNull();
    expect((await engine.applyChange(request, preview.fingerprint)).ok).toBe(false);
    expect(await store.getEntity('E1')).toBeNull();
  });

  it('rejects stale fingerprints and requires explicit unlink before deletion', async () => {
    const { store, engine } = fixture();
    const create: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'E1', fields: { title: 'Epic' } },
      { kind: 'product_create', entityType: 'Feature', id: 'F1', fields: { title: 'Feature' } },
      { kind: 'product_link', sourceId: 'E1', predicate: 'targets', targetId: 'F1' }
    ] };
    const first = await engine.previewChange(create);
    await engine.applyChange(create, first.fingerprint);
    const update: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'Feature', id: 'F1', fields: { title: 'Revised' } }
    ] };
    const stale = await engine.previewChange(update);
    const feature = await store.getEntity('F1');
    await feature!.update({ title: 'External' }, true, false);
    expect(engine.applyChange(update, stale.fingerprint)).rejects.toThrow(/Stale change preview/);
    const blocked = await engine.previewChange({ action: 'product_change', mutations: [
      { kind: 'product_delete', entityType: 'Feature', id: 'F1' }
    ] });
    expect(blocked.blocked).toBe(true);
    expect(blocked.blockReason).toContain('E1');
    expect(blocked.dependents).toEqual([{ sourceId: 'E1', predicate: 'targets', targetId: 'F1' }]);
    const deleteRequest: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_unlink', sourceId: 'E1', predicate: 'targets', targetId: 'F1' },
      { kind: 'product_delete', entityType: 'Feature', id: 'F1' }
    ] };
    const deletion = await engine.previewChange(deleteRequest);
    expect(deletion.blocked).toBe(false);
    expect(deletion.dependents?.length).toBe(1);
    expect((await engine.applyChange(deleteRequest, deletion.fingerprint)).ok).toBe(true);
    expect(await store.getEntity('F1')).toBeNull();
  });

  it('links and unlinks every canonical relation and rejects invalid lifecycle fields', async () => {
    const { store, engine } = fixture();
    for (const [entityType, id] of [['Epic', 'E'], ['Feature', 'F'], ['UserStory', 'S'], ['Ticket', 'T']] as const) {
      const request: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_create', entityType, id, fields: { title: id } }
      ] };
      const preview = await engine.previewChange(request);
      expect(preview.blocked).toBe(false);
      await engine.applyChange(request, preview.fingerprint);
    }
    await store.upsertEntity(TestNode.dcr, { id: 'TEST', title: 'Test', targetPath: 'a.test.ts' });
    await store.upsertEntity(Decision.dcr, { id: 'ADR', title: 'Decision', decision: 'Use graph' });
    const relations = [
      ['E', 'targets', 'F'], ['E', 'targets', 'S'], ['F', 'contains', 'S'], ['E', 'contains', 'T'],
      ['T', 'implements', 'F'], ['T', 'addresses', 'S'], ['TEST', 'verifies', 'F'],
      ['TEST', 'verifies', 'S'], ['ADR', 'governs', 'E'], ['ADR', 'governs', 'F'], ['ADR', 'governs', 'S']
    ];
    for (const [sourceId, predicate, targetId] of relations) {
      const link: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_link', sourceId, predicate, targetId }
      ] };
      const preview = await engine.previewChange(link);
      expect(preview.blocked).toBe(false);
      expect((await engine.applyChange(link, preview.fingerprint)).verification.passed).toBe(true);
    }
    for (const [sourceId, predicate, targetId] of relations) {
      const unlink: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_unlink', sourceId, predicate, targetId }
      ] };
      const preview = await engine.previewChange(unlink);
      expect(preview.blocked).toBe(false);
      expect((await engine.applyChange(unlink, preview.fingerprint)).verification.passed).toBe(true);
    }
    for (const [entityType, id, status] of [['Epic', 'E', 'cancelled'], ['Feature', 'F', 'deprecated'], ['UserStory', 'S', 'deprecated']] as const) {
      const update: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_update', entityType, id, fields: { status } }
      ] };
      const preview = await engine.previewChange(update);
      expect(preview.blocked).toBe(false);
      await engine.applyChange(update, preview.fingerprint);
      expect((await store.getEntity(id) as any).status).toBe(status);
    }
    const invalid = await engine.previewChange({ action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'Feature', id: 'F', fields: { status: 'active' } }
    ] });
    expect(invalid.blocked).toBe(true);
  });

  it('accepts the Product Intent request through public preview_change and apply_change tools', async () => {
    const { store } = fixture();
    initializeTools();
    const ctx = { store, projectRoot: store.root };
    const request = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'PUBLIC-E', fields: { title: 'Public Epic' } }
    ] };
    const preview = await registry.execute('preview_change', request, ctx);
    expect(preview.blocked).toBe(false);
    const result = await registry.execute('apply_change', { request, fingerprint: preview.fingerprint }, ctx);
    expect(result.verification.passed).toBe(true);
    expect(await store.getEntity('PUBLIC-E')).not.toBeNull();
  });
});
