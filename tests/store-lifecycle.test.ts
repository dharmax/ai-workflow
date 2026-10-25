import {afterEach, expect, test} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket, UserStory} from '../src/graph/ontology.ts';

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

test('store close finalizes outstanding prepared statements and is idempotent', () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-store-busy-'));
  store=new WorkflowStore(root);
  const statement=store.db.prepare('SELECT 1');
  expect(statement.get()).toEqual({'1':1});
  expect(()=>store.close()).not.toThrow();
  expect(()=>statement.get()).toThrow('Database has closed');
  expect(()=>statement.finalize()).not.toThrow();
  expect(()=>store.close()).not.toThrow();
});

test('Ticket lane is authoritative and public authoring cannot store a second state or complete work', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-state-'));
  store=new WorkflowStore(root);
  const {initializeTools}=await import('../src/tools/index.ts');
  const tools=initializeTools(),ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
  await tools.execute('create_ticket',{id:'T',title:'Real work'},ctx);
  expect(await store.getEntity('T',Ticket.dcr)).not.toHaveProperty('status');
  await tools.execute('update_ticket_state',{ticketId:'T',lane:'Blocked'},ctx);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Blocked');
  await expect(tools.execute('update_ticket_state',{ticketId:'T',lane:'Done'},ctx)).rejects.toThrow('independent Ticket completion');
  await expect(store.upsertEntity(Ticket.dcr,{id:'T',status:'verified'})).rejects.toThrow();
  await expect(store.upsertEntity(Ticket.dcr,{id:'T',lane:'Imaginary'})).rejects.toThrow();
  await expect(tools.execute('update_ticket_state',{ticketId:'T',lane:'Todo',status:'planned'},ctx)).rejects.toThrow();
  await expect(tools.execute('update_ticket',{ticketId:'T',status:'planned'},ctx)).rejects.toThrow();
  const collection=await store.sp.collectionForEntityType(Ticket.dcr);
  await expect(collection.updateDocument(store.formatId(Ticket.dcr,'T'),{lane:'Done'})).rejects.toThrow('independent Ticket completion');
  await tools.execute('update_ticket_state',{ticketId:'T',lane:'Cancelled'},ctx);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Cancelled');
  await expect(store.upsertEntity(Ticket.dcr,{id:'T',lane:'In Progress'})).rejects.toThrow('Reopen cancelled work');
  const cancelled=await tools.execute('resolve_ticket',{ticketId:'T'},ctx);
  expect(cancelled.status).toBe('needs_input');
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.claim).toBeFalsy();
  await tools.execute('update_ticket_state',{ticketId:'T',lane:'Todo'},ctx);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Todo');
});

test('historically accepted incomplete Story is needs-review and resolution cannot bypass it', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-effective-'));
  store=new WorkflowStore(root);
  const story=await store.upsertEntity<UserStory>(UserStory.dcr,{id:'S',title:'Legacy approved title',status:'accepted'});
  const ticket=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'T',title:'Address Story',lane:'Todo',acceptanceCriteria:['Outcome']});
  await store.relate(ticket,'addresses',story);
  const before=story.version;
  const effective=await story.getEffectiveState(store);
  expect(effective.state).toBe('needs-review');
  expect(effective.reasons.join(' ')).toContain('intent');
  expect(story.version).toBe(before);
  const {initializeTools}=await import('../src/tools/index.ts');
  const result=await initializeTools().execute('resolve_ticket',{ticketId:'T',agentId:'test'}, {store,projectRoot:root,executionAuthority:'project-write'});
  expect(result.status).toBe('needs_input');
  expect(JSON.stringify(result)).toContain('Story');
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.claim).toBeFalsy();
  expect(await store.getEntity('VERIFY-T')).toBeNull();
});

test('legacy rejection migrates once to Cancelled and retains historical identity and meaning', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-legacy-state-'));
  store=new WorkflowStore(root);
  await store.upsertEntity(Ticket.dcr,{id:'R',title:'Rejected work',lane:'Backlog',body:'Retain exact intent'});
  await store.upsertEntity(Ticket.dcr,{id:'H',title:'Historical completion',lane:'Todo'});
  // Seed historical bytes; this is not a newly authorized transition.
  const update=store.db.query("UPDATE aiwf_Ticket SET data=json_set(data,'$.status',?,'$.lane',?) WHERE _id=?");
  update.run('rejected','Done',store.formatId(Ticket.dcr,'R'));
  update.run('verified','Done',store.formatId(Ticket.dcr,'H'));
  store.close();store=new WorkflowStore(root);
  const rejected=(await store.withExecutionContext('read-only',undefined,()=>store.getEntity<Ticket>('R',Ticket.dcr)))!;
  expect(rejected.lane).toBe('Cancelled');
  expect(rejected.body).toBe('Retain exact intent');
  expect(rejected).not.toHaveProperty('status');
  expect((await store.getEntity<Ticket>('H',Ticket.dcr))!.lane).toBe('Done');
  const {getTicketHistory}=await import('../src/graph/journal.ts');
  const history=await getTicketHistory(store,'R');
  expect(history.entries.filter(event=>event.kind==='legacy')).toHaveLength(1);
  expect(JSON.stringify(history.entries)).toContain('rejected');
  const version=rejected.version;
  store.close();store=new WorkflowStore(root);
  expect((await store.getEntity<Ticket>('R',Ticket.dcr))!.version).toBe(version);
  expect((await getTicketHistory(store,'R')).entries.filter(event=>event.kind==='legacy')).toHaveLength(1);
  expect(await store.getEntity('VERIFY-H')).toBeNull();
});

test('effective Story state retains one authoritative definition state without writes', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-story-state-'));
  store=new WorkflowStore(root);
  const story=await store.upsertEntity<UserStory>(UserStory.dcr,{id:'S',title:'Read output',actor:'Caller',intent:'Read a result',initialState:'Result exists',action:'Read',expectedResult:'The result is returned'});
  expect((await story.getEffectiveState(store)).state).toBe('draft');
  await story.update({status:'proposed'});
  expect((await story.getEffectiveState(store)).state).toBe('proposed');
  await story.update({status:'accepted'});
  expect((await story.getEffectiveState(store)).state).toBe('needs-review');
  await story.update({status:'deprecated'});
  expect((await story.getEffectiveState(store)).state).toBe('deprecated');
  await expect(story.update({status:'done'})).rejects.toThrow();
  expect(story.status).toBe('deprecated');
});
