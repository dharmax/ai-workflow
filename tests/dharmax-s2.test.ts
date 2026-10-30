import {productReviewFixture} from './product-review-fixture.ts';
import {reviewedApply,createProduct,updateProduct} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkflowStore } from '../src/graph/store.ts';
import { Epic, Feature, UserStory, entityDescriptors } from '../src/model/ontology.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { applyEpicStructure } from '../src/product/apply.ts';
import type { ChangeRequest } from '../src/change/types.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

describe('Dharmax S2 reviewed canonical product edits', () => {
  let stopReviewer: (()=>void) | undefined;
  let root: string, store: WorkflowStore;
  const call = (name: string, params: Record<string, unknown>) => registry.execute(name, params, { store, projectRoot: root, executionAuthority: 'project-write' });
  const scenario = { actor: 'Signed-in user', intent: 'Keep my filtered avatar', initialState: 'Unsaved filtered preview and previous saved avatar exist', action: 'Activate Save', expectedResult: 'Saved avatar matches preview after reload', exceptions: 'Failure preserves previous avatar', bounds: 'Current account' };
  const snapshot = (admission = true) => {
    using tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    return Object.fromEntries((tables.all() as Array<{name:string}>).map(({name}) => {
      using rows = store.db.prepare('SELECT * FROM "' + name + '" ORDER BY rowid');
      return [name, (rows.all() as Record<string,unknown>[])
        .filter(row => {
          if (name === 'aiwf_Artifact' && row._id === 'aiwf_Artifact_INDEX-ADMISSION') {
            // Index coordination is operational, but every admission must be released.
            expect(JSON.parse(String(row.data))).toEqual({title: 'Project index admission', body: '[]', status: 'active'});
            return false;
          }
          return admission || !String(row._id).endsWith('GOVERNANCE-ADMISSION');
        })];
    }));
  };
  const reopen = async () => {
    store.close(); store = new WorkflowStore(root);
    for (const dcr of entityDescriptors) await store.listEntities(dcr);
  };
  const request = (): Extract<ChangeRequest, {action: 'product_change'}> => ({ action: 'product_change', mutations: [
    { kind: 'product_create', entityType: 'Feature', id: 'F', fields: { title: 'Avatar filters', body:'Preview and save filtered avatars', priority: 1, status: 'accepted' } },
    { kind: 'product_create', entityType: 'UserStory', id: 'S', fields: { title: 'Save avatar', ...scenario, status: 'accepted' } },
    { kind: 'product_link', sourceId: 'F', predicate: 'enables', targetId: 'S' }
  ] });
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-dw-s2-')); store = new WorkflowStore(root); initializeTools();
    stopReviewer=await productReviewFixture(store);
    for (const dcr of entityDescriptors) await store.listEntities(dcr);
    await store.sp.predicateCollection(store.sp.ontology.pdcr('addresses'));
    await store.upsertEntity(Epic.dcr, { id: 'E', title: 'Avatar delivery', body: 'Deliver reviewed avatar filters', status: 'active' });
  });
  afterEach(() => { stopReviewer?.(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('DW-01/02 previews, edits and explicitly accepts one coherent Feature and complete Story', async () => {
    const before = snapshot();
    const original = request();
    const preview = await call('preview_change', original);
    expect(preview.blocked).toBe(false); expect(snapshot()).toEqual(before);
    await expect(reviewedApply(store, { request: original, fingerprint: preview.fingerprint })).rejects.toThrow('approval');
    expect(snapshot()).toEqual(before);
    const edited = request(); edited.mutations[1] = { kind: 'product_create', entityType: 'UserStory', id: 'S', fields: { title: 'Save avatar', ...scenario, action: 'Activate Save once', status: 'accepted' } };
    const reviewed = await call('preview_change', edited);
    expect((await reviewedApply(store, { request: edited, fingerprint: reviewed.fingerprint, decision: 'accept' })).ok).toBe(true);
    await reopen();
    expect(await call('get_user_story', { storyId: 'S' })).toMatchObject({ ...scenario, action: 'Activate Save once', status: 'accepted', enablingFeatures: ['F'] });
    expect((await call('list_features', {})).length).toBe(1);
  });

  it('DW-01 uses the same reviewed operation from the real CLI and MCP registry', async () => {
    const cli = path.resolve(import.meta.dir, '../src/cli.ts');
    const invoke = async (...args: string[]) => {
      const proc = Bun.spawn(['bun', cli, 'product-change', ...args], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return {stdout, stderr, code};
    };
    fs.writeFileSync(path.join(root, 'request.json'), JSON.stringify(request()));
    const before = snapshot();
    const proposed = await invoke('preview', 'request.json');
    expect(proposed.code).toBe(0);
    const preview = JSON.parse(proposed.stdout);
    expect(snapshot()).toEqual(before);
    fs.writeFileSync(path.join(root, 'review.json'), JSON.stringify(preview));
    const cancelled = await invoke('cancel', 'review.json'); expect(cancelled.code).toBe(0);
    expect(snapshot()).toEqual(before);
    const accepted = await invoke('accept', 'review.json'); expect(accepted.code).toBe(0);
    expect((await call('get_user_story', {storyId: 'S'})).expectedResult).toBe(scenario.expectedResult);
    const stale = await invoke('accept', 'review.json'); expect(stale.code).not.toBe(0);
    const client = new Client({name: 's2-reviewer', version: '1'});
    try {
      await client.connect(new StdioClientTransport({command: 'bun', args: [path.resolve(import.meta.dir, '../src/mcp.ts')], cwd: root, stderr: 'pipe', env: {...process.env, AIWF_EXECUTION_AUTHORITY:'project-write'}}));
      const rpc = async (name: string, args: Record<string, unknown>) => {
        const response = await client.callTool({name, arguments: args});
        expect(response.isError).not.toBe(true);
        const block = (response.content as Array<{type: string; text?: string}>).find(item => item.type === 'text');
        return JSON.parse(block!.text!);
      };
      const update = {action: 'product_change', mutations: [{kind: 'product_update', entityType: 'Feature', id: 'F', fields: {body: 'Reviewed through MCP'}}]};
      const reviewed = await rpc('preview_change', update);
      const current = snapshot();
      expect((await rpc('apply_change', {request: update, fingerprint: reviewed.fingerprint, decision: 'reject'})).ok).toBe(false);
      expect(snapshot()).toEqual(current);
      expect((await rpc('apply_change', {request: update, fingerprint: reviewed.fingerprint, decision: 'accept'})).status).toBe('review_required');
      expect(snapshot()).toEqual(current);
      await reviewedApply(store,{request:update,fingerprint:reviewed.fingerprint,decision:'accept'});
      expect((await call('get_feature', {featureId: 'F'})).body).toBe('Reviewed through MCP');
    } finally { await client.close(); }
  });

  it('DW-02 rejects and cancels proposals without any DB or projection change, including after reopen', async () => {
    const before = snapshot();
    const proposal = request(), preview = await call('preview_change', proposal);
    for (const decision of ['reject', 'cancel']) {
      const result = await reviewedApply(store, { request: proposal, fingerprint: preview.fingerprint, decision });
      expect(result.ok).toBe(false); expect(snapshot()).toEqual(before);
      expect(fs.existsSync(path.join(root, 'features.md'))).toBe(false);
      await reopen(); expect(snapshot()).toEqual(before);
    }
  });

  it('DW-06 rejects stale concurrent reviews and preserves same-identity in-place revisions', async () => {
    await createProduct(store, "Feature", { id: 'F', title: 'Avatar filters' });
    const update: ChangeRequest = { action: 'product_change', mutations: [{ kind: 'product_update', entityType: 'Feature', id: 'F', fields: { title: 'Reviewed filter scope' } }] };
    const first = await call('preview_change', update), second = await call('preview_change', update);
    await reviewedApply(store, { request: update, fingerprint: first.fingerprint, decision: 'accept' });
    const after = snapshot();
    await expect(reviewedApply(store, { request: update, fingerprint: second.fingerprint, decision: 'accept' })).rejects.toThrow('fingerprint');
    await reopen(); expect(snapshot()).toEqual(after);
    expect((await call('list_features', {})).map((f: {id:string}) => f.id)).toEqual(['F']);
  });

  it('DW-09 refuses malformed relations, ambiguous identity spellings and dangling deletion before writes', async () => {
    const before = snapshot();
    const malformed: ChangeRequest = {action: 'product_change', mutations: [
      {kind: 'product_create', entityType: 'Feature', id: 'BAD', fields: {title: 'Bad relation'}},
      {kind: 'product_link', sourceId: 'BAD', predicate: 'contains', targetId: 'E'}
    ]};
    expect((await call('preview_change', malformed)).blocked).toBe(true);
    const aliases: ChangeRequest = {action: 'product_change', mutations: [
      {kind: 'product_create', entityType: 'Feature', id: 'F_A', fields: {title: 'First identity'}},
      {kind: 'product_create', entityType: 'Feature', id: 'F-A', fields: {title: 'Colliding spelling'}}
    ]};
    expect((await call('preview_change', aliases)).blocked).toBe(true);
    expect(snapshot()).toEqual(before);
    const create = request(), preview = await call('preview_change', create);
    await reviewedApply(store, {request: create, fingerprint: preview.fingerprint, decision: 'accept'});
    const current = snapshot();
    expect((await call('preview_change', {action: 'product_change', mutations: [{kind: 'product_delete', entityType: 'Feature', id: 'F'}]})).blocked).toBe(true);
    expect(snapshot()).toEqual(current);
  });

  it('DW-09 rolls back actual midway SQLite failure across entities and edges', async () => {
    const proposal = request(), preview = await call('preview_change', proposal);
    const before = snapshot(false);
    for (const target of ['aiwf_UserStory', 'aiwf__Predicates']) {
      store.db.exec("CREATE TRIGGER s2_fail BEFORE INSERT ON " + target + " BEGIN SELECT RAISE(ABORT, 'injected product write failure'); END");
      await expect(reviewedApply(store, { request: proposal, fingerprint: preview.fingerprint, decision: 'accept' })).rejects.toThrow('injected product write failure');
      await reopen(); expect(snapshot(false)).toEqual(before);
      expect(await store.getEntity('F')).toBeNull(); expect(await store.getEntity('S')).toBeNull();
      store.db.exec('DROP TRIGGER s2_fail');
    }
  });

  it('DW-02 complete S1 Story content reaches inert processing without legacy narrative prerequisites', async () => {
    await createProduct(store, "UserStory", {id: 'S', title: 'Save avatar', ...scenario, status: 'accepted'});
    const story = (await store.getEntity<UserStory>('S', UserStory.dcr))!;
    const before = snapshot(); let called = false;
    const result = await story.process(store, {critic: 'none', systemOne: {assess: async () => null}, propose: async context => {
      called = true;
      for (const value of Object.values(scenario)) expect(context.body).toContain(value);
      return {items: [], aspectIds: [], gaps: [], required: [], rationale: 'No additional changes'};
    }});
    expect(result.status).toBe('complete'); expect(called).toBe(true); expect(snapshot()).toEqual(before);
  });

  it('DW-09 exclusive product review excludes concurrent native product applicability links', async () => {
    await createProduct(store, "UserStory", {id: 'S', title: 'Save avatar', ...scenario});
    await call('create_ticket', {id: 'T', title: 'Implement Save', lane: 'Todo', priority: 2});
    const token = await store.admitGovernance('governance');
    try {
      await expect(store.relate('T', 'addresses', 'S')).rejects.toThrow('Governance admission conflict');
      expect(await store.getIncoming('S', 'addresses')).toEqual([]);
    } finally { await store.releaseGovernance(token); }
  });

  it('DW-09 rechecks revisions after admission rather than trusting the earlier preview check', async () => {
    await createProduct(store, "Feature", {id: 'F', title: 'Before'});
    const proposal: ChangeRequest = {action: 'product_change', mutations: [
      {kind: 'product_update', entityType: 'Feature', id: 'F', fields: {title: 'Stale writer'}},
      {kind: 'product_create', entityType: 'Feature', id: 'EXTRA', fields: {title: 'Must not survive'}}
    ]};
    const preview = await call('preview_change', proposal);
    const admit = store.admitGovernance.bind(store); let raced = false;
    const interleave = spyOn(store, 'admitGovernance').mockImplementation(async (mode, duration) => {
      if (!raced) {
        raced = true;
        const concurrent = new WorkflowStore(root);
        try { await updateProduct(concurrent,'Feature',{id:'F',title:'Concurrent writer'}); }
        finally { concurrent.close(); }
      }
      return admit(mode, duration);
    });
    try { await expect(reviewedApply(store, {request: proposal, fingerprint: preview.fingerprint, decision: 'accept'})).rejects.toThrow('fingerprint'); }
    finally { interleave.mockRestore(); }
    await reopen();
    expect((await call('get_feature', {featureId: 'F'})).title).toBe('Concurrent writer');
    expect(await store.getEntity('EXTRA')).toBeNull();
  });

  it('DW-02 critic-approved process proposals are inert; rejected critic leaves all canonical rows and files unchanged', async () => {
    const e = (await store.getEntity<Epic>('E', Epic.dcr))!;
    const before = snapshot();
    const propose = async () => ({ items: [{ id: 'F', kind: 'Feature' as const, title: 'Avatar filters', body: 'Filter preview', acceptanceCriteria: [] }], aspectIds: [], gaps: [], required: [], rationale: 'Requested functionality' });
    const result = await e.process(store, { critic: { id: 'independent', review: async () => ({ verdict: 'accept' }) }, systemOne: { assess: async () => null }, propose });
    expect(result.status).toBe('complete');
    expect(snapshot()).toEqual(before); expect(fs.existsSync(path.join(root, 'epics.md'))).toBe(false);
    if (result.status === 'complete') {
      expect(result.value.created).toEqual([]);
      expect(result.value.proposals.length).toBe(1);
      const request = result.value.proposals[0].request;
      expect(request.action).toBe('product_change');
      if (request.action === 'product_change') expect(request.basis).toContainEqual({ id: 'E', entityType: 'Epic', version: e.version });
    }
    const rejected = await e.process(store, { critic: { id: 'independent', review: async () => ({ verdict: 'reject', findings: [{message:'Unnecessary duplicate'}] }) }, systemOne: { assess: async () => null }, propose });
    expect(rejected.status).toBe('blocked'); expect(snapshot()).toEqual(before);
    await reopen(); expect(snapshot()).toEqual(before);
    const stale = (await store.getEntity<Epic>('E', Epic.dcr))!;
    const changed = await stale.process(store, {critic: 'none', systemOne: {assess: async () => null}, propose: async () => {
      await store.upsertEntity(Epic.dcr, {id: 'E', body: 'Developer changed the request while reasoning'});
      return propose();
    }});
    expect(changed.status).toBe('blocked'); expect(await store.getEntity('F')).toBeNull();
    expect(fs.existsSync(path.join(root, 'epics.md'))).toBe(false);
  });

  it('DW-09 refuses cancellation, read-only authority and stale proposal sources before any write', async () => {
    const proposal = request(), preview = await call('preview_change', proposal), before = snapshot();
    await expect(registry.execute('apply_change', {request: proposal, fingerprint: preview.fingerprint, decision: 'accept'}, {store, projectRoot: root, executionAuthority: 'read-only'})).rejects.toThrow('read-only');
    const controller = new AbortController(); controller.abort();
    await expect(registry.execute('apply_change', {request: proposal, fingerprint: preview.fingerprint, decision: 'accept'}, {store, projectRoot: root, signal: controller.signal})).rejects.toThrow();
    expect(snapshot()).toEqual(before);
    const pending = await call('propose_epic_structure', {title: 'Avatar delivery', existingEpicId: 'E', injectedSemanticOutput: {features: [], stories: [], questions: []}});
    expect(pending.basis).toContainEqual({id: 'E', entityType: 'Epic', version: (await store.getEntity('E'))!.version});
    await store.upsertEntity(Epic.dcr, {id: 'E', body: 'Concurrent developer correction'});
    const changed = snapshot();
    await expect(call('apply_epic_structure', {proposal: pending})).rejects.toThrow('revision');
    expect(snapshot()).toEqual(changed);
    await createProduct(store, "Feature", {id: 'EXISTING', title: 'Repeated label'});
    const ambiguous = await call('propose_epic_structure', {title: 'Reuse', injectedSemanticOutput: {features: [{action: 'reuse', title: 'Repeated label'}], stories: [], questions: []}});
    expect(ambiguous.questions.some((q: {blocking: boolean}) => q.blocking)).toBe(true);
    await expect(call('apply_epic_structure', {proposal: ambiguous})).rejects.toThrow('blocking');
  });

  it('DW-02 decomposition is inert and reviewed application never overwrites reused Feature or Story', async () => {
    await createProduct(store, "Feature", { id: 'F', title: 'Reviewed filters', body: 'Developer scope', status: 'accepted' });
    await createProduct(store, "UserStory", { id: 'S', title: 'Save avatar', ...scenario, status: 'accepted' });
    const before = snapshot();
    const proposal = { epic: { id: 'DELIVERY', action: 'create' as const, title: 'Avatar delivery', status: 'planned' as const }, features: [{ id: 'F', action: 'reuse' as const, title: 'AI replacement', body: 'Conflicting replacement' }], stories: [{ id: 'S', action: 'reuse' as const, title: 'Discard avatar', acceptanceCriteria: [] }], questions: [] };
    const prepared = await applyEpicStructure(store, proposal);
    expect(prepared.applied).toBe(false); expect(snapshot()).toEqual(before);
    expect(prepared.preview).toBeDefined();
    await reviewedApply(store, { request: prepared.preview.request, fingerprint: prepared.preview.fingerprint, decision: 'accept' });
    expect((await call('get_feature', { featureId: 'F' })).body).toBe('Developer scope');
    expect(await call('get_user_story', { storyId: 'S' })).toMatchObject({ title: 'Save avatar', ...scenario, status: 'accepted' });
    await reopen(); expect((await call('get_epic', { epicId: 'DELIVERY' })).targetedFeatures).toContain('F');
  });
});
