/**
 * Responsibility: Registry-first externalization and fail-closed availability acceptance.
 * Scope: Real owner execution through generated Commander, Shell discovery, MCP and live Workspace HTTP.
 */
import {it,expect} from 'bun:test';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {z} from 'zod';
import {commandRegistry as r,commandId} from '../src/tools/registry.ts';
import {initializeTools} from '../src/tools/index.ts';
import {parseCommand} from '../src/artifact-command.ts';
import {commandDiscovery} from '../src/command-presentation.ts';
import {startWorkspace} from '../src/workspace/server.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';import {createMcpServer} from '../src/mcp.ts';
it('one registration adds and removes all projections, dispatch and OpenAPI; repeated startup is stable',async()=>{
 initializeTools();const count=r.getCommands().length;expect(initializeTools()).toBe(r);expect(r.getCommands()).toHaveLength(count);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-registry-'));Bun.spawnSync(['git','init','-q'],{cwd:root});
 const store=new WorkflowStore(root,true);await store.sp.ready();
 const definition={topic:'fixture',action:'status',description:'Actual repository status',owner:'get_git_status',parameters:z.object({}).strict(),positionals:[],exposure:['cli','shell','mcp','rest'] as const,authority:'read-only' as const,http:{method:'GET' as const}};
 const c={...definition,exposure:[...definition.exposure]};r.registerCommand(c);
 let host:ReturnType<typeof startWorkspace>|undefined;let client:Client|undefined;let mcp:ReturnType<typeof createMcpServer>|undefined;
 try{
  expect(()=>r.registerCommand(c)).toThrow('Duplicate');
  const help=await parseCommand(['fixture','--help']);expect(JSON.stringify(help)).toContain('Actual repository status');
  expect(commandDiscovery().subcommands.fixture).toEqual(['status']);
  const input=await parseCommand(['fixture','status','--json']);expect(input).toMatchObject({tool:'fixture status',args:{}});
  host=startWorkspace({store,projectRoot:root});const url=new URL(host.url),headers={'x-aiwf-token':url.hash.slice(1)};
  const get=async(route:string)=>fetch(url.origin+route,{headers});
  expect(await (await get('/api/v1/fixture/status')).json()).toMatchObject({isGit:true});
  expect((await (await get('/api/v1/openapi.json')).json()).paths['/api/v1/fixture/status'].get['x-aiwf-commands']).toEqual(['fixture status']);
  mcp=createMcpServer({store,projectRoot:root});const [a,b]=InMemoryTransport.createLinkedPair();await mcp.server.connect(b);client=new Client({name:'registry-gate',version:'1'});await client.connect(a);
  expect((await client.listTools()).tools.find(t=>t.name==='fixture')?.inputSchema).toBeDefined();
  const result=await client.callTool({name:'fixture',arguments:{action:'status'}});if(result.isError)throw Error(JSON.stringify(result));expect(result.isError).not.toBe(true);
  r.removeCommand(commandId(c));
  expect(commandDiscovery().builtins).not.toContain('fixture');
  await expect(parseCommand(['fixture','status'])).rejects.toThrow();
  expect((await client.listTools()).tools.some(t=>t.name==='fixture')).toBe(false);
  expect((await client.callTool({name:'fixture',arguments:{action:'status'}})).isError).toBe(true);
  expect((await get('/api/v1/fixture/status')).status).toBe(404);
  host.server.stop(true);host=startWorkspace({store,projectRoot:root});const restarted=new URL(host.url);
  const spec=await fetch(restarted.origin+'/api/v1/openapi.json',{headers:{'x-aiwf-token':restarted.hash.slice(1)}});
  expect((await spec.json()).paths['/api/v1/fixture/status']).toBeUndefined();
  r.registerCommand({...c,enabled:false});
  expect(commandDiscovery().builtins).not.toContain('fixture');await expect(r.execute('fixture status',{}, {store,projectRoot:root})).rejects.toThrow('not exposed');
 }finally{r.removeCommand(commandId(c));await client?.close();await mcp?.server.close();host?.server.stop(true);store.close();fs.rmSync(root,{recursive:true,force:true});}
});
it('rejects missing owners, unsafe GET, ambiguous routes and unrepresentable schemas',()=>{
 initializeTools();
 const base={topic:'fixture',action:'list',description:'Invalid fixtures',parameters:z.object({}).strict(),owner:'get_git_status',exposure:['rest' as const],authority:'read-only' as const,http:{method:'GET' as const}};
 expect(()=>r.registerCommand({...base,owner:'missing'})).toThrow('Missing');
 expect(()=>r.registerCommand({...base,authority:'project-write'})).toThrow('GET');
 expect(()=>r.registerCommand({...base,parameters:z.object({transform:z.string().transform(s=>s.length)}).strict()})).toThrow();
 r.registerCommand(base);try{expect(()=>r.registerCommand({...base,action:'show'})).toThrow('Ambiguous');}finally{r.removeCommand('fixture list');}
});
