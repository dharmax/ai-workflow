import {createProduct,acceptProduct,reviewedApply,updateProduct} from './product-review.ts';
import {afterEach,describe,expect,it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,type Browser} from 'playwright';
import {WorkflowStore} from '../src/graph/store.ts';
import {TestNode,UserStory} from '../src/graph/ontology.ts';
import {indexSingleFile} from '../src/graph/indexer.ts';
import {initializeTools,registry} from '../src/tools/index.ts';
import {startWorkspace} from '../src/workspace/server.ts';

describe('S5 Story test-first lifecycle',()=>{
 let root:string,store:WorkflowStore,browser:Browser,host:ReturnType<typeof startWorkspace>;
 const call=(name:string,params:unknown)=>registry.execute(name,params,{store,projectRoot:root,executionAuthority:'project-write' as const});
 afterEach(async()=>{
  await browser?.close();browser=undefined as any;
  host?.server.stop(true);host=undefined as any;
  store?.close();store=undefined as any;
  if(root){fs.rmSync(root,{recursive:true,force:true});root=undefined as any;}
 });
 it('DW-04 activates and executes the same reviewed public-interface TestNode through Workspace',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s5-'));store=new WorkflowStore(root);initializeTools();
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.copyFileSync(path.resolve('tests/fixtures/dw04-avatar-store.ts'),path.join(root,'src/avatar.ts'));
  await indexSingleFile(store,path.join(root,'src/avatar.ts'),'src/avatar.ts',root);
  fs.copyFileSync(path.join(root,'src/avatar.ts'),path.join(root,'src/backlog.ts'));
  await indexSingleFile(store,path.join(root,'src/backlog.ts'),'src/backlog.ts',root);
  for(const id of ['S','BACKLOG','UNCOVERED']) await createProduct(store, "UserStory", {id,title:id==='S'?'Save filtered avatar':id==='BACKLOG'?'Unrelated backlog story':'Uncovered story',actor:'Signed-in user',intent:'Preserve avatar state',initialState:'A previous avatar exists',action:'Save a filtered avatar',expectedResult:'The new avatar is saved',exceptions:'A failed save preserves the previous avatar',status:'accepted'});
  expect((await (call('get_story_test_status',{storyId:'UNCOVERED'}) as Promise<any>)).state).toBe('uncovered');
  await createProduct(store, "Aspect", {id:'A',title:'Avatar persistence',body:'Failed persistence preserves the previous value.',status:'accepted'});
  await acceptProduct(store, [{kind:"product_link",predicate:'applies_to',sourceId:'A',targetId:'S'}]);
  for(const [id,storyId] of [['T','S']]) {
   await call('create_ticket',{id,title:'Implement avatar save',lane:'Todo',body:'Implement reviewed public save behavior'});
   await acceptProduct(store, [{kind:"product_link",sourceId:id,predicate:'addresses',targetId:storyId}]);
  }
  const specification={storyId:'S',filePath:'tests/dw04-save.test.ts',fixturePath:'src/avatar.ts',interfaceName:'saveFilteredAvatar',
   body:"const state={value:'previous'};const store={read:()=>state.value,clear:()=>{state.value=''},write:(value:string)=>{if(value==='fail')throw new Error('disk failure');state.value=value}};expect(subject(store,'filtered')).toBe('filtered');state.value='previous';console.log('DW-04 happy-path assertions passed');expect(()=>subject(store,'fail')).toThrow('disk failure');expect(store.read()).toBe('previous');"};
  const other={...specification,storyId:'BACKLOG',filePath:'tests/backlog-story.test.ts',fixturePath:'src/backlog.ts',body:"expect(subject({read:()=>'',clear:()=>{},write:()=>{}},'x')).toBe('x');"};
  for(const spec of [specification,other]) {
   let preview=await call('prepare_story_test',{specification:spec});expect(preview.status).toBe('review');expect(preview.testState).toBe('skipped');
   let applied=await call('apply_story_test',{specification:spec,fingerprint:preview.fingerprint,decision:'accept'});
   if(applied.status==='file-created-unlinked') { preview=await call('prepare_story_test',{specification:spec});applied=await call('apply_story_test',{specification:spec,fingerprint:preview.fingerprint,decision:'accept'}); }
   expect(applied.status).toBe('linked');
  }
  const stableId='test:tests/dw04-save.test.ts';
  expect((await store.getEntity<TestNode>(stableId,TestNode.dcr))?.testState).toBe('skipped');
  expect((await (call('get_story_test_status',{storyId:'BACKLOG'}) as Promise<any>)).tests[0].state).toBe('skipped');
  const changed=await call('update_ticket_state',{ticketId:'T',lane:'In Progress'});
  expect((changed as any).lane).toBe('In Progress');
  expect(fs.readFileSync(path.join(root,specification.filePath),'utf8')).not.toContain('it.skip');
  let test=await store.getEntity<TestNode>(stableId,TestNode.dcr);expect(test?.testState).toBe('not-run');
  host=startWorkspace({store,projectRoot:root,executionAuthority:'project-write' as const});browser=await chromium.launch({headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(5000);await page.goto(host.url);
  await page.getByRole('button',{name:'Save filtered avatar',exact:true}).click();
  await page.getByRole('button',{name:'Specify Story test',exact:true}).click();
  await page.getByRole('button',{name:'Run active Story test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Story test expected-red'}).waitFor();
  const red=JSON.parse(await page.locator('#story-test-source').innerText());
  expect(red.status).toBe('expected-red');expect(red.output).toContain('DW-04 happy-path assertions passed');expect(red.output).toContain('disk failure');
  test=await store.getEntity<TestNode>(stableId,TestNode.dcr);expect(test?.testState).toBe('expected-red');expect(test?.passed).toBe(false);expect(test?.lastRun).toBeTruthy();
  expect((await (call('get_story_test_status',{storyId:'BACKLOG'}) as Promise<any>)).tests[0].state).toBe('skipped');
  const beforeFix=fs.readFileSync(path.join(root,'src/avatar.ts'),'utf8');
  const fixed=beforeFix.replace('  store.clear()\n','');
  const fix=await call('preview_change',{action:'replace_text',filePath:'src/avatar.ts',oldText:beforeFix,newText:fixed});
  await reviewedApply(store, {request:(fix as any).request,fingerprint:(fix as any).fingerprint,decision:'accept'});
  expect((await (call('get_story_test_status',{storyId:'S'}) as Promise<any>)).tests[0].state).toBe('stale');
  await page.getByRole('button',{name:'Run active Story test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Story test green'}).waitFor();
  test=await store.getEntity<TestNode>(stableId,TestNode.dcr);expect(test?.testState).toBe('green');expect(test?.passed).toBe(true);
  const syntax=await call('preview_change',{action:'replace_text',filePath:'src/avatar.ts',oldText:fixed,newText:fixed+'\nexport const broken = ;'});
  await reviewedApply(store, {request:(syntax as any).request,fingerprint:(syntax as any).fingerprint,decision:'accept'});
  await page.getByRole('button',{name:'Run active Story test',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Story test blocked'}).waitFor();
  test=await store.getEntity<TestNode>(stableId,TestNode.dcr);expect(test?.testState).toBe('blocked');
  const malformed=fs.readFileSync(path.join(root,'src/avatar.ts'),'utf8');
  const repair=await call('preview_change',{action:'replace_text',filePath:'src/avatar.ts',oldText:malformed,newText:fixed});
  await reviewedApply(store, {request:(repair as any).request,fingerprint:(repair as any).fingerprint,decision:'accept'});
  await page.getByRole('button',{name:'Run active Story test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Story test green'}).waitFor();
  host.server.stop(true);host=undefined as any;await browser?.close();browser=undefined as any;store.close();store=new WorkflowStore(root);
  test=await store.getEntity<TestNode>(stableId,TestNode.dcr);
  expect(test?.testState).toBe('green');expect(test?.lastRun).toBeTruthy();expect(test?.executionHashes).toBeTruthy();
  expect((await (call('get_story_test_status',{storyId:'S'}) as Promise<any>)).tests[0].id).toBe(stableId);
  expect((await (call('get_story_test_status',{storyId:'BACKLOG'}) as Promise<any>)).tests[0].state).toBe('skipped');
  await updateProduct(store, "Aspect", {id:'A',body:'Persistence preserves prior value on every failed write.'});
  expect((await (call('get_story_test_status',{storyId:'S'}) as Promise<any>)).tests[0].state).toBe('stale');
  expect((await store.getEntity<UserStory>('S',UserStory.dcr))?.title).toBe('Save filtered avatar');
 },30000);
});
