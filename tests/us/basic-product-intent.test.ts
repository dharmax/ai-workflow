import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../../src/graph/store.ts';
import {initializeTools, registry} from '../../src/tools/index.ts';
import {saveConfig} from '../../src/services/config-service.ts';
import {reviewedApply} from '../product-review.ts';
import {reviewProductChange} from '../../src/product/links.ts';
import type {ChangeRequest} from '../../src/change/types.ts';

type Request=Extract<ChangeRequest,{action:'product_change'}>;
const recorded=JSON.parse(fs.readFileSync(new URL('../../docs/evidence/product-charter-feature-o3-2026-10-22/evidence.json',import.meta.url),'utf8'));
const aligned=recorded.cases[0];
const {parseStructuredJsonResult}=await import('@dharmax/llm-utils');
const parsed=parseStructuredJsonResult<{criteria:Array<{evidence:string}>,review:{verdict:string,findings:Array<{artifactId:string,message:string}>}}>(JSON.parse(aligned.transport[0].rawResponse).choices[0].message.content);
if(!parsed.ok)throw Error(parsed.message);
const originalResponse=parsed.data;
const storyFields={title:'Inspect a repository defect',actor:'Developer',intent:'Locate the cause of a failing repository test to decide a repair',initialState:'A repository has an existing failing test and indexed source; no diagnosis is accepted',action:'Submit the failing test and request diagnosis',expectedResult:'Return the failing test, exact implicated source references and a proposed causal explanation for developer review. Preserve source and accepted definitions. If evidence is insufficient, report the missing evidence and leave the diagnosis unresolved.'};
const warning='PRODUCT excludes general-purpose content generation; US proposes poems unrelated to software engineering. Revise US to repository diagnosis or defer it.';

describe('Basic Product Intent: developer reviews Charter, Feature and complete Story',()=>{
 let root:string,store:WorkflowStore,server:ReturnType<typeof Bun.serve>,previousHost:string|undefined;
 let mode:'aligned'|'conflict'|'unknown'|'missing'|'malformed'|'contradictory'|'raw'|'external-conflict'='aligned';
 let prompts:string[];
 const ctx=()=>({store,projectRoot:root,executionAuthority:'project-write' as const});
 const call=(name:string,args:Record<string,unknown>)=>registry.execute(name,args,ctx());
 const preview=(request:Request)=>call('preview_change',request);
 const apply=async(request:Request)=>{const p=await preview(request);return reviewedApply(store,{request,fingerprint:p.fingerprint,decision:'accept'});};
 const charter=():Request=>({action:'product_change',mutations:[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:(({id,version,...fields})=>fields)(recorded.charter)}]});
 const feature=():Request=>({...aligned.request,mutations:[...aligned.request.mutations,{kind:'product_link',sourceId:'PRODUCT',predicate:'contains',targetId:'QUALIFY-ALIGNED'}]});
 const story=(fields=storyFields):Request=>({action:'product_change',mutations:[{kind:'product_create',entityType:'UserStory',id:'US',fields:{...fields,status:'accepted'}},{kind:'product_link',sourceId:'QUALIFY-ALIGNED',predicate:'enables',targetId:'US'}]});
 beforeEach(()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-basic-intent-'));store=new WorkflowStore(root);initializeTools();mode='aligned';prompts=[];
  server=Bun.serve({port:0,fetch:async req=>{
   const body=await req.json() as {messages:Array<{content:string}>};const prompt=body.messages.map(m=>m.content).join('\n');prompts.push(prompt);
   const input=JSON.parse(prompt.split('Review context: ')[1]!.split('\n')[0]!);
   if(mode==='external-conflict'){
    const live=JSON.parse(fs.readFileSync(new URL('../../docs/evidence/basic-product-intent-2026-10-23/live.json',import.meta.url),'utf8'));
    const response=live.cases[1].transport.at(-1).response.choices[0].message.content;
    return Response.json({message:{content:response}});
   }
   if(mode==='raw')return Response.json({message:{content:JSON.stringify(originalResponse)}});
   const ids=input.charterAlignment?.artifactIds??['QUALIFY-ALIGNED'];
   const conflicts=mode==='conflict'||mode==='contradictory'?[{artifactId:ids[0],message:warning,charterEvidence:recorded.charter.nonGoals[1],definitionEvidence:'Generate poems unrelated to software engineering',question:'Revise the episode to engineering diagnosis or defer it?'}]:[];
   const assessment={status:mode==='unknown'?'uncertain':mode==='conflict'?'conflict':'aligned',explanation:originalResponse.criteria[0].evidence,observations:originalResponse.review.findings,conflicts};
   return Response.json({message:{content:JSON.stringify({
    criteria:(input.acceptanceCriteria??[]).map((criterion:string)=>({criterion,covered:true,evidence:originalResponse.criteria[0].evidence})),aspects:[],
    review:{...originalResponse.review,...(mode==='conflict'?{findings:[{artifactId:ids[0],message:'General Critic paraphrase: this is outside the engineering charter.'}]}:{}),...(mode==='unknown'?{verdict:'needs_input',required:[{artifactId:ids[0],question:'Clarify the intended scope'}]}:{})},
    ...(mode==='missing'?{}:{alignment:mode==='malformed'?{status:'aligned'}:assessment})
   })}});
  }});
  previousHost=process.env.OLLAMA_HOST;process.env.OLLAMA_HOST=server.url.toString();saveConfig(root,{model:'ollama/controlled-reviewer',ollamaUrl:server.url.toString()});
 });
 afterEach(()=>{server.stop(true);if(previousHost===undefined)delete process.env.OLLAMA_HOST;else process.env.OLLAMA_HOST=previousHost;store.close();fs.rmSync(root,{recursive:true,force:true});});
 it('accepts the recorded positive observation with an explicit aligned assessment',async()=>{
  expect((await apply(charter())).ok).toBe(true);
  const p=await preview(feature());expect(p.blocked).toBe(false);expect(p.warnings).toEqual([]);
  expect((await apply(feature())).ok).toBe(true);
 });
 it('blocks an accept verdict containing a substantive explicit conflict',async()=>{
  await apply(charter());mode='conflict';const p=await preview(feature());expect(p.status).toBe('needs_input');expect(p.warnings).toContain(warning);
 });
 it('keeps legacy responses, malformed assessments, contradictions and uncertainty closed',async()=>{
  await apply(charter());
  for(const outcome of ['raw','missing','malformed','contradictory','unknown'] as const){
   mode=outcome;const p=await preview(feature());expect(p.status).toBe('needs_input');
   expect(await call('list_features',{})).toHaveLength(0);
  }
 });
 it('reviews an inert derived Story, developer revision, durable acceptance and explicit conflict resolution',async()=>{
  expect((await apply(charter())).ok).toBe(true);expect((await apply(feature())).ok).toBe(true);
  // Public derivation uses a controlled externally supplied proposal; it cannot accept itself.
  const derived=await call('process_feature',{featureId:'QUALIFY-ALIGNED',depth:1,critic:'none',proposal:{items:[{id:'US',kind:'UserStory',...storyFields}],rationale:'Diagnose a failing repository test using this accepted Feature'}});
  expect(derived.status).toBe('complete');expect(derived.value.created).toEqual([]);
  const proposed=derived.value.proposals[0];expect(proposed.request.mutations).toContainEqual({kind:'product_link',sourceId:'QUALIFY-ALIGNED',predicate:'enables',targetId:'US'});
  await expect(call('get_user_story',{storyId:'US'})).rejects.toThrow();
  expect((await call('apply_change',{request:proposed.request,fingerprint:proposed.fingerprint,decision:'accept'})).ok).toBe(false);
  expect((await reviewedApply(store,{request:proposed.request,fingerprint:proposed.fingerprint,decision:'accept'})).ok).toBe(true);
  expect((await call('get_user_story',{storyId:'US'})).status).toBe('proposed');
  const expected=storyFields.expectedResult+' Include the failing test name and source file plus line; never apply the proposed repair.';
  const revision:Request={action:'product_change',basis:[{id:'US',entityType:'UserStory',version:1}],mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:{expectedResult:expected,status:'accepted'}}]};
  const p=await preview(revision);expect(p.blocked).toBe(false);
  for(const decision of ['reject','cancel'])expect((await reviewedApply(store,{request:revision,fingerprint:p.fingerprint,decision})).ok).toBe(false);
  expect((await call('get_user_story',{storyId:'US'})).version).toBe(1);
  expect((await apply(revision)).ok).toBe(true);
  const before=await call('get_user_story',{storyId:'US'}),featureBefore=await call('get_feature',{featureId:'QUALIFY-ALIGNED'});
  expect(before.definitionReview).toEqual({status:'complete',missingFields:[]});expect(before.expectedResult).toBe(expected);expect(before.version).toBe(2);
  expect(prompts.join('\n')).toContain(recorded.charter.purpose.slice(0,60));expect(prompts.join('\n')).toContain(expected);
  const cli=path.resolve(import.meta.dir,'../../src/cli.ts');
  const exported=Bun.spawn(['bun',cli,'product','export'],{cwd:root,stdout:'pipe',stderr:'pipe'});
  expect(await exported.exited).toBe(0);
  const manifest=fs.readFileSync(path.join(root,'product-manifest.md'),'utf8');
  expect(manifest).toContain('### QUALIFY-ALIGNED: '+featureBefore.title);expect(manifest).toContain('**Enabled Stories**: US');expect(manifest).toContain('**Revision**: `v'+featureBefore.version+'`');
  store.close();store=new WorkflowStore(root);
  expect(await call('get_user_story',{storyId:'US'})).toEqual(before);expect(await call('get_feature',{featureId:'QUALIFY-ALIGNED'})).toEqual(featureBefore);
  expect((await call('link',{action:'inspect',id:'US',predicate:'enables'})).links).toEqual([expect.objectContaining({sourceId:'QUALIFY-ALIGNED',targetId:'US',predicate:'enables'})]);
  const drift:Request={action:'product_change',mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:{expectedResult:'Generate poems unrelated to software engineering'}}]};
  mode='conflict';const raised=await preview(drift);expect(raised.status).toBe('needs_input');expect(raised.warnings).toContain(warning);expect((await apply(drift)).ok).toBe(false);
  const response='Keep repository test diagnosis and exact source references; remove poetry and unrelated content generation.';
  mode='aligned';
  const resolved:Request={action:'product_change',mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:{expectedResult:expected+' Restrict the explanation to the submitted repository.'}},{kind:'product_create',entityType:'Decision',id:'ANSWER',fields:{title:'Keep diagnosis within software engineering',context:JSON.stringify({warning,proposal:drift,reviewFingerprint:raised.fingerprint,charterRevision:1}),decision:response,status:'accepted'}},{kind:'product_link',sourceId:'ANSWER',predicate:'governs',targetId:'US'}]};
  const answerPreview=await preview(resolved);expect((await reviewedApply(store,{request:resolved,fingerprint:answerPreview.fingerprint,decision:'accept'})).ok).toBe(false);
  // Only the trusted host callback obtains the separate developer answer.
  let asked=0;
  mode='conflict'; // Re-review the original warning while the host obtains the answer.
  const hostCall=reviewProductChange({request:resolved,fingerprint:answerPreview.fingerprint,decision:'accept'},ctx(),async question=>{
   asked++;expect(question).toContain(warning);mode='aligned';return response;
  });
  expect((await hostCall).ok).toBe(true);expect(asked).toBe(1);
  const answer=await call('get_decision',{id:'ANSWER'});expect(answer.decision).toBe(response);expect(answer.context).toContain(raised.fingerprint);
  const current=await call('get_user_story',{storyId:'US'});expect(current.version).toBe(3);
  // Charter amendments invalidate pending reviews but do not rewrite accepted definitions.
  const pending:Request={action:'product_change',mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:{title:'Review repository diagnosis'}}]};
  const old=await preview(pending);
  expect((await apply({action:'product_change',mutations:[{kind:'product_update',entityType:'Product',id:'PRODUCT',fields:{bounds:recorded.charter.bounds+' Preserve repository-local review.'}}]})).ok).toBe(true);
  await expect(reviewedApply(store,{request:pending,fingerprint:old.fingerprint,decision:'accept'})).rejects.toThrow('Stale');
  expect(await call('get_user_story',{storyId:'US'})).toEqual(current);expect(await call('get_feature',{featureId:'QUALIFY-ALIGNED'})).toEqual(featureBefore);
  const staleAnswer:Request={...resolved,mutations:resolved.mutations.map(m=>m.kind==='product_create'&&m.id==='ANSWER'?{...m,id:'STALE-ANSWER'}:m.kind==='product_link'&&m.sourceId==='ANSWER'?{...m,sourceId:'STALE-ANSWER'}:m)};
  expect((await preview(staleAnswer)).status).toBe('needs_input');
 });
 it('preserves the grounded conflict from the actual o3-mini response despite paraphrased general findings',async()=>{
  await apply(charter());mode='external-conflict';
  const live=JSON.parse(fs.readFileSync(new URL('../../docs/evidence/basic-product-intent-2026-10-23/live.json',import.meta.url),'utf8'));
  const response=JSON.parse(live.cases[1].transport.at(-1).response.choices[0].message.content);
  const p=await preview(live.cases[1].request);
  expect(p.status).toBe('needs_input');expect(p.warnings).toContain(response.alignment.conflicts[0].message);
  expect(p.required).toContainEqual({artifactId:'QUALIFY-CONTRADICTORY',question:response.alignment.conflicts[0].question});
 });
 it('refuses incomplete acceptance without changing accepted intent',async()=>{
  expect((await apply(charter())).ok).toBe(true);
  expect((await apply(feature())).ok).toBe(true);
  for(const field of ['actor','intent','initialState','action','expectedResult'] as const){
   const refused=await preview(story({...storyFields,[field]:'   '}));expect(refused.blocked).toBe(true);expect(refused.blockReason).toContain(field);
   expect(await call('list_user_stories',{})).toHaveLength(0);
  }
  expect((await apply(story())).ok).toBe(true);
  const accepted=await call('get_user_story',{storyId:'US'});
  for(const field of ['actor','intent','initialState','action','expectedResult'] as const){
   const incomplete:Request={action:'product_change',mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:{[field]:''}}]};
   const refused=await preview(incomplete);expect(refused.blocked).toBe(true);expect(refused.blockReason).toContain(field);
   expect(await call('get_user_story',{storyId:'US'})).toEqual(accepted);
  }
 });
 it('refuses a stale Story approval and reopens the same accepted identity and meaning',async()=>{
  expect((await apply(charter())).ok).toBe(true);
  expect((await apply(feature())).ok).toBe(true);
  expect((await apply(story())).ok).toBe(true);
  const pending:Request={action:'product_change',basis:[{id:'US',entityType:'UserStory',version:1}],mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:{expectedResult:storyFields.expectedResult+' Show the test command.'}}]};
  const old=await preview(pending);
  const revised={...storyFields,expectedResult:storyFields.expectedResult+' Include source file and line references.'};
  expect((await apply({action:'product_change',mutations:[{kind:'product_update',entityType:'UserStory',id:'US',fields:revised}]})).ok).toBe(true);
  const accepted=await call('get_user_story',{storyId:'US'});
  expect(accepted).toMatchObject({id:'US',...revised,status:'accepted',version:2,definitionReview:{status:'complete',missingFields:[]}});
  const stale=await reviewedApply(store,{request:pending,fingerprint:old.fingerprint,decision:'accept'});expect(stale.ok).toBe(false);expect(stale.error).toContain('Stale');
  for(const decision of ['reject','cancel']){
   const current=await preview({...pending,basis:[{id:'US',entityType:'UserStory',version:2}]});
   expect((await reviewedApply(store,{request:current.request,fingerprint:current.fingerprint,decision})).ok).toBe(false);
   expect(await call('get_user_story',{storyId:'US'})).toEqual(accepted);
  }
  store.close();store=new WorkflowStore(root);
  expect(await call('get_user_story',{storyId:'US'})).toEqual(accepted);
  expect(await call('list_user_stories',{})).toHaveLength(1);
  expect((await call('link',{action:'inspect',id:'US',predicate:'enables'})).links).toEqual([expect.objectContaining({sourceId:'QUALIFY-ALIGNED',targetId:'US',predicate:'enables'})]);
 });
 it('requires current accepted charter for complete Stories too',async()=>{
  const request=story();request.mutations.pop();expect((await preview(request)).status).toBe('needs_input');
 });
});
