import {afterEach, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../../src/graph/store.ts';
import {Ticket,Artifact} from '../../src/model/ontology.ts';
import {ticketVerificationSignature} from '../../src/ticket-operation-types.ts';
import {systemJournal} from '../../src/services/journal-service.ts';
import {initializeTools, commandRegistry} from '../../src/tools/index.ts';

let root: string, store: WorkflowStore | undefined;
afterEach(() => {store?.close(); if(root) fs.rmSync(root,{recursive:true,force:true});});
it('keeps the current specification through progression, durable history, condensation and reopening', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-ticket-journal-'));
  store=new WorkflowStore(root); initializeTools();
  const call=(name:string, args:unknown) => commandRegistry.execute(name,args,{store:store!,projectRoot:root,executionAuthority:'project-write'});
  const ticketId='JOURNEY', body='Repair the saved total. Preserve decimal precision.';
  await call('create_ticket',{id:ticketId,title:'Repair saved total',body});
  expect((await call('get_ticket',{ticketId})).body).toBe(body);
  expect((await call('claim_ticket',{ticketId,agentId:'developer'})).success).toBe(true);
  await call('record_ticket_event',{ticketId,kind:'failure',message:'Decimal acceptance failed; string concatenation observed.',references:['test:tests/total.test.ts','docs/evidence/total-red.json']});
  await call('record_ticket_event',{ticketId,kind:'decision',message:'Use decimal arithmetic at the input boundary.',references:['src/total.ts']});
  await call('update_ticket_state',{ticketId,lane:'Blocked'});
  await call('record_ticket_event',{ticketId,kind:'correction',message:'Replaced concatenation with decimal addition.',references:['src/total.ts']});
  await call('record_ticket_event',{ticketId,kind:'outcome',message:'Acceptance passes; independent verification remains pending.',references:['test:tests/total.test.ts']});
  await call('release_ticket',{ticketId});
  const edited=body+' Reject malformed input.';
  await call('update_ticket',{ticketId,body:edited});
  const before=await call('get_ticket_history',{ticketId});
  expect(before.entries.some((e:{kind:string})=>e.kind==='created')).toBe(true);
  expect(before.entries.some((e:{kind:string})=>e.kind==='state')).toBe(true);
  expect(before.entries.some((e:{kind:string})=>e.kind==='specification')).toBe(true);
  const condensed=await call('condense_ticket_history',{ticketId});
  expect(condensed.text.length).toBeGreaterThan(0);
  expect(condensed.references).toContain('docs/evidence/total-red.json');
  expect((await call('get_ticket_history',{ticketId})).entries).toEqual(before.entries);
  store.close(); store=new WorkflowStore(root);
  await call('update_ticket_state',{ticketId,lane:'Todo'});
  const reopened=await call('get_ticket',{ticketId});
  expect(reopened.body).toBe(edited); expect(reopened.lane).toBe('Todo');
  expect(reopened.history.summary.text).toBe(condensed.text);
  expect(reopened.history.summary.stale).toBe(true);
  expect(reopened.history.entries).toBeUndefined();
  const history=await call('get_ticket_history',{ticketId});
  expect(history.entries.filter((e:{kind:string})=>e.kind==='failure')[0].references).toContain('test:tests/total.test.ts');
  expect(history.entries.slice(0,before.entries.length)).toEqual(before.entries);
});

it('preserves legacy bodies and evidence atomically, retains historical verification, and rejects stale or unreviewed cleanup', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-journal-migration-'));store=new WorkflowStore(root);initializeTools();
  const call=(name:string,args:unknown)=>commandRegistry.execute(name,args,{store:store!,projectRoot:root,executionAuthority:'project-write'});
  const ticketId='LEGACY',specification='Preserve decimal precision.',body=specification+'\n\nHistorical run: failed, corrected, passed. Evidence: tests/total.test.ts';
  await call('create_ticket',{id:ticketId,title:'Decimal total',body});
  // Existing owner seeds a controlled historical completion; this fixture is not current product acceptance.
  await store.claimTicket(ticketId,'fixture',30,false);
  const token=await store.admitGovernance('governed');
  try {await store.completeTicket((await store.getEntity<Ticket>(ticketId,Ticket.dcr))!,(await store.getEntity<Ticket>(ticketId,Ticket.dcr))!.claim!,token,'Historical fixture receipt; preserve exact bytes.');}
  finally {await store.releaseGovernance(token);}
  const receipt=(await store.getEntity<Artifact>('VERIFY-'+ticketId,Artifact.dcr))!;
  const beforeSignature=await ticketVerificationSignature(store,(await store.getEntity<Ticket>(ticketId,Ticket.dcr))!);
  const input={ticketId,expectedBody:body,specification,references:['test:tests/total.test.ts','VERIFY-'+ticketId]};
  const preview=await call('migrate_ticket_history',input);
  expect(preview.status).toBe('review_required');expect((await call('get_ticket',{ticketId})).body).toBe(body);
  const run=()=>store!.withExecutionContext('project-write',undefined,()=>call('migrate_ticket_history',input),preview.fingerprint);
  const journal=await systemJournal(store);
  // Failure inside the native batch must preserve both the original body and the journal.
  const before=(await call('get_ticket_history',{ticketId})).entries;
  store.db.exec(`CREATE TRIGGER journal_reject BEFORE INSERT ON "${journal.name}" BEGIN SELECT RAISE(ABORT, 'journal unavailable'); END`);
  await expect(run()).rejects.toThrow('journal unavailable');
  expect((await call('get_ticket',{ticketId})).body).toBe(body);
  expect((await call('get_ticket_history',{ticketId})).entries).toEqual(before);
  store.db.exec('DROP TRIGGER journal_reject');
  expect((await run()).migrated).toBe(true);
  const after=(await store.getEntity<Ticket>(ticketId,Ticket.dcr))!;
  expect(after.lane).toBe('Done');expect(after).not.toHaveProperty('status');
  expect(await ticketVerificationSignature(store,after)).toBe(beforeSignature);
  const unchanged=(await store.getEntity<Artifact>('VERIFY-'+ticketId,Artifact.dcr))!;
  expect(unchanged.body).toBe(receipt.body);expect(unchanged.version).toBe(receipt.version);
  expect((await call('get_ticket_history',{ticketId})).entries.find((e:{kind:string})=>e.kind==='legacy').message).toBe(body);
  await expect(call('migrate_ticket_history',input)).rejects.toThrow('body changed');
  await call('update_ticket',{ticketId,body:specification+' New developer requirement.'});
  expect(await ticketVerificationSignature(store,(await store.getEntity<Ticket>(ticketId,Ticket.dcr))!)).not.toBe(beforeSignature);
});

it('bounds default context, paginates all originals, replaces only summaries and enforces write authority', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-journal-bounds-'));store=new WorkflowStore(root);initializeTools();
  const call=(name:string,args:unknown,executionAuthority:'read-only'|'project-write'='project-write')=>commandRegistry.execute(name,args,{store:store!,projectRoot:root,executionAuthority});
  const ticketId='BOUNDS';await call('create_ticket',{id:ticketId,title:'Bounded history',body:'Current specification.'});
  for(let i=0;i<23;i++) await call('record_ticket_event',{ticketId,kind:'action',message:`Action ${i}: `+'detail '.repeat(100),references:[`docs/evidence/${i}.json`]});
  const first=await call('get_ticket_history',{ticketId,limit:7});
  const all=[...first.entries];let cursor=first.nextCursor;
  while(cursor){const page=await call('get_ticket_history',{ticketId,limit:7,after:cursor});all.push(...page.entries);cursor=page.nextCursor;}
  expect(all).toHaveLength(24);expect(new Set(all.map(e=>e._id)).size).toBe(24);
  const shown=await call('get_ticket',{ticketId},'read-only');expect(shown.history.recent).toHaveLength(5);
  expect(JSON.stringify(shown.history).length).toBeLessThan(3000);
  await expect(call('record_ticket_event',{ticketId,kind:'failure',message:'Denied'},'read-only')).rejects.toThrow('read-only');
  await expect(call('condense_ticket_history',{ticketId},'read-only')).rejects.toThrow('read-only');
  const summary=await call('condense_ticket_history',{ticketId});
  expect(summary.references).toHaveLength(23);
  await call('record_ticket_event',{ticketId,kind:'decision',message:'Keep originals.',references:['docs/evidence/decision.json']});
  const next=await call('condense_ticket_history',{ticketId});expect(next.count).toBe(25);expect(next.text).toContain('Keep originals.');
  expect((await call('get_ticket_history',{ticketId})).entries.slice(0,24)).toEqual(all);
  expect(await (await systemJournal(store)).count({ticketId,type:'summary'})).toBe(1);
  const cli=path.resolve('src/cli.ts');
  const binary=process.env.AIWF_TEST_BINARY;
  const run=(...args:string[])=>Bun.spawnSync(binary?[binary,...args]:['bun',cli,...args],{cwd:root,stderr:'pipe'});
  const result=run('ticket','history',ticketId,'--limit','2');expect(result.success).toBe(true);expect(JSON.parse(result.stdout.toString()).entries).toHaveLength(2);
  expect(run('ticket','condense',ticketId).success).toBe(true);
  expect(run('ticket','record',ticketId,'--kind','correction','--message','CLI correction','--reference','src/total.ts').success).toBe(true);
});
