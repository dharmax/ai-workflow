import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {processShellInput} from '../../src/shell.ts';
import {lexCommand} from '../../src/artifact-command.ts';
import {WorkflowActor} from '../../src/helpers/actor/engine.ts';
import type {Asker} from '@dharmax/llm-utils';
import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../../src/graph/store.ts';
import {initializeTools, commandRegistry} from '../../src/tools/index.ts';
import {saveConfig} from '../../src/services/config-service.ts';
import {Product, Feature, Decision} from '../../src/model/ontology.ts';
import {reviewedApply} from '../product-review.ts';
import {reviewProductChange} from '../../src/product/links.ts';
import {startWorkspace} from '../../src/workspace/server.ts';
import {ParameterFacilitator} from '@dharmax/shell-ui';
import type {ChangeRequest} from '../../src/change/types.ts';

type ProductRequest=Extract<ChangeRequest,{action:'product_change'}>;
const charter={kind:'product_create' as const,entityType:'Product' as const,id:'PRODUCT',fields:{title:'Engineering assistant',purpose:'Help developers maintain software',actors:['Developer'],scope:'Software engineering',nonGoals:['General-purpose conversation and content generation'],bounds:'Developer governs intent',status:'accepted'}};
const feature=(body='Discuss any topic and write poems for the general public'):ProductRequest=>({action:'product_change',mutations:[{kind:'product_create',entityType:'Feature',id:'F',fields:{title:'Conversation',body,status:'accepted'}}]});
const warning='PRODUCT excludes general-purpose conversation; F offers unrestricted conversation and poems for the general public. Revise F to engineering assistance or leave unresolved. What should F provide?';

describe('Product charter governs Feature acceptance and revision through public operations',()=>{
 let root:string,store:WorkflowStore,server:ReturnType<typeof Bun.serve>,previousHost:string|undefined;
 let verdict:'aligned'|'conflict'|'unknown'|'generic'='aligned';
 let prompts:string[];
 const call=(tool:string,args:Record<string,unknown>)=>commandRegistry.execute(tool,args,{store,projectRoot:root,executionAuthority:'project-write'});
 const accept=async(request:ProductRequest)=>{
  const preview=await call('preview_change',request);
  return reviewedApply(store,{request,fingerprint:preview.fingerprint,decision:'accept'});
 };
 beforeEach(()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-charter-feature-'));store=new WorkflowStore(root);initializeTools();prompts=[];verdict='aligned';
  server=Bun.serve({port:0,fetch:async request=>{
   const body=await request.json() as {messages:Array<{content:string}>};
   const prompt=body.messages.map(m=>m.content).join('\n');prompts.push(prompt);
   const context=JSON.parse(prompt.split('Review context: ')[1]!);
   const originalConflict=verdict==='aligned' && context.proposal?.some((mutation:{entityType?:string;fields?:{body?:string}})=>mutation.entityType==='Feature' && mutation.fields?.body?.includes('poems'));
   const effective=originalConflict?'conflict':verdict;
   const criteria=(context.acceptanceCriteria??[]).map((criterion:string)=>({criterion,covered:effective==='aligned',evidence:effective==='aligned'?'PRODUCT purpose and scope permit F engineering assistance.':warning}));
   // Deliberate general Critic approval must not erase a material finding.
   const review=effective==='generic'?{verdict:'accept'}:effective==='conflict'?{verdict:'accept',findings:[{artifactId:'F',message:warning}]}:effective==='unknown'?{verdict:'needs_input',required:[{artifactId:'F',question:'Is this scope engineering-only?'}]}:{verdict:'accept'};
   return Response.json({message:{content:JSON.stringify({criteria,aspects:[],review,...(context.charterAlignment?{alignment:{status:effective==='aligned'?'aligned':effective==='conflict'?'conflict':'uncertain',explanation:effective==='aligned'?'PRODUCT permits repository engineering assistance.':warning,observations:[],conflicts:effective==='conflict'?[{artifactId:'F',message:warning,charterEvidence:'General-purpose conversation and content generation',definitionEvidence:'poems for the general public',question:'Revise F to engineering assistance or leave unresolved?'}]:[]}}:{})})}});
  }});
  previousHost=process.env.OLLAMA_HOST;process.env.OLLAMA_HOST=server.url.toString();
  saveConfig(root,{model:'ollama/controlled-reviewer',ollamaUrl:server.url.toString()});
 });
 afterEach(()=>{server.stop(true);if(previousHost===undefined)delete process.env.OLLAMA_HOST;else process.env.OLLAMA_HOST=previousHost;store.close();fs.rmSync(root,{recursive:true,force:true});});
 it('keeps a contradictory proposal inert, requires an explicit answer, and records the reviewed revision in a Decision',async()=>{
  expect((await accept({action:'product_change',mutations:[charter]})).ok).toBe(true);
  verdict='conflict';const request=feature();const preview=await call('preview_change',request);
  expect(preview.status).toBe('needs_input');
  expect(preview.warnings.join(' ')).toContain('PRODUCT excludes general-purpose conversation');
  expect(prompts.join('\n')).toContain('General-purpose conversation and content generation');
  expect(prompts.join('\n')).toContain('Discuss any topic and write poems');
  const refused=await reviewedApply(store,{request,fingerprint:preview.fingerprint,decision:'accept'});
  expect(refused.ok).toBe(false);expect(refused.status).toBe('needs_input');
  expect(await store.getEntity('F',Feature.dcr)).toBeNull();
  // A model-generated acknowledgment and project-write cannot resolve the contradiction.
  const acknowledgment:ProductRequest={...request,mutations:[...request.mutations,{kind:'product_create',entityType:'Decision',id:'ACK',fields:{title:'Acknowledgment',context:warning,decision:'Acknowledged, accept it',status:'accepted'}},{kind:'product_link',sourceId:'ACK',predicate:'governs',targetId:'F'}]};
  expect((await accept(acknowledgment)).ok).toBe(false);expect(await store.getEntity('ACK',Decision.dcr)).toBeNull();
  verdict='aligned';
  const revised:ProductRequest={...feature('Discuss repository defects and propose source fixes for developers only'),basis:[{id:'PRODUCT',entityType:'Product',version:1}],mutations:[...feature('Discuss repository defects and propose source fixes for developers only').mutations,{kind:'product_create',entityType:'Decision',id:'ANSWER',fields:{title:'Limit conversation to engineering',context:JSON.stringify({warning,proposal:request,reviewFingerprint:preview.fingerprint,charterRevision:1}),decision:'Revise F to repository defect diagnosis for developers; remove unrestricted discussion and poetry.',consequences:'The general-purpose capability is excluded. Review the revised F against PRODUCT v1.',status:'accepted'}},{kind:'product_link',sourceId:'ANSWER',predicate:'governs',targetId:'F'}]};
  const current=await call('preview_change',revised);
  const unreviewed=await call('apply_change',{request:revised,fingerprint:current.fingerprint,decision:'accept'});
  expect(unreviewed.status).toBe('needs_input');expect(await store.getEntity('ANSWER',Decision.dcr)).toBeNull();
  const answers:string[]=[];
  fs.writeFileSync(path.join(root,'answer-preview.json'),JSON.stringify({request:revised,fingerprint:current.fingerprint}));
  const facilitator=new ParameterFacilitator({elicit:async request=>{answers.push(JSON.stringify(request));return {status:'answered',id:request.id,value:'Revise F to repository defect diagnosis for developers; remove unrestricted discussion and poetry.'};},form:async()=>({status:'unavailable'}),review:async()=>({status:'unavailable'}),view:async()=>({status:'unavailable'})});
  const applied=await processShellInput('product-change accept answer-preview.json',{store,projectRoot:root,actor:new WorkflowActor({store,projectRoot:root,offline:true}),interactive:true,facilitator});
  expect(JSON.parse(applied.output).ok).toBe(true);
  expect(answers).toHaveLength(1);expect(answers[0]).toContain(warning);
  store.close();store=new WorkflowStore(root);
  const answer=await call('get_decision',{id:'ANSWER'});
  expect(answer.context).toContain(warning);expect(answer.decision).toContain('remove unrestricted discussion');
  expect((await store.getOutgoing('ANSWER','governs')).map(e=>store.localId(e.targetId))).toContain('F');
  expect((await call('get_feature',{featureId:'F'})).body).toContain('developers only');
  verdict='conflict';
  const drift:ProductRequest={action:'product_change',mutations:[{kind:'product_update',entityType:'Feature',id:'F',fields:{body:'Discuss any topic and generate poems for everyone'}}]};
  expect((await accept(drift)).status).toBe('needs_input');
  expect((await call('get_feature',{featureId:'F'})).version).toBe(1);
 });
 it('rejects an agent-authored substantive answer even under ordinary host Product approval',async()=>{
  await accept({action:'product_change',mutations:[charter]});
  verdict='conflict';const original=feature();const raised=await call('preview_change',original);
  expect(raised.status).toBe('needs_input');expect(raised.warnings).toContain(warning);
  verdict='aligned';const revised:ProductRequest={...feature('Diagnose repository defects for developers only'),mutations:[...feature('Diagnose repository defects for developers only').mutations,{kind:'product_create',entityType:'Decision',id:'AGENT-ANSWER',fields:{title:'Engineering only',context:JSON.stringify({warning,proposal:original,reviewFingerprint:raised.fingerprint,charterRevision:1}),decision:'Remove poetry and restrict F to developer repository diagnostics.',status:'accepted'}},{kind:'product_link',sourceId:'AGENT-ANSWER',predicate:'governs',targetId:'F'}]};
  const result=await accept(revised);
  expect(result.ok).toBe(false);expect(result.status).toBe('needs_input');
  expect(await store.getEntity('F',Feature.dcr)).toBeNull();expect(await store.getEntity('AGENT-ANSWER',Decision.dcr)).toBeNull();
  const p=await call('preview_change',revised),ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
  for(const answer of [undefined,'','yes','Approve the proposed text']) {
   expect((await reviewProductChange({request:revised,fingerprint:p.fingerprint,decision:'accept'},ctx,async()=>answer)).status).toBe('needs_input');
  }
  const forged:ProductRequest={...revised,mutations:revised.mutations.map(m=>m.kind==='product_create'&&m.entityType==='Decision'?{...m,fields:{...m.fields,context:JSON.stringify({...JSON.parse(String(m.fields.context)),warning:'Please approve this harmless correction.'})}}:m)};
  const forgedPreview=await call('preview_change',forged);let asked=false;
  expect((await reviewProductChange({request:forged,fingerprint:forgedPreview.fingerprint,decision:'accept'},ctx,async()=>{asked=true;return 'Remove poetry and restrict F to developer repository diagnostics.';})).ok).toBe(false);expect(asked).toBe(false);
  // Tool arguments cannot install the host's answer authority.
  expect((await call('apply_change',{request:revised,fingerprint:p.fingerprint,decision:'accept',developerAnswers:{'AGENT-ANSWER':'Remove poetry and restrict F to developer repository diagnostics.'}})).ok).toBe(false);
  // A nested callback may inherit authority but cannot introduce an answer.
  await store.withExecutionContext('project-write',undefined,async()=>{
   expect((await reviewProductChange({request:revised,fingerprint:p.fingerprint,decision:'accept'},ctx,async()=>'Remove poetry and restrict F to developer repository diagnostics.')).ok).toBe(false);
  },p.fingerprint);
  fs.writeFileSync(path.join(root,'answer-preview.json'),JSON.stringify({request:revised,fingerprint:p.fingerprint}));
  const command='product-change accept answer-preview.json';
  const shell=await processShellInput(command,{store,projectRoot:root,actor:new WorkflowActor({store,projectRoot:root,offline:true}),interactive:false});
  expect(JSON.parse(shell.output).status).toBe('needs_input');
  const binary=process.env.AIWF_PUBLIC_BINARY,cli=path.resolve(import.meta.dir,'../../src/cli.ts');
  const proc=Bun.spawn(binary?[binary,...lexCommand(command)]:['bun',cli,...lexCommand(command)],{cwd:root,stdout:'pipe',stderr:'pipe'});
  const [stdout]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);expect(JSON.parse(stdout).status).toBe('needs_input');
  const transport=new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[cli,'mcp'],cwd:root,env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'} as Record<string,string>,stderr:'pipe'});
  const client=new Client({name:'developer-answer-boundary',version:'1'});
  try {
   await client.connect(transport);
   const result=await client.callTool({name:'apply_change',arguments:{request:revised,fingerprint:p.fingerprint,decision:'accept',developerAnswers:{'AGENT-ANSWER':'Remove poetry and restrict F to developer repository diagnostics.'}}});
   expect(result.isError).toBe(true);expect(JSON.stringify(result.content)).toContain('developerAnswers');expect(await store.getEntity('AGENT-ANSWER',Decision.dcr)).toBeNull();
  } finally {await client.close();}
  // Trusted Workspace host receives the response separately from request/approval.
  let hostAnswer:string|undefined;
  const workspace=startWorkspace(ctx,0,async()=>true,async()=>hostAnswer),url=new URL(workspace.url),token=url.hash.slice(1);
  try {
   const apply=async(developerAnswers?:Record<string,string>,request=revised,fingerprint=p.fingerprint)=>{
    const response=await fetch(url.origin+'/api/apply',{method:'POST',headers:{'x-aiwf-token':token,'content-type':'application/json'},body:JSON.stringify({request,fingerprint,decision:'accept',developerAnswers})});
    return response.json();
   };
   expect((await apply()).status).toBe('needs_input');
   const changed:ProductRequest={...revised,mutations:revised.mutations.map(m=>m.kind==='product_create'&&m.entityType==='Feature'?{...m,fields:{...m.fields,body:'Different repository diagnostic proposal'}}:m)};
   expect((await apply({'AGENT-ANSWER':'Remove poetry and restrict F to developer repository diagnostics.'},changed)).error).toContain('Stale preview');
   expect((await apply({'AGENT-ANSWER':'Remove poetry and restrict F to developer repository diagnostics.'})).status).toBe('needs_input');
   hostAnswer='Remove poetry and restrict F to developer repository diagnostics.';
   const success=await apply();expect(success.ok).toBe(true);
   expect((await call('get_decision',{id:'AGENT-ANSWER'})).context).toContain(warning);
  } finally {workspace.server.stop(true);}

 });
 it('rejects answers bound to a stale charter or original Feature revision',async()=>{
  await accept({action:'product_change',mutations:[charter]});
  await accept(feature('Diagnose source defects for developers'));
  const original:ProductRequest={action:'product_change',mutations:[{kind:'product_update',entityType:'Feature',id:'F',fields:{body:'General conversation and poems'}}]};
  verdict='conflict';const raised=await call('preview_change',original);expect(raised.status).toBe('needs_input');verdict='aligned';
  const response='Keep repository engineering assistance; exclude general conversation.';
  const revised:ProductRequest={action:'product_change',mutations:[{kind:'product_update',entityType:'Feature',id:'F',fields:{body:'Repository engineering assistance'}},{kind:'product_create',entityType:'Decision',id:'STALE',fields:{title:'Engineering assistance',context:JSON.stringify({warning,proposal:original,reviewFingerprint:raised.fingerprint,charterRevision:1}),decision:response,status:'accepted'}},{kind:'product_link',sourceId:'STALE',predicate:'governs',targetId:'F'}]};
  const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
  // Independently aligned ordinary Feature revision remains usable.
  await accept({action:'product_change',mutations:[{kind:'product_update',entityType:'Feature',id:'F',fields:{body:'Explain compiler diagnostics for developers'}}]});
  const stale=await call('preview_change',revised);expect(stale.status).toBe('needs_input');expect(stale.blockReason).toContain('Stale');
  expect((await reviewProductChange({request:revised,fingerprint:stale.fingerprint,decision:'accept'},ctx,async()=>response)).ok).toBe(false);
  await accept({action:'product_change',mutations:[{kind:'product_update',entityType:'Product',id:'PRODUCT',fields:{bounds:'Repository-local engineering assistance'}}]});
  const changed=await call('preview_change',revised);expect(changed.blockReason).toContain('Stale');
  expect(await store.getEntity('STALE',Decision.dcr)).toBeNull();expect((await call('get_feature',{featureId:'F'})).body).toContain('compiler diagnostics');
 });
 it('requires an accepted canonical charter, while drafts and unrelated work remain usable',async()=>{
  const missing=await call('preview_change',feature('Review source defects'));
  expect(missing.status).toBe('needs_input');expect(missing.blockReason).toContain('accepted Product charter');
  expect((await accept({action:'product_change',mutations:[{...charter,fields:{...charter.fields,status:'draft'}}]})).ok).toBe(true);
  expect((await accept(feature('Review source defects'))).ok).toBe(false);
  expect((await accept({action:'product_change',mutations:[{kind:'product_create',entityType:'Feature',id:'DRAFT',fields:{title:'Unresolved draft'}},{kind:'product_create',entityType:'Ticket',id:'TECH',fields:{title:'Repair parser',lane:'Todo'}}]})).ok).toBe(true);
  expect((await call('get_feature',{featureId:'DRAFT'})).status).toBe('draft');
 });
 it('accepts aligned Product and Feature atomically and invalidates review when the charter changes',async()=>{
  const request=feature('Diagnose repository defects for developers');request.mutations.unshift(charter);
  expect((await accept(request)).ok).toBe(true);
  const revision:ProductRequest={action:'product_change',mutations:[{kind:'product_update',entityType:'Feature',id:'F',fields:{body:'Explain repository compiler errors'}}]};
  const old=await call('preview_change',revision);expect(old.blocked).toBe(false);
  expect((await accept({action:'product_change',mutations:[{kind:'product_update',entityType:'Product',id:'PRODUCT',fields:{bounds:'Developer review and repository-local diagnostics'}}]})).ok).toBe(true);
  await expect(reviewedApply(store,{request:revision,fingerprint:old.fingerprint,decision:'accept'})).rejects.toThrow('Stale');
  expect((await call('get_feature',{featureId:'F'})).version).toBe(1);
  expect((await call('get_product',{})).product.version).toBe(2);
 });
 it('fails closed when the reviewer is uncertain or gives generic approval without alignment evidence',async()=>{
  await accept({action:'product_change',mutations:[charter]});
  for(const response of ['unknown','generic'] as const){verdict=response;const p=await call('preview_change',feature('Help with tasks'));expect(p.status).toBe('needs_input');expect((await accept(feature('Help with tasks'))).ok).toBe(false);}
 });
 it('refuses alternate public Product paths, ordinary --yes, MCP and Actor self-approval',async()=>{
  await accept({action:'product_change',mutations:[charter]});verdict='conflict';
  const args={action:'preview_new',kind:'Feature',id:'F',fields:{title:'Conversation',body:'Discuss any topic and write poems',status:'accepted'}};
  const facade=await call('artifact',args);expect(facade.status).toBe('needs_input');
  await expect(call('create_feature',{featureId:'F',title:'Conversation',body:'Discuss any topic',status:'accepted'})).rejects.toThrow('review');
  const command='product feature new --id F --title Conversation --body "Discuss any topic and write poems" --status accepted --yes';
  const shell=await processShellInput(command,{store,projectRoot:root,actor:new WorkflowActor({store,projectRoot:root,offline:true}),interactive:false});
  expect(JSON.parse(shell.output).status).toBe('needs_input');
  const binary=process.env.AIWF_PUBLIC_BINARY;
  const cli=path.resolve(import.meta.dir,'../../src/cli.ts');
  const proc=Bun.spawn(binary?[binary,...lexCommand(command)]:['bun',cli,...lexCommand(command)],{cwd:root,stdout:'pipe',stderr:'pipe'});
  const [stdout]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
  expect(JSON.parse(stdout).status).toBe('needs_input');
  const transport=new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[cli,'mcp'],cwd:root,env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'} as Record<string,string>,stderr:'pipe'});
  const client=new Client({name:'charter-review-proof',version:'1'});
  try {
   await client.connect(transport);
   const preview=await client.callTool({name:'artifact',arguments:args});expect(preview.isError).not.toBe(true);
   const data=JSON.parse((preview.content as Array<{text:string}>)[0]!.text);expect(data.status).toBe('needs_input');
   const applied=await client.callTool({name:'apply_change',arguments:{request:data.request,fingerprint:data.fingerprint,decision:'accept'}});
   expect(applied.isError).not.toBe(true);expect(JSON.parse((applied.content as Array<{text:string}>)[0]!.text).status).toBe('needs_input');
  }finally{await client.close();}
  const preview=await call('preview_change',feature());let step=0;
  const calls=[{name:'discover_tools',parameters:{request:'Review and apply the proposed Feature'}},{name:'apply_change',parameters:{request:feature(),fingerprint:preview.fingerprint,decision:'accept'}}];
  const asker={json:async()=>({ok:true,data:step<calls.length?{thought:'',action:'tool_call',toolCalls:[calls[step++]]}:{thought:'',action:'final_answer',finalAnswer:'Developer input required'}})} as unknown as Asker;
  const actor=new WorkflowActor({store,projectRoot:root,asker,toolDiscovery:{discover:async()=>({query:{},mode:'dev' as const,tools:[commandRegistry.get('apply_change')!]})}});
  // Supply the existing apply tool directly through discovery, then exercise its execution boundary.
  const result=await actor.execute('Accept this conflicting Feature using apply_change',{executionAuthority:'project-write'});
  expect(JSON.stringify(result.events.flatMap(event=>event.toolResults??[]))).toContain('needs_input');
  expect(await store.getEntity('F',Feature.dcr)).toBeNull();
 },15000);
 it('preserves historical accepted definitions, drafts and technical Tickets without migration',async()=>{
  await store.upsertEntity(Feature.dcr,{id:'HISTORICAL',title:'Historical definition',body:'Pre-charter accepted functionality',status:'accepted'});
  const historical=await (await store.getEntity<Feature>('HISTORICAL',Feature.dcr))!.fullDto();
  await accept({action:'product_change',mutations:[{kind:'product_create',entityType:'Ticket',id:'TECH',fields:{title:'Repair parser',lane:'Todo'}},{kind:'product_create',entityType:'Feature',id:'DRAFT',fields:{title:'Unreviewed draft'}}]});
  const before=await call('get_ticket',{ticketId:'TECH'});
  expect((await call('preview_change',feature())).status).toBe('needs_input');
  expect(await (await store.getEntity<Feature>('HISTORICAL',Feature.dcr))!.fullDto()).toEqual(historical);
  expect(await call('get_ticket',{ticketId:'TECH'})).toEqual(before);
  expect((await call('get_feature',{featureId:'DRAFT'})).status).toBe('draft');
  expect(prompts).toEqual([]);
 });
});
