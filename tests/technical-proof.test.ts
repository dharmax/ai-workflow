import {afterEach,expect,it,spyOn} from 'bun:test';
import {parseCommand,artifactCommand} from '../src/artifact-command.ts';
import {RuleStore} from '../src/rules/store.ts';
import {createAspect} from './product-review.ts';
import {CompletionEngine} from '@dharmax/llm-utils';
import {currentTestEvidence} from '../src/graph/test-artifacts.ts';
import {assertTechnicalReviews} from '../src/graph/technical-proof.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket,TestNode,Artifact} from '../src/model/ontology.ts';
import {indexCodebase} from '../src/graph/indexer.ts';
import {initializeTools,commandRegistry} from '../src/tools/index.ts';

const roots:string[]=[];
const stores:WorkflowStore[]=[];
afterEach(()=>{for(const store of stores.splice(0))store.close();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
async function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-technical-proof-'));roots.push(root);
 fs.mkdirSync(path.join(root,'tests'));fs.mkdirSync(path.join(root,'src'));
 fs.writeFileSync(path.join(root,'src/add.ts'),'export function add(a:number,b:number){return a+b;}\n');
 fs.writeFileSync(path.join(root,'tests/add.test.ts'),'import {it,expect} from "bun:test";import {add} from "../src/add";it("public sums",()=>expect(add(2,3)).toBe(5));\n');
 const store=new WorkflowStore(root);stores.push(store);await indexCodebase(store,root);initializeTools();
 await store.upsertEntity(Ticket.dcr,{id:'T',title:'Technical arithmetic proof',body:'Preserve public arithmetic',lane:'Todo',acceptanceCriteria:['public sums']});
 await store.relate('T','modifies','src/add.ts');
 const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
 const call=(name:string,args:unknown)=>commandRegistry.execute(name,args,ctx);
 const specification={ticketId:'T',testId:'test:tests/add.test.ts',scopes:[{id:'public',criteria:['public sums'],testId:'test:tests/add.test.ts',sources:[{filePath:'src/add.ts',symbolName:'add'}]}]};
 return {root,store,call,specification};
}
it('reviews a current technical binding through public operations and preserves its TestNode identity after reopen',async()=>{
 const {root,store,call,specification}=await fixture();
 const before=(await store.getEntity<TestNode>(specification.testId,TestNode.dcr))!;
 const preview=await call('prepare_test_binding',{specification});expect(preview.status).toBe('review');
 expect(await store.getIncoming('T','verifies')).toHaveLength(0);
 const unauthorized=await call('apply_test_binding',{specification,fingerprint:preview.fingerprint,decision:'accept'});
 expect(unauthorized.status).toBe('review_required');
 const result=await store.withExecutionContext('project-write',undefined,()=>call('apply_test_binding',{specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint);
 expect(result.status).toBe('bound');
 store.close();const reopened=new WorkflowStore(root);stores.push(reopened);
 const after=(await reopened.getEntity<TestNode>(specification.testId,TestNode.dcr))!;
 expect(after.id).toBe(before.id);expect(after.version).toBeGreaterThan(before.version);
 expect(after.technicalProofs![0].ticketId).toBe('T');
 expect(await reopened.getIncoming('T','verifies')).toHaveLength(1);
 expect(await reopened.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
});
it('refuses stale review and generic TestNode proof writes and links',async()=>{
 const {root,store,call,specification}=await fixture();
 const preview=await call('prepare_test_binding',{specification});
 fs.appendFileSync(path.join(root,'src/add.ts'),'// changed\n');
 await expect(store.withExecutionContext('project-write',undefined,()=>call('apply_test_binding',{specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint)).rejects.toThrow('Stale');
 const test=(await store.getEntity<TestNode>(specification.testId,TestNode.dcr))!;
 await expect(test.update({technicalProofs:[{ticketId:'T'}]})).rejects.toThrow('Test proof');
 await expect(store.relate(test,'verifies',(await store.getEntity<Ticket>('T',Ticket.dcr))!)).rejects.toThrow('Test proof');
});

async function bind(f:Awaited<ReturnType<typeof fixture>>){
 const preview=await f.call('prepare_test_binding',{specification:f.specification});
 return f.store.withExecutionContext('project-write',undefined,()=>f.call('apply_test_binding',{specification:f.specification,fingerprint:preview.fingerprint,decision:'accept'}),preview.fingerprint);
}
function commitFixture(root:string){
 fs.symlinkSync(path.resolve(import.meta.dir,'../node_modules'),path.join(root,'node_modules'));
 fs.writeFileSync(path.join(root,'.gitignore'),'node_modules\n.ai-workflow\n*.md\n');
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']]){
  const result=Bun.spawnSync(['git',...args],{cwd:root});if(!result.success)throw Error(result.stderr.toString());
 }
}
for(const mode of ['accept','inconclusive','changed-local','changed-dependency','failed-dependency','sql-failure','rule-inconclusive','aspect-missing'] as const)
it('native technical scopes retain regression execution and dependency ownership: '+mode,async()=>{
 const local=await fixture(),dependency=await fixture();
 // One physical local test has two semantic scopes. A dependency keeps its own test and evidence.
 local.specification.scopes.push({...local.specification.scopes[0],id:'completion',sources:[...local.specification.scopes[0].sources,{filePath:'src/add.ts',symbolName:'add',projectRoot:dependency.root} as typeof local.specification.scopes[0]['sources'][number]]});
 local.specification.scopes.push({...local.specification.scopes[0],id:'dependency',projectRoot:dependency.root} as typeof local.specification.scopes[number]);
 if(mode==='failed-dependency')fs.writeFileSync(path.join(dependency.root,'src/add.ts'),'export function add(a:number,b:number){return a-b;}\n');
 fs.writeFileSync(path.join(local.root,'tests/regression.test.ts'),'import {it,expect} from "bun:test";import {add} from "../src/add";it("regression",()=>expect(add(-2,3)).toBe(1));\n// REGRESSION_SOURCE_MUST_NOT_REACH_REVIEW '+ 'x'.repeat(70000));
 await indexCodebase(local.store,local.root);
 if(mode==='rule-inconclusive')await new RuleStore(local.store).saveRule({id:'direct',ruleId:'engineering.direct',title:'Direct arithmetic',scope:{kind:'universal'},type:'architecture',importance:10,rule:'Keep arithmetic in its existing public owner.',status:'active',revision:1,provenance:'fixture',examples:[],references:[],test:{kind:'llm'}});
 if(mode==='aspect-missing'){const aspect=await createAspect(local.store,{id:'A',title:'Arithmetic truth',status:'accepted',acceptanceCriteria:['Evidence reflects actual sums']});await local.store.relate('T','addresses',aspect);}
 await bind(local);
 commitFixture(local.root);commitFixture(dependency.root);
 if(mode==='sql-failure')local.store.db.exec("CREATE TRIGGER reject_done BEFORE UPDATE ON aiwf_Ticket WHEN json_extract(NEW.data,'$.lane') = 'Done' BEGIN SELECT RAISE(ABORT,'injected completion failure'); END");
 const contexts:Array<Record<string,any>>=[];
 const completion=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(prompt,model)=>{
  if(!prompt.includes('Independently verify EVERY'))throw Error('Implementation Actor invoked in verify-only');
  expect(prompt).not.toContain('REGRESSION_SOURCE_MUST_NOT_REACH_REVIEW');
  const context=JSON.parse(prompt.slice(prompt.lastIndexOf('Context: ')+9).split('\n\nPrevious response failed validation:')[0]);
  contexts.push(context);
  expect(context.testNodes.some((test:{filePath:string;passed:boolean})=>test.filePath==='tests/regression.test.ts'&&test.passed),JSON.stringify(context.testNodes)).toBe(true);
  const refused=mode==='inconclusive'&&context.scope?.id==='completion';
  if(context.scope?.id==='dependency'&&mode.startsWith('changed-'))
   fs.appendFileSync(path.join(mode==='changed-local'?local.root:dependency.root,'src/add.ts'),'// changed during review\n');
  return {model,ok:true,text:JSON.stringify({criteria:context.dossier.ticket.acceptanceCriteria.map((criterion:string)=>({criterion,passed:!refused,evidence:refused?'Missing independent evidence':'Actual public sums assertion, passing owner execution and supplied add source agree.'})),aspects:[],rules:context.dossier.governance.rules.map((rule:{ruleId:string;revision:number;fingerprint:string})=>({ruleId:rule.ruleId,revision:rule.revision,fingerprint:rule.fingerprint,verdict:mode==='rule-inconclusive'&&context.scope?.id==='completion'?'inconclusive':'pass',evidence:'Supplied current arithmetic owner and public assertions.',evidenceIds:['src/add.ts'],limitations:[]}))})};
 });
 try{
  const result=await local.call('resolve_ticket',{ticketId:'T',verifyOnly:true,maxRepairs:0,critic:'none',depth:0,maxArtifacts:4,testCommands:[['bun','test']]});
  if(mode==='accept')expect(result.status,JSON.stringify(result)).toBe('complete');else expect(result.status,JSON.stringify(result)).toBe('blocked');
  expect((await local.store.getEntity<Ticket>('T',Ticket.dcr))!.claim).toBeNull();
  const receipt=await local.store.getEntity<Artifact>('VERIFY-T',Artifact.dcr);
  expect(!!receipt).toBe(mode==='accept');
  expect((await local.store.getIncoming('T','verifies')).filter(edge=>edge.sourceId.includes('VERIFY-T'))).toHaveLength(mode==='accept'?1:0);
  const external=(await currentTestEvidence(dependency.store,['test:tests/add.test.ts']))[0];
  expect(external.passed).toBe(!['failed-dependency','changed-dependency'].includes(mode));
  expect(await local.store.listEntities(TestNode.dcr)).toHaveLength(2);
  if(mode==='accept'){
   expect(contexts).toHaveLength(4);
   expect(contexts.find(context=>context.scope?.id==='completion')!.code.map((file:{projectRoot:string})=>file.projectRoot)).toContain(dependency.root);
   expect(contexts.filter(context=>context.scope).map(context=>context.scope.id)).toEqual(['public','completion','dependency']);
   const body=JSON.parse(receipt!.body!);expect(body.testNodes).toHaveLength(2);expect(body.acceptance.scopeReviews).toHaveLength(3);
   expect(body.acceptance.scopeReviews.every((scope:{characters:number})=>scope.characters<64000)).toBe(true);
   local.store.close();const reopened=new WorkflowStore(local.root);stores.push(reopened);
   expect((await reopened.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Done');
   await assertTechnicalReviews(reopened,'T',body.acceptance);
   // Missing structured review and missing execution cannot be replaced by three stored accept strings.
   await expect(assertTechnicalReviews(reopened,'T',{...body.acceptance,scopeReviews:[]})).rejects.toThrow('Missing independently');
   await dependency.store.withTestArtifactWrite('test:tests/add.test.ts',async()=>{
    const test=(await dependency.store.getEntity<TestNode>('test:tests/add.test.ts',TestNode.dcr))!;await test.update({passed:false});
   });
   await expect(assertTechnicalReviews(reopened,'T',body.acceptance)).rejects.toThrow('execution');
  }else{
   const causes={'inconclusive':'Independent technical scope refused: completion','changed-local':'Stale technical binding: source or TestNode changed in public','changed-dependency':'Stale technical binding: source or TestNode changed in completion','failed-dependency':'Dependency-owned technical execution refused','sql-failure':'injected completion failure','rule-inconclusive':"Mandatory Rule 'engineering.direct': inconclusive",'aspect-missing':'Missing Aspect assessment: A'};
   expect(JSON.stringify(result)).toContain(causes[mode]);
   if(mode==='aspect-missing')expect(contexts).toHaveLength(2);
   const reopened=new WorkflowStore(local.root);stores.push(reopened);
   expect((await reopened.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
   expect(await reopened.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
  }
 }finally{completion.mockRestore();}
},30000);


it('local CLI/Shell review fingerprint is absent from Actor adaptation',async()=>{
 const {specification}=await fixture();const args=['test-binding','apply',JSON.stringify(specification),'--fingerprint','current','--yes'];
 const local=await parseCommand(args);expect(local.family).toBe('artifact');
 expect(local).toHaveProperty('reviewFingerprint','current');
 const actor=await artifactCommand(args);expect(actor?.tool).toBe('apply_test_binding');
 expect(actor).not.toHaveProperty('reviewFingerprint');
});
