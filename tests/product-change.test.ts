import {productReviewFixture} from './product-review-fixture.ts';
import {reviewedApply} from './product-review.ts';
import { describe, it, expect, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import {previewProductChange, applyProductChange} from '../src/product/change-operations.ts';
import { getCoverage } from '../src/product/coverage.ts';
import { getProductImpact } from '../src/product/impact.ts';
import { TestNode, Decision, Feature, UserStory } from '../src/model/ontology.ts';
import type {ProductChangeRequest as ChangeRequest} from '../src/product/change-types.ts';
import { initializeTools, commandRegistry } from '../src/tools/index.ts';

const stops:Array<()=>void>=[];
const roots: string[] = [];
const stores: WorkflowStore[] = [];
afterEach(() => {
  for(const stop of stops.splice(0)) stop();
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-product-change-'));
  roots.push(root);
  const store = new WorkflowStore(root);
  stores.push(store);
  return {store};
}

describe('Product Intent Causal Change', () => {
  it('keeps exact Product previews and blocked fingerprints across Product owner and public entry points', async () => {
    const {store} = fixture();
    stops.push(await productReviewFixture(store));
    const valid: Extract<ChangeRequest, {action: 'product_change'}> = {action: 'product_change', mutations: [
      {kind: 'product_create', entityType: 'Epic', id: 'S2-E', fields: {title: 'Stage 2 product'}}
    ]};
    const direct = await previewProductChange(store, valid);
        initializeTools();
    const ctx = {store, projectRoot: store.root, executionAuthority: 'project-write' as const};
    const publicPreview = await commandRegistry.execute('preview_change', valid, ctx);
        expect(publicPreview).toEqual(direct);
    expect(direct.affectedFiles).toEqual([]);
    expect(direct.originalHashes).toEqual({});
    const invalid: Extract<ChangeRequest, {action: 'product_change'}> = {action: 'product_change', mutations: [
      {kind: 'product_update', entityType: 'Epic', id: 'MISSING-EPIC', fields: {title: 'Wrong'}}
    ]};
    const denied = await previewProductChange(store, invalid);
    expect(denied.blocked).toBe(true);
    expect(await previewProductChange(store, invalid)).toEqual(denied);
    expect(await commandRegistry.execute('preview_change', invalid, ctx)).toEqual(denied);
  });

  it('does not accept forged Product fingerprints or an unapproved public Product write', async () => {
    const {store} = fixture();
    stops.push(await productReviewFixture(store));
    initializeTools();
    const ctx = {store, projectRoot: store.root, executionAuthority: 'project-write' as const};
    const request: Extract<ChangeRequest, {action: 'product_change'}> = {action: 'product_change', mutations: [
      {kind: 'product_create', entityType: 'Epic', id: 'S2-DENIED', fields: {title: 'Unapproved epic'}}
    ]};
    const preview = await commandRegistry.execute('preview_change', request, ctx);
    expect(preview.blocked).toBe(false);
    await expect(commandRegistry.execute('apply_change', {request, fingerprint: preview.fingerprint}, ctx)).rejects.toThrow(/explicit developer approval/);
    await expect(reviewedApply(store, {request, fingerprint: 'forged', decision: 'accept'})).rejects.toThrow(/Stale change preview/);
    expect(await store.getEntity('S2-DENIED')).toBeNull();
    const rejected = await reviewedApply(store, {request, fingerprint: preview.fingerprint, decision: 'reject'});
    expect(rejected.ok).toBe(false);
    expect(await store.getEntity('S2-DENIED')).toBeNull();
  });

  it('previews a coherent create/link set without writing and verifies coverage and impact after apply', async () => {
    const {store} = fixture();
    stops.push(await productReviewFixture(store));
    const request: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'E1', fields: { title: 'Epic', status: 'planned' } },
      { kind: 'product_create', entityType: 'Feature', id: 'F1', fields: { title: 'Feature', body: 'Inspect related delivery work', status: 'accepted' } },
      { kind: 'product_create', entityType: 'UserStory', id: 'S1', fields: { title: 'Story', status: 'accepted',
        actor: 'Developer', intent: 'Inspect feature work', initialState: 'Feature and Ticket exist',
        action: 'Request product impact for the Feature', expectedResult: 'The linked Ticket is returned' } },
      { kind: 'product_create', entityType: 'Ticket', id: 'T1', fields: { title: 'Ticket', lane: 'Todo' } },
      { kind: 'product_link', sourceId: 'E1', predicate: 'targets', targetId: 'F1' },
      { kind: 'product_link', sourceId: 'F1', predicate: 'enables', targetId: 'S1' },
      { kind: 'product_link', sourceId: 'E1', predicate: 'contains', targetId: 'T1' },
      { kind: 'product_link', sourceId: 'T1', predicate: 'implements', targetId: 'F1' },
      { kind: 'product_link', sourceId: 'T1', predicate: 'addresses', targetId: 'S1' }
    ] };
    const preview = await previewProductChange(store, request);
    expect(preview.blocked).toBe(false);
    expect(await store.getEntity('E1')).toBeNull();
    const result = await applyProductChange(store, request, preview.fingerprint);
    expect(result.verification.passed).toBe(true);
    expect((await getCoverage(store, 'E1')).related.features).toEqual(['F1']);
    expect((await getProductImpact(store, 'F1')).tickets).toContain('T1');
    const updates: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'Epic', id: 'E1', fields: { title: 'Epic revised' } },
      { kind: 'product_update', entityType: 'Feature', id: 'F1', fields: { title: 'Feature revised' } },
      { kind: 'product_update', entityType: 'UserStory', id: 'S1', fields: { title: 'Story revised' } },
      { kind: 'product_update', entityType: 'Ticket', id: 'T1', fields: { title: 'Ticket revised' } }
    ] };
    const revised = await previewProductChange(store, updates);
    expect(revised.blocked).toBe(false);
    expect((await applyProductChange(store, updates, revised.fingerprint)).verification.passed).toBe(true);
    for (const [id, title] of [['E1', 'Epic revised'], ['F1', 'Feature revised'], ['S1', 'Story revised'], ['T1', 'Ticket revised']]) {
      expect((await store.getEntity(id) as any).title).toBe(title);
    }
  });

  it('rejects an invalid later mutation before any write', async () => {
    const {store} = fixture();
    const request: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'E1', fields: { title: 'Epic' } },
      { kind: 'product_create', entityType: 'Feature', id: 'F1', fields: { title: 'Feature' } },
      { kind: 'product_link', sourceId: 'F1', predicate: 'targets', targetId: 'E1' }
    ] };
    const preview = await previewProductChange(store, request);
    expect(preview.blocked).toBe(true);
    expect(await store.getEntity('E1')).toBeNull();
    expect((await applyProductChange(store, request, preview.fingerprint)).ok).toBe(false);
    expect(await store.getEntity('E1')).toBeNull();
  });

  it('rejects stale fingerprints and requires explicit unlink before deletion', async () => {
    const {store} = fixture();
    const create: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'E1', fields: { title: 'Epic' } },
      { kind: 'product_create', entityType: 'Feature', id: 'F1', fields: { title: 'Feature' } },
      { kind: 'product_link', sourceId: 'E1', predicate: 'targets', targetId: 'F1' }
    ] };
    const first = await previewProductChange(store, create);
    await applyProductChange(store, create, first.fingerprint);
    const update: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'Feature', id: 'F1', fields: { title: 'Revised' } }
    ] };
    const stale = await previewProductChange(store, update);
    const feature = await store.getEntity('F1');
    await feature!.update({ title: 'External' }, true, false);
    expect(applyProductChange(store, update, stale.fingerprint)).rejects.toThrow(/Stale change preview/);
    const blocked = await previewProductChange(store, { action: 'product_change', mutations: [
      { kind: 'product_delete', entityType: 'Feature', id: 'F1' }
    ] });
    expect(blocked.blocked).toBe(true);
    expect(blocked.blockReason).toContain('E1');
    expect(blocked.dependents).toEqual([{ sourceId: 'E1', predicate: 'targets', targetId: 'F1' }]);
    const deleteRequest: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_unlink', sourceId: 'E1', predicate: 'targets', targetId: 'F1' },
      { kind: 'product_delete', entityType: 'Feature', id: 'F1' }
    ] };
    const deletion = await previewProductChange(store, deleteRequest);
    expect(deletion.blocked).toBe(false);
    expect(deletion.dependents?.length).toBe(1);
    expect((await applyProductChange(store, deleteRequest, deletion.fingerprint)).ok).toBe(true);
    expect(await store.getEntity('F1')).toBeNull();
  });

  it('links and unlinks every canonical relation and rejects invalid lifecycle fields', async () => {
    const {store} = fixture();
    for (const [entityType, id] of [['Epic', 'E'], ['Feature', 'F'], ['UserStory', 'S'], ['Ticket', 'T']] as const) {
      const request: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_create', entityType, id, fields: { title: id } }
      ] };
      const preview = await previewProductChange(store, request);
      expect(preview.blocked).toBe(false);
      await applyProductChange(store, request, preview.fingerprint);
    }
    await store.upsertEntity(TestNode.dcr, { id: 'TEST', title: 'Test', targetPath: 'a.test.ts' });
    await store.sp.createEntity(Decision.dcr, { id:store.formatId(Decision.dcr,"ADR"),_id:store.formatId(Decision.dcr,"ADR"), title: 'Decision', decision: 'Use graph' },true,false);
    const relations = [
      ['E', 'targets', 'F'], ['E', 'targets', 'S'], ['F', 'enables', 'S'], ['E', 'contains', 'T'],
      ['T', 'implements', 'F'], ['T', 'addresses', 'S'], ['TEST', 'verifies', 'F'],
      ['TEST', 'verifies', 'S'], ['ADR', 'governs', 'E'], ['ADR', 'governs', 'F'], ['ADR', 'governs', 'S']
    ];
    for (const [sourceId, predicate, targetId] of relations) {
      const link: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_link', sourceId, predicate, targetId }
      ] };
      const preview = await previewProductChange(store, link);
      if (predicate === 'verifies') { expect(preview.blocked).toBe(true); continue; }
      expect(preview.blocked).toBe(false);
      expect((await applyProductChange(store, link, preview.fingerprint)).verification.passed).toBe(true);
    }
    for (const [sourceId, predicate, targetId] of relations) {
      const unlink: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_unlink', sourceId, predicate, targetId }
      ] };
      const preview = await previewProductChange(store, unlink);
      if (predicate === 'verifies') { expect(preview.blocked).toBe(true); continue; }
      expect(preview.blocked).toBe(false);
      expect((await applyProductChange(store, unlink, preview.fingerprint)).verification.passed).toBe(true);
    }
    for (const [entityType, id, status] of [['Epic', 'E', 'cancelled'], ['Feature', 'F', 'deprecated'], ['UserStory', 'S', 'deprecated']] as const) {
      const update: ChangeRequest = { action: 'product_change', mutations: [
        { kind: 'product_update', entityType, id, fields: { status } }
      ] };
      const preview = await previewProductChange(store, update);
      expect(preview.blocked).toBe(false);
      await applyProductChange(store, update, preview.fingerprint);
      expect((await store.getEntity(id) as any).status).toBe(status);
    }
    const invalid = await previewProductChange(store, { action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'Feature', id: 'F', fields: { status: 'active' } }
    ] });
    expect(invalid.blocked).toBe(true);
  });

  it('rejects new legacy containment through preview while allowing explicit removal of existing state', async () => {
    const {store} = fixture();
    const feature = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Existing capability' });
    const story = await store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Existing episode' });
    await store.relate(feature, 'contains', story);
    const author: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_link', sourceId: 'F', predicate: 'contains', targetId: 'S' }
    ] };
    const blocked = await previewProductChange(store, author);
    expect(blocked.blocked).toBe(true);
    expect(blocked.blockReason).toContain('not allowed');
    expect((await applyProductChange(store, author, blocked.fingerprint)).ok).toBe(false);
    expect(await store.getOutgoing(feature.id, 'contains')).toHaveLength(1);
    const remove: ChangeRequest = { action: 'product_change', mutations: [
      { kind: 'product_unlink', sourceId: 'F', predicate: 'contains', targetId: 'S' }
    ] };
    const preview = await previewProductChange(store, remove);
    expect(preview.blocked).toBe(false);
    expect((await applyProductChange(store, remove, preview.fingerprint)).verification.passed).toBe(true);
    expect(await store.getOutgoing(feature.id, 'contains')).toEqual([]);
  });

  it('accepts the Product Intent request through public preview_change and apply_change tools', async () => {
    const { store } = fixture();
    initializeTools();
    const ctx = { store, projectRoot: store.root, executionAuthority: 'project-write' as const };
    const request = { action: 'product_change', mutations: [
      { kind: 'product_create', entityType: 'Epic', id: 'PUBLIC-E', fields: { title: 'Public Epic' } }
    ] };
    const preview = await commandRegistry.execute('preview_change', request, ctx);
    expect(preview.blocked).toBe(false);
    const result = await reviewedApply(ctx.store, { request, fingerprint: preview.fingerprint, decision: 'accept' });
    expect(result.verification.passed).toBe(true);
    expect(await store.getEntity('PUBLIC-E')).not.toBeNull();
  });
});
