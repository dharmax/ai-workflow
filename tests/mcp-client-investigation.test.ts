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
    server = createMcpServer({store, projectRoot: project, actor: new WorkflowActor({store, projectRoot: project, offline: true})}).server;
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
    expect(response.isError).not.toBe(true);
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
    expect(CANONICAL_SKILL_MD).toContain('Repository investigation');
    expect(CODEX_AGENT_RULES).toContain('Repository investigation');
    const schemas = path.join(root, 'schemas');
    exportMcpSchemas(schemas);
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
  });

  it('keeps a cold host graph usable after sibling-first access', async () => {
    expect(await call('find_symbol', {name: 'KnowledgeBase', exact: true, projectRoot: sibling})).toHaveLength(1);
    expect(await call('find_symbol', {name: 'hostOnly', exact: true})).toHaveLength(1);
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
