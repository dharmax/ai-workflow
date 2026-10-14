import {afterEach, beforeEach, expect, test} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {RuleStore} from '../src/rules/store.ts';
import type {RuleModel} from '../src/rules/types.ts';
let root: string, store: WorkflowStore, rules: RuleStore;
const rule = (ruleId: string, scope: RuleModel['scope'] = {kind: 'universal'}): RuleModel => ({
  id: ruleId, ruleId, scope, type: 'coding', importance: 8, rule: 'Keep one owner.',
  status: 'active', revision: 1, provenance: 'test', examples: [], references: [], test: {kind: 'llm'}
});
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-rule-batch-'));
  store = new WorkflowStore(root); await store.sp.ready(); rules = new RuleStore(store);
});
afterEach(() => {store.close(); fs.rmSync(root, {recursive: true, force: true});});
test('Rule batches retain lossless layered identities, survive restart and return fresh instances', async () => {
  const original = await rules.saveRule(rule('a_b'));
  const rows = await rules.saveBatch([
    {rule: {...rule('a_b'), rule: 'Changed principle.', revision: 2}, expectedVersion: original.version},
    {rule: rule('a-b'), expectedVersion: null},
    {rule: rule('a_b', {kind: 'project'}), expectedVersion: null}
  ]);
  expect(rows).toHaveLength(3);
  expect(rows[0]).not.toBe(original);
  expect(original.rule).toBe('Keep one owner.');
  expect(rows[0].rule).toBe('Changed principle.');
  expect(new Set(rows.map(row => row.id)).size).toBe(3);
  store.close(); store = new WorkflowStore(root); rules = new RuleStore(store);
  expect((await rules.getRule('a_b', {kind: 'universal'}))!.revision).toBe(2);
  expect((await rules.getRule('a_b', {kind: 'project'}))!.revision).toBe(1);
});
test('prevalidation rejects the whole pack before persistence', async () => {
  await expect(rules.saveBatch([
    {rule: rule('valid'), expectedVersion: null},
    {rule: {...rule('invalid'), importance: 11}, expectedVersion: null}
  ])).rejects.toThrow();
  expect(await rules.listAllRules()).toEqual([]);
});
test('actual SQLite failure leaves no partial Rule entity, version or index state', async () => {
  const original = await rules.saveRule(rule('original'));
  store.db.exec("CREATE TRIGGER fail_rule BEFORE INSERT ON aiwf_Rule BEGIN SELECT RAISE(ABORT, 'injected batch failure'); END");
  await expect(rules.saveBatch([
    {rule: {...rule('original'), rule: 'Must roll back.', revision: 2}, expectedVersion: original.version},
    {rule: rule('fail'), expectedVersion: null}
  ])).rejects.toThrow('injected batch failure');
  expect((await rules.getRule('original', {kind: 'universal'}))!.rule).toBe('Keep one owner.');
  expect(await rules.getRule('fail', {kind: 'universal'})).toBeNull();
  expect(await store.listEntities('Rule', {rule: 'Must roll back.'})).toEqual([]);
});
test('a stale editor cannot overwrite a concurrent edit or persist earlier records', async () => {
  const original = await rules.saveRule(rule('original'));
  await rules.saveRule({...rule('original'), revision: 2, rule: 'Other editor.'});
  await expect(rules.saveBatch([
    {rule: rule('new'), expectedVersion: null},
    {rule: {...rule('original'), rule: 'Stale editor.'}, expectedVersion: original.version}
  ])).rejects.toThrow('Stale batch revision');
  expect(await rules.getRule('new', {kind: 'universal'})).toBeNull();
  expect((await rules.getRule('original', {kind: 'universal'}))!.rule).toBe('Other editor.');
});
