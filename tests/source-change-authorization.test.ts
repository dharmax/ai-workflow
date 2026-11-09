/** Public source previews bind dirty exceptions to existing host review and Ticket governance. */
import {beforeEach,afterEach,it,expect} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket} from '../src/model/ontology.ts';
import {ensureAstFresh} from '../src/graph/indexer.ts';
import {initializeTools,commandRegistry} from '../src/tools/index.ts';
import {reviewPublicProductChange} from '../src/product/links.ts';
import {closeAllTsLspClients} from '../src/change/ts-lsp.ts';
import {sourceChangeScope} from '../src/ticket/source-scope.ts';
import {SourceManager} from '../src/managers/source-manager.ts';

let root:string,store:WorkflowStore;
const ctx=()=>({store,projectRoot:root,executionAuthority:'project-write' as const});
const request={action:'replace_text' as const,filePath:'a.ts',oldText:'return 1',newText:'return 2'};
const context={ticketId:'EDIT',agentId:'owner',allowDirtyTargets:['a.ts']};
const preview=()=>commandRegistry.execute('source:change preview',{request,...context},ctx());
const input=(fingerprint:string)=>({request,...context,fingerprint,decision:'accept' as const});
async function failure(work:()=>Promise<unknown>,message:string){let error:unknown;try{await work();}catch(e){error=e;}expect(String(error)).toContain(message);}
beforeEach(async()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-dirty-review-'));
 fs.writeFileSync(path.join(root,'a.ts'),'export function value() { return 1; }\n');
 fs.writeFileSync(path.join(root,'b.ts'),'export const unrelated = true;\n');
 for(const args of [['init','-q'],['add','.'],['-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','fixture']])expect(Bun.spawnSync(['git',...args],{cwd:root}).success).toBe(true);
 fs.appendFileSync(path.join(root,'a.ts'),'// existing task work\n');
 fs.appendFileSync(path.join(root,'b.ts'),'// unrelated user work\n');
 store=new WorkflowStore(root);initializeTools();await ensureAstFresh(store,root);
 const ticket=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'EDIT',title:'Change value',body:'Bounded source authorization fixture.',lane:'Todo',acceptanceCriteria:['Preserve existing comments; change return value']});
 await store.relate(ticket,'modifies',(await store.getEntity('a.ts','FileNode'))!);
 await commandRegistry.execute('claim_ticket',{ticketId:'EDIT',agentId:'owner'},ctx());
});
afterEach(async()=>{await closeAllTsLspClients();store.close();fs.rmSync(root,{recursive:true,force:true});});

it('requires host approval, rejects host refusal and applies exactly reviewed dirty effects',async()=>{
 const p=await preview(),before=fs.readFileSync(path.join(root,'a.ts'),'utf8'),unrelated=fs.readFileSync(path.join(root,'b.ts'),'utf8');
 expect(p.allowDirtyTargets).toEqual(['a.ts']);expect(p.dirtyTargetApprovalRequired).toBe(true);
 await failure(()=>commandRegistry.execute('source:change apply',input(p.fingerprint),ctx()),'trusted host approval');
 expect((await reviewPublicProductChange(input(p.fingerprint),ctx())).status).toBe('needs_input');
 expect((await reviewPublicProductChange(input(p.fingerprint),ctx(),async()=>false)).status).toBe('cancelled');
 expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toBe(before);
 const result=await reviewPublicProductChange(input(p.fingerprint),ctx(),async candidate=>{
  const reviewed=candidate as typeof p;expect(reviewed.fingerprint).toBe(p.fingerprint);expect(reviewed.originalHashes).toEqual(p.originalHashes);expect(reviewed.request).toEqual(request);expect(reviewed.allowDirtyTargets).toEqual(['a.ts']);return true;
 });
 expect(result.ok).toBe(true);expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toBe(before.replace('return 1','return 2'));expect(fs.readFileSync(path.join(root,'b.ts'),'utf8')).toBe(unrelated);
});
it('exposes transport-independent manager operations with exact public preview and guarded apply parity',async()=>{
 const first=await preview();
 expect((await reviewPublicProductChange(input(first.fingerprint),ctx(),async()=>true)).ok).toBe(true);
 const manager=new SourceManager({store,projectRoot:root});
 const nextRequest={...request,oldText:'return 2',newText:'return 3'};
 const options={ticketId:'EDIT',agentId:'owner'};
 const direct=await manager.previewSourceChange(nextRequest,options);
 const publicPreview=await commandRegistry.execute('source:change preview',{request:nextRequest,...options},ctx());
 expect(direct).toEqual(publicPreview);
 expect(direct.dirtyTargetApprovalRequired).toBe(false);
 const result=await manager.applySourceChange(nextRequest,direct.fingerprint,options);
 expect(result.ok&&result.verification.passed).toBe(true);
 expect(result.fingerprint).toBe(direct.fingerprint);
 expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toContain('return 3');
 const {scope}=await sourceChangeScope(store,'EDIT','owner');
 expect(scope.effects.at(-1)?.fingerprint).toBe(direct.fingerprint);
});

it('manager refuses source apply without active Ticket ownership or trusted host source permission',async()=>{
 const manager=new SourceManager({store,projectRoot:root});
 await failure(()=>manager.applySourceChange(request,'forged',{}),'ticketId');
 const denied=new SourceManager({store,projectRoot:root,codeMutationAllowed:false});
 const p=await denied.previewSourceChange(request,context);
 await failure(()=>denied.applySourceChange(request,p.fingerprint,context),'forbidden by the host');
 expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toContain('return 1');
});

it('rejects unauthorized, duplicate and extraneous targets without broadening Ticket scope',async()=>{
 await failure(()=>commandRegistry.execute('preview_change',{...request,ticketId:'EDIT',agentId:'owner'},ctx()),'Dirty target');
 await failure(()=>commandRegistry.execute('source:change preview',{request,...context,allowDirtyTargets:['a.ts','./a.ts']},ctx()),'Duplicate');
 await failure(()=>commandRegistry.execute('source:change preview',{request,...context,allowDirtyTargets:['b.ts']},ctx()),'outside preview');
 await failure(()=>commandRegistry.execute('source:change preview',{request:{action:'replace_text',filePath:'b.ts',oldText:'true',newText:'false'},...context,allowDirtyTargets:['b.ts']},ctx()),'Scope expansion');
});
it('binds the target set, content, lease owner and Ticket scope to the fingerprint',async()=>{
 const p=await preview();
 await failure(()=>commandRegistry.execute('apply_change',{...input(p.fingerprint),allowDirtyTargets:[]},ctx()),'Stale');
 await failure(()=>commandRegistry.execute('apply_change',{...input(p.fingerprint),agentId:'intruder'},ctx()),'lease');
 const ticket=(await store.getEntity<Ticket>('EDIT',Ticket.dcr))!;await store.upsertEntity(Ticket.dcr,{...ticket,title:'Changed scope'});
 await failure(()=>reviewPublicProductChange(input(p.fingerprint),ctx(),async()=>{throw Error('must not review stale scope');}),'Stale');
});
it('rechecks content after host review and never applies a stale approval',async()=>{
 const p=await preview();
 await failure(()=>reviewPublicProductChange(input(p.fingerprint),ctx(),async candidate=>{
  expect((candidate as typeof p).fingerprint).toBe(p.fingerprint);fs.appendFileSync(path.join(root,'a.ts'),'// concurrent user edit\n');return true;
 }),'Stale');
 expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toContain('return 1');
});
it('rejects a changed governed scope revision before asking the host again',async()=>{
 const {ticket,scope}=await sourceChangeScope(store,'EDIT','owner');
 const admission=await store.admitGovernance('governed');
 try{await store.saveGovernedScope('EDIT',ticket.claim!,admission,scope);}finally{await store.releaseGovernance(admission);}
 const p=await preview();
 const next=await store.admitGovernance('governed');
 try{await store.saveGovernedScope('EDIT',ticket.claim!,next,{...scope,revision:scope.revision+1});}finally{await store.releaseGovernance(next);}
 await failure(()=>reviewPublicProductChange(input(p.fingerprint),ctx(),async()=>{throw Error('must not review stale revision');}),'Stale');
});
it('adopts a reviewed dirty file and reuses its latest recorded effect without another review',async()=>{
 const first=await preview();
 expect((await reviewPublicProductChange(input(first.fingerprint),ctx(),async()=>true)).ok).toBe(true);
 const nextRequest={...request,oldText:'return 2',newText:'return 3'};
 const next=await commandRegistry.execute('source:change preview',{request:nextRequest,...context},ctx());
 expect(next.dirtyTargetApprovalRequired).toBe(false);
 const applied=await reviewPublicProductChange({request:nextRequest,...context,fingerprint:next.fingerprint,decision:'accept'},ctx());
 expect(applied.ok).toBe(true);
 expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toContain('return 3');
 expect(fs.readFileSync(path.join(root,'b.ts'),'utf8')).toContain('// unrelated user work');
 fs.appendFileSync(path.join(root,'a.ts'),'// another user edit\\n');
 await ensureAstFresh(store,root);
 const third={...request,oldText:'return 3',newText:'return 4'};
 await failure(()=>commandRegistry.execute('source:change preview',{request:third,ticketId:'EDIT',agentId:'owner'},ctx()),'Unexpected concurrent source modification');
});
it('rejects read-only callers and client-supplied approval fields',async()=>{
 const p=await preview();
 await failure(()=>reviewPublicProductChange(input(p.fingerprint),{...ctx(),executionAuthority:'read-only'},async()=>true),'read-only');
 await failure(()=>commandRegistry.execute('source:change apply',{...input(p.fingerprint),approved:true},ctx()),'Unrecognized');
 expect(fs.readFileSync(path.join(root,'a.ts'),'utf8')).toContain('return 1');
});
