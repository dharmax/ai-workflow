import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {WorkflowActor} from '../src/actor/engine.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {createMcpServer, exportMcpSchemas} from '../src/mcp.ts';
import {CANONICAL_SKILL_MD, CODEX_AGENT_RULES, MCP_INSTRUCTIONS_2_0} from '../src/setup.ts';

describe('Client investigation through MCP', () => {
  let root: string, project: string, sibling: string;
  let store: WorkflowStore, client: Client;
  let server: ReturnType<typeof createMcpServer>['server'];

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-client-research-'));
    project = path.join(root, 'host');
    sibling = path.join(root, 'sibling');
    for (const dir of [project, sibling]) {
      fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: path.basename(dir)}));
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions: {target: 'ESNext', module: 'ESNext'}}));
    }
    fs.writeFileSync(path.join(project, 'src/index.ts'), 'export function hostOnly() { return 1; }');
    fs.writeFileSync(path.join(sibling, 'src/knowledge.ts'), 'export class KnowledgeBase { getContextSource() { return "sibling evidence"; } }');
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

  async function call(name: string, args: Record<string, unknown>) {
    const response = await client.callTool({name, arguments: args});
    if (response.isError) throw Error(JSON.stringify(response.content));
    const text = (response.content as Array<{type: string; text?: string}>).find(item => item.type === 'text')?.text;
    return JSON.parse(text!);
  }

  it('advertises scoped research and emits the same guidance used by installed clients', async () => {
    expect(client.getInstructions()).toBe(MCP_INSTRUCTIONS_2_0);
    expect(client.getInstructions()).toContain('Repository investigation');
    expect(client.getInstructions()).not.toContain('Resolution options:');
    const tools = await client.listTools();
    for (const name of ['find_symbol', 'get_file_outline', 'get_symbol_source', 'execute_shell_wish']) {
      const tool = tools.tools.find(item => item.name === name)!;
      expect(tool.inputSchema.properties?.projectRoot).toEqual(expect.objectContaining({type: 'string'}));
      expect(tool.inputSchema.required ?? []).not.toContain('projectRoot');
    }
    for (const name of ['claim_ticket','process_story','get_product_coverage','get_product_impact','list_user_stories']) {
      expect(tools.tools.some(item => item.name === name)).toBe(true);
    }
    for (const name of ['create_user_story','create_feature','run_command','apply_block_patch']) {
      expect(tools.tools.some(item => item.name === name)).toBe(false);
    }
    expect(tools.tools.find(item=>item.name==='execute_shell_wish')?.description).toContain('AI-Workflow cognitive engine');
    expect(CANONICAL_SKILL_MD).toContain('Repository investigation');
    expect(CODEX_AGENT_RULES).toContain('Repository investigation');
    const schemas = path.join(root, 'schemas');
    fs.mkdirSync(schemas,{recursive:true});
    fs.writeFileSync(path.join(schemas,'run_command.json'),'{}');
    const exported=exportMcpSchemas(schemas);
    expect(exported).toContain('claim_ticket.json');
    expect(exported).toContain('execute_shell_wish.json');
    expect(exported).not.toContain('run_command.json');
    expect(fs.existsSync(path.join(schemas,'run_command.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(schemas, 'find_symbol.json'), 'utf8')).parameters.properties.projectRoot.type).toBe('string');
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

  it('finds and slices an undeclared sibling without changing the default project scope', async () => {
    expect(await call('find_symbol', {name: 'hostOnly', exact: true})).toHaveLength(1);
    const matches = await call('find_symbol', {name: 'KnowledgeBase', exact: true, projectRoot: '../sibling'});
    expect(matches).toEqual(expect.arrayContaining([expect.objectContaining({filePath: 'src/knowledge.ts', name: 'KnowledgeBase'})]));
    const source = await call('get_symbol_source', {projectRoot: sibling, filePath: 'src/knowledge.ts', symbolName: 'KnowledgeBase.getContextSource'});
    expect(source.exact).toBe(true);
    expect(source.code).toContain('sibling evidence');
    expect(await call('find_symbol', {name: 'hostOnly', exact: true})).toHaveLength(1);
    expect(await call('find_symbol', {name: 'KnowledgeBase', exact: true})).toHaveLength(0);
    expect(fs.existsSync(path.join(sibling, '.ai-workflow'))).toBe(false);
  });

  it('keeps sibling and default scope correct across a restarted MCP session without persisting sibling state', async () => {
    const file=path.join(sibling,'src/knowledge.ts');
    const source=fs.readFileSync(file,'utf8');
    expect(await call('find_symbol', {name: 'KnowledgeBase', exact: true, projectRoot: sibling})).toHaveLength(1);
    expect(await call('find_symbol', {name: 'hostOnly', exact: true})).toHaveLength(1);

    await client.close();
    await server.close();
    store.close();
    store=new WorkflowStore(project,true);
    await store.sp.ready();
    server=createMcpServer({store,projectRoot:project,executionAuthority:'project-write',
      actor:new WorkflowActor({store,projectRoot:project,offline:true})}).server;
    client=new Client({name:'investigation-client-restarted',version:'1'});
    const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(await call('find_symbol', {name: 'hostOnly', exact: true})).toHaveLength(1);
    expect(await call('find_symbol', {name: 'KnowledgeBase', exact: true, projectRoot: sibling})).toHaveLength(1);
    expect(fs.readFileSync(file,'utf8')).toBe(source);
    expect(fs.existsSync(path.join(sibling,'.ai-workflow'))).toBe(false);
  });

  it('recognizes a sibling filePath and rebases it to that project', async () => {
    const outline = await call('get_file_outline', {filePath: '../sibling/src/knowledge.ts'});
    expect(outline.file).toBe('src/knowledge.ts');
    expect(outline.symbolCount).toBeGreaterThan(0);
    const source = await call('get_symbol_source', {filePath: path.join(sibling, 'src/knowledge.ts'), symbolName: 'KnowledgeBase.getContextSource'});
    expect(source.code).toContain('sibling evidence');
  });

  it('rejects an invalid explicit project instead of silently using the default', async () => {
    const response = await client.callTool({name: 'find_symbol', arguments: {projectRoot: 'missing-project', name: 'hostOnly'}});
    expect(response.isError).toBe(true);
  });
});
