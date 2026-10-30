/**
 * Responsibility: Phase 1 Ticket/Link semantics at real public boundaries.
 * Scope: Executable CLI, interactive shell dispatch and stdio MCP in disposable projects.
 */
import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {WorkflowStore} from '../src/graph/store.ts';
import {WorkflowActor} from '../src/helpers/actor/engine.ts';
import {processShellInput} from '../src/shell.ts';
import {initializeTools} from '../src/tools/index.ts';

const cli=path.resolve(import.meta.dir,'../src/cli.ts');
const mcp=path.resolve(import.meta.dir,'../src/mcp.ts');
const binary=process.env.AIWF_TEST_BINARY;
describe('Phase 1 public Ticket and Link semantics',()=>{
 let root:string,store:WorkflowStore,client:Client,actor:WorkflowActor,actorCalls:number;
 const run=(...args:string[])=>Bun.spawnSync(binary?[binary,...args]:['bun',cli,...args],{cwd:root,stderr:'pipe',env:{...process.env,AIWF_EXECUTION_AUTHORITY:'read-only'},timeout:15000});
 const json=(...args:string[])=>{
  const result=run(...args);
  if(!result.success) throw Error(result.stderr.toString()+'\n'+result.stdout.toString());
  return JSON.parse(result.stdout.toString());
 };
 const call=async(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args});
 const value=(result:Awaited<ReturnType<typeof call>>)=>{
  expect(result.isError).not.toBe(true);
  return JSON.parse((result.content as Array<{text:string}>)[0]!.text);
 };
 const shell=async(input:string)=>processShellInput(input,{store,projectRoot:root,actor,interactive:false});
 beforeEach(async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-phase1-public-'));
  Bun.spawnSync(['git','init','-q'],{cwd:root});
  expect(run('init').success).toBe(true);
  json('ticket','new','--id','READ-1','--title','Inspect canonical work','--body','Read the canonical contract','--criterion','Preserve identity and lane');
  json('ticket','new','--id','BLOCK-1','--title','Explicit blocker');
  // Seed an existing runtime blocker; 'blocks' is not a human-authorable Link predicate.
  const fixture=new WorkflowStore(root);
  await fixture.relate('BLOCK-1','blocks','READ-1');
  fixture.close();
  expect(run('index').success).toBe(true);
  initializeTools();store=new WorkflowStore(root);
  actor=new WorkflowActor({store,projectRoot:root,offline:true});actorCalls=0;
  actor.execute=async()=>{actorCalls++;throw Error('Explicit command reached Actor');};
  client=new Client({name:'phase1-public-client',version:'1'});
  await client.connect(new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[mcp],cwd:root,stderr:'pipe',env:{...process.env,AIWF_EXECUTION_AUTHORITY:'read-only'}}));
 });
 afterEach(async()=>{await client?.close();store?.close();fs.rmSync(root,{recursive:true,force:true});});
 it('reads the same canonical Ticket through show/status, ergonomic syntax and restart',async()=>{
  const expected=value(await call('get_ticket',{ticketId:'READ-1'}));
  for(const args of [['ticket','show','READ-1'],['ticket','status','READ-1'],['ticket','READ-1','show'],['ticket','READ-1','status']]){
   expect(json(...args)).toEqual(expected);
   expect(JSON.parse((await shell(args.join(' '))).output)).toEqual(expected);
  }
  store.close();store=new WorkflowStore(root);
  expect(value(await call('get_ticket',{ticketId:'READ-1'}))).toEqual(expected);
  expect(json('ticket','READ-1','status')).toMatchObject({id:'READ-1',version:expected.version,lane:'Todo',verification:null});
  expect(actorCalls).toBe(0);
 },30000);
 it('discovers Link types and identical bounded canonical relationships',async()=>{
  const types=value(await call('link',{action:'allowed',sourceKind:'Ticket',targetKind:'Ticket'}));
  expect(json('link','types','Ticket','Ticket')).toEqual(types);
  expect(JSON.parse((await shell('link types Ticket Ticket')).output)).toEqual(types);
  expect(types.relations.some((row:{predicate:string})=>row.predicate==='depends_on')).toBe(true);
  const links=value(await call('link',{action:'inspect',id:'READ-1',direction:'incoming',limit:1}));
  expect(links.links[0]).toMatchObject({sourceId:'BLOCK-1',targetId:'READ-1',predicate:'blocks'});
  expect(json('links','READ-1','--incoming','--limit','1')).toEqual(links);
  expect(JSON.parse((await shell('links READ-1 --incoming --limit 1')).output)).toEqual(links);
  expect(links.freshness).toEqual({basis:'canonical-relations',sourceIndex:'not-assessed'});
 },30000);
 it('returns truthful blocked investigation with read-only authority and no canonical mutation',async()=>{
  const before=value(await call('get_ticket',{ticketId:'READ-1'}));
  const expected={status:'blocked',artifactId:'READ-1',blockers:[{artifactId:'BLOCK-1',reason:'Explicit graph blocker'}]};
  expect(value(await call('investigate_ticket',{ticketId:'READ-1'}))).toEqual(expected);
  for(const args of [['investigate','READ-1'],['ticket','investigate','READ-1'],['ticket','READ-1','investigate']]){
   const result=run(...args);expect(result.exitCode).toBe(2);expect(JSON.parse(result.stdout.toString())).toEqual(expected);
   expect(JSON.parse((await shell(args.join(' '))).output)).toEqual(expected);
  }
  expect(value(await call('get_ticket',{ticketId:'READ-1'}))).toEqual(before);
  expect(actorCalls).toBe(0);
 },30000);
 it('returns the same substantive read-only dossier for existing duplicate work without accepting it',async()=>{
  json('ticket','new','--id','DUP-1','--title','Inspect canonical work','--body','Read the canonical contract','--criterion','Preserve identity and lane');
  expect(run('index').success).toBe(true);
  const before=value(await call('get_ticket',{ticketId:'DUP-1'}));
  const expected=value(await call('investigate_ticket',{ticketId:'DUP-1'}));
  expect(expected).toMatchObject({status:'complete',artifactId:'DUP-1',value:{ticket:{id:'DUP-1',lane:'Todo'},disposition:'rejectable'}});
  expect(expected.value.evidence.some((item:{id:string;provenance:string})=>item.id==='READ-1'&&item.provenance==='Identical existing work contract')).toBe(true);
  expect(json('ticket','DUP-1','investigate')).toEqual(expected);
  expect(JSON.parse((await shell('ticket DUP-1 investigate')).output)).toEqual(expected);
  expect(value(await call('get_ticket',{ticketId:'DUP-1'}))).toEqual(before);
  expect(actorCalls).toBe(0);
 },30000);
 it('keeps help and malformed input inert and denies writes at stdio MCP',async()=>{
  const before=value(await call('get_ticket',{ticketId:'READ-1'}));
  for(const args of [['ticket','--help'],['ticket','READ-1','--help'],['help','ticket'],['help','link','types']]){
   const result=run(...args);expect(result.success).toBe(true);
   expect((await shell(args.join(' '))).output.trim()).toBe(result.stdout.toString().trim());
  }
  for(const args of [['ticket','READ-1','unknown'],['ticket','status'],['ticket','READ-1','show','--yes'],['link','types','NoSuchKind'],['links','READ-1','--limit','0']]){
   expect(run(...args).success).toBe(false);
   expect((await shell(args.join(' '))).output).toMatch(/error|invalid|unknown|missing/i);
  }
  expect((await call('get_ticket',{ticketId:'READ-1',decision:'accept'})).isError).toBe(true);
  expect((await call('investigate_ticket',{ticketId:'READ-1',agentId:'escalate'})).isError).toBe(true);
  expect((await call('get_ticket',{ticketId:' '})).isError).toBe(true);
  for(const [name,args] of [['create_ticket',{id:'DENIED',title:'Unapproved'}],['update_ticket',{ticketId:'READ-1',title:'Unapproved'}],['define_product',{title:'Unapproved'}]] as const){
   expect((await call(name,args)).isError).toBe(true);
  }
  expect(value(await call('get_ticket',{ticketId:'READ-1'}))).toEqual(before);
  expect((await call('get_ticket',{ticketId:'MISSING'})).isError).toBe(true);
  expect(run('ticket','MISSING','show').stderr.toString()).toContain('not found');
  expect((await shell('ticket MISSING show')).output).toContain('not found');
  expect(actorCalls).toBe(0);
 },30000);
 it('reports a stale index equally and leaves refresh to the explicit index owner',async()=>{
  fs.writeFileSync(path.join(root,'changed.ts'),'export const currentValue = 1;\n');
  const before=value(await call('get_ticket',{ticketId:'READ-1'}));
  const stale=await call('investigate_ticket',{ticketId:'READ-1'});
  expect(stale.isError).toBe(true);expect(JSON.stringify(stale.content)).toContain('AST index is stale');
  const result=run('ticket','READ-1','investigate');
  expect(result.success).toBe(false);expect(result.stderr.toString()).toContain('AST index is stale');
  expect((await shell('ticket READ-1 investigate')).output).toContain('AST index is stale');
  expect(value(await call('get_ticket',{ticketId:'READ-1'}))).toEqual(before);
  // Link reads report canonical edge revisions, without claiming current source-index evidence.
  expect(value(await call('link',{action:'inspect',id:'READ-1'})).freshness.sourceIndex).toBe('not-assessed');
  expect(run('index').success).toBe(true);
  expect(value(await call('investigate_ticket',{ticketId:'READ-1'})).status).toBe('blocked');
 },30000);
 it('measures real default/compact tools/list and keeps legacy calls executable',async()=>{
  const full=await client.listTools();
  const compact=new Client({name:'phase1-compact-client',version:'1'});
  try{
   await compact.connect(new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[mcp],cwd:root,stderr:'pipe',env:{...process.env,AIWF_MCP_SURFACE:'compact',AIWF_EXECUTION_AUTHORITY:'read-only'}}));
   const small=await compact.listTools();
   const fullBytes=Buffer.byteLength(JSON.stringify(full)),smallBytes=Buffer.byteLength(JSON.stringify(small));
   expect(small.tools.length).toBeLessThan(full.tools.length);expect(smallBytes).toBeLessThan(fullBytes);
   for(const name of ['artifact.discovery','graph.link','ticket']) expect(small.tools.some(tool=>tool.name===name)).toBe(true);
   expect((await compact.callTool({name:'get_ticket',arguments:{ticketId:'READ-1'}})).isError).not.toBe(true);
   console.log('Phase 1 tools/list '+JSON.stringify({default:{tools:full.tools.length,bytes:fullBytes},compact:{tools:small.tools.length,bytes:smallBytes}}));
  }finally{await compact.close();}
 },30000);
});
