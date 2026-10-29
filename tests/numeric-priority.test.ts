import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Database} from 'bun:sqlite';
import {WorkflowStore} from '../src/graph/store.ts';
import {Epic, Feature, Ticket, UserStory} from '../src/graph/ontology.ts';
import {initializeTools, registry} from '../src/tools/index.ts';
import {exportProjections, importProjections} from '../src/graph/projections.ts';
import {processShellInput} from '../src/shell.ts';
import {proposeEpicStructure} from '../src/product/decompose.ts';
import {applyEpicStructure} from '../src/product/apply.ts';
import {WorkflowActor} from '../src/helpers/actor/engine.ts';

let root: string, store: WorkflowStore;
const cli=path.resolve('src/cli.ts');
const call=(name: string,args: Record<string,unknown>)=>registry.execute(name,args,{store,projectRoot:root,executionAuthority:'project-write'});
const run=(...args: string[])=>Bun.spawnSync(['bun',cli,...args],{cwd:root,stderr:'pipe'});
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-numeric-priority-'));store=new WorkflowStore(root);initializeTools();});
afterEach(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});

describe('canonical numeric priority migration',()=>{
 it('uses integers 0-5/default 2 through public Ticket/Bug APIs and validates all Product schemas',async()=>{
  for(const kind of ['Epic','Feature','Ticket']) {
   const fields=registry.get(kind==='Ticket'?'create_ticket':kind==='Epic'?'create_epic':'create_feature')!.parameters;
   expect(fields.safeParse({title:'Default'}).success).toBe(true);
   for(const priority of [-1,6,1.5,'P1','2',null]) expect(fields.safeParse({title:'Invalid',priority}).success).toBe(false);
   for(const priority of [0,1,2,3,4,5]) expect(fields.safeParse({title:'Valid',priority}).success).toBe(true);
  }
  await call('create_ticket',{id:'T',title:'Default task'});
  expect((await call('get_ticket',{ticketId:'T'})).priority).toBe(2);
  await call('create_bug',{id:'B',title:'Default bug'});
  expect((await call('get_bug',{ticketId:'B'})).priority).toBe(2);
  await call('update_ticket',{ticketId:'T',priority:0});
  await call('update_bug',{ticketId:'B',priority:5,defect:{severity:'critical'}});
  expect((await call('get_ticket',{ticketId:'T'})).priority).toBe(0);
  const bug=await call('get_bug',{ticketId:'B'});expect(bug.priority).toBe(5);expect(bug.defect.severity).toBe('critical');
  for(const entityType of ['Epic','Feature','Ticket']) for(const priority of [-1,6,1.5,'P2']) {
   await expect(call('preview_change',{action:'product_change',mutations:[{kind:'product_create',entityType,id:'INVALID',fields:{title:'Invalid',priority}}]})).rejects.toThrow();
  }
 });
 it('persists defaults and rejects invalid priority at the domain write boundary',async()=>{
  for(const ctor of [Epic,Feature,Ticket]) {
   const entity=await store.upsertEntity<Epic & Feature & Ticket>(ctor.dcr,{id:ctor.dcr.name,title:'Default'});
   expect(entity.priority).toBe(2);
   for(const priority of [-1,6,0.5,'P0']) await expect(store.upsertEntity<Epic & Feature & Ticket>(ctor.dcr,{id:ctor.dcr.name,priority})).rejects.toThrow();
  }
  store.close();store=new WorkflowStore(root);
  for(const ctor of [Epic,Feature,Ticket]) expect((await store.getEntity<Epic & Feature & Ticket>(ctor.dcr.name,ctor.dcr))!.priority).toBe(2);
 });
 it('migrates legacy P0-P3 and missing values atomically, retains numeric values and is idempotent',async()=>{
  for(const ctor of [Epic,Feature,Ticket]) for(let p=0;p<6;p++) await store.upsertEntity<Epic & Feature & Ticket>(ctor.dcr,{id:ctor.dcr.name+p,title:'Keep '+p,priority:p,...(ctor===Ticket?{lane:'Todo'}:{})});
  await store.upsertEntity(UserStory.dcr,{id:'S',title:'Accepted Story',status:'accepted'});
  store.close();
  const db=new Database(path.join(root,'.ai-workflow/state/graph.db'));
  for(const kind of ['Epic','Feature','Ticket']) {
   for(let p=0;p<4;p++) db.query(`UPDATE aiwf_${kind} SET data=json_set(data,'$.priority',?) WHERE _id=?`).run('P'+p,`aiwf_${kind}_${kind+p}`);
   db.query(`UPDATE aiwf_${kind} SET data=json_remove(data,'$.priority') WHERE _id=?`).run(`aiwf_${kind}_${kind}4`);
  }
  db.close();store=new WorkflowStore(root);
  const versions: number[]=[];
  for(const ctor of [Epic,Feature,Ticket]) {
   const entities=await store.listEntities<Epic & Feature & Ticket>(ctor.dcr,{}, {sort:{priority:1}});
   expect(entities.map(e=>e.priority)).toEqual([0,1,2,2,3,5]);
   for(const entity of entities) {
    versions.push(entity.version);
    if(ctor===Ticket) {expect(entity.lane).toBe('Todo');expect((entity as unknown as {status?: string}).status).toBeUndefined();expect((entity as unknown as {effectiveState?: string}).effectiveState).toBeUndefined();}
   }
  }
  const story=(await store.getEntity<UserStory>('S',UserStory.dcr))!;expect(story.status).toBe('accepted');expect((story as unknown as {effectiveState?: string}).effectiveState).toBeUndefined();
  store.close();store=new WorkflowStore(root);
  const reopened: number[]=[];
  for(const ctor of [Epic,Feature,Ticket]) for(const entity of await store.listEntities<Epic & Feature & Ticket>(ctor.dcr,{}, {sort:{priority:1}})) reopened.push(entity.version);
  expect(reopened).toEqual(versions);
 });
 it('fails an invalid legacy migration without writing any candidate row',async()=>{
  await store.upsertEntity(Epic.dcr,{id:'E',title:'Retain Epic',priority:1});
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Retain Ticket',priority:2,lane:'Backlog'});
  store.close();
  const db=new Database(path.join(root,'.ai-workflow/state/graph.db'));
  db.query("UPDATE aiwf_Epic SET data=json_set(data,'$.priority','P0')").run();
  db.query("UPDATE aiwf_Ticket SET data=json_set(data,'$.priority','P9')").run();
  const before=db.query('SELECT data FROM aiwf_Epic').all();db.close();
  store=new WorkflowStore(root);
  await expect(store.listEntities(Epic.dcr)).rejects.toThrow();
  expect(store.db.query('SELECT data FROM aiwf_Epic').all()).toEqual(before);
 });
 it('preserves numeric Epic draft priority through decomposition and its inert apply preview',async()=>{
  for(const priority of [undefined,0,5]) {
   const proposal=await proposeEpicStructure(store,{title:'Priority draft',priority},{injectedSemanticOutput:{}});
   expect(proposal.epic.priority).toBe(priority ?? 2);
   const result=await applyEpicStructure(store,proposal);
   const mutation=result.preview.mutations.find(item=>item.kind==='product_create' && item.entityType==='Epic');
   expect(mutation && 'fields' in mutation && mutation.fields.priority).toBe(priority ?? 2);
   expect(await store.listEntities(Epic.dcr)).toHaveLength(0);
  }
 });
 it('allows short read-only CLI commands to close an already migrated store cleanly',async()=>{
  await store.upsertEntity(Epic.dcr,{id:'E',title:'Numeric Epic',priority:0});
  const result=run('link','types','Epic','Goal');
  expect(result.stderr.toString()).toBe('');expect(result.success).toBe(true);
  store.db.query("UPDATE aiwf_Epic SET data=json_set(data,'$.priority','P0')").run();
  const migrated=run('link','types','Epic','Goal');
  expect(migrated.stderr.toString()).toBe('');expect(migrated.success).toBe(true);
  expect((await store.getEntity<Epic>('E',Epic.dcr))!.priority).toBe(0);
 });
 it('orders selection numerically while retaining lane, lease, dependency and severity semantics',async()=>{
  for(const priority of [5,3,0,4,1,2]) await call('create_ticket',{id:'T'+priority,title:'Task '+priority,lane:'Todo',priority});
  for(const priority of [0,1,2,3,4,5]) {
   expect((await call('recommend_next_task',{})).ticket.id).toBe('T'+priority);
   await call('update_ticket',{ticketId:'T'+priority,lane:'Blocked'});
  }
  await call('update_ticket',{ticketId:'T5',lane:'Todo',priority:5});
  await call('create_bug',{id:'B',title:'Critical but lower priority',priority:5,defect:{reproduction:'Run',expected:'Good',actual:'Bad',severity:'critical'}});
  expect((await call('recommend_next_task',{})).ticket.id).toBe('B');
  await call('update_ticket',{ticketId:'T0',lane:'Todo',priority:0});
  expect((await call('recommend_next_task',{})).ticket.id).toBe('T0');
 });
 it('accepts numeric CLI/Shell inputs, preserves zero, and rejects partial or fractional numbers',async()=>{
  Bun.spawnSync(['git','init','-q'],{cwd:root});
  for(const args of [['create','Zero','--id','T','--priority','0'],['bug','new','--id','B','--title','Low','--priority','5']]) {
   const result=run(...args);expect(result.stderr.toString()).toBe('');expect(result.success).toBe(true);
  }
  expect((await call('get_ticket',{ticketId:'T'})).priority).toBe(0);
  expect((await call('get_bug',{ticketId:'B'})).priority).toBe(5);
  const actor=new WorkflowActor({store,projectRoot:root,offline:true});
  const result=await processShellInput('ticket edit T --priority 4',{store,projectRoot:root,actor,interactive:false});expect(result.output).toContain('T');
  expect((await call('get_ticket',{ticketId:'T'})).priority).toBe(4);
  for(const priority of ['P1','1.5','2oops','6','-1','']) expect(run('ticket','edit','T','--priority',priority).success).toBe(false);
 });
 it('exports and imports priority for tasks, bugs, Epics and Features without changing state',async()=>{
  await store.upsertEntity(Ticket.dcr,{id:'T',title:'Task',lane:'Todo',priority:0});
  await store.upsertEntity(Ticket.dcr,{id:'B',title:'Bug',kind:'bug',lane:'Backlog',priority:5});
  await store.upsertEntity(Epic.dcr,{id:'E',title:'Epic',priority:4});
  await store.upsertEntity(Feature.dcr,{id:'F',title:'Feature',priority:3});
  await exportProjections(store,root);
  for(const [file,value] of [['kanban.md',0],['epics.md',4],['features.md',3]] as const) expect(fs.readFileSync(path.join(root,file),'utf8')).toContain('Priority**: '+value);
  for(const [file,from,to] of [['kanban.md',0,1],['epics.md',4,5],['features.md',3,0]] as const) {
   const target=path.join(root,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace('Priority**: '+from,'Priority**: '+to));
   const future=new Date(Date.now()+2000);fs.utimesSync(target,future,future);
  }
  await importProjections(store,root);
  expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.priority).toBe(1);
  expect((await store.getEntity<Epic>('E',Epic.dcr))!.priority).toBe(5);
  expect((await store.getEntity<Feature>('F',Feature.dcr))!.priority).toBe(0);
  expect((await store.getEntity<Ticket>('B',Ticket.dcr))!.priority).toBe(5);
 });
});
