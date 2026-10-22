import {productReviewFixture} from './product-review-fixture.ts';
import {createProduct,acceptProduct,updateProduct,reviewedApply} from './product-review.ts';
import {describe,it,expect,afterEach} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {initializeTools,registry} from '../src/tools/index.ts';
import {UserStory,Ticket,Epic,TestNode,FileNode} from '../src/graph/ontology.ts';
import {indexSingleFile} from '../src/graph/indexer.ts';
import {chromium,type Browser} from 'playwright';
import {startWorkspace} from '../src/workspace/server.ts';
describe('S4 reviewed derivation through Workspace',()=>{
 let stopReviewer:(()=>void)|undefined;
 let root:string,store:WorkflowStore,browser:Browser,host:ReturnType<typeof startWorkspace>;
 const call=(name:string,params:unknown)=>registry.execute(name,params,{store,projectRoot:root,executionAuthority:'project-write' as const});
 afterEach(async()=>{
  stopReviewer?.();stopReviewer=undefined;
  await browser?.close();browser=undefined as any;
  host?.server.stop(true);host=undefined as any;
  store?.close();store=undefined as any;
  if(root){fs.rmSync(root,{recursive:true,force:true});root=undefined as any;}
 });
 it('DW-03 proposes complete reviewed Stories, Epic and scoped work without mutations',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s4-'));store=new WorkflowStore(root);initializeTools();
  stopReviewer=await productReviewFixture(store);
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/avatar.ts'),"export function saveAvatar(file:string,value:string){return {file,value}}");
  await indexSingleFile(store,path.join(root,'src/avatar.ts'),'src/avatar.ts',root);
  await createProduct(store, "Feature", {id:'F',title:'Avatar Filters',body:'Preview and save filtered avatars',status:'accepted',priority:1});
  host=startWorkspace({store,projectRoot:root,executionAuthority:'project-write' as const});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.setDefaultTimeout(3000);
  await page.goto(host.url);await page.getByRole('button',{name:'Avatar Filters',exact:true}).click();
  await page.getByRole('button',{name:'Derive work',exact:true}).click();
  await page.getByLabel('Work proposal JSON',{exact:true}).fill(JSON.stringify({
   items:[
    {id:'E',kind:'Epic',title:'Deliver Avatar Filters',body:'Deliver reviewed preview and save',priority:1},
    {id:'S',kind:'UserStory',title:'Save filtered avatar',actor:'Signed-in user',intent:'Keep the preview',initialState:'Unsaved filtered preview and previous avatar',action:'Activate Save',expectedResult:'Saved avatar survives reload',exceptions:'Failure preserves previous avatar'},
    {id:'T',kind:'Ticket',title:'Implement Save',body:'Implement the public avatar save API',priority:'P1',storyIds:['S'],scopeIds:['src/avatar.ts']}
   ],rationale:'Deliver accepted intent'}));
  await page.getByRole('button',{name:'Prepare work proposal',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  expect(await store.getEntity('S')).toBeNull();expect(await store.getEntity('T')).toBeNull();
  await page.getByLabel('Action',{exact:true}).fill('Activate Save once');
  await page.getByLabel('Definition status',{exact:true}).selectOption('accepted');
  await page.getByRole('button',{name:'Update review',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  await page.getByRole('button',{name:'Accept and save',exact:true}).click();
  await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
  expect((await store.getEntity<UserStory>('S',UserStory.dcr))?.action).toBe('Activate Save once');
  expect((await store.listEntities(Epic.dcr)).length).toBe(1);expect((await store.listEntities(Ticket.dcr)).length).toBe(1);
  expect((await store.getOutgoing('T','addresses')).map(e=>store.localId(e.targetId))).toEqual(['S']);
  const work=JSON.parse(await page.getByLabel('Work proposal JSON',{exact:true}).inputValue());
  // Repeat accepted intent through the same Workspace operation; identity and definition survive.
  await page.getByRole('button',{name:'Avatar Filters',exact:true}).click();
  await page.getByRole('button',{name:'Derive work',exact:true}).click();
  await page.getByLabel('Work proposal JSON',{exact:true}).fill(JSON.stringify(work));
  await page.getByRole('button',{name:'Prepare work proposal',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  await page.getByRole('button',{name:'Accept and save',exact:true}).click();
  await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
  expect((await store.listEntities(UserStory.dcr)).length).toBe(1);
  expect((await store.getEntity<UserStory>('S',UserStory.dcr))?.action).toBe('Activate Save once');
  await page.getByRole('button',{name:'Avatar Filters',exact:true}).click();
  await page.getByLabel('Priority',{exact:true}).fill('2');
  await page.getByLabel('Description',{exact:true}).fill('Preview and save filters, preserving the previous avatar on failure');
  await page.getByRole('button',{name:'Review changes',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  await page.getByRole('button',{name:'Accept and save',exact:true}).click();
  await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
  work.items[2].revise=true;work.items[2].priority='P0';work.items[2].body='Implement reviewed save and failure preservation';
  await page.getByRole('button',{name:'Derive work',exact:true}).click();
  await page.getByLabel('Work proposal JSON',{exact:true}).fill(JSON.stringify(work));
  await page.getByRole('button',{name:'Prepare work proposal',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  expect(await page.getByTestId('diff').innerText()).toContain('P0');
  expect((await call('get_ticket',{ticketId:'T'})).priority).toBe('P1');
  await page.getByRole('button',{name:'Accept and save',exact:true}).click();
  await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
  expect((await call('get_ticket',{ticketId:'T'})).priority).toBe('P0');
  expect((await store.listEntities(Ticket.dcr)).length).toBe(1);
  expect((await store.listEntities(Epic.dcr)).length).toBe(1);
  // The real fixture is an executable filesystem API, not a mocked test of specification strings.
  fs.writeFileSync(path.join(root,'src/avatar.ts'),`import fs from 'node:fs';
export function createAvatar(file:string) {
 return {save(value:string){fs.writeFileSync(file,value)},reload(){return fs.readFileSync(file,'utf8')}};
}`);
  await page.getByRole('button',{name:'Save filtered avatar',exact:true}).click();
  await page.getByRole('button',{name:'Specify Story test',exact:true}).click();
  const specification={storyId:'S',filePath:'tests/save.test.ts',fixturePath:'src/avatar.ts',interfaceName:'createAvatar',
    body:"const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'avatar-'));try {const file=path.join(root,'avatar');subject(file).save('old');subject(file).save('filtered');expect(subject(file).reload()).toBe('filtered');} finally {fs.rmSync(root,{recursive:true,force:true});}"};
  await page.getByLabel('Story test specification JSON',{exact:true}).fill(JSON.stringify(specification));
  await page.getByRole('button',{name:'Review executable test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Executable test ready'}).waitFor();
  expect(fs.existsSync(path.join(root,specification.filePath))).toBe(false);
  // Force DB approval to fail after the actual guarded source creation.
  await store.listEntities(TestNode.dcr);
  const testId=store.formatId(TestNode.dcr,'test:tests/save.test.ts').replaceAll("'","''");
  await page.getByRole('button',{name:'Accept test and link',exact:true}).click();
  await page.getByRole('alert').waitFor();
  expect(await page.getByRole('alert').innerText()).toContain('file-created-unlinked');
  expect(fs.existsSync(path.join(root,specification.filePath))).toBe(true);
  expect(await store.getEntity<TestNode>('test:tests/save.test.ts',TestNode.dcr)).toBeTruthy();
  expect((await call('get_story_test_status',{storyId:'S'})).status).toBe('uncovered');
  await page.getByRole('button',{name:'Review executable test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Executable test ready'}).waitFor();
  store.db.exec("CREATE TRIGGER s4_fail BEFORE UPDATE ON aiwf_TestNode WHEN NEW._id='"+testId+"' BEGIN SELECT RAISE(ABORT,'injected S4 link failure'); END");
  await page.getByRole('button',{name:'Accept test and link',exact:true}).click();
  await page.getByRole('alert').waitFor();
  expect(await page.getByRole('alert').innerText()).toContain('file-created-unlinked');
  expect((await call('get_story_test_status',{storyId:'S'})).status).toBe('uncovered');
  store.db.exec('DROP TRIGGER s4_fail');
  await page.getByRole('button',{name:'Review executable test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Executable test ready'}).waitFor();
  await page.getByRole('button',{name:'Accept test and link',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Story test linked · skipped'}).waitFor();
  expect((await store.getEntity<TestNode>('test:tests/save.test.ts',TestNode.dcr))?.command).toEqual(['bun','test','tests/save.test.ts']);
  expect((await call('get_story_test_status',{storyId:'S'})).status).toBe('materialized');
  host.server.stop(true);host=undefined as any;await browser?.close();browser=undefined as any;store.close();store=new WorkflowStore(root);
  expect((await store.getEntity<TestNode>('test:tests/save.test.ts',TestNode.dcr))?.storyVersion).toBe((await store.getEntity<UserStory>('S',UserStory.dcr))?.version);
  expect((await store.listEntities(Ticket.dcr)).length).toBe(1);
 });
 it('reports missing fixtures uncovered and materializes an approved executable public API test separately',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s4-test-'));store=new WorkflowStore(root);initializeTools();
  stopReviewer=await productReviewFixture(store);
  await createProduct(store, "UserStory", {id:'S',title:'Save filtered avatar',actor:'User',intent:'Keep preview',initialState:'Previous avatar exists',action:'Save filtered preview',expectedResult:'New avatar survives restart',status:'accepted'});
  const specification={storyId:'S',filePath:'tests/save.test.ts',fixturePath:'src/avatar.ts',interfaceName:'createAvatar',body:"const avatar = subject(); avatar.save('filtered'); expect(avatar.reload()).toBe('filtered');"};
  const missing=await call('prepare_story_test',{specification});expect(missing.status).toBe('uncovered');
  expect(await store.listEntities(TestNode.dcr)).toHaveLength(0);
  fs.mkdirSync(path.join(root,'src'));
  fs.writeFileSync(path.join(root,'src/avatar.ts'),"export function createAvatar() { let saved = 'old'; return {save(value:string){saved=value},reload(){return saved}} }");
  const preview=await call('prepare_story_test',{specification});expect(preview.status).toBe('review');
  expect(fs.existsSync(path.join(root,specification.filePath))).toBe(false);
  expect((await call('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'reject'})).status).toBe('rejected');
  expect(fs.existsSync(path.join(root,specification.filePath))).toBe(false);
  const partial=await call('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'});
  expect(partial.status).toBe('file-created-unlinked');
  let approved=await call('prepare_story_test',{specification});expect(approved.status).toBe('review');
  const applied=await call('apply_story_test',{specification,fingerprint:approved.fingerprint,decision:'accept'});
  expect(applied.status).toBe('linked');expect(applied.testState).toBe('skipped');
  expect((await store.getEntity<TestNode>('test:tests/save.test.ts',TestNode.dcr))?.testState).toBe('skipped');
  const command=Bun.spawn(['bun','test','tests/save.test.ts'],{cwd:root,stdout:'pipe',stderr:'pipe'});
  const [out,err,exitCode]=await Promise.all([new Response(command.stdout).text(),new Response(command.stderr).text(),command.exited]);
  const output=out+'\n'+err;expect(exitCode).toBe(0);expect(output).toContain('1 skip');
  const repeated=await call('prepare_story_test',{specification});
  const reapplied=await call('apply_story_test',{specification,fingerprint:repeated.fingerprint,decision:'accept'});
  expect(reapplied.status,reapplied.reason).toBe('linked');
  expect((await store.getIncoming('S','verifies')).filter(e=>store.localId(e.sourceId)==='test:tests/save.test.ts')).toHaveLength(1);
 });

 it('rejects an individual proposed Story in Workspace without creating its Ticket',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s4-reject-'));store=new WorkflowStore(root);initializeTools();
  stopReviewer=await productReviewFixture(store);
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/avatar.ts'),'export function saveAvatar(value:string){return value}');
  await indexSingleFile(store,path.join(root,'src/avatar.ts'),'src/avatar.ts',root);
  await createProduct(store, "Feature", {id:'F',title:'Avatar Filters',body:'Preview and save filtered avatars',status:'accepted'});
  await browser?.close();
  host=startWorkspace({store,projectRoot:root,executionAuthority:'project-write' as const});browser=await chromium.launch({headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(3000);await page.goto(host.url);
  await page.getByRole('button',{name:'Avatar Filters',exact:true}).click();
  await page.getByRole('button',{name:'Derive work',exact:true}).click();
  await page.getByLabel('Work proposal JSON',{exact:true}).fill(JSON.stringify({items:[
   {id:'E',kind:'Epic',title:'Avatar delivery',body:'Deliver accepted intent'},
   {id:'S',kind:'UserStory',title:'Save avatar',actor:'User',intent:'Keep preview',initialState:'Unsaved preview',action:'Save',expectedResult:'Avatar persists'},
   {id:'T',kind:'Ticket',title:'Implement save',body:'Implement public save',storyIds:['S'],scopeIds:['src/avatar.ts']}
  ],rationale:'Reviewable delivery'}));
  await page.getByRole('button',{name:'Prepare work proposal',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  await page.getByRole('button',{name:'Reject Story S',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
  const application=page.waitForResponse(response=>response.url().endsWith('/api/apply'));
  await page.getByRole('button',{name:'Accept and save',exact:true}).click();
  expect(await (await application).json()).toMatchObject({ok:true});
  await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
  expect(await store.getEntity('S')).toBeNull();expect(await store.getEntity('T')).toBeNull();
  expect(await store.listEntities(Ticket.dcr)).toHaveLength(0);
  host.server.stop(true);host=undefined as any;await browser?.close();browser=undefined as any;
 });

 it('reconciles an edited accepted Story, retains authoritative Aspects, and returns identity/scenario ambiguity',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s4-reconcile-'));store=new WorkflowStore(root);initializeTools();
  stopReviewer=await productReviewFixture(store);
  await createProduct(store, "Feature", {id:'F',title:'Avatar Filters',body:'Save previews',status:'accepted'});
  await createProduct(store, "UserStory", {id:'S',title:'Save avatar',actor:'User',intent:'Keep preview',initialState:'Unsaved preview',action:'Save',expectedResult:'Avatar persists',status:'accepted'});
  await call('create_ticket',{id:'T',title:'Implement save',body:'Original scope',priority:'P2'});
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/api.ts'),'export function save() { return true }');
  await indexSingleFile(store,path.join(root,'src/api.ts'),'src/api.ts',root);
  await createProduct(store, "Aspect", {id:'A',title:'Persistency',body:'Save must survive restart',status:'accepted'});
  await acceptProduct(store, [{kind:"product_link",sourceId:'F',predicate:'enables',targetId:'S'}]);
  await acceptProduct(store, [{kind:"product_link",sourceId:'A',predicate:'applies_to',targetId:'F'}]);
  await acceptProduct(store, [{kind:"product_link",sourceId:'T',predicate:'addresses',targetId:'S'}]);
  await updateProduct(store, "UserStory", {id:'S',action:'Save once; retain previous avatar on failure'});
  const result=await call('process_story',{storyId:'S',critic:'none',proposal:{items:[
   {id:'T',kind:'Ticket',title:'Implement save',body:'Add public failure preservation case',priority:'P1',revise:true,scopeIds:['src/api.ts']}
  ],rationale:'Changed existing Story'}});
  expect(result.status).toBe('complete');expect((await call('get_ticket',{ticketId:'T'})).body).toBe('Original scope');
  const preview=result.value.proposals[0];
  expect(preview.request.basis.some((r:{id:string})=>r.id==='A')).toBe(true);
  await reviewedApply(store, {request:preview.request,fingerprint:preview.fingerprint,decision:'accept'});
  expect((await call('get_ticket',{ticketId:'T'})).body).toBe('Add public failure preservation case');
  expect(await store.listEntities(Ticket.dcr)).toHaveLength(1);
  expect((await call('get_applicable_aspects',{entityId:'T'})).map((a:{id:string})=>a.id)).toEqual(['A']);
  const ambiguous=await call('process_feature',{featureId:'F',critic:'none',proposal:{items:[
   {id:'OTHER',kind:'Ticket',title:'Implement save',body:'Maybe the same work'}
  ],rationale:'Ambiguous identity'}});
  expect(ambiguous.status).toBe('needs_input');expect(await store.getEntity('OTHER')).toBeNull();
  const incomplete=await call('process_feature',{featureId:'F',critic:'none',proposal:{items:[
   {id:'UNKNOWN',kind:'UserStory',title:'Unspecified scenario'}
  ],rationale:'Needs review'}});
  expect(incomplete.status).toBe('needs_input');expect(await store.getEntity('UNKNOWN')).toBeNull();
 });

 it('refuses stale/dirty test reviews, keeps started work active, and classifies fixture and source failures',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s4-boundary-'));store=new WorkflowStore(root);initializeTools();
  stopReviewer=await productReviewFixture(store);
  await createProduct(store, "UserStory", {id:'S',title:'Save avatar',actor:'User',intent:'Keep preview',initialState:'Unsaved preview',action:'Save',expectedResult:'Avatar persists',status:'accepted'});
  await call('create_ticket',{id:'T',title:'Implement save',lane:'In Progress'});
  await acceptProduct(store, [{kind:"product_link",sourceId:'T',predicate:'addresses',targetId:'S'}]);
  const specification={storyId:'S',filePath:'tests/save.test.ts',fixturePath:'src/avatar.ts',interfaceName:'saveAvatar',body:"expect(subject('filtered')).toBe('filtered');"};
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/avatar.ts'),"export function saveAvatar(value:string){return value}");
  await indexSingleFile(store,path.join(root,'src/avatar.ts'),'src/avatar.ts',root);
  let preview=await call('prepare_story_test',{specification});
  expect(preview.testState).toBe('not-run');expect(preview.content).not.toContain('it.skip');
  fs.appendFileSync(path.join(root,'src/avatar.ts'),'\n// developer edit');
  await expect(call('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'})).rejects.toThrow('Stale');
  expect(fs.existsSync(path.join(root,specification.filePath))).toBe(false);
  preview=await call('prepare_story_test',{specification});
  const readOnly={store,projectRoot:root,executionAuthority:'read-only' as const};
  await expect(registry.execute('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'},readOnly)).rejects.toThrow('read-only');
  const abort=new AbortController();abort.abort();
  await expect(registry.execute('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'},{store,projectRoot:root,signal:abort.signal})).rejects.toThrow();
  fs.mkdirSync(path.join(root,'tests'));fs.writeFileSync(path.join(root,specification.filePath),'// unrelated user test');
  await expect(call('prepare_story_test',{specification})).rejects.toThrow('unattributed');
  expect(fs.readFileSync(path.join(root,specification.filePath),'utf8')).toBe('// unrelated user test');
  fs.unlinkSync(path.join(root,specification.filePath));
  preview=await call('prepare_story_test',{specification});
  const partial=await call('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'});
  expect(partial.status).toBe('file-created-unlinked');
  preview=await call('prepare_story_test',{specification});
  const applied=await call('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'});
  expect(applied.status).toBe('linked');expect(applied.testState).toBe('not-run');
  const command=Bun.spawn(['bun','test',specification.filePath],{cwd:root,stdout:'pipe',stderr:'pipe'});
  const output=await new Response(command.stderr).text();expect(await command.exited).toBe(0);expect(output).toContain('1 pass');expect(output).toContain('0 fail');
  fs.unlinkSync(path.join(root,'src/avatar.ts'));
  expect((await call('get_story_test_status',{storyId:'S'})).status).toBe('uncovered');
  expect((await call('prepare_story_test',{specification})).status).toBe('uncovered');
  fs.writeFileSync(path.join(root,'src/avatar.ts'),"import {missing} from './missing.ts'; export function saveAvatar(){return missing()}");
  expect((await call('prepare_story_test',{specification})).status).toBe('uncovered');
  fs.writeFileSync(path.join(root,'src/avatar.ts'),"export function other(){}");
  expect((await call('prepare_story_test',{specification})).status).toBe('uncovered');
 });
});
