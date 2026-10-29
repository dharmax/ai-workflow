import {afterEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket} from '../src/graph/ontology.ts';
import {initializeTools,registry} from '../src/tools/index.ts';
import {processShellInput} from '../src/shell.ts';
import {WorkflowActor} from '../src/helpers/actor/engine.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const cli=path.resolve('src/cli.ts');
let root:string,store:WorkflowStore|undefined;
const run=(...args:string[])=>Bun.spawnSync(process.env.AIWF_TEST_BINARY?[process.env.AIWF_TEST_BINARY,...args]:['bun',cli,...args],{cwd:root,stderr:'pipe'});
function json(...args:string[]){const r=run(...args);if(!r.success) throw Error(r.stderr.toString()+r.stdout.toString());return JSON.parse(r.stdout.toString());}
afterEach(()=>{store?.close();store=undefined;if(root)fs.rmSync(root,{recursive:true,force:true});});
describe('first-class Bug public journey',()=>{
 it('reports unknowns, completes triage, preserves identity through edit, sync, shell and reopen',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-bug-public-'));
  Bun.spawnSync(['git','init','-q'],{cwd:root});expect(run('init').success).toBe(true);
  const reported=json('bug','new','--id','B1','--title','Incorrect saved total');
  expect(reported.kind).toBe('bug');
  const incomplete=json('bug','triage','B1');
  expect(incomplete.lane).toBe('Todo');
  expect(incomplete.missing).toEqual(['reproduction','expected','actual']);
  expect(incomplete.reasons[0]).toContain('Incomplete Bug report');
  for(const key of ['ready','eligible','verificationState']) expect(key in incomplete).toBe(false);
  expect(run('claim','B1','agent').success).toBe(false);
  expect(run('bug','resolve','B1').exitCode).toBe(2);
  expect(json('bug','show','B1').verification).toBeNull();
  json('bug','edit','B1','--reproduction','Run total 2 3','--expected','5','--actual','23','--severity','high','--priority','1','--evidence','tests/total.test.ts');
  const triage=json('bug','triage','B1');
  expect(triage.lane).toBe('Todo');
  expect(triage.missing).toEqual([]);
  expect(triage.reasons).toEqual([]);
  for(const key of ['ready','eligible','verificationState']) expect(key in triage).toBe(false);
  expect('verificationState' in json('bug','show','B1')).toBe(false);
  expect(json('bug','show','B1').defect.actual).toBe('23');
  expect(run('bug','new','--title','Different title','--reproduction','Run total 2 3','--expected','5','--actual','23').exitCode).toBe(2);
  expect(json('work','bug','show','B1').id).toBe('B1');
  json('bug','cancel','B1');expect(json('bug','show','B1').lane).toBe('Cancelled');
  expect(run('sync').success).toBe(true);expect(json('bug','show','B1').lane).toBe('Cancelled');
  json('bug','reopen','B1');expect(json('bug','show','B1').lane).toBe('Todo');
  json('bug','block','B1');expect(json('bug','show','B1').lane).toBe('Blocked');
  json('bug','reopen','B1');
  expect(json('bugs','--severity','high').map((b:{id:string})=>b.id)).toEqual(['B1']);
  expect(run('bug','edit','B1','--severity','fatal').success).toBe(false);
  expect(run('sync').success).toBe(true);
  const board=fs.readFileSync(path.join(root,'kanban.md'),'utf8');expect(board).toContain('Type: Bug');expect(board).toContain('high');
  expect(run('sync').success).toBe(true);expect(json('bug','show','B1').title).toBe('Incorrect saved total');
  initializeTools();store=new WorkflowStore(root);
  const actor=new WorkflowActor({store,projectRoot:root,offline:true});
  const shown=await processShellInput('bug show B1',{store,projectRoot:root,actor,interactive:false});expect(JSON.parse(shown.output).kind).toBe('bug');
  expect((await processShellInput('bug --help',{store,projectRoot:root,actor,interactive:false})).output).toContain('triage');
  const client=new Client({name:'iteration1-bug',version:'1'});
  const binary=process.env.AIWF_TEST_BINARY;
  const transport=new StdioClientTransport({command:binary??'bun',args:binary?['mcp']:[path.resolve('src/mcp.ts')],cwd:root,stderr:'pipe'});
  try {
    await client.connect(transport);
    const tools=(await client.listTools()).tools;
    expect(tools.map(tool=>tool.name)).toContain('create_bug');
    for(const name of ['create_ticket','update_ticket','create_bug','update_bug']) {
      const schema=tools.find(tool=>tool.name===name)!.inputSchema.properties!.priority as {type:string;minimum:number;maximum:number};
      expect(schema).toMatchObject({type:'integer',minimum:0,maximum:5});
    }
    const read=await client.callTool({name:'get_bug',arguments:{ticketId:'B1'}});
    expect(JSON.parse((read.content as Array<{text:string}>)[0]!.text).kind).toBe('bug');
    const denied=await client.callTool({name:'create_bug',arguments:{id:'UNAPPROVED',title:'Agent report'}});
    expect(denied.isError).toBe(true);
  } finally {await client.close();}

 },30000);
 it('selects explicit kinds with priority, dependencies, foreign claims and legacy tasks',async()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-bug-rank-'));initializeTools();store=new WorkflowStore(root);
  const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
  const call=(tool:string,args:unknown)=>registry.execute(tool,args,ctx);
  await call('create_ticket',{id:'T',title:'fix BUG in task title',lane:'Todo',priority:1});
  await call('create_bug',{id:'B',title:'Saved total',priority:1,defect:{reproduction:'total 2 3',expected:'5',actual:'23',severity:'medium'}});
  expect((await call('get_ticket',{ticketId:'T'})).kind).toBe('task');
  const proposal=await call('preview_change',{action:'product_change',mutations:[{kind:'product_update',entityType:'Ticket',id:'T',fields:{kind:'bug'}}]});
  expect((await call('apply_change',{request:proposal.request,fingerprint:proposal.fingerprint,decision:'accept'})).status).toBe('review_required');
  const task=await store.getEntity<Ticket>('T',Ticket.dcr);
  await expect(store.withExecutionContext('project-write',undefined,()=>task!.update({kind:'bug'}))).rejects.toThrow('reviewed preview/apply');
  expect((await call('recommend_next_task',{})).ticket.id).toBe('B');
  expect(run('link','B','to','T','as','depends_on','--yes').success).toBe(true);
  expect((await call('recommend_next_task',{})).ticket.id).toBe('T');
  expect(run('bug','start','B').success).toBe(false);
  await call('claim_ticket',{ticketId:'T',agentId:'other'});
  expect((await call('recommend_next_task',{agentId:'me'})).ticket).toBeNull();
  expect(run('bug','show','T').success).toBe(false);
  expect(run('ticket','classify','T','bug').success).toBe(true);
  expect((await call('get_ticket',{ticketId:'T'})).kind).toBe('task');
  expect(run('ticket','classify','T','bug','--yes').success).toBe(true);
  store.close();store=new WorkflowStore(root);expect((await registry.execute('get_ticket',{ticketId:'T'},{...ctx,store})).kind).toBe('bug');
 },30000);
});
