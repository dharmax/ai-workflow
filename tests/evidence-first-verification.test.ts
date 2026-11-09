import {closeAllTsLspClients} from '../src/services/typescript/ts-lsp.ts';
import {afterEach,expect,it,spyOn} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CompletionEngine} from '@dharmax/llm-utils';
import {WorkflowStore} from '../src/graph/store.ts';
import type {AbstractEntity} from '@dharmax/semantika';
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
 if(mode==='green'){
  expect(model).not.toHaveBeenCalled();expect(await currentTicketReceipt(f.store,(await f.store.getEntity<Ticket>('T',Ticket.dcr))!)).not.toBeNull();
  await f.call('update_ticket_state',{ticketId:'T',lane:'Todo'});const commands=observeChecks();
  const reused=await f.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none'});
  expect(reused.status,JSON.stringify(reused)).toBe('complete');expect(commands).toEqual([]);expect(model).not.toHaveBeenCalled();
 }
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

function observeChecks(){
 const commands:string[]=[];
 const execute=commandRegistry.execute.bind(commandRegistry);
 const spy=spyOn(commandRegistry,'execute').mockImplementation(async(name,args,ctx)=>{
  if(name==='run_command')commands.push((args as {command:string}).command);
  return execute(name,args,ctx);
 });restores.push(()=>spy.mockRestore());return commands;
}
for(const command of [['bun','test','tests/add.test.ts'],['bun','test']])it('reuses current proof from '+command.join(' ')+' when closing a reopened technical Ticket',async()=>{
 const f=await fixture();noLLM();expect((await f.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none',testCommands:[command]})).status).toBe('complete');
 await f.call('update_ticket_state',{ticketId:'T',lane:'Todo'});
 const commands=observeChecks();
 const result=await f.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none'});
 expect(result.status,JSON.stringify(result)).toBe('complete');expect(commands).toEqual([]);
});
it('reusing proof does not rehash unrelated TestNode executions',async()=>{
 const f=await fixture();noLLM();
 fs.writeFileSync(path.join(f.root,'tests/unrelated.test.ts'),"import {it,expect} from 'bun:test';it('unrelated',()=>expect(true).toBe(true));\n");
 await indexCodebase(f.store,f.root);expect((await f.resolve()).status).toBe('complete');
 await f.call('update_ticket_state',{ticketId:'T',lane:'Todo'});
 let unrelatedReads=0;const read=f.store.getEntity.bind(f.store);
 const spy=spyOn(f.store,'getEntity').mockImplementation(async <T extends AbstractEntity = AbstractEntity>(...args:Parameters<WorkflowStore['getEntity']>)=>{
  const entity=await read<T>(...args);
  if(entity instanceof TestNode && f.store.localId(entity.id)==='test:tests/unrelated.test.ts'){
   const hashes=entity.executionHashes;Object.defineProperty(entity,'executionHashes',{get:()=>{unrelatedReads++;return hashes;}});
  }
  return entity;
 });
 restores.push(()=>spy.mockRestore());
 const result=await f.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none'});
 expect(result.status,JSON.stringify(result)).toBe('complete');expect(unrelatedReads).toBe(0);
});
it('reports the affected source and missing proof without running an unrelated suite',async()=>{
 const f=await fixture({unbound:true});noLLM();
 fs.writeFileSync(path.join(f.root,'src/maintenance.ts'),'export const configuration = 1;\n');
 await indexCodebase(f.store,f.root);await f.store.unrelate('T','modifies','src/add.ts');await f.store.relate('T','modifies','src/maintenance.ts');
 const commands=observeChecks();
 const result=await f.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none'});
 expect(result.status,JSON.stringify(result)).toBe('needs_input');expect(JSON.stringify(result)).toContain('src/maintenance.ts');expect(commands).toEqual([]);
});
it('an unrelated passing requested test cannot provide missing affected-behavior proof',async()=>{
 const f=await fixture({unbound:true});noLLM();
 fs.writeFileSync(path.join(f.root,'src/maintenance.ts'),'export const configuration = 1;\n');
 await indexCodebase(f.store,f.root);await f.store.unrelate('T','modifies','src/add.ts');await f.store.relate('T','modifies','src/maintenance.ts');
 const result=await f.resolve();expect(result.status,JSON.stringify(result)).toBe('needs_input');expect(JSON.stringify(result)).toContain('src/maintenance.ts');
 expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});
for(const required of [false,true])it('a release journey gates a technical Ticket only when required: '+required,async()=>{
 const f=await fixture();noLLM();const close=await productReviewFixture(f.store);
 try{await createProduct(f.store,'Epic',{id:'RELEASE',title:'Live release acceptance',body:'Six live journeys remain unexecuted.',status:'active'});}
 finally{close();}
 await f.store.relate('RELEASE','contains','T');

 // An unexecuted release check must remain visible without becoming this fix's proof.
 fs.writeFileSync(path.join(f.root,'tests/release.test.ts'),"import {it} from 'bun:test';it('live journey',()=>{throw Error('live environment unavailable')});\n");
 await indexCodebase(f.store,f.root);await f.store.withTestArtifactWrite('test:tests/release.test.ts',()=>f.store.relate('test:tests/release.test.ts','verifies','RELEASE'));
 if(required){const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;await ticket.update({acceptanceCriteria:[...ticket.acceptanceCriteria!,'The live journey passes.']});}
 const scopes=[{id:'public',criteria:['Adding 2 and 3 returns 5.'],testId:'test:tests/add.test.ts',sources:[{filePath:'src/add.ts'}]}];
 if(required)scopes.push({id:'live',criteria:['The live journey passes.'],testId:'test:tests/release.test.ts',sources:[{filePath:'src/add.ts'}]});
 const specification={ticketId:'T',testId:'test:tests/add.test.ts',scopes};
 const preview=await f.call('prepare_test_binding',{specification});
 await f.store.withExecutionContext('project-write',undefined,()=>f.call('apply_test_binding',{specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint);
 const commands=observeChecks();const result=await f.resolve();
 expect(result.status,JSON.stringify(result)).toBe(required?'blocked':'complete');expect(commands.some(command=>command.includes('release.test.ts'))).toBe(required);
 const live=(await f.store.getEntity<TestNode>('test:tests/release.test.ts',TestNode.dcr))!;
 if(required)expect(live.passed).toBe(false);else expect(live.lastRun).toBeUndefined();
});
it('shared affected behavior selects every dependent check, including a failing consumer',async()=>{
 const f=await fixture();noLLM();
 fs.writeFileSync(path.join(f.root,'src/consumer.ts'),"import {add} from './add.ts';export const total=()=>add(2,3);\n");
 fs.writeFileSync(path.join(f.root,'tests/consumer.test.ts'),"import {it,expect} from 'bun:test';import {total} from '../src/consumer.ts';it('shared caller',()=>expect(total()).toBe(6));\n");
 await indexCodebase(f.store,f.root);
 const commands=observeChecks();const result=await f.resolve();
 expect(result.status,JSON.stringify(result)).toBe('blocked');expect(commands.some(command=>command.includes('consumer.test.ts'))).toBe(true);
 expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});
it('missing proof stops ordinary resolution without speculative implementation repair',async()=>{
 const f=await fixture({unbound:true});noLLM();
 fs.writeFileSync(path.join(f.root,'src/maintenance.ts'),'export const configuration = 1;\n');
 await indexCodebase(f.store,f.root);await f.store.unrelate('T','modifies','src/add.ts');await f.store.relate('T','modifies','src/maintenance.ts');
 const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;
 const dossier=await ticket.investigate(f.store,{mandatoryEvidenceOnly:true});expect(dossier.status).toBe('complete');
 if(dossier.status!=='complete')return;
 const prepare=spyOn(Ticket.prototype,'prepare').mockResolvedValue({status:'complete',artifactId:'T',value:{dossier:dossier.value,children:[],created:[],reused:[],applied:false,criticRounds:0,rationale:'Existing bounded maintenance contract.'}});
 restores.push(()=>prepare.mockRestore());let implementations=0,reviews=0;
 const result=await ticket.resolve(f.store,{maxRepairs:3,depth:0,critic:'none',implement:async()=>{implementations++;return {changes:[],testCommands:[]};},verify:async()=>{reviews++;throw Error('Missing proof cannot reach acceptance');}});
 expect(result.status,JSON.stringify(result)).toBe('needs_input');expect(JSON.stringify(result)).toContain('src/maintenance.ts');
 expect(implementations).toBe(1);expect(reviews).toBe(0);expect(await f.store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});
it('technical maintenance can use an actual compiler check and substantive source acceptance',async()=>{
 const f=await fixture({unbound:true});
 fs.writeFileSync(path.join(f.root,'src/maintenance.ts'),'export const configuration: number = 1;\n');
 fs.writeFileSync(path.join(f.root,'package.json'),JSON.stringify({scripts:{typecheck:'tsc --noEmit --skipLibCheck --target esnext --module esnext --moduleResolution bundler src/maintenance.ts'}}));
 await indexCodebase(f.store,f.root);await f.store.unrelate('T','modifies','src/add.ts');await f.store.relate('T','modifies','src/maintenance.ts');
 const ticket=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;await ticket.update({acceptanceCriteria:['The numeric configuration remains a valid exported number.']});
 const model=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(prompt,model)=>{
  expect(prompt).toContain('configuration: number = 1');expect(prompt).toContain('typecheck');
  return {model,ok:true,text:JSON.stringify({criteria:[{criterion:'The numeric configuration remains a valid exported number.',passed:true,evidence:'Current exported numeric declaration and passing real TypeScript compilation establish this maintenance contract.'}],aspects:[],rules:[]})};
 });restores.push(()=>model.mockRestore());
 const result=await f.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,depth:0,critic:'none',testCommands:[['bun','run','typecheck']]});
 expect(result.status,JSON.stringify(result)).toBe('complete');expect(model).toHaveBeenCalledTimes(1);
 const after=(await f.store.getEntity<Ticket>('T',Ticket.dcr))!;expect(await currentTicketReceipt(f.store,after)).not.toBeNull();
 const receipt=(await f.store.getEntity<Artifact>('VERIFY-T',Artifact.dcr))!;expect(JSON.parse(receipt.body!).testNodes).toEqual([]);
 fs.appendFileSync(path.join(f.root,'package.json'),'\n');expect(await currentTicketReceipt(f.store,after)).toBeNull();
},20000);

it.skipIf(process.env.AIWF_LIVE_REVIEWER !== '1')('public Ticket verification calls a real normal reviewer for a qualitative rule', async () => {
const {withAcceptedGreetingStory}=await import('./us/fixtures/greeting-project.ts');
const {saveConfig}=await import('../src/services/config-service.ts');
const {spawnSync}=await import('node:child_process');
await withAcceptedGreetingStory(async ({root,ctx})=>{
 saveConfig(root,{modelRoutes:{critic:'ollama/qwen2.5-coder:7b'}});
 const call=(name:string,args:unknown)=>commandRegistry.execute(name,args,ctx);
 fs.writeFileSync(root+'/src/greeting.ts',"export function greet(name: string): string { return 'Hello, ' + name.toUpperCase() + '!'; }\n");
 await indexCodebase(ctx.store,root);
 await call('create_ticket',{id:'LIVE-VERIFY',title:'Verify the greeting implementation',body:'Preserve the current greeting.',acceptanceCriteria:["Calling greet('Ada') returns 'Hello, ADA!'."]});
 await ctx.store.relate('LIVE-VERIFY','modifies','src/greeting.ts');
 await new RuleStore(ctx.store).saveRule({id:'direct',ruleId:'engineering.fixture-direct',title:'Direct greeting',scope:{kind:'universal'},type:'architecture',importance:10,rule:'Keep the greeting implementation direct and readable.',status:'active',revision:1,provenance:'fixture',examples:[],references:[],test:{kind:'llm'}});
 const specification={ticketId:'LIVE-VERIFY',testId:'test:tests/public-contract.test.ts',scopes:[{id:'greeting',criteria:["Calling greet('Ada') returns 'Hello, ADA!'."],testId:'test:tests/public-contract.test.ts',sources:[{filePath:'src/greeting.ts'}]}]};
 const preview=await call('prepare_test_binding',{specification}); expect(preview.status).toBe('review');
 const linked=await ctx.store.withExecutionContext('project-write',undefined,()=>call('apply_test_binding',{specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint);expect(linked.status).toBe('bound');
 expect((await call('claim_ticket',{ticketId:'GREET-TICKET',agentId:'fixture'})).success).toBe(true);
 expect((await call('run_story_test',{storyId:'GREET-USER'})).status).toBe('green');
 for(const args of [['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','test']]){const p=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(p.status)throw Error(p.stderr)}
 let calls=0, responses=0; const originalFetch=globalThis.fetch;
 const fetchSpy=spyOn(globalThis,'fetch').mockImplementation((async (input,init)=>{
  const url=String(input);
  if(url.includes('/api/chat') || url.includes('/api/generate')){
   const request=JSON.parse(String(init?.body));expect(request.model).toBe('qwen2.5-coder:7b');calls++;
  }
  const response=await originalFetch(input,init);
  if((url.includes('/api/chat') || url.includes('/api/generate')) && response.ok) { const data=await response.clone().json() as {message?:{content?:string};response?:string}; if(data.message?.content || data.response) responses++; }
  return response;
 }) as typeof fetch);
 try{const result=await call('resolve_ticket',{ticketId:'LIVE-VERIFY',verifyOnly:true,maxRepairs:0,depth:0,critic:'none',testCommands:[['bun','test','tests/public-contract.test.ts']]});console.info('Live Ticket reviewer result:', JSON.stringify(result)); expect(calls).toBeGreaterThan(0); expect(responses).toBeGreaterThan(0); const history=JSON.stringify(await call('get_ticket_history',{ticketId:'LIVE-VERIFY'})); expect(history).toContain('ollama/qwen2.5-coder:7b'); if(result.status==='blocked'){expect(JSON.stringify(result)).toContain('engineering.fixture-direct');expect(await ctx.store.getEntity('VERIFY-LIVE-VERIFY')).toBeNull();} else expect(result.status,JSON.stringify(result)).toBe('complete');}
 finally{fetchSpy.mockRestore();}
});
},180000);
