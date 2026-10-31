import {closeAllTsLspClients} from '../src/change/ts-lsp.ts';
import {afterEach,expect,it,spyOn} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CompletionEngine} from '@dharmax/llm-utils';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket,TestNode,Artifact} from '../src/model/ontology.ts';
import {indexCodebase} from '../src/graph/indexer.ts';
import {initializeTools,commandRegistry} from '../src/tools/index.ts';
import {currentTicketReceipt} from '../src/ticket/verification.ts';
import {createProduct,acceptProduct,updateProduct} from './product-review.ts';
import {productReviewFixture} from './product-review-fixture.ts';
import {RuleStore} from '../src/rules/store.ts';

const stores:WorkflowStore[]=[],roots:string[]=[],restores:Array<()=>void>=[];
afterEach(async()=>{await closeAllTsLspClients();for(const restore of restores.splice(0))restore();for(const store of stores.splice(0))store.close();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
async function fixture(options:{unbound?:boolean;test?:'fail'|'skip';rule?:boolean}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-evidence-first-'));roots.push(root);
 fs.mkdirSync(path.join(root,'src'));fs.mkdirSync(path.join(root,'tests'));
 fs.writeFileSync(path.join(root,'src/add.ts'),'export function add(a:number,b:number){return a+b;}\n');
 fs.writeFileSync(path.join(root,'tests/add.test.ts'),`import {it,expect} from 'bun:test';import {add} from '../src/add.ts';it${options.test==='skip'?'.skip':''}('public arithmetic',()=>expect(add(2,3)).toBe(${options.test==='fail'?6:5}));\n`);
 const store=new WorkflowStore(root);stores.push(store);initializeTools();await indexCodebase(store,root);
 await store.upsertEntity(Ticket.dcr,{id:'T',title:'Preserve public addition',body:'Keep the existing public arithmetic contract.',lane:'Todo',acceptanceCriteria:['Adding 2 and 3 returns 5.']});
 await store.relate('T','modifies','src/add.ts');
 if(options.rule)await new RuleStore(store).saveRule({id:'direct',ruleId:'engineering.direct',title:'Direct arithmetic',scope:{kind:'universal'},type:'architecture',importance:10,rule:'Keep arithmetic in its existing public owner.',status:'active',revision:1,provenance:'fixture',examples:[],references:[],test:{kind:'llm'}});
 if(options.rule)await new RuleStore(store).saveRule({id:'expected',ruleId:'engineering.expected',title:'Optional style',scope:{kind:'universal'},type:'architecture',importance:6,rule:'Prefer concise arithmetic.',status:'active',revision:1,provenance:'fixture',examples:[],references:[],test:{kind:'llm'}});
 const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
 const call=(name:string,args:unknown)=>commandRegistry.execute(name,args,ctx);
 const specification={ticketId:'T',testId:'test:tests/add.test.ts',scopes:[{id:'public',criteria:['Adding 2 and 3 returns 5.'],testId:'test:tests/add.test.ts',sources:[{filePath:'src/add.ts'}]}]};
 if(!options.unbound){const preview=await call('prepare_test_binding',{specification});expect(preview.status).toBe('review');await store.withExecutionContext('project-write',undefined,()=>call('apply_test_binding',{specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint);}
 fs.symlinkSync(path.resolve(import.meta.dir,'../node_modules'),path.join(root,'node_modules'));
 fs.writeFileSync(path.join(root,'.gitignore'),'node_modules\n.ai-workflow\n*.md\n');
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']]){const result=Bun.spawnSync(['git',...args],{cwd:root});if(!result.success)throw Error(result.stderr.toString());}
 const resolve=()=>call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none',testCommands:[['bun','test','tests/add.test.ts']]});
 return {root,store,call,resolve};
}
function noLLM(){const spy=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async()=>{throw Error('LLM unavailable');});restores.push(()=>spy.mockRestore());return spy;}
it('reviewed adequate technical evidence closes atomically without a model and survives receipt reuse',async()=>{
 const f=await fixture(),model=noLLM();
 const preparation=spyOn(Ticket.prototype,'prepare').mockImplementation(async()=>{throw Error('Verification-only invoked preparation');});restores.push(()=>preparation.mockRestore());
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).toBe('complete');expect(model).not.toHaveBeenCalled();expect(preparation).not.toHaveBeenCalled();
 const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;expect(ticket.lane).toBe('Done');expect(ticket.claim).toBeNull();
 const receipt=(await f.store.getEntity<Artifact>('VERIFY-T',Artifact.dcr))!;expect(receipt).not.toBeNull();expect(JSON.parse(receipt.body!).acceptance.scopeReviews).toBeUndefined();
 expect(await currentTicketReceipt(f.store,ticket)).not.toBeNull();
 const before=receipt.body;expect((await f.resolve()).status).toBe('complete');expect((await f.store.getEntity<Artifact>('VERIFY-T',Artifact.dcr))!.body).toBe(before);
});
for(const mode of ['unbound','changed-contract','changed-source','changed-test','fail','skip'] as const)it('cannot certify inadequate or noncurrent evidence: '+mode,async()=>{
 const f=await fixture({unbound:mode==='unbound',test:mode==='fail'?'fail':mode==='skip'?'skip':undefined});noLLM();
 if(mode==='changed-contract'){const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;await ticket.update({acceptanceCriteria:[...ticket.acceptanceCriteria!,'Negative numbers also work.']});}
 if(mode==='changed-source')fs.appendFileSync(path.join(f.root,'src/add.ts'),'// changed since adequacy review\n');
 if(mode==='changed-test')fs.appendFileSync(path.join(f.root,'tests/add.test.ts'),'// unreviewed change\n');
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).not.toBe('complete');expect((await f.store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
 if(mode==='unbound')expect(JSON.stringify(result)).toContain('Adding 2 and 3 returns 5.');
});
for(const mode of ['pass','fail','unavailable'] as const)it('reviews only the unresolved qualitative Rule: '+mode,async()=>{
 const f=await fixture({rule:true});const contexts:unknown[]=[];
 const model=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(prompt,model)=>{
  if(mode==='unavailable')throw Error('Reviewer offline');
  const context=JSON.parse(prompt.slice(prompt.lastIndexOf('Context: ')+9).split('\n\nPrevious response failed validation:')[0]);contexts.push(context);
  expect(context.dossier.ticket.acceptanceCriteria).toEqual([]);
  return {model,ok:true,text:JSON.stringify({criteria:[],aspects:[],rules:context.dossier.governance.rules.filter((rule:{importance:number})=>rule.importance>=8).map((rule:{ruleId:string;revision:number;fingerprint:string})=>({...rule,verdict:mode==='pass'?'pass':'fail',evidence:'The supplied arithmetic implementation is directly in its public owner.',evidenceIds:['src/add.ts'],limitations:[]}))})};
 });restores.push(()=>model.mockRestore());
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).toBe(mode==='pass'?'complete':'blocked');
 expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)!==null).toBe(mode==='pass');
 if(mode==='unavailable')expect(JSON.stringify(result)).toContain('engineering.direct');else expect(contexts).toHaveLength(1);
});
it('verification-only never rewrites an incomplete work specification',async()=>{
 const f=await fixture({unbound:true});const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;await ticket.update({acceptanceCriteria:[]});noLLM();
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).toBe('needs_input');
 const after=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;expect(after.body).toBe(ticket.body);expect(after.acceptanceCriteria).toEqual([]);expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});

for(const mode of ['contract','expiry','source','binding','sql'] as const)it('preserves coherent completion under concurrent changes: '+mode,async()=>{
 const f=await fixture();noLLM();
 // Mutate at the completion boundary after the verifier has observed passing evidence.
 const original=f.store.completeTicket.bind(f.store);
 const complete=spyOn(f.store,'completeTicket').mockImplementation(async(ticket,owner,admission,body)=>{
  if(mode==='contract'){const latest=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;await latest.update({body:'Concurrent developer contract edit.'});}
  if(mode==='expiry')owner.expiresAt=new Date(0).toISOString();
  if(mode==='source')fs.appendFileSync(path.join(f.root,'src/add.ts'),'// concurrent source mutation\n');
  if(mode==='binding')await f.store.withTestArtifactWrite('test:tests/add.test.ts',async()=>{const test=(await f.store.getEntity<TestNode>('test:tests/add.test.ts',TestNode.dcr))!;await test.update({technicalProofs:[]});});
  if(mode==='sql')f.store.db.exec("CREATE TRIGGER reject_done BEFORE UPDATE ON aiwf_Ticket WHEN json_extract(NEW.data,'$.lane') = 'Done' BEGIN SELECT RAISE(ABORT,'injected completion failure'); END");
  await original(ticket,owner,admission,body);
 });restores.push(()=>complete.mockRestore());
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).toBe('blocked');expect((await f.store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});

for(const mode of ['green','skipped','changed-definition','uncovered-criterion'] as const)it('uses reviewed Story adequacy without weakening its contract: '+mode,async()=>{
 const f=await fixture({unbound:true});const closeReviewer=await productReviewFixture(f.store);
 try{
  await createProduct(f.store,'UserStory',{id:'S',title:'Public addition',actor:'Caller',intent:'Obtain the sum',initialState:'Two numbers are available',action:'Call add(2,3)',expectedResult:'Adding 2 and 3 returns 5.',status:'accepted'});
  await acceptProduct(f.store,[{kind:'product_link',sourceId:'T',predicate:'addresses',targetId:'S'}]);
  const specification={storyId:'S',filePath:'tests/add-story.test.ts',fixturePath:'src/add.ts',interfaceName:'add',body:'expect(subject(2,3)).toBe(5);'};
  for(let attempt=0;attempt<2;attempt++){
   const preview=await f.call('prepare_story_test',{specification});
   const applied=await f.store.withExecutionContext('project-write',undefined,()=>f.call('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint);
   if(applied.status==='linked')break;expect(applied.status).toBe('file-created-unlinked');
  }
  if(mode!=='skipped')await f.call('update_ticket_state',{ticketId:'T',lane:'In Progress'});
  if(mode==='changed-definition')await updateProduct(f.store,'UserStory',{id:'S',expectedResult:'Adding 2 and 3 returns the text five.'});
  if(mode==='uncovered-criterion'){const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;await ticket.update({acceptanceCriteria:[...ticket.acceptanceCriteria!,'Every input is handled within one millisecond.']});}
 }finally{closeReviewer();}
 for(const args of [['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','reviewed public Story test']]){const run=Bun.spawnSync(['git',...args],{cwd:f.root});expect(run.success).toBe(true);}
 const model=noLLM(),before=fs.readFileSync(path.join(f.root,'tests/add-story.test.ts'),'utf8');
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).toBe(mode==='green'?'complete':['uncovered-criterion','changed-definition'].includes(mode)?'blocked':'needs_input');
 expect(fs.readFileSync(path.join(f.root,'tests/add-story.test.ts'),'utf8')).toBe(before);
 expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)!==null).toBe(mode==='green');
 if(mode==='green'){expect(model).not.toHaveBeenCalled();expect(await currentTicketReceipt(f.store,(await f.store.getEntity<Ticket>('T',Ticket.dcr))!)).not.toBeNull();}
 if(mode==='changed-definition'){expect(JSON.stringify(result)).toContain('Story revision changed since test review');expect(model).not.toHaveBeenCalled();}
 if(mode==='uncovered-criterion')expect(JSON.stringify(result)).toContain('Every input is handled within one millisecond.');
},20000);


it('rechecks dependency proof before reusing an otherwise current receipt',async()=>{
 const f=await fixture();noLLM();expect((await f.resolve()).status).toBe('complete');
 const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;
 expect(await currentTicketReceipt(f.store,ticket)).not.toBeNull();
 await f.store.upsertEntity(Ticket.dcr,{id:'DEPENDENCY',title:'Required external work',body:'A separate real prerequisite.',lane:'Todo',acceptanceCriteria:['The prerequisite is independently proven.']});
 await f.store.relate('T','depends_on','DEPENDENCY');
 expect(await currentTicketReceipt(f.store,ticket)).toBeNull();
 const result=await f.resolve();expect(result.status).toBe('blocked');expect(JSON.stringify(result)).toContain('Unresolved prerequisite');
});


it('refuses a binding whose claimed exact source declaration does not exist',async()=>{
 const f=await fixture({unbound:true});noLLM();
 let refusal:unknown;
 try{await f.call('prepare_test_binding',{specification:{ticketId:'T',testId:'test:tests/add.test.ts',scopes:[{id:'public',criteria:['Adding 2 and 3 returns 5.'],testId:'test:tests/add.test.ts',sources:[{filePath:'src/add.ts',symbolName:'missing'}]}]}});}catch(error){refusal=error;}
 expect(refusal).toBeInstanceOf(Error);expect(String(refusal)).toContain('missing');
 expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});
