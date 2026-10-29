import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {WorkflowActor} from '../../src/helpers/actor/engine.ts';
import {WorkflowStore} from '../../src/graph/store.ts';
import {createMcpServer, exportMcpSchemas} from '../../src/mcp.ts';
import {CANONICAL_SKILL_MD, CODEX_AGENT_RULES, MCP_INSTRUCTIONS_2_0, configureMcp} from '../../src/setup.ts';

describe('US-E01: investigate a sibling repository without changing or authorizing it', () => {
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

  it('discovers scoped investigation and its canonical installed guidance', async () => {
    expect(client.getInstructions()).toBe(MCP_INSTRUCTIONS_2_0);
    expect(client.getInstructions()).toContain('Repository investigation');
    expect(client.getInstructions()).not.toContain('Resolution options:');
    const tools = await client.listTools();
    for (const name of ['find_symbol', 'get_file_outline', 'get_symbol_source', 'execute_shell_wish']) {
      const tool = tools.tools.find(item => item.name === name)!;
      expect(tool.inputSchema.properties?.projectRoot).toEqual(expect.objectContaining({type: 'string'}));
      expect(tool.inputSchema.required ?? []).not.toContain('projectRoot');
    }
    expect(CANONICAL_SKILL_MD).toContain('Repository investigation');
    expect(CODEX_AGENT_RULES).toContain('Repository investigation');
    const schemas = path.join(root, 'schemas');
    const exported=exportMcpSchemas(schemas);
    expect(exported).toContain('find_symbol.json');
    expect(JSON.parse(fs.readFileSync(path.join(schemas, 'find_symbol.json'), 'utf8')).parameters.properties.projectRoot.type).toBe('string');
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
  it('investigates a non-pristine sibling through a configured host before and after stdio restart without transferring write authority', async () => {
    // A real installed-host journey, not a direct handler mock. The sibling already has its own
    // .ai-workflow directory; reading must neither initialize state nor change existing bytes.
    const home = path.join(root, 'external-host');
    fs.mkdirSync(path.join(home, '.cursor'), {recursive: true});
    const configPath = path.join(home, '.cursor', 'mcp.json');
    fs.writeFileSync(configPath, JSON.stringify({mcpServers: {'ai-workflow': {env: {AIWF_EXECUTION_AUTHORITY: 'project-write'}}}}));
    configureMcp({homeDir: home, link: true, mcpPath: path.resolve(import.meta.dir, '../../src/mcp.ts')});
    const entry = JSON.parse(fs.readFileSync(configPath, 'utf8')).mcpServers['ai-workflow'];
    expect(entry.env.AIWF_EXECUTION_AUTHORITY).toBe('project-write');

    const siblingState = path.join(sibling, '.ai-workflow');
    fs.mkdirSync(siblingState);
    fs.writeFileSync(path.join(siblingState, 'existing-note'), 'leave existing state alone');
    const originalEntries = fs.readdirSync(siblingState).sort();
    const sourcePath = path.join(sibling, 'src/knowledge.ts');
    const originalSource = fs.readFileSync(sourcePath, 'utf8');
    fs.writeFileSync(path.join(sibling, 'victim.txt'), 'unrelated sibling content');

    const connect = async (name: string) => {
      const current = new Client({name, version: '1'});
      await current.connect(new StdioClientTransport({
        command: entry.command, args: entry.args, cwd: project, stderr: 'pipe',
        env: {...process.env, AIWF_EXECUTION_AUTHORITY: 'read-only', ...entry.env} as Record<string, string>
      }));
      return current;
    };
    const inspect = async (current: Client) => {
      const read = await current.callTool({name: 'read_workspace_file', arguments: {projectRoot: sibling, filePath: 'victim.txt'}});
      expect(read.isError).not.toBe(true);
      expect(JSON.stringify(read.content)).toContain('unrelated sibling content');
      const symbols = await current.callTool({name: 'find_symbol', arguments: {projectRoot: sibling, name: 'KnowledgeBase', exact: true}});
      expect(symbols.isError).not.toBe(true);
      expect(JSON.stringify(symbols.content)).toContain('KnowledgeBase');
      expect(fs.readdirSync(siblingState).sort()).toEqual(originalEntries);

      const refused = await current.callTool({name: 'create_ticket', arguments: {
        projectRoot: sibling, id: 'UNAUTHORIZED', title: 'Other project write',
        kind: 'task', lane: 'Todo', priority: 0
      }});
      expect(refused.isError).toBe(true);
      expect(fs.readdirSync(siblingState).sort()).toEqual(originalEntries);
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe(originalSource);
      expect(fs.readFileSync(path.join(sibling, 'victim.txt'), 'utf8')).toBe('unrelated sibling content');

      const host = await current.callTool({name: 'find_symbol', arguments: {name: 'hostOnly', exact: true}});
      expect(host.isError).not.toBe(true);
      expect(JSON.stringify(host.content)).toContain('hostOnly');
    };

    let current: Client | undefined;
    try {
      current = await connect('us-e01-installed');
      await inspect(current);
      await current.close();
      current = undefined;
      current = await connect('us-e01-restarted');
      await inspect(current);
    } finally {
      await current?.close();
    }
  }, 15000);

});
