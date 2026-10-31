import {acceptProduct} from './product-review.ts';
import {afterEach,beforeEach,describe,expect,it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Epic,Goal,Feature,UserStory,Ticket,TestNode,Artifact,ModuleNode,FileNode} from '../src/model/ontology.ts';
import {initializeTools,commandRegistry} from '../src/tools/index.ts';
import {parseCommand,lexCommand} from '../src/artifact-command.ts';
import {PRODUCT_RELATIONS,productEdgeRows} from '../src/product/mutation.ts';
import {processShellInput} from '../src/shell.ts';
import {WorkflowActor} from '../src/helpers/actor/engine.ts';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {buildMcpSchemas} from '../src/mcp.ts';

const binary=process.env.AIWF_PUBLIC_BINARY;
const cli=path.resolve(import.meta.dir,'../src/cli.ts');
describe('PC1b governed relation public proof',()=>{
 let root:string,store:WorkflowStore;
 const call=(name:string,args:unknown,authority:'project-write'|'read-only'='project-write')=>commandRegistry.execute(name,args,{store,projectRoot:root,executionAuthority:authority});
 const preview=(extra:Record<string,unknown>={})=>call('link',{action:'preview_add',sourceId:'E1',targetId:'G1',predicate:'targets',...extra});
 const accept=(p:any,decision='accept',authority:'project-write'|'read-only'='project-write')=>store.withExecutionContext(authority,undefined,()=>call('apply_change',{request:p.request,fingerprint:p.fingerprint,decision},authority),p.fingerprint);
 const rows=async()=>productEdgeRows(store,(await store.getEntity('E1',Epic.dcr))!.id);
 const reopen=()=>{store.close();store=new WorkflowStore(root);};
 beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-pc1b-proof-'));store=new WorkflowStore(root);initializeTools();
  await store.upsertEntity(Epic.dcr,{id:'E1',title:'Delivery'});await store.upsertEntity(Goal.dcr,{id:'G1',title:'Outcome'});});
 afterEach(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
 it('normalizes colon/space, keyword case, quotes and escaped values to the same typed intent',async()=>{
  expect((await parseCommand(['LINK:TYPES','epic','goal']))).toEqual((await parseCommand(['link','types','Epic','Goal'])));
  expect((await parseCommand(lexCommand(`LiNk E1 TO G1 AS TARGETS --NOTE "a \\"quoted\\" note"`)))).toEqual((await parseCommand(['link','E1','to','G1','as','targets','--note','a "quoted" note'])));
  expect((await parseCommand(['process:feature','F']))).toEqual((await parseCommand(['process','feature','F'])));
  expect((await parseCommand(['RESOLVE','T','--DEPTH','ALL','--COMPLETENESS','PRODUCTION','--CRITIC','AUTO']))).toEqual((await parseCommand(['resolve','T','--depth','all','--completeness','production','--critic','auto'])));
  expect(lexCommand(`link E1 to G1 as targets --note '$(literal) $HOME a=b'`)).toContain('$(literal) $HOME a=b');
  expect(()=>lexCommand('link E1 to G1 as targets --note tail'+String.fromCharCode(92))).toThrow();
 });
 it('rejects malformed grammar, duplicate flags, foreign payloads, and no Actor fallback',async()=>{
  for(const words of [['link','E1','to','G1','as','targets','-D'],['link','types','Epic','Goal','extra'],['links','E1','--limit','0'],['link','E1','to','G1','as','targets','--note','--clear-note'],['link','E1','to','G1','as','targets','--payload','{}'],['resolve','T','extra'],['process','unknown','X']]) await expect(parseCommand(words)).rejects.toThrow();
  for(const payload of [{note:1},{Note:'x'},{weight:1},null,[],true,JSON.parse('{"__proto__":{}}'),{note:'x'.repeat(4001)}]) await expect(preview({payload})).rejects.toThrow();
  await expect(call('link',{action:'preview_remove',sourceId:'E1',targetId:'G1',predicate:'targets',payload:{}})).rejects.toThrow();
  await expect(preview({yes:true})).rejects.toThrow();reopen();expect(await rows()).toEqual([]);
 });
 it('replaces and clears notes on one native row while omitted/identical notes preserve identity and version',async()=>{
  const p=await preview({payload:{note:'first'}});expect(p.blocked).toBe(false);expect((await accept(p)).verification.passed).toBe(true);reopen();
  const first=(await rows())[0]!;
  expect(first.payload).toEqual({note:'first'});
  for(const extra of [{},{payload:{note:'first'}}]) {const same=await preview(extra);expect(same.unchanged).toBe(true);await accept(same);reopen();expect(await rows()).toEqual([first]);}
  await accept(await preview({payload:{note:'replacement'}}));reopen();const second=(await rows())[0]!;
  expect(second._id).toBe(first._id);expect(second._version).toBe(first._version+1);expect(second.payload).toEqual({note:'replacement'});
  await accept(await preview({payload:{}}));reopen();const cleared=(await rows())[0]!;expect(cleared._id).toBe(first._id);expect(cleared._version).toBe(second._version+1);expect(cleared.payload).toEqual({});
  const remove=await call('link',{action:'preview_remove',sourceId:'E1',targetId:'G1',predicate:'targets'});await accept(remove);reopen();expect(await rows()).toEqual([]);expect(await store.getEntity('G1',Goal.dcr)).not.toBeNull();
  const clearMissing=await preview({payload:{}});expect(clearMissing.unchanged).toBe(true);expect((await accept(clearMissing)).verification.passed).toBe(true);reopen();expect(await rows()).toEqual([]);
  const missing=await call('link',{action:'preview_remove',sourceId:'E1',targetId:'G1',predicate:'targets'});expect(missing.unchanged).toBe(true);await accept(missing);expect(await rows()).toEqual([]);
 });
 it('preserves system payload and detects payload-only stale and ABA changes',async()=>{
  await store.relate('E1','targets','G1',{note:'old',provenance:{owner:'fixture'}});
  const p=await preview({payload:{note:'new'}});await accept(p);reopen();expect((await rows())[0]!.payload).toEqual({note:'new',provenance:{owner:'fixture'}});
  const stale=await preview({payload:{note:'later'}});await accept(await preview({payload:{note:'changed'}}));await expect(accept(stale)).rejects.toThrow('fingerprint');
  const aba=await preview();const old=(await rows())[0]!;await store.unrelate('E1','targets','G1');await store.relate('E1','targets','G1',old.payload);reopen();expect((await rows())[0]!._id).not.toBe(old._id);await expect(accept(aba)).rejects.toThrow('fingerprint');
  const absent=await call('link',{action:'preview_remove',sourceId:'E1',targetId:'G1',predicate:'targets'});await store.unrelate('E1','targets','G1');await expect(accept(absent)).rejects.toThrow('fingerprint');
 });
 it('rejects endpoint revisions, ambiguous IDs, cycles and wrong direction, preserving endpoints',async()=>{
  const p=await preview();await store.upsertEntity(Goal.dcr,{id:'G1',title:'Revised'});expect((await accept(p)).ok).toBe(false);
  await store.upsertEntity(Goal.dcr,{id:'g1',title:'Other'});
  expect((await preview({sourceId:'e1',targetId:'G1',idMatch:'human'})).request.mutations[0].targetId).toBe('G1');
  await store.upsertEntity(Goal.dcr,{id:'GoAl',title:'A'});await store.upsertEntity(Goal.dcr,{id:'GOAL',title:'B'});
  await expect(preview({targetId:'goal',idMatch:'human'})).rejects.toThrow('Ambiguous');
  await store.upsertEntity(Feature.dcr,{id:'G1',title:'Same exact local ID'});await expect(preview()).rejects.toThrow('Ambiguous');
  await expect(preview({sourceId:'G1',targetId:'E1'})).rejects.toThrow('Ambiguous');
  expect((await preview({sourceId:'g1',targetId:'E1'})).blocked).toBe(true);
  for(const id of ['T1','T2','T3']) await store.upsertEntity(Ticket.dcr,{id,title:id,lane:'Todo'});
  await acceptProduct(store, [{kind:"product_link",sourceId:'T1',predicate:'depends_on',targetId:'T2'}]);await acceptProduct(store, [{kind:"product_link",sourceId:'T2',predicate:'contains',targetId:'T3'}]);
  expect((await preview({sourceId:'T3',targetId:'T1',predicate:'depends_on'})).blocked).toBe(true);
  expect((await preview({sourceId:'T1',targetId:'T1',predicate:'depends_on'})).blocked).toBe(true);
 });
 it('protects verification evidence, legacy triples and indexed relationships',async()=>{
  await store.upsertEntity(Feature.dcr,{id:'F',title:'Feature'});await store.upsertEntity(UserStory.dcr,{id:'S',title:'Story'});
  await store.relate('F','contains','S');
  const {exportAuthoredState}=await import('../src/product/manifest.ts');
  const snapshot=JSON.parse(fs.readFileSync(await exportAuthoredState(store,root),'utf8'));
  expect(snapshot.relations.some((r:any)=>r.sourceId==='F'&&r.predicate==='contains'&&r.targetId==='S')).toBe(false);
  expect((await call('link',{action:'inspect',id:'F'})).links.some((r:any)=>r.predicate==='contains'&&r.targetId==='S')).toBe(true);
  expect((await preview({sourceId:'F',targetId:'S',predicate:'contains'})).blocked).toBe(true);
  const legacy=await call('link',{action:'preview_remove',sourceId:'F',targetId:'S',predicate:'contains'});await accept(legacy);expect(await store.getOutgoing('F','contains')).toEqual([]);
  await store.withTestArtifactWrite('TEST',()=>store.upsertEntity(TestNode.dcr,{id:'TEST',title:'Owned Test'}));
  expect((await preview({sourceId:'TEST',targetId:'S',predicate:'verifies'})).blocked).toBe(true);
  await expect(call('link_product',{sourceId:'TEST',targetId:'S',predicate:'verifies'})).rejects.toThrow();
  await store.sp.createEntity(Artifact.dcr,{id:store.formatId(Artifact.dcr,'VERIFY-T'),_id:store.formatId(Artifact.dcr,'VERIFY-T'),title:'Historical fixture'},true,false);
  expect((await preview({sourceId:'E1',targetId:'VERIFY-T'})).blocked).toBe(true);
  await store.upsertEntity(ModuleNode.dcr,{id:'mod:src',title:'Module',path:'src'});await store.upsertEntity(FileNode.dcr,{id:'src/a.ts',title:'a.ts'});
  expect((await preview({sourceId:'mod:src',targetId:'src/a.ts',predicate:'contains'})).blocked).toBe(true);
  const descriptor=await call('link',{action:'allowed'});expect(descriptor.relations).toEqual(PRODUCT_RELATIONS);
  expect(descriptor).not.toHaveProperty('modes');expect(descriptor.relations.every((r:any)=>!('mode' in r)&&!('owner' in r))).toBe(true);
 });
 it('requires human confirmation; cancel/reject, model yes and read-only application are inert',async()=>{
  const actor=new WorkflowActor({store,projectRoot:root,offline:true});const session={store,projectRoot:root,actor,interactive:true};
  const declined={facilitate:async()=>({approval:'cancel'})};
  expect((await processShellInput('link E1 to G1 as targets',{...session,facilitator:declined as any})).output).toContain('cancelled');expect(await rows()).toEqual([]);
  const approved={facilitate:async()=>({approval:'apply'})};
  expect((await processShellInput('link E1 to G1 as targets --note confirmed',{...session,facilitator:approved as any})).output).toContain('applied');
  await store.unrelate('E1','targets','G1');
  await actor.execute('link E1 to G1 as targets --yes',{executionAuthority:'project-write'});expect(await rows()).toEqual([]);
  const p=await preview();for(const decision of ['reject','cancel']) expect((await accept(p,decision)).ok).toBe(false);
  await expect(accept(p,'accept','read-only')).rejects.toThrow('read-only');expect(await rows()).toEqual([]);
 });
 it('rejects duplicate physical rows and rolls back the native SQL batch without partial graph',async()=>{
  const p=await preview({payload:{note:'atomic'}});const predicates=await store.sp.predicateCollection(store.sp.ontology.pdcr('targets'));
  store.db.exec(`CREATE TRIGGER reject_pc1b BEFORE INSERT ON "${predicates.name}" BEGIN SELECT RAISE(ABORT,'pc1b rollback'); END`);
  await expect(accept(p)).rejects.toThrow();store.db.exec('DROP TRIGGER reject_pc1b');reopen();expect(await rows()).toEqual([]);
  await accept(await preview());const row=(await rows())[0]!;
  // Deliberately corrupt a disposable legacy fixture, bypassing native uniqueness.
  store.db.exec('DROP INDEX idx_aiwf__Predicates_sourceId_predicateName_targetId');
  store.db.exec('CREATE INDEX idx_aiwf__Predicates_sourceId_predicateName_targetId ON "'+predicates.name+'" (_id)');
  store.sqliteStore.applyBatch([{collectionName:predicates.name,id:predicates.createId(),expectedVersion:null,record:{...row,_id:undefined,_version:undefined}}]);
  const duplicate=await preview();expect(duplicate.blocked).toBe(true);expect(duplicate.blockReason).toContain('Duplicate');reopen();expect((store.db.query('SELECT count(*) AS count FROM "'+predicates.name+'"').get() as {count:number}).count).toBe(2);
 });
 it('preserves notes across an advanced batch and refuses changes made during interactive review',async()=>{
  const base={kind:'product_link',sourceId:'E1',targetId:'G1',predicate:'targets'};
  const request={action:'product_change',mutations:[{...base,payload:{note:'batch note'}},base]};
  const p=await call('preview_change',request);await accept(p);reopen();expect((await rows())[0]!.payload).toEqual({note:'batch note'});
  const actor=new WorkflowActor({store,projectRoot:root,offline:true});
  const facilitator={facilitate:async()=>{await store.upsertEntity(Goal.dcr,{id:'G1',title:'Changed during review'});return {approval:'apply'};}};
  const result=await processShellInput('link E1 to G1 as targets --note reviewed',{store,projectRoot:root,actor,interactive:true,facilitator:facilitator as any});
  expect(result.output).toMatch(/stale/i);reopen();expect((await rows())[0]!.payload).toEqual({note:'batch note'});
 });
 it('paginates both directions and refuses stale or invalid cursors',async()=>{
  await accept(await preview());await store.upsertEntity(Goal.dcr,{id:'G2',title:'Another'});await accept(await preview({targetId:'G2'}));
  const page=await call('link',{action:'inspect',id:'E1',limit:1});expect(page.links).toHaveLength(1);expect(page.cursor).toBeString();
  const next=await call('link',{action:'inspect',id:'E1',limit:1,cursor:page.cursor});expect(next.links[0].id).not.toBe(page.links[0].id);expect(next.cursor).toBeNull();
  await store.unrelate('E1','targets','G2');await expect(call('link',{action:'inspect',id:'E1',cursor:page.cursor})).rejects.toThrow('cursor');
  const incoming=await call('link',{action:'inspect',id:'G1',direction:'incoming'});expect(incoming.links[0].direction).toBe('incoming');
 });
 it('runs strict typed discovery/preview and refusal over real stdio MCP and reopens',async()=>{
  const transport=new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[cli,'mcp'],cwd:root,env:{...process.env,AIWF_EXECUTION_AUTHORITY:'read-only'} as Record<string,string>,stderr:'inherit'});
  const client=new Client({name:'pc1b-proof',version:'1'});
  try {await client.connect(transport);const tools=await client.listTools();const schema=tools.tools.find(t=>t.name==='link')!.inputSchema;expect(schema.oneOf??schema.anyOf).toBeArray();
   const rpc=async(args:any)=>{const response=await client.callTool({name:'link',arguments:args});return {response,value:response.isError?null:JSON.parse((response.content as Array<{text:string}>)[0]!.text)};};
   expect((await rpc({action:'allowed',sourceKind:'Epic',targetKind:'Goal'})).value.relations[0].predicate).toBe('targets');
   const local=await preview({payload:{note:'typed'}});const remote=await rpc({action:'preview_add',sourceId:'E1',targetId:'G1',predicate:'targets',payload:{note:'typed'}});
   expect(remote.response.isError).not.toBe(true);expect(remote.value.request).toEqual(local.request);expect(remote.value.fingerprint).toBe(local.fingerprint);
   expect((await rpc({action:'preview_add',sourceId:'E1',targetId:'G1',predicate:'targets',yes:true})).response.isError).toBe(true);
   const denied=await client.callTool({name:'apply_change',arguments:{request:local.request,fingerprint:local.fingerprint,decision:'accept'}});expect(denied.isError).toBe(true);
  } finally {await client.close();await transport.close();}reopen();expect(await rows()).toEqual([]);
 },30000);
 it('fails closed when an advertised tool schema cannot be converted',()=>{
  const tool=commandRegistry.get('link')!;const original=tool.parameters;
  try {commandRegistry.register({...tool,parameters:z.custom()});expect(()=>buildMcpSchemas()).toThrow();}
  finally {commandRegistry.register({...tool,parameters:original});}
 });
 it('distinguishes clean application from committed mutation whose verification failed and reports recovery guidance',async()=>{
  const {reviewLink}=await import('../src/product/links.ts');
  const applyChange=commandRegistry.get('apply_change')!;
  const originalExecute=applyChange.execute;
  try {
   applyChange.execute=async(args,ctx)=>{
    const res=await originalExecute(args,ctx);
    return {...res,verification:{passed:false,errors:['Simulated post-commit verification failure: relation check mismatch']}};
   };
   const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
   const result=await reviewLink({action:'preview_add',sourceId:'E1',targetId:'G1',predicate:'targets',payload:{note:'partial'}},ctx,true);
   expect(result.status).toBe('committed-verification-failed');
   expect((result as any).warning).toContain('Do not retry blind application');
   expect((result as any).warning).toContain('Simulated post-commit verification failure');
   expect((result as any).result.ok).toBe(true);
   reopen();
   const edges=await rows();
   expect(edges).toHaveLength(1);
   expect(edges[0]!.payload).toEqual({note:'partial'});
  } finally {
   applyChange.execute=originalExecute;
  }
 });
});
