import {afterEach, beforeEach, expect, it} from 'bun:test';
import {Database} from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SemanticPackage, SqliteStore} from '@dharmax/semantika';
import * as ontology from '../src/model/ontology.ts';
import {WorkflowEntity} from '../src/model/workflow-entity.ts';
import contracts from './fixtures/model-contract.json';

// Frozen before extraction using native model construction; not inferred from the refactored classes.
const names = contracts.map(contract => contract.descriptor.name);
const entityFile = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '.ts';
const aliases = {ProductEntity:'Product', ArtifactEntity:'Artifact', DecisionEntity:'Decision', EpicEntity:'Epic',
  FeatureEntity:'Feature', FileEntity:'FileNode', IdeaEntity:'Idea', LessonEntity:'Lesson', ModuleEntity:'ModuleNode',
  SymbolEntity:'SymbolNode', TestEntity:'TestNode', TicketEntity:'Ticket', UserStoryEntity:'UserStory'};
let root: string, db: Database, sp: SemanticPackage;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-model-runtime-'));
  db = new Database(path.join(root, 'model.db'));
  sp = new SemanticPackage('model', ontology.graphOntology, new SqliteStore(db));
});
afterEach(() => { db.close(); fs.rmSync(root, {recursive:true, force:true}); });

it('cold imports every entity before composition and retains public class and descriptor identity', () => {
  const modelRoot = path.resolve(import.meta.dir, '../src/model');
  for (const name of ['WorkflowEntity', ...names]) {
    const code = `import assert from 'node:assert/strict';
      const direct = await import(${JSON.stringify(modelRoot + '/')} + ${JSON.stringify(entityFile(name))});
      const Class = direct[${JSON.stringify(name)}];
      assert.equal(typeof Class, 'function');
      const ontology = await import(${JSON.stringify(modelRoot + '/ontology.ts')});
      const api = await import(${JSON.stringify(path.resolve(modelRoot, '../index.ts'))});
      assert.equal(Class, ontology[${JSON.stringify(name)}]);
      assert.equal(Class, api[${JSON.stringify(name)}]);
      for (const [alias, name] of Object.entries(${JSON.stringify(aliases)})) {
        assert.equal(ontology[alias], ontology[name]);
        assert.equal(api[alias], ontology[name]);
      }
      if (${JSON.stringify(name)} !== 'WorkflowEntity') {
        assert.equal(Class.dcr, ontology[${JSON.stringify(name)}].dcr);
        assert.equal(Class.dcr.clazz, Class);
        assert.equal(Class.dcr.collectionName, ${JSON.stringify(name)});
        assert.equal(ontology.entityDescriptors.filter(d => d === Class.dcr).length, 1);
      }`;
    const child = Bun.spawnSync([process.execPath, '-e', code], {cwd:root, stderr:'pipe'});
    expect({entity:name, exitCode:child.exitCode, stderr:child.stderr.toString()})
      .toEqual({entity:name, exitCode:0, stderr:''});
  }
}, 20_000);

it('preserves descriptor contracts, defaults, typed persistence, reload and relationships', async () => {
  expect(ontology.entityDescriptors.map(d => d.toJSON())).toEqual(contracts.map(c => c.descriptor));
  expect(new Set(ontology.entityDescriptors).size).toBe(20);
  expect(ontology.durableEntityDescriptors.map(d => d.name)).toEqual(names.slice(0, 18));
  expect(ontology.ephemeralEntityDescriptors.map(d => d.name)).toEqual(['CallSite', 'TraceNode']);
  const policy = await import('../src/artifact-policy.ts');
  const templates = await import('../src/model/entity-templates.ts');
  expect(policy.CompletenessSchema).toBe(templates.CompletenessSchema);
  for (const [alias, name] of Object.entries(aliases)) {
    const exports = ontology as unknown as Record<string, typeof WorkflowEntity>;
    expect(exports[alias]).toBe(exports[name]);
  }
  for (const {descriptor, defaults} of contracts) {
    const dcr = ontology.entityDescriptors.find(d => d.name === descriptor.name)!;
    expect(sp.ontology.edcr(dcr.name)).toBe(dcr);
    const partition = ontology.durableEntityDescriptors.includes(dcr)
      ? ontology.durableOntology : ontology.ephemeralOntology;
    expect(partition.entityDcrs.filter(entry => entry === dcr)).toHaveLength(1);
    const entity = await sp.createEntity<WorkflowEntity>(dcr, {id:`model_${dcr.name}_CONTRACT`, title:defaults.title});
    expect(entity).toBeInstanceOf(dcr.clazz);
    expect(entity).toBeInstanceOf(WorkflowEntity);
    expect(entity.descriptor).toBe(dcr);
    expect(entity.typeName()).toBe(dcr.name);
    const fields = Object.fromEntries(Object.keys(dcr.template)
      .map(key => [key, (entity as unknown as Record<string, unknown>)[key]]));
    for (const key of ['id', '_id', 'createdAt', 'updatedAt']) delete fields[key];
    expect(JSON.parse(JSON.stringify(fields))).toEqual(defaults);
  }
  const feature = await sp.loadEntity<ontology.Feature>('model_Feature_CONTRACT', ontology.Feature.dcr);
  const story = await sp.loadEntity<ontology.UserStory>('model_UserStory_CONTRACT', ontology.UserStory.dcr);
  const relation = await sp.createPredicate(feature, ontology.semanticPredicates.enables, story, {note:'Preserved relationship'});
  expect(story.definitionReview.missingFields).toEqual(['actor', 'intent', 'initialState', 'action', 'expectedResult']);
  await expect(sp.createEntity(ontology.Ticket.dcr, {id:'model_Ticket_INVALID', priority:6})).rejects.toThrow();
  await expect(sp.createEntity(ontology.UserStory.dcr, {id:'model_UserStory_INVALID', status:'done'})).rejects.toThrow();
  db.close();
  db = new Database(path.join(root, 'model.db'));
  sp = new SemanticPackage('model', ontology.graphOntology, new SqliteStore(db));
  for (const dcr of ontology.entityDescriptors) {
    const loaded = await sp.loadEntity<WorkflowEntity>(`model_${dcr.name}_CONTRACT`, dcr);
    const direct: Record<string, typeof WorkflowEntity> = await import('../src/model/' + entityFile(dcr.name));
    expect(loaded).toBeInstanceOf(direct[dcr.name]!);
    expect(loaded.title).toBe('Existing ' + dcr.name);
    expect((await loaded.getCollection()).name).toBe('model_' + dcr.name);
  }
  const loadedFeature = await sp.loadEntity<ontology.Feature>(feature.id, ontology.Feature.dcr);
  const edges = await loadedFeature.outgoingPreds(ontology.semanticPredicates.enables);
  expect(edges).toHaveLength(1);
  expect(edges[0]!.id).toBe(relation.id);
  expect(edges[0]!.targetId).toBe(story.id);
  expect(edges[0]!.payload).toEqual({note:'Preserved relationship'});
});
