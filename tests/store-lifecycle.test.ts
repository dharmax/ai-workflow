import {afterEach, expect, test} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket} from '../src/graph/ontology.ts';

let root: string;
let store: WorkflowStore;
afterEach(() => {
  store?.close();
  if (root) fs.rmSync(root, {recursive:true, force:true});
});

test('store close releases SQLite files before fixture removal and preserves data on restart', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-store-close-'));
  store=new WorkflowStore(root);
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Retained work',lane:'Todo'});
  expect(await store.listEntities(Ticket.dcr)).toHaveLength(1);
  store.close();
  expect(fs.existsSync(path.join(root,'.ai-workflow/state/graph.db-wal'))).toBe(false);
  expect(fs.existsSync(path.join(root,'.ai-workflow/state/graph.db-shm'))).toBe(false);
  expect(()=>store.db.exec('SELECT 1')).toThrow();
  expect(()=>store.close()).not.toThrow();
  store=new WorkflowStore(root);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))?.title).toBe('Retained work');
});

test('store close reports an outstanding native statement and can retry after its owner disposes it', () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-store-busy-'));
  store=new WorkflowStore(root);
  const statement=store.db.prepare('SELECT 1');
  try {
    expect(()=>store.close()).toThrow('database is locked');
  } finally {
    statement.finalize();
  }
  expect(()=>store.close()).not.toThrow();
});
