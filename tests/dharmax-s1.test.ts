import {productReviewFixture} from './product-review-fixture.ts';
import {createProduct,acceptProduct,updateProduct,reviewedApply} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { UserStory, FileNode, SymbolNode, Ticket, TestNode, Artifact, Decision } from '../src/model/ontology.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';
import { applyEpicStructure } from '../src/product/apply.ts';

describe('Dharmax S1 public Story definitions and Aspect applicability', () => {
  let root: string, store: WorkflowStore;
  let stopReviewer: (()=>void) | undefined;
  const call = (name: string, params: Record<string, unknown>) => registry.execute(name, params, { store, projectRoot: root, executionAuthority: 'project-write' });
  const scenario = {
    actor: 'signed-in user', intent: 'keep the previewed avatar',
    initialState: 'Preview is open with an unsaved filter and an existing saved avatar',
    action: 'Activate Save', expectedResult: 'Saved avatar displays the filtered image after reload',
    exceptions: 'Failed save preserves the previous avatar and reports failure', bounds: 'One signed-in account'
  };
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-dw-s1-'));
    store = new WorkflowStore(root); initializeTools();
    stopReviewer=await productReviewFixture(store);
  });
  afterEach(() => { stopReviewer?.(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('DW-02 creates, edits and reopens a complete accepted Story under the same identity', async () => {
    await createProduct(store, "Feature", { id: 'F', title: 'Avatar filters', priority: 1 });
    expect((await call('get_feature', { featureId: 'F' })).priority).toBe(1);
    const created = await createProduct(store, "UserStory", { id: 'S', title: 'Save filtered avatar', ...scenario, status: 'proposed' });
    expect(created).toMatchObject({ ...scenario, status: 'proposed', definitionReview: { status: 'complete', missingFields: [] } });
    await acceptProduct(store, [{kind:"product_link",sourceId: 'F',predicate: 'enables',targetId: 'S'}]);
    await updateProduct(store, "UserStory", { id: 'S', status: 'accepted' });
    await updateProduct(store, "UserStory", { id: 'S', action: 'Activate Save once' });
    store.close(); store = new WorkflowStore(root);
    const reopened = await call('get_user_story', { storyId: 'S' });
    expect(reopened).toMatchObject({ id: 'S', ...scenario, action: 'Activate Save once', status: 'accepted', enablingFeatures: ['F'] });
    expect((await call('list_user_stories', {})).length).toBe(1);
    await expect(updateProduct(store, "UserStory", { id: 'S', expectedResult: '  ' })).rejects.toThrow('expectedResult');
    expect((await call('get_user_story', { storyId: 'S' })).expectedResult).toBe(scenario.expectedResult);
  });

  it('DW-02 refuses title-only acceptance through public tools and guarded product changes', async () => {
    await expect(createProduct(store, "UserStory", { id: 'BAD', title: 'Save', status: 'accepted' })).rejects.toThrow('Story');
    expect(await store.getEntity('BAD')).toBeNull();
    await createProduct(store, "UserStory", { id: 'S', title: 'Save', status: 'proposed' });
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const preview = await engine.previewChange({ action: 'product_change', mutations: [
      { kind: 'product_update', entityType: 'UserStory', id: 'S', fields: { status: 'accepted' } }
    ] });
    expect(preview.blocked).toBe(true);
    expect((await call('get_user_story', { storyId: 'S' })).status).toBe('proposed');
  });

  it('DW-02 preserves ambiguous legacy content and historical acceptance without inventing a scenario', async () => {
    const old = { id: 'OLD', title: 'Save', actor: 'User', story: 'Save', context: 'Avatar editor', acceptanceCriteria: ['Keeps avatar'], sla: '1s', status: 'accepted' };
    await store.upsertEntity(UserStory.dcr, old); // Existing on-disk legacy fixture, not a new accepted public definition.
    const before = await store.getEntity<UserStory>('OLD', UserStory.dcr);
    store.close(); store = new WorkflowStore(root);
    const view = await call('get_user_story', { storyId: 'OLD' });
    expect(view).toMatchObject({ ...old, definitionReview: { status: 'needs_review', missingFields: ['intent', 'initialState', 'action', 'expectedResult'] } });
    expect(view.initialState).toBeUndefined();
    expect((await store.getEntity<UserStory>('OLD', UserStory.dcr))!.version).toBe(before!.version);
    await updateProduct(store, "UserStory", { id: 'OLD', title: 'Save avatar' });
    await expect(updateProduct(store, "UserStory", { id: 'OLD', story: 'Invented replacement' })).rejects.toThrow('Story');
    await updateProduct(store, "UserStory", { id: 'OLD', ...scenario });
    expect((await call('get_user_story', { storyId: 'OLD' })).definitionReview.status).toBe('complete');
    expect((await call('get_user_story', { storyId: 'OLD' })).story).toBe('Save');
  });

  it('DW-02 keeps generated Stories proposed and reuses reviewed definitions without rewriting them', async () => {
    await createProduct(store, "UserStory", { id: 'REVIEWED', title: 'Save avatar', ...scenario, status: 'accepted' });
    const before = await call('get_user_story', { storyId: 'REVIEWED' });
    const pending = await applyEpicStructure(store, {
      epic: { id: 'E', action: 'create', title: 'Avatar delivery', status: 'planned' },
      features: [],
      stories: [
        { id: 'NEW', action: 'create', title: 'Suggested reset', story: 'Reset avatar', acceptanceCriteria: [] },
        { id: 'REVIEWED', action: 'reuse', title: 'AI replacement title', story: 'Discard avatar', acceptanceCriteria: [] }
      ],
      questions: []
    });
    expect(await store.getEntity('NEW')).toBeNull();
    await reviewedApply(store, {request: pending.preview.request, fingerprint: pending.preview.fingerprint, decision: 'accept'});
    expect((await call('get_user_story', { storyId: 'NEW' })).status).toBe('proposed');
    expect((await call('get_user_story', { storyId: 'NEW' })).definitionReview.status).toBe('needs_review');
    const after = await call('get_user_story', { storyId: 'REVIEWED' });
    expect(after).toMatchObject({ ...scenario, title: before.title, status: 'accepted', version: before.version });
    await createProduct(store, "Feature", { id: 'COLLISION', title: 'Existing capability' });
    await expect(applyEpicStructure(store, {
      epic: { id: 'E2', action: 'create', title: 'Another delivery', status: 'planned' },
      features: [], stories: [{ id: 'COLLISION', action: 'create', title: 'Wrong kind', acceptanceCriteria: [] }], questions: []
    })).rejects.toThrow('UserStory');
    expect(await store.getEntity('E2')).toBeNull();
  });

  it('DW-05 resolves one authoritative definition over direct engineering tags and defined inherited paths', async () => {
    await createProduct(store, "Feature", { id: 'F', title: 'Avatar filters' });
    await createProduct(store, "UserStory", { id: 'S', title: 'Save', ...scenario });
    await acceptProduct(store, [{kind:"product_link",sourceId: 'F',predicate: 'enables',targetId: 'S'}]);
    const targets = [
      await store.upsertEntity(FileNode.dcr, { id: 'FILE', title: 'avatar.ts', path: 'src/avatar.ts' }),
      await store.upsertEntity(SymbolNode.dcr, { id: 'SYM', title: 'save', filePath: 'src/avatar.ts', kind: 'function' }),
      await store.upsertEntity(Ticket.dcr, { id: 'T', title: 'Implement Save', lane: 'Todo' }),
      await store.upsertEntity(TestNode.dcr, { id: 'TEST', title: 'Save through API' }),
      await store.upsertEntity(Artifact.dcr, { id: 'REPORT', title: 'Save results' })
    ];
    await createProduct(store, "Aspect", { id: 'P', title: 'Persistency', status: 'accepted', body: 'Save survives reload', acceptanceCriteria: ['Read after restart returns saved avatar'] });
    for (const scopeId of ['F', ...targets.map(t => store.localId(t.id))])
      await acceptProduct(store, [{kind:"product_link",predicate:'applies_to',sourceId: 'P',targetId:scopeId}]);
    await acceptProduct(store, [{kind:"product_link",sourceId: 'T',predicate: 'addresses',targetId: 'S'}]);
    for (const entityId of ['S', ...targets.map(t => store.localId(t.id))]) {
      const resolved = await call('get_applicable_aspects', { entityId });
      expect(resolved.length).toBe(1); expect(resolved[0].id).toBe('P');
    }
    expect((await call('get_aspect', { id: 'P' })).scopes).toEqual(['F', 'FILE', 'REPORT', 'SYM', 'T', 'TEST']);
    const previousVersion = (await call('get_aspect', { id: 'P' })).version;
    const revised = await updateProduct(store, "Aspect", { id: 'P', body: 'Save survives a new session' });
    expect(revised.version).toBeGreaterThan(previousVersion);
    store.close(); store = new WorkflowStore(root);
    expect((await call('get_applicable_aspects', { entityId: 'S' }))[0].body).toBe('Save survives a new session');
    expect((await call('list_aspects', {})).length).toBe(1);
    await acceptProduct(store, [{kind:"product_unlink",predicate:'applies_to',sourceId: 'P',targetId: 'TEST'}]);
    expect(await call('get_applicable_aspects', { entityId: 'TEST' })).toEqual([]);
    await createProduct(store, "Aspect", { id: 'CODE', title: 'Safe avatar writes', status: 'accepted' });
    await acceptProduct(store, [{kind:"product_link",predicate:'applies_to',sourceId: 'CODE',targetId: 'FILE'}]);
    await acceptProduct(store, [{kind:"product_link",sourceId: 'T',predicate: 'modifies',targetId: 'FILE'}]);
    expect((await call('get_applicable_aspects', { entityId: 'T' })).map((a: {id: string}) => a.id)).toEqual(['CODE', 'P']);
    expect((await call('get_applicable_aspects', { entityId: 'S' })).map((a: {id: string}) => a.id)).toEqual(['P']);
    expect((await call('get_applicable_aspects', { entityId: 'SYM' })).map((a: {id: string}) => a.id)).toEqual(['P']);
  });

  it('DW-05 rejects invalid scope links and keeps proposed conflicting policy ineffective', async () => {
    await createProduct(store, "Feature", { id: 'F', title: 'Avatar filters' });
    await store.sp.createEntity(Decision.dcr, { id:store.formatId(Decision.dcr,"D"),_id:store.formatId(Decision.dcr,"D"), title: 'Engineering instruction' },true,false);
    await createProduct(store, "Aspect", { id: 'P', title: 'Persistency', body: 'Save survives reload', status: 'accepted' });
    await createProduct(store, "Aspect", { id: 'OTHER', title: 'Proposed ephemeral storage', body: 'Discard on reload', status: 'proposed' });
    await acceptProduct(store, [{kind:"product_link",predicate:'applies_to',sourceId: 'P',targetId: 'F'}]);
    await acceptProduct(store, [{kind:"product_link",predicate:'applies_to',sourceId: 'OTHER',targetId: 'F'}]);
    expect((await call('get_applicable_aspects', { entityId: 'F' })).map((a: {id: string}) => a.id)).toEqual(['P']);
    await expect(call('link_aspect', { aspectId: 'P', scopeId: 'D' })).rejects.toThrow('scope');
    await expect(call('link_product', { sourceId: 'F', predicate: 'applies_to', targetId: 'P' })).rejects.toThrow('not allowed');
    expect((await call('get_aspect', { id: 'OTHER' })).status).toBe('proposed');
  });
});
