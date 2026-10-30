/**
 * Responsibility: S1 canonical read API acceptance through actual transports.
 * Scope: Disposable canonical project, CLI processes, stdio MCP and live Workspace HTTP.
 */
import {afterEach, beforeEach, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {startWorkspace} from '../src/workspace/server.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const cli=path.resolve(import.meta.dir,'../src/cli.ts');
let root:string,store:WorkflowStore,workspace:ReturnType<typeof startWorkspace>,client:Client;
const run=(...args:string[])=>Bun.spawnSync(['bun',cli,...args],{cwd:root,stderr:'pipe',timeout:15000});
const json=(...args:string[])=>{const r=run(...args);if(!r.success)throw Error(r.stderr.toString());return JSON.parse(r.stdout.toString());};
const http=async(route:string,init:RequestInit={})=>fetch(workspace.url.split('/#')[0]+route,{...init,headers:{'x-aiwf-token':workspace.url.split('#')[1]!,...init.headers}});
beforeEach(async()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-s1-'));Bun.spawnSync(['git','init','-q'],{cwd:root});
 expect(run('init').success).toBe(true);
 json('ticket','new','--id','T1','--title','Canonical read');json('ticket','new','--id','T2','--title','Blocker');
 store=new WorkflowStore(root);await store.relate('T2','blocks','T1');expect(run('index').success).toBe(true);
 workspace=startWorkspace({store,projectRoot:root,executionAuthority:'project-write'});
 client=new Client({name:'s1-acceptance',version:'1'});
 await client.connect(new StdioClientTransport({command:'bun',args:[path.resolve(import.meta.dir,'../src/mcp.ts')],cwd:root,stderr:'pipe',env:{...process.env,AIWF_EXECUTION_AUTHORITY:'read-only'}}));
});
afterEach(async()=>{await client?.close();await workspace?.server.stop(true);store?.close();if(root)fs.rmSync(root,{recursive:true,force:true});});
it('preserves Ticket identity and read-only investigation through CLI, MCP and HTTP',async()=>{
 const expected=json('ticket','show','T1','--json');
 expect(json('ticket','status','T1','--json')).toEqual(expected);
 const mcp=await client.callTool({name:'ticket',arguments:{action:'show',ticketId:'T1'}});
 expect(mcp.isError).not.toBe(true);expect(JSON.parse((mcp.content as {text:string}[])[0]!.text)).toEqual(expected);
 expect(await (await http('/api/v1/ticket/T1')).json()).toEqual(expected);
 expect(await (await http('/api/v1/ticket/T1/status')).json()).toEqual(expected);
 const investigation=await http('/api/v1/ticket/T1/investigate',{method:'POST',body:'{}'});
 expect(await investigation.json()).toMatchObject({status:'blocked',artifactId:'T1'});
 expect(await (await http('/api/v1/ticket/T1')).json()).toEqual(expected);
 expect((await http('/api/v1/ticket/MISSING')).status).toBe(404);
 expect((await http('/api/v1/ticket/T1/investigate',{method:'POST',body:'{"approved":true}'})).status).toBe(400);
},30000);
it('discovers predicates and exact directed links with strict native filters',async()=>{
 const predicates=json('graph:predicate','list','--json');
 expect(await (await http('/api/v1/graph/predicate')).json()).toEqual(predicates);
 const check=json('graph:predicate','check','Feature','enables','UserStory','--json');
 expect(check).toMatchObject({allowed:true});
 expect(await (await http('/api/v1/graph/predicate/check?sourceKind=Feature&predicate=enables&targetKind=UserStory')).json()).toEqual(check);
 const links=json('graph:link','show','T2','blocks','T1','--json');
 expect(await (await http('/api/v1/graph/link?sourceId=T2&predicate=blocks&targetId=T1')).json()).toEqual(links);
 expect(json('graph:link','list','--data-json','{"sourceId":"T2","limit":1}','--json').links).toHaveLength(1);
 for(const data of ['{"sourceId":"T2","limit":1,"limit":2}','{"sourceId":"T2","approved":true}','{"sourceId":"T2","limit":null}'])expect(run('graph:link','list','--data-json',data).success).toBe(false);
 expect(run('graph:link','create','T2','blocks','T1').success).toBe(false);
 expect((await http('/api/v1/graph/link',{method:'POST',body:'{}'})).status).toBe(405);
},30000);
it('keeps stale GETs inert and refuses client-forged approval',async()=>{
 fs.writeFileSync(path.join(root,'new.ts'),'export const fresh = true;');
 const before=Bun.hash(store.db.serialize());
 for(const route of ['/api/catalog','/api/entity?kind=Module&id=mod:src','/api/v1/ticket/T1','/api/v1/graph/predicate'])await http(route);
 expect(Bun.hash(store.db.serialize())).toBe(before);
 const apply=await http('/api/apply',{method:'POST',body:JSON.stringify({request:{action:'product_change',mutations:[{kind:'product_create',entityType:'Goal',id:'FORGED',fields:{title:'Forged'}}]},fingerprint:'fake',decision:'accept'})});
 expect(apply.status).toBe(403);expect(await store.getEntity('FORGED')).toBeNull();
 expect((await fetch(workspace.url.split('/#')[0]+'/api/v1/ticket')).status).toBe(403);
 expect((await http('/api/v1/ticket',{headers:{Origin:'https://evil.example'}})).status).toBe(403);
 const spec=await (await http('/api/v1/openapi.json')).json();expect(spec.openapi).toBe('3.1.0');
},30000);

it('executes all S1 reads through the installed shell-ui on a real PTY',async()=>{
 let output='',notify=()=>{};
 const proc=Bun.spawn(['bun',cli,'shell'],{cwd:root,env:{...process.env,HOME:root},terminal:{cols:180,rows:40,data(_terminal,data){output+=new TextDecoder().decode(data);notify();}}});
 const wait=async(pattern:RegExp)=>{await new Promise<void>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('PTY output missing '+pattern+': '+output.slice(-1800))),5000);
  notify=()=>{if(pattern.test(output)){clearTimeout(timer);resolve();}};notify();
 });};
 const command=async(text:string,expected:RegExp)=>{output='';proc.terminal!.write(text+'\r');await wait(new RegExp(expected.source+'[\\s\\S]*aiwf> '));return output;};
 try{
  await wait(/aiwf> /);
  for(const [text,pattern] of [
   ['ticket list --json',/"tickets"/],['ticket show T1 --json',/"id": "T1"/],['ticket status T1 --json',/"id": "T1"/],
   ['ticket investigate T1 --json',/"status": "blocked"/],['graph:predicate list --json',/"enables"/],
   ['graph:predicate check Feature enables UserStory --json',/"allowed": true/],
   ['graph:link list --source T2 --json',/"predicate": "blocks"/],['graph:link show T2 blocks T1 --json',/"targetId": "T1"/]
  ] as const)await command(text,pattern);
  output='';proc.terminal!.write('ticket sh\t');await wait(/ticket show/);proc.terminal!.write(' T1\r');await wait(/"id": "T1"[\s\S]*aiwf> /);
  output='';proc.terminal!.write('ticket show\r');await wait(/ticket ID/);proc.terminal!.write('T1\r');await wait(/"id": "T1"/);await wait(/aiwf> /);
  await command('ticket nonsense T1',/Error:/);
  output='';proc.terminal!.write('ticket show T1');proc.terminal!.write('\x03');await wait(/aiwf> /);
  proc.terminal!.write('exit\r');await proc.exited;expect(proc.exitCode).toBe(0);
 }finally{if(proc.exitCode===null){proc.kill(9);await proc.exited;}proc.terminal?.close();}
},30000);
it('validates JSON file/stdin, pagination, exact references and finite MCP schemas',async()=>{
 const filters=path.join(root,'filters.json');fs.writeFileSync(filters,'{"sourceId":"T2","limit":1}');
 const expected=json('graph:link','list','--source','T2','--limit','1','--json');
 expect(json('graph:link','list','--data-file',filters,'--json')).toEqual(expected);
 const stdin=Bun.spawnSync(['bun',cli,'graph:link','list','--data-file','-','--json'],{cwd:root,stdin:Buffer.from('{"sourceId":"T2","limit":1}'),stderr:'pipe'});
 expect(stdin.success).toBe(true);expect(JSON.parse(stdin.stdout.toString())).toEqual(expected);
 for(const args of [
 ['ticket','show','t1'],['graph:predicate','check','Feature','made_up','UserStory'],['graph:link','show','T1','blocks','T2'],
 ['graph:link','list','--source','T2','--data-json','{}'],['graph:link','list','--data-json','{"sourceId":"T2","limit":1.2}'],
 ['graph:link','list','--data-json','{"sourceId":"T2","limit":9007199254740993}'],['graph:link','list','--payload-json','{}'],
 ['graph:link','list','--data-json','{"sourceId":"T2","__proto__":{}}'],['graph:link','list','--data-json','{"sourceId":"T2","limit":1e999}'],
 ['graph:link:extra','list'],['ticket','T1','resolve']
 ])expect(run(...args).success).toBe(false);
 const page=json('ticket','list','--limit','1','--json');expect(page.tickets).toHaveLength(1);expect(page.cursor).toBeString();
 expect(json('ticket','list','--limit','1','--cursor',page.cursor,'--json').tickets[0].id).not.toBe(page.tickets[0].id);
 for(const [name,args] of [['graph.predicate',{action:'check',sourceKind:'Feature',predicate:'enables',targetKind:'UserStory'}],['graph.link',{action:'show',sourceId:'T2',predicate:'blocks',targetId:'T1'}]] as const){
  const result=await client.callTool({name,arguments:args});expect(result.isError).not.toBe(true);
  const route=name==='graph.link'?'/api/v1/graph/link?sourceId=T2&predicate=blocks&targetId=T1':'/api/v1/graph/predicate/check?sourceKind=Feature&predicate=enables&targetKind=UserStory';
  expect(JSON.parse((result.content as {text:string}[])[0]!.text)).toEqual(await (await http(route)).json());
 }
 const tools=await client.listTools();console.log('S1 tools/list '+JSON.stringify({tools:tools.tools.length,bytes:Buffer.byteLength(JSON.stringify(tools))}));
 for(const name of ['ticket','graph.predicate','graph.link'])expect(tools.tools.some(tool=>tool.name===name)).toBe(true);
 expect((await client.callTool({name:'graph.link',arguments:{action:'create',sourceId:'T2',predicate:'blocks',targetId:'T1'}})).isError).toBe(true);
},30000);
