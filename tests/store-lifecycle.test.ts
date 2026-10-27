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


// Lifecycle invariants exercised through installed public transports and disk reconciliation.
test('public MCP release and cancellation end execution without manufacturing completion', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-ticket-public-'));store=new WorkflowStore(root);
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Retained specification',body:'Keep this work',lane:'Todo'});
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
  const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client=new Client({name:'ticket-lifecycle-regression',version:'1'});
  const transport=new StdioClientTransport({command:'bun',args:[path.resolve('src/mcp.ts')],cwd:root,
    env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'} as Record<string,string>,stderr:'pipe'});
  try {
    await client.connect(transport);
    const call=async(name:string,args:Record<string,unknown>)=>{
      const result=await client.callTool({name,arguments:args});
      if(result.isError) throw Error(JSON.stringify(result.content));
      return JSON.parse((result.content as Array<{text:string}>)[0]!.text);
    };
    for(const durationMinutes of [0,-1]) {
      const invalid=await client.callTool({name:'claim_ticket',arguments:{ticketId:'T',agentId:'owner',durationMinutes}});
      expect(invalid.isError).toBe(true);
    }
    expect((await call('claim_ticket',{ticketId:'T',agentId:'owner',durationMinutes:30})).success).toBe(true);
    await call('release_ticket',{ticketId:'T'});
    expect(await call('get_ticket',{ticketId:'T'})).toMatchObject({lane:'Todo',claim:null,verification:null,body:'Keep this work'});
    await call('claim_ticket',{ticketId:'T',agentId:'owner',durationMinutes:30});
    await call('update_ticket_state',{ticketId:'T',lane:'Cancelled'});
    expect(await call('get_ticket',{ticketId:'T'})).toMatchObject({lane:'Cancelled',claim:null,verification:null});
    await call('release_ticket',{ticketId:'T'});
    expect((await call('get_ticket',{ticketId:'T'})).lane).toBe('Cancelled');
    const history=await call('get_ticket_history',{ticketId:'T',limit:100});
    expect(history.entries.some((entry:{message:string})=>entry.message==='In Progress → Todo.')).toBe(true);
    expect(history.entries.some((entry:{message:string})=>entry.message==='In Progress → Cancelled.')).toBe(true);
  } finally {await client.close();}
},30000);

test('interrupted MCP claim expires and recovers through CLI without stale-board resurrection', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-ticket-recovery-'));store=new WorkflowStore(root);
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Interrupted work',body:'Preserve work',lane:'Todo'});
  const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
  const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client=new Client({name:'interrupted-owner',version:'1'});
  const transport=new StdioClientTransport({command:'bun',args:[path.resolve('src/mcp.ts')],cwd:root,
    env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'} as Record<string,string>,stderr:'pipe'});
  try {
    await client.connect(transport);
    const result=await client.callTool({name:'claim_ticket',arguments:{ticketId:'T',agentId:'interrupted',durationMinutes:0.001}});
    expect(result.isError).not.toBe(true);
    // End the host session without releasing its Ticket, as after an interrupted execution.
  } finally {await client.close();}
  await Bun.sleep(80);
  expect(await store.isTicketClaimed('T')).toBe(false);
  const run=(...args:string[])=>{
    const result=Bun.spawnSync(['bun',path.resolve('src/cli.ts'),...args],{cwd:root,stderr:'pipe'});
    expect(result.success).toBe(true);return result;
  };
  run('claim','T','replacement','30');
  const board=fs.readFileSync(path.join(root,'kanban.md'),'utf8');
  run('release','T');
  for(let iteration=0;iteration<2;iteration++) {
    fs.writeFileSync(path.join(root,'kanban.md'),board);
    const later=new Date(Date.now()+5000);fs.utimesSync(path.join(root,'kanban.md'),later,later);
    run('sync');
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!).toMatchObject({lane:'Todo',claim:null,body:'Preserve work'});
  }
  expect(await store.getEntity('VERIFY-T')).toBeNull();
},30000);

test('revision-checked Markdown edits preserve current state and repeat without journal churn', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-ticket-reconcile-'));store=new WorkflowStore(root);
  const {exportProjections,importProjections}=await import('../src/graph/projections.ts');
  const {getTicketHistory}=await import('../src/graph/journal.ts');
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Original work',body:'Keep specification',lane:'Todo'});
  await exportProjections(store);
  const original=fs.readFileSync(path.join(root,'kanban.md'),'utf8');
  const replay=async(board:string)=>{
    fs.writeFileSync(path.join(root,'kanban.md'),board);
    const later=new Date(Date.now()+5000);fs.utimesSync(path.join(root,'kanban.md'),later,later);
    await importProjections(store);
  };
  await replay(original.replace('Original work','Reviewed title'));
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.title).toBe('Reviewed title');
  const version=(await store.getEntity<Ticket>('T',Ticket.dcr))!.version;
  const count=(await getTicketHistory(store,'T')).entries.length;
  await replay(original);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!).toMatchObject({title:'Reviewed title',version});
  expect((await getTicketHistory(store,'T')).entries).toHaveLength(count);
  await store.upsertEntity(Ticket.dcr,{id:'T',lane:'Cancelled'});
  for(const board of [original,original.replace('## Todo','## In Progress'),original.replace('- [ ] **T**','- [x] **T**')]) {
    await replay(board);
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Cancelled');
  }
});


test('public status reports a resolver reservation even before its lane enters In Progress', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-ticket-reservation-'));store=new WorkflowStore(root);
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Reserved work',lane:'Todo'});
  await store.claimTicket('T','reserved-owner',30,false);
  expect((await store.getActiveClaims()).map(item=>item.ticketId)).toEqual(['T']);
  const result=Bun.spawnSync(['bun',path.resolve('src/cli.ts'),'status'],{cwd:root,stderr:'pipe'});
  expect(result.success).toBe(true);
  expect(result.stdout.toString()).toContain('reserved-owner');
  await store.releaseTicket('T','reserved-owner');
  expect((await store.getActiveClaims())).toEqual([]);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Todo');
});
