import {WorkflowActor} from '../src/helpers/actor/engine.ts';
import {CommandRegistry} from '../src/tools/registry.ts';
import type {Asker,SystemOne} from '@dharmax/llm-utils';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {describe,it,expect,afterEach} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {initializeTools,commandRegistry} from '../src/tools/index.ts';
import {applyProductMutations} from '../src/product/mutation.ts';
import {Product,Ticket} from '../src/model/ontology.ts';

describe('EXT-SURFACE-10 Product review authority',()=>{
 let store:WorkflowStore|undefined, root:string;
 afterEach(()=>{store?.close();if(root)fs.rmSync(root,{recursive:true,force:true});});
 it('refuses a project-write agent using a legacy direct writer or accepting its own preview',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-authority-'));
  store=new WorkflowStore(root);initializeTools();
  const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
  await expect(commandRegistry.execute('define_product',{title:'Self-approved'},ctx)).rejects.toThrow('review');
  const request={action:'product_change',mutations:[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Self-approved'}}]};
  const preview=await commandRegistry.execute('preview_change',request,ctx);
  const result=await commandRegistry.execute('apply_change',{request,fingerprint:preview.fingerprint,decision:'accept'},ctx);
  expect(result.ok).toBe(false);
  expect(result.status).toBe('review_required');
  store.close();store=new WorkflowStore(root);
  expect(await store.getEntity('PRODUCT',Product.dcr)).toBeNull();
 });
 it('keeps legacy Actor discovery and model self-approval inert at the real execution boundary',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-actor-'));
  store=new WorkflowStore(root);initializeTools();
  const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
  const request={action:'product_change',mutations:[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Actor proposal'}}]};
  const preview=await commandRegistry.execute('preview_change',request,ctx);
  const calls=[
   {name:'discover_tools',parameters:{request:'Define and accept the Product'}},
   {name:'define_product',parameters:{title:'Actor direct write'}},
   {name:'apply_change',parameters:{request,fingerprint:preview.fingerprint,decision:'accept'}}
  ];
  let step=0;
  const asker={json:async()=>({ok:true,data:step<calls.length
   ?{thought:'',action:'tool_call',toolCalls:[calls[step++]]}
   :{thought:'',action:'final_answer',finalAnswer:'Review required'}})} as unknown as Asker;
  const actor=new WorkflowActor({store,projectRoot:root,asker,toolDiscovery:{discover:async()=>({
   query:{},mode:'dev' as const,tools:[commandRegistry.get('define_product')!,commandRegistry.get('apply_change')!]
  })}});
  const result=await actor.execute('Define the Product and approve it myself',undefined,{executionAuthority:'project-write'});
  const results=result.events.flatMap(event=>event.toolResults??[]);
  expect(results.some(result=>result.isError)).toBe(true);
  expect(JSON.stringify(results)).toContain('review_required');
  store.close();store=new WorkflowStore(root);
  expect(await store.getEntity('PRODUCT',Product.dcr)).toBeNull();
 });

 it('requires the exact host fingerprint, preserves cancellation, and cannot upgrade nested agent context',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-host-'));
  store=new WorkflowStore(root);initializeTools();
  const current=store,ctx={store:current,projectRoot:root,executionAuthority:'project-write' as const};
  const request={action:'product_change',mutations:[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Reviewed charter'}}]};
  const preview=await commandRegistry.execute('preview_change',request,ctx);
  const apply=(decision='accept')=>commandRegistry.execute('apply_change',{request,fingerprint:preview.fingerprint,decision},ctx);
  for(const decision of ['reject','cancel']) expect((await apply(decision)).ok).toBe(false);
  expect((await current.withExecutionContext('project-write',undefined,apply,'wrong fingerprint')).status).toBe('review_required');
  const nested=await current.withExecutionContext('project-write',undefined,()=>
   current.withExecutionContext('project-write',undefined,apply,preview.fingerprint));
  expect(nested.status).toBe('review_required');
  const abort=new AbortController();abort.abort();
  await expect(current.withExecutionContext('project-write',abort.signal,apply,preview.fingerprint)).rejects.toThrow();
  await expect(commandRegistry.execute('apply_change',{request,fingerprint:preview.fingerprint,decision:'accept'},
   {...ctx,executionAuthority:'read-only'})).rejects.toThrow('read-only');
  const approved=await current.withExecutionContext('project-write',undefined,apply,preview.fingerprint);
  expect(approved.ok).toBe(true);
  expect((await current.withExecutionContext('project-write',undefined,apply,preview.fingerprint)).ok).toBe(false);
  store.close();store=new WorkflowStore(root);
  expect(await store.getEntity('PRODUCT',Product.dcr)).toMatchObject({title:'Reviewed charter',version:1});
 });

 it('refuses raw legacy store writers reached through an actual project-write commandRegistry call',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-legacy-'));
  store=new WorkflowStore(root);initializeTools();
  const local=new CommandRegistry();
  local.register({name:'legacy_definition',category:'planning',description:'Adversarial legacy writer',
   parameters:z.object({}),execute:(_args,ctx)=>ctx.store.upsertEntity(Product.dcr,{id:'PRODUCT',title:'Unreviewed'})});
  local.register({name:'legacy_mutation',category:'planning',description:'Direct Product mutation owner',parameters:z.object({}),
   execute:(_args,ctx)=>applyProductMutations(ctx.store,[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Unreviewed'}}])});
  await expect(local.execute('legacy_mutation',{},{store,projectRoot:root,executionAuthority:'project-write'})).rejects.toThrow('review');
  await expect(local.execute('legacy_definition',{},{
   store,projectRoot:root,executionAuthority:'project-write'
  })).rejects.toThrow('review');
  store.close();store=new WorkflowStore(root);
  expect(await store.getEntity('PRODUCT',Product.dcr)).toBeNull();
 });

 it('keeps project-write stdio MCP self-approval inert and applies only through the local reviewed host',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-stdio-'));
  store=new WorkflowStore(root);initializeTools();
  const binary=process.env.AIWF_PUBLIC_BINARY;
  const cli=path.resolve(import.meta.dir,'../src/cli.ts');
  const transport=new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[cli,'mcp'],
   cwd:root,env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'} as Record<string,string>,stderr:'pipe'});
  const client=new Client({name:'product-authority-proof',version:'1'});
  try {
   await client.connect(transport);
   const rpc=async(name:string,args:Record<string,unknown>)=>{
    const response=await client.callTool({name,arguments:args});
    expect(response.isError).not.toBe(true);
    return JSON.parse((response.content as Array<{text:string}>)[0]!.text);
   };
   expect((await client.callTool({name:'define_product',arguments:{title:'MCP direct write'}})).isError).toBe(true);
   const request={action:'product_change',mutations:[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'MCP proposal'}}]};
   const preview=await rpc('preview_change',request);
   for(const decision of ['reject','cancel','accept']) {
    const result=await rpc('apply_change',{request,fingerprint:preview.fingerprint,decision});
    expect(result.ok).toBe(false);
    if(decision==='accept') expect(result.status).toBe('review_required');
    store.close();store=new WorkflowStore(root);
    expect(await store.getEntity('PRODUCT',Product.dcr)).toBeNull();
   }
   fs.writeFileSync(path.join(root,'review.json'),JSON.stringify(preview));
   const run=(...args:string[])=>Bun.spawnSync(binary?[binary,...args]:['bun',cli,...args],{cwd:root,stderr:'pipe'});
   const accepted=run('product-change','accept','review.json');
   expect(accepted.exitCode).toBe(0);
   expect(run('product-change','accept','review.json').exitCode).not.toBe(0);
   store.close();store=new WorkflowStore(root);
   expect(await store.getEntity('PRODUCT',Product.dcr)).toMatchObject({title:'MCP proposal',version:1});
   const update={action:'product_change',mutations:[{kind:'product_update',entityType:'Product',id:'PRODUCT',fields:{title:'Stale proposal'}}]};
   const stale=await rpc('preview_change',update);
   const second={...update,mutations:[{...update.mutations[0],fields:{title:'Current reviewed charter'}}]};
   const current=await rpc('preview_change',second);
   fs.writeFileSync(path.join(root,'review.json'),JSON.stringify(current));
   expect(run('product-change','accept','review.json').exitCode).toBe(0);
   expect((await client.callTool({name:'apply_change',arguments:{request:update,fingerprint:stale.fingerprint,decision:'accept'}})).isError).toBe(true);
   store.close();store=new WorkflowStore(root);
   expect(await store.getEntity('PRODUCT',Product.dcr)).toMatchObject({title:'Current reviewed charter',version:2});
  } finally {await client.close();await transport.close();}
 },30000);

 it('preserves Ticket-owned technical preparation inside project-write execution without approving definitions',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-work-'));
  store=new WorkflowStore(root);initializeTools();
  const current=store;
  await commandRegistry.execute('create_ticket',{id:'P',title:'Persist jobs and migrate records',body:'Persist new jobs; migrate historical records separately.',
   acceptanceCriteria:['Restart retains jobs','Old records migrate safely']},{store:current,projectRoot:root,executionAuthority:'project-write'});
  const parent=(await current.getEntity<Ticket>('P',Ticket.dcr))!;
  const systemOne: SystemOne={assess:async()=>({backendId:'fixture',quality:'high',latencyMs:0,
   answers:Object.fromEntries(Object.entries({workKind:'code',scope:'grounded',context:'none',atomicity:'split',depth:'deterministic'})
    .map(([id,choice])=>[id,{choice,probabilities:{[choice]:0.99}}]))})};
  const result=await current.withExecutionContext('project-write',undefined,()=>parent.prepare(current,{
   systemOne,critic:'none',propose:async()=>({rationale:'Two independently verifiable technical outcomes.',children:[
    {id:'P/persist',title:'Persist jobs',body:'Write and reload queued jobs.',acceptanceCriteria:['Restart retains jobs'],relations:[],dependsOn:[]},
    {id:'P/migrate',title:'Migrate records',body:'Migrate historical records.',acceptanceCriteria:['Old records migrate safely'],relations:[],dependsOn:['P/persist']}
   ]})
  }));
  expect(result.status).toBe('complete');
  store.close();store=new WorkflowStore(root);
  expect((await store.getOutgoing('P/migrate','depends_on')).map(edge=>store!.localId(edge.targetId))).toEqual(['P/persist']);
  expect((await store.getEntity<Ticket>('P',Ticket.dcr))?.claim).toBeNull();
  expect(await store.getEntity('PRODUCT',Product.dcr)).toBeNull();
 });

 it('revokes nested and detached review authority when the owning host call returns',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-product-expiry-'));
  store=new WorkflowStore(root);initializeTools();
  const current=store,ctx={store:current,projectRoot:root,executionAuthority:'project-write' as const};
  const request={action:'product_change',mutations:[{kind:'product_create',entityType:'Product',id:'PRODUCT',fields:{title:'Expired review'}}]};
  const preview=await commandRegistry.execute('preview_change',request,ctx);
  let resume!:()=>void,child!:Promise<unknown>;
  const gate=new Promise<void>(resolve=>{resume=resolve;});
  await current.withExecutionContext('project-write',undefined,async()=>{
   child=current.withExecutionContext('project-write',undefined,async()=>{
    await gate;
    return commandRegistry.execute('apply_change',{request,fingerprint:preview.fingerprint,decision:'accept'},ctx);
   });
  },preview.fingerprint);
  resume();
  await expect(child).rejects.toThrow('read-only');
  store.close();store=new WorkflowStore(root);
  expect(await store.getEntity('PRODUCT',Product.dcr)).toBeNull();
 });

});
