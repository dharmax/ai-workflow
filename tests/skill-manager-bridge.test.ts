import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SkillManager } from '@dharmax/skill-manager';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { getAIWFSkillManager, resolveSkillSources } from '../src/kb/manager.ts';

function writeSkill(root: string, id = 'web-ui-design') {
  const dir = path.join(root, 'skills', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({
    id, name: id, description: 'Web frontend design',
    keys: { primary: ['web', 'frontend', 'design'], secondary: [] },
    tools: ['generateTheme', 'createMainFrame'].map(name => ({ name, description: name, inputSchema: { type: 'object' } }))
  }));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Web design\nUse the project theme.');
}

describe('SkillManager Bridge & Dynamic Skills Integration', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-sm-bridge-test-'));
    store = new WorkflowStore(tmpDir, true);
    writeSkill(tmpDir);
    initializeTools();
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retrieves project fixture skills without a sibling checkout', async () => {
    expect(resolveSkillSources(tmpDir)).toEqual([{ id: 'project-skills', path: tmpDir, writable: true }]);
    const sm = await getAIWFSkillManager({ projectRoot: tmpDir });
    const skills = await sm.retrieve('web frontend design');
    expect(skills.map(skill => skill.id)).toContain('web-ui-design');
    expect(skills[0].source.repo).toBe(tmpDir);
  });

  it('exposes find_skills through the production registry', async () => {
    const result = await registry.execute('find_skills', { query: 'web frontend design' }, { store, projectRoot: tmpDir });
    expect(result.find((s: { id: string }) => s.id === 'web-ui-design').tools).toContain('generateTheme');
  });

  it('activates project skill metadata through get_knowledge_item', async () => {
    const result = await registry.execute('get_knowledge_item', { id: 'web-ui-design' }, { store, projectRoot: tmpDir });
    expect(result.id).toBe('web-ui-design');
    expect(result.type).toBe('skill');
    expect(result.verified).toBe(true);
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual(['generateTheme', 'createMainFrame']);
    expect(result.content).toContain('Use the project theme.');
  });

  it('isolates managers and source contents for two project roots', async () => {
    const secondRoot = path.join(tmpDir, 'second-project');
    writeSkill(secondRoot, 'second-skill');
    const first = await getAIWFSkillManager({ projectRoot: tmpDir });
    const second = await getAIWFSkillManager({ projectRoot: secondRoot });
    expect(first).not.toBe(second);
    expect((await first.list()).map(skill => skill.id)).toEqual(['web-ui-design']);
    expect((await second.list()).map(skill => skill.id)).toEqual(['second-skill']);
  });

  it('allows an absent optional project skills directory', async () => {
    const emptyRoot = path.join(tmpDir, 'empty-project');
    fs.mkdirSync(emptyRoot);
    expect(resolveSkillSources(emptyRoot)).toEqual([]);
    expect(await (await getAIWFSkillManager({ projectRoot: emptyRoot })).list()).toEqual([]);
  });

  it('surfaces malformed skill sync reports through every skill lookup tool', async () => {
    fs.writeFileSync(path.join(tmpDir, 'skills/web-ui-design/skill.json'), '{broken');
    for (const [name, params] of [
      ['find_skills', { query: 'web' }],
      ['search_knowledgebase', { type: 'skill' }],
      ['get_knowledge_item', { id: 'web-ui-design' }]
    ] as const) {
      await expect(registry.execute(name, params, { store, projectRoot: tmpDir })).rejects.toThrow('SkillManager sync failed');
    }
  });

  it('surfaces thrown sync, retrieval, and activation failures', async () => {
    for (const [method, name, params] of [
      ['sync', 'find_skills', { query: 'web' }],
      ['retrieve', 'search_knowledgebase', { query: 'web', type: 'skill' }],
      ['activate', 'get_knowledge_item', { id: 'web-ui-design' }]
    ] as const) {
      const failure = spyOn(SkillManager.prototype, method).mockRejectedValue(new Error('skill runtime failed'));
      try {
        await expect(registry.execute(name, params, { store, projectRoot: tmpDir })).rejects.toThrow('skill runtime failed');
      } finally { failure.mockRestore(); }
    }
  });
});
