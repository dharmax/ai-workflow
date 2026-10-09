import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { getAIWFSkillManager, resetAIWFSkillManager } from '../src/kb/manager.ts';

describe('SkillManager Bridge & Dynamic Skills Integration', () => {
  let tmpDir: string;
  let store: WorkflowStore;

  beforeEach(async () => {
    resetAIWFSkillManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-sm-bridge-test-'));
    store = new WorkflowStore(tmpDir, true);
    initializeTools();
  });

  afterEach(() => {
    resetAIWFSkillManager();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes SkillManager and retrieves web-ui-design skill from sibling checkout', async () => {
    const sm = getAIWFSkillManager({ projectRoot: tmpDir });
    await sm.sync();
    const skills = await sm.retrieve('Riot.js modern web ui design');
    expect(skills.length).toBeGreaterThan(0);
    const uiSkill = skills.find(s => s.id === 'web-ui-design');
    expect(uiSkill).toBeDefined();
    expect(uiSkill?.name).toBe('Web UI Design & Building');
    expect(uiSkill?.tools.map(t => t.name)).toContain('createMainFrame');
    expect(uiSkill?.tools.map(t => t.name)).toContain('createMenuManager');
  });

  it('exposes find_skills in tool registry with dynamic discovery', async () => {
    const result = await registry.execute('find_skills', { query: 'web and frontend' }, { store, projectRoot: tmpDir });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const match = result.find((s: any) => s.id === 'web-ui-design');
    expect(match).toBeDefined();
    expect(match.tools).toContain('generateTheme');
  });

  it('retrieves detailed skill metadata through get_knowledge_item', async () => {
    const result = await registry.execute('get_knowledge_item', { id: 'web-ui-design' }, { store, projectRoot: tmpDir });
    expect(result.id).toBe('web-ui-design');
    expect(result.type).toBe('skill');
    expect(result.verified).toBe(true);
    expect(result.tools.length).toBe(5);
  });
});
