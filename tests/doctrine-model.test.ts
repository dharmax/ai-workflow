import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { Rule } from '../src/graph/ontology.ts';
import { RuleStore } from '../src/rules/store.ts';
import { RuleSchema, type RuleModel } from '../src/rules/types.ts';

describe('Doctrine Gate 1: Native Rule Model & Scoped Overrides', () => {
  let tempDir: string;
  let store: WorkflowStore;
  let ruleStore: RuleStore;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-doctrine-test-'));
    store = new WorkflowStore(tempDir);
    await store.sp.ready();
    ruleStore = new RuleStore(store);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('validates rule schemas strictly and rejects invalid importance or types', () => {
    const valid = {
      id: 'test.rule',
      ruleId: 'test.rule',
      title: 'Test Rule',
      type: 'coding',
      scope: { kind: 'universal' },
      importance: 8,
      rule: 'Write simple code.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'test'
    };
    expect(() => RuleStore.validateRule(valid)).not.toThrow();

    // Invalid importance (> 10)
    expect(() => RuleStore.validateRule({ ...valid, importance: 11 })).toThrow();
    // Invalid importance (< 1)
    expect(() => RuleStore.validateRule({ ...valid, importance: 0 })).toThrow();
    // Invalid type
    expect(() => RuleStore.validateRule({ ...valid, type: 'nonexistent-type' })).toThrow();
  });

  it('persists and retrieves individual Rule entities in Semantika WorkflowStore', async () => {
    const model: RuleModel = {
      id: 'engineering.test-persist',
      ruleId: 'engineering.test-persist',
      title: 'Test Persistence',
      type: 'architecture',
      scope: { kind: 'universal' },
      importance: 9,
      rule: 'Keep architecture decoupled and bounded.',
      status: 'active',
      examples: [
        {
          kind: 'positive',
          description: 'Isolate database access to storage adapters',
          lesson: 'Prevents database driver leaks'
        }
      ],
      references: [],
      test: { kind: 'llm', instruction: 'Check decoupling.' },
      revision: 1,
      provenance: 'unit-test'
    };

    const saved = await ruleStore.saveRule(model);
    expect(saved).toBeDefined();
    expect(saved.id).toContain('engineering.test-persist');

    const retrieved = await ruleStore.getRule('engineering.test-persist', { kind: 'universal' });
    expect(retrieved).not.toBeNull();
    expect(retrieved?.ruleId).toBe('engineering.test-persist');
    expect(retrieved?.importance).toBe(9);
    expect(retrieved?.examples.length).toBe(1);
    expect(retrieved?.examples[0].kind).toBe('positive');
  });

  it('resolves scoped overrides in precedence order (module > project > universal)', async () => {
    const ruleId = 'engineering.scope-test';

    // 1. Universal layer
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Universal Rule',
      type: 'coding',
      scope: { kind: 'universal' },
      importance: 5,
      rule: 'Universal doctrine statement.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'bundled-default'
    });

    let res = await ruleStore.resolveRule(ruleId);
    expect(res).not.toBeNull();
    expect(res?.effective.importance).toBe(5);
    expect(res?.isOverridden).toBe(false);

    // 2. Project layer override
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Project Override',
      type: 'coding',
      scope: { kind: 'project', projectId: 'my-project' },
      importance: 8,
      rule: 'Project-specific doctrine statement.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 2,
      provenance: 'project-override'
    });

    res = await ruleStore.resolveRule(ruleId, { projectId: 'my-project' });
    expect(res).not.toBeNull();
    expect(res?.effective.importance).toBe(8);
    expect(res?.effective.rule).toBe('Project-specific doctrine statement.');
    expect(res?.isOverridden).toBe(true);
    expect(res?.inheritedFrom).toBe('universal');
    expect(res?.layers.length).toBe(2);

    // 3. Module layer override
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Module Override',
      type: 'coding',
      scope: { kind: 'module', moduleId: 'src/core' },
      importance: 10,
      rule: 'Module-specific doctrine statement.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 3,
      provenance: 'module-override'
    });

    res = await ruleStore.resolveRule(ruleId, { projectId: 'my-project', moduleId: 'src/core' });
    expect(res).not.toBeNull();
    expect(res?.effective.importance).toBe(10);
    expect(res?.effective.rule).toBe('Module-specific doctrine statement.');
    expect(res?.isOverridden).toBe(true);
    expect(res?.inheritedFrom).toBe('project');
    expect(res?.layers.length).toBe(3);

    // Querying without module context resolves back to project override
    res = await ruleStore.resolveRule(ruleId, { projectId: 'my-project' });
    expect(res?.effective.importance).toBe(8);
  });

  it('detects incomplete default installation and installs defaults cleanly', async () => {
    // Fresh store should detect incomplete defaults
    const initialCheck = await ruleStore.checkDefaultsInstalled();
    expect(initialCheck.complete).toBe(false);
    expect(initialCheck.missingRuleIds.length).toBeGreaterThan(0);
    expect(initialCheck.installedCount).toBe(0);

    // Install defaults
    const installRes = await ruleStore.installDefaults();
    expect(installRes.installed).toBeGreaterThan(0);
    expect(installRes.skipped).toBe(0);

    // Verify complete installation
    const postCheck = await ruleStore.checkDefaultsInstalled();
    expect(postCheck.complete).toBe(true);
    expect(postCheck.missingRuleIds.length).toBe(0);
    expect(postCheck.installedCount).toBe(postCheck.expectedCount);

    // Re-installing defaults is idempotent and skips existing universal rules
    const reinstallRes = await ruleStore.installDefaults();
    expect(reinstallRes.installed).toBe(0);
    expect(reinstallRes.skipped).toBe(postCheck.expectedCount);
  });

  it('preserves existing project overrides when defaults are installed or updated', async () => {
    // Create a local project override first
    const ruleId = 'engineering.abstraction-placement';
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Local Project Customization',
      type: 'architecture',
      scope: { kind: 'project', projectId: 'local-test' },
      importance: 10,
      rule: 'Strict local project rules.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'local-user'
    });

    // Install bundled defaults
    await ruleStore.installDefaults();

    // Verify project override is completely intact
    const resolved = await ruleStore.resolveRule(ruleId, { projectId: 'local-test' });
    expect(resolved).not.toBeNull();
    expect(resolved?.effective.title).toBe('Local Project Customization');
    expect(resolved?.effective.scope.kind).toBe('project');
    expect(resolved?.isOverridden).toBe(true);
  });

  it('filters rules by language when language filter is applied', async () => {
    await ruleStore.saveRule({
      id: 'rule.ts-only',
      ruleId: 'rule.ts-only',
      title: 'TS Only',
      type: 'coding',
      scope: { kind: 'universal' },
      importance: 8,
      rule: 'Use TypeScript strict mode.',
      status: 'active',
      languages: ['typescript'],
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'test'
    });

    await ruleStore.saveRule({
      id: 'rule.python-only',
      ruleId: 'rule.python-only',
      title: 'Python Only',
      type: 'coding',
      scope: { kind: 'universal' },
      importance: 8,
      rule: 'Use Python typing.',
      status: 'active',
      languages: ['python'],
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'test'
    });

    const tsRules = await ruleStore.resolveAllRules({ language: 'typescript' });
    expect(tsRules.some(r => r.ruleId === 'rule.ts-only')).toBe(true);
    expect(tsRules.some(r => r.ruleId === 'rule.python-only')).toBe(false);

    const pyRules = await ruleStore.resolveAllRules({ language: 'python' });
    expect(pyRules.some(r => r.ruleId === 'rule.python-only')).toBe(true);
    expect(pyRules.some(r => r.ruleId === 'rule.ts-only')).toBe(false);
  });
});
