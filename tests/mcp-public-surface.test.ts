import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {registry} from '../src/tools/index.ts';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {WorkflowActor} from '../src/actor/engine.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {createMcpServer, exportMcpSchemas} from '../src/mcp.ts';

describe('MCP public domain surface (historical US-E05 cases awaiting digestion)', () => {
  let root: string, project: string;
  let store: WorkflowStore, client: Client;
  let server: ReturnType<typeof createMcpServer>['server'];

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-client-research-'));
    project = path.join(root, 'host');
    fs.mkdirSync(path.join(project, 'src'), {recursive: true});
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({name: path.basename(project)}));
    fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({compilerOptions: {target: 'ESNext', module: 'ESNext'}}));
    fs.writeFileSync(path.join(project, 'src/index.ts'), 'export function hostOnly() { return 1; }');
    store = new WorkflowStore(project, true);
    await store.sp.ready();
    server = createMcpServer({store, projectRoot: project, executionAuthority:'project-write', actor: new WorkflowActor({store, projectRoot: project, offline: true})}).server;
    client = new Client({name: 'investigation-client', version: '1'});
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client?.close();
    await server?.close();
    store?.close();
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('advertises canonical public domain tools and exports schemas', async () => {
    const tools = await client.listTools();
    for (const name of ['claim_ticket','process_story','get_product_coverage','get_product_impact','list_user_stories']) {
      expect(tools.tools.some(item => item.name === name)).toBe(true);
    }
    for (const name of ['create_user_story','create_feature','run_command','apply_block_patch']) {
      expect(tools.tools.some(item => item.name === name)).toBe(false);
    }
    expect(tools.tools.find(item=>item.name==='execute_shell_wish')?.description).toContain('AI-Workflow cognitive engine');
    const schemas = path.join(root, 'schemas');
    fs.mkdirSync(schemas,{recursive:true});
    fs.writeFileSync(path.join(schemas,'run_command.json'),'{}');
    const exported=exportMcpSchemas(schemas);
    expect(exported).toContain('claim_ticket.json');
    expect(exported).toContain('execute_shell_wish.json');
    expect(exported).not.toContain('run_command.json');
    expect(fs.existsSync(path.join(schemas,'run_command.json'))).toBe(false);
    const claim=JSON.parse(fs.readFileSync(path.join(schemas,'claim_ticket.json'),'utf8'));
    expect(claim).toMatchObject({name:'claim_ticket'});
    expect(claim.parameters.properties.ticketId).toBeDefined();
  });

  it('allows advertised domain calls but refuses hidden/unknown primitives through an actual MCP client',async()=>{
    const recommended=await client.callTool({name:'recommend_next_task',arguments:{}});
    expect(recommended.isError).not.toBe(true);
    expect(JSON.stringify(recommended.content)).toContain('reason');
    const wished=await client.callTool({name:'execute_shell_wish',arguments:{wish:'What is the recommended next task?'}});
    expect(wished.isError).not.toBe(true);
    expect(JSON.stringify(wished.content)).toContain('AI-Workflow');
    expect((await client.callTool({name:'list_user_stories',arguments:{}})).isError).not.toBe(true);
    for(const name of ['create_user_story','create_feature','run_command','non_existent_tool']) {
      const result=await client.callTool({name,arguments:{}});
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain('not exposed');
    }
    const absent=await client.callTool({name:'update_ticket_state',arguments:{ticketId:'TKT-NON-EXISTENT',lane:'Done'}});
    expect(absent.isError).toBe(true);
    expect(JSON.stringify(absent.content)).toContain('TKT-NON-EXISTENT');
  });

  it('fences delayed public cleanup after same-agent reacquisition', async () => {
    await client.callTool({name:'create_ticket',arguments:{id:'LEASE',title:'Retain canonical work'}});
    const call=async(name:string,args:Record<string,unknown>)=>{
      const result=await client.callTool({name,arguments:args});
      expect(result.isError).not.toBe(true);
      return JSON.parse((result.content as Array<{text:string}>)[0]!.text);
    };
    const first=await call('claim_ticket',{ticketId:'LEASE',agentId:'same'});
    const next=await call('claim_ticket',{ticketId:'LEASE',agentId:'same'});
    expect(first.claim.leaseId).not.toBe(next.claim.leaseId);
    expect((await call('release_ticket',{ticketId:'LEASE',leaseId:first.claim.leaseId})).success).toBe(false);
    expect((await call('get_ticket',{ticketId:'LEASE'})).claim).toEqual(next.claim);
    expect((await call('release_ticket',{ticketId:'LEASE',leaseId:next.claim.leaseId})).success).toBe(true);
    expect(await call('get_ticket',{ticketId:'LEASE'})).toMatchObject({lane:'Todo',claim:null,verification:null});
  });

  it('forwards an SDK cancellation notification to the executing tool', async () => {
    const original=registry.get('get_ticket')!;
    let entered!:()=>void, observed!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve});
    const cancelled=new Promise<void>(resolve=>{observed=resolve});
    registry.register({...original,execute:async(_input,ctx)=>{
      entered();
      await new Promise<void>(resolve=>{
        if(ctx.signal?.aborted){observed();resolve();return;}
        const timer=setTimeout(resolve,1000);
        ctx.signal?.addEventListener('abort',()=>{clearTimeout(timer);observed();resolve();},{once:true});
      });
      return {cancelled:ctx.signal?.aborted};
    }});
    try {
      const controller=new AbortController();
      const pending=client.callTool({name:'get_ticket',arguments:{ticketId:'T'}},undefined,{signal:controller.signal}).catch(error=>error);
      await started;controller.abort(Error('Public MCP cancellation'));
      await pending;
      expect(await Promise.race([cancelled.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),200))])).toBe(true);
    } finally {registry.register(original);}
  });
});
