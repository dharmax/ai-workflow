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

  it('generates lossless collision-free entity IDs for complex rule and module IDs', () => {
    const id1 = RuleStore.entityIdForScope('rule:a.b-c', { kind: 'universal' });
    const id2 = RuleStore.entityIdForScope('rule:a.b-c', { kind: 'project' });
    const id3 = RuleStore.entityIdForScope('rule:a.b-c', { kind: 'module', moduleId: 'src/core/auth.service.ts' });
    const id4 = RuleStore.entityIdForScope('rule:a.b-c', { kind: 'module', moduleId: 'src/core/auth-service.ts' });

    expect(id1).toBe('rule:a.b-c__universal');
    expect(id2).toBe('rule:a.b-c__project');
    expect(id3).not.toBe(id4); // Different module paths produce distinct IDs without lossy hyphen substitution
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
      scope: { kind: 'project' },
      importance: 8,
      rule: 'Project-specific doctrine statement.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 2,
      provenance: 'project-override'
    });

    res = await ruleStore.resolveRule(ruleId);
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

    res = await ruleStore.resolveRule(ruleId, { moduleId: 'src/core' });
    expect(res).not.toBeNull();
    expect(res?.effective.importance).toBe(10);
    expect(res?.effective.rule).toBe('Module-specific doctrine statement.');
    expect(res?.isOverridden).toBe(true);
    expect(res?.inheritedFrom).toBe('project');
    expect(res?.layers.length).toBe(3);

    // Querying without module context resolves back to project override
    res = await ruleStore.resolveRule(ruleId);
    expect(res?.effective.importance).toBe(8);
  });

  it('guarantees that draft rules cannot shadow active inherited rules, but disabled rules explicitly suppress', async () => {
    const ruleId = 'engineering.draft-shadow-test';

    // Active universal rule
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Active Universal Rule',
      type: 'coding',
      scope: { kind: 'universal' },
      importance: 7,
      rule: 'Active universal statement.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'bundled-default'
    });

    // Proposed module rule in draft state
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Draft Module Proposal',
      type: 'coding',
      scope: { kind: 'module', moduleId: 'src/experimental' },
      importance: 10,
      rule: 'Unapproved draft proposal.',
      status: 'draft',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 2,
      provenance: 'draft'
    });

    // The active universal rule must NOT be shadowed by the draft module proposal!
    let res = await ruleStore.resolveRule(ruleId, { moduleId: 'src/experimental' });
    expect(res).not.toBeNull();
    expect(res?.effective.status).toBe('active');
    expect(res?.effective.title).toBe('Active Universal Rule');
    expect(res?.effective.rule).toBe('Active universal statement.');

    // Now test explicit suppression: disable the module rule
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Disabled Module Rule',
      type: 'coding',
      scope: { kind: 'module', moduleId: 'src/experimental' },
      importance: 10,
      rule: 'Disabled statement.',
      status: 'disabled',
      disableReason: 'Not applicable to experimental prototypes',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 3,
      provenance: 'user-disabled'
    });

    // Disabled rule explicitly suppresses inherited rule
    res = await ruleStore.resolveRule(ruleId, { moduleId: 'src/experimental' });
    expect(res).not.toBeNull();
    expect(res?.isDisabled).toBe(true);
    expect(res?.effective.status).toBe('disabled');
    expect(res?.effective.disableReason).toBe('Not applicable to experimental prototypes');
  });

  it('detects incomplete and outdated default installations, and installs defaults cleanly', async () => {
    // Fresh store should detect incomplete defaults
    const initialCheck = await ruleStore.checkDefaultsInstalled();
    expect(initialCheck.complete).toBe(false);
    expect(initialCheck.missingRuleIds.length).toBeGreaterThan(0);
    expect(initialCheck.installedCount).toBe(0);

    // Partial installation test: install only one rule
    const firstRule = initialCheck.missingRuleIds[0];
    await ruleStore.saveRule({
      id: firstRule,
      ruleId: firstRule,
      title: 'Partial Default',
      type: 'architecture',
      scope: { kind: 'universal' },
      importance: 10,
      rule: 'Partial rule test.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'bundled-default'
    });

    const partialCheck = await ruleStore.checkDefaultsInstalled();
    expect(partialCheck.complete).toBe(false);
    expect(partialCheck.installedCount).toBe(1);
    expect(partialCheck.missingRuleIds).not.toContain(firstRule);

    // Complete install defaults
    const installRes = await ruleStore.installDefaults();
    expect(installRes.installed).toBeGreaterThan(0);
    expect(installRes.skipped).toBe(1); // The one already installed

    // Verify complete installation
    const postCheck = await ruleStore.checkDefaultsInstalled();
    expect(postCheck.complete).toBe(true);
    expect(postCheck.upToDate).toBe(true);
    expect(postCheck.missingRuleIds.length).toBe(0);
    expect(postCheck.installedCount).toBe(postCheck.expectedCount);

    // Re-installing defaults is idempotent
    const reinstallRes = await ruleStore.installDefaults();
    expect(reinstallRes.installed).toBe(0);
    expect(reinstallRes.upgraded).toBe(0);
    expect(reinstallRes.skipped).toBe(postCheck.expectedCount);
  });

  it('preserves existing project overrides when defaults are installed or upgraded', async () => {
    // Create a local project override first
    const ruleId = 'engineering.abstraction-placement';
    await ruleStore.saveRule({
      id: ruleId,
      ruleId,
      title: 'Local Project Customization',
      type: 'architecture',
      scope: { kind: 'project' },
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
    const resolved = await ruleStore.resolveRule(ruleId);
    expect(resolved).not.toBeNull();
    expect(resolved?.effective.title).toBe('Local Project Customization');
    expect(resolved?.effective.scope.kind).toBe('project');
    expect(resolved?.isOverridden).toBe(true);
  });

  it('survives an actual database restart and persists all rule layers intact', async () => {
    // Save universal and module rule
    await ruleStore.saveRule({
      id: 'restart.rule',
      ruleId: 'restart.rule',
      title: 'Universal Rule Before Restart',
      type: 'coding',
      scope: { kind: 'universal' },
      importance: 6,
      rule: 'Universal code.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'pre-restart'
    });

    await ruleStore.saveRule({
      id: 'restart.rule',
      ruleId: 'restart.rule',
      title: 'Module Rule Before Restart',
      type: 'coding',
      scope: { kind: 'module', moduleId: 'src/subsystem' },
      importance: 9,
      rule: 'Subsystem code.',
      status: 'active',
      examples: [],
      references: [],
      test: { kind: 'llm' },
      revision: 1,
      provenance: 'pre-restart'
    });

    // Close database connection
    store.close();

    // Reopen database connection in the same temp directory
    const reopenedStore = new WorkflowStore(tempDir);
    await reopenedStore.sp.ready();
    const reopenedRuleStore = new RuleStore(reopenedStore);

    const universal = await reopenedRuleStore.getRule('restart.rule', { kind: 'universal' });
    expect(universal).not.toBeNull();
    expect(universal?.title).toBe('Universal Rule Before Restart');

    const moduleRule = await reopenedRuleStore.getRule('restart.rule', { kind: 'module', moduleId: 'src/subsystem' });
    expect(moduleRule).not.toBeNull();
    expect(moduleRule?.title).toBe('Module Rule Before Restart');

    const resolved = await reopenedRuleStore.resolveRule('restart.rule', { moduleId: 'src/subsystem' });
    expect(resolved?.effective.importance).toBe(9);
    expect(resolved?.isOverridden).toBe(true);

    reopenedStore.close();
  });

  it('performs single-read in resolveAllRules and filters rules by language', async () => {
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
