import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Epic, Feature, UserStory, ModuleNode, Ticket } from '../src/graph/ontology.ts';
import { ArtifactBudget, resolveArtifactCritic, type ArtifactCritic } from '../src/artifact-policy.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { exportProjections, importProjections } from '../src/graph/projections.ts';

describe('artifact policy', () => {
  let root: string;
  let store: WorkflowStore;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-policy-')); store = new WorkflowStore(root); initializeTools(); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });

  it('resolves root overrides, explicit descendant targets, Story inheritance, clearing and restart persistence', async () => {
    const epic = await store.upsertEntity<Epic>(Epic.dcr, { id: 'E', title: 'Epic', completenessTarget: 'production' });
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature', completenessTarget: 'poc' });
    const other = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F2', title: 'Other', completenessTarget: 'advanced' });
    const s = await store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Story' });
    await store.relate(epic, 'targets', f);
    await store.relate(f, 'contains', s);
    await store.relate(other, 'contains', s);
    expect((await f.getCompletenessTarget(store)).effective).toBe('poc');
    expect((await s.getCompletenessTarget(store)).effective).toBe('advanced');
    expect((await f.getCompletenessTarget(store, { override: 'production' })).source).toBe('override');
    expect((await f.getCompletenessTarget(store, { descendant: true, inherited: 'production' })).effective).toBe('poc');
    expect((await s.getCompletenessTarget(store, { descendant: true, inherited: 'functional' })).source).toBe('operation');
    const ctx = { store, projectRoot: root };
    await registry.execute('set_completeness_target', { entityId: 'F', level: null }, ctx);
    expect((await registry.execute('get_completeness_target', { entityId: 'F' }, ctx)).effective).toBe('functional');
    store.close(); store = new WorkflowStore(root);
    const restored = await store.getEntity<Feature>('F', Feature.dcr);
    expect(restored!.completenessTarget).toBeNull();
    expect((await restored!.getCompletenessTarget(store)).source).toBe('project');
    expect((await (await store.getEntity<Epic>('E', Epic.dcr))!.getCompletenessTarget(store)).effective).toBe('production');
  });

  it('keeps Ticket scope targets distinct and rejects persistent Ticket completeness', async () => {
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Prototype', completenessTarget: 'poc' });
    const m = await store.upsertEntity<ModuleNode>(ModuleNode.dcr, { id: 'M', title: 'Module', path: 'src', completenessTarget: 'production' });
    const e = await store.upsertEntity<Epic>(Epic.dcr, { id: 'E', title: 'Epic', completenessTarget: 'advanced' });
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'T', title: 'Work', lane: 'Todo' });
    await registry.execute('link_product', { sourceId: 'T', predicate: 'targets', targetId: 'M' }, { store, projectRoot: root });
    await store.relate(t, 'implements', f); await store.relate(e, 'contains', t);
    const context = await t.getCompletenessContext(store, 'functional');
    expect(context.feature[0].target.effective).toBe('poc');
    expect(context.module[0].target.effective).toBe('production');
    expect(context.epic[0].target.effective).toBe('advanced');
    expect(context.runOverride).toBe('functional'); expect(context.criticStrength).toBe('production');
    await expect(registry.execute('set_completeness_target', { entityId: 'T', level: 'production' }, { store, projectRoot: root })).rejects.toThrow('Only Epic');
  });

  it('round trips target fields without changing relations or interpreting operational percentages as maturity', async () => {
    const e = await store.upsertEntity<Epic>(Epic.dcr, { id: 'E', title: 'Epic', completenessTarget: 'production' });
    const f = await store.upsertEntity<Feature>(Feature.dcr, { id: 'F', title: 'Feature', completenessTarget: 'advanced' });
    const s = await store.upsertEntity<UserStory>(UserStory.dcr, { id: 'S', title: 'Story', completenessTarget: 'poc' });
    await store.upsertEntity<ModuleNode>(ModuleNode.dcr, { id: 'M', title: 'Module', path: 'src', completionPercent: 100 });
    await store.relate(e, 'targets', f); await store.relate(f, 'contains', s);
    await exportProjections(store, root);
    expect(fs.readFileSync(path.join(root, 'modules.md'), 'utf8')).not.toContain('100%');
    for (const name of ['epics.md', 'features.md', 'user-stories.md']) {
      const file = path.join(root, name);
      fs.utimesSync(file, new Date(Date.now() + 1000), new Date(Date.now() + 1000));
    }
    await importProjections(store, root);
    expect((await store.getEntity<Epic>('E', Epic.dcr))!.completenessTarget).toBe('production');
    expect((await store.getEntity<Feature>('F', Feature.dcr))!.completenessTarget).toBe('advanced');
    expect((await store.getEntity<UserStory>('S', UserStory.dcr))!.completenessTarget).toBe('poc');
    expect((await store.getOutgoing(e.id, 'targets')).length).toBe(1);
  });

  it('counts depth as expansion edges and stops at breadth without claiming artifact completion', () => {
    const budget = new ArtifactBudget({ depth: 1, maxArtifacts: 2 }, 1, 24);
    expect(budget.visit('root', 0)).toBe(true);
    expect(budget.visit('child', 1)).toBe(true);
    expect(budget.visit('child', 1)).toBe(true);
    expect(budget.visit('grandchild', 2)).toBe(false);
    expect(budget.visit('sibling', 1)).toBe(false);
    expect(budget.stoppedAtDepth).toBe(true); expect(budget.stoppedAtMaxArtifacts).toBe(true);
    expect([...budget.remaining].sort()).toEqual(['grandchild', 'sibling']);
    const all = new ArtifactBudget({ depth: 'all' }, 0, 3);
    expect(all.visit('deep', 500)).toBe(true);
    const zero = new ArtifactBudget({ depth: 0 }, 1, 2);
    expect(zero.visit('root', 0)).toBe(true); expect(zero.visit('child', 1)).toBe(false);
    expect(() => new ArtifactBudget({ depth: -1 }, 1, 2)).toThrow();
    expect(() => new ArtifactBudget({ maxArtifacts: 0 }, 1, 2)).toThrow();
  });

  it('resolves injected and transport Critics without a registry or semantic writes', async () => {
    const critic: ArtifactCritic = { id: 'fixture', review: async () => ({ verdict: 'revise', findings: [{ message: 'Missing failure acceptance' }] }) };
    const resolver = async (id: string) => { expect(['fixture', 'auto']).toContain(id); return critic; };
    expect(await resolveArtifactCritic(critic, resolver)).toBe(critic);
    expect(await resolveArtifactCritic({ id: 'fixture' }, resolver)).toBe(critic);
    expect(await resolveArtifactCritic('auto', resolver)).toBe(critic);
    expect(await resolveArtifactCritic('none', resolver)).toBeNull();
    expect(await critic.review({ artifactId: 'F', intent: 'behavior', neighborhood: [], proposal: [], applicableAspects: [], candidateAspects: [], completeness: 'production', depth: 0, evidence: [] })).toEqual({ verdict: 'revise', findings: [{ message: 'Missing failure acceptance' }] });
  });
});
