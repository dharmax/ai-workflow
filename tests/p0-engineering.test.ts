import {afterEach, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {configureMcp} from '../src/setup.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket, FileNode} from '../src/graph/ontology.ts';
import {parseCommand} from '../src/artifact-command.ts';

const roots: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});
async function installed(authority?: 'project-write') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-p0-engineering-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.ai-workflow'));
  const home = path.join(root, 'host');
  fs.mkdirSync(path.join(home, '.cursor'), {recursive: true});
  const file = path.join(home, '.cursor', 'mcp.json');
  fs.writeFileSync(file, JSON.stringify({mcpServers: {'ai-workflow': {
    env: authority ? {AIWF_EXECUTION_AUTHORITY: authority} : {}
  }}}));
  configureMcp({homeDir: home, link: true, mcpPath: path.resolve(import.meta.dir, '../src/mcp.ts')});
  const entry = JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers['ai-workflow'];
  expect(entry.env ?? {}).toEqual(authority ? {AIWF_EXECUTION_AUTHORITY: authority} : {});
  const git = (...args: string[]) => {
    const result = Bun.spawnSync(['git', ...args], {cwd: root});
    if (!result.success) throw Error(result.stderr.toString());
  };
  git('init');git('config', 'user.email', 'fixture@example.test');git('config', 'user.name', 'P0 fixture');
  fs.writeFileSync(path.join(root, '.gitignore'), '.ai-workflow/\nhost/\n');
  fs.writeFileSync(path.join(root, 'math.ts'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'obsolete.ts'), 'export const obsolete = true;\n');
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'original\n');
  git('add', '.');git('commit', '-m', 'fixture');
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'preserved local work\n');
  const store = new WorkflowStore(root);
  try {
    await store.upsertEntity(Ticket.dcr, {id: 'T-P0', title: 'Change source coherently', body: 'Reviewed fixture source scope', acceptanceCriteria: ['Source changes preserve unrelated work and pass execution checks'], kind: 'task', lane: 'Todo', priority: 0});
    for (const file of ['math.ts', 'obsolete.ts', 'created.ts', 'renamed.ts']) {
      await store.upsertEntity(FileNode.dcr, {id: file, title: file, metadata: {isStub: true,
        ...(['created.ts','renamed.ts'].includes(file) ? {plannedCreation: true} : {})}});
      await store.relate('T-P0', 'modifies', file);
    }
  } finally {store.close();}
  const client = new Client({name: 'external-engineering-story', version: '1'});
  clients.push(client);
  await client.connect(new StdioClientTransport({command: entry.command, args: entry.args, cwd: root,
    stderr: 'pipe', env: {...process.env, AIWF_EXECUTION_AUTHORITY: 'read-only', ...entry.env} as Record<string, string>}));
  return {root, client};
}
async function payload(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({name, arguments: args});
  if (result.isError) throw Error(JSON.stringify(result.content));
  return JSON.parse((result.content as Array<{text: string}>)[0].text);
}
it('P0 installed host discovers guarded engineering and preserves explicit host authority', async () => {
  const {client, root} = await installed('project-write');
  const names = (await client.listTools()).tools.map(tool => tool.name);
  expect(names).toContain('preview_change');expect(names).toContain('apply_change');
  expect(names).not.toContain('apply_block_patch');
  expect((await payload(client, 'get_ticket', {ticketId: 'T-P0'})).id).toBe('T-P0');
  expect(JSON.stringify(await payload(client, 'get_file_outline', {filePath: 'math.ts'}))).toContain('value');
  await payload(client, 'claim_ticket', {ticketId: 'T-P0', agentId: 'external-p0', durationMinutes: 10});
  const request = {action: 'source_change', changes: [
    {action: 'replace_text', filePath: 'math.ts', oldText: 'value = 1', newText: 'value = 2'},
    {action: 'delete_file', filePath: 'obsolete.ts'},
    {action: 'create_file', filePath: 'created.ts', content: 'export const created = true;\n'}
  ]};
  const context = {ticketId: 'T-P0', agentId: 'external-p0'};
  const preview = await payload(client, 'preview_change', {...request, ...context});
  expect(preview.blocked).toBe(false);
  expect(fs.readFileSync(path.join(root, 'math.ts'), 'utf8')).toContain('value = 1');
  const unleased = await client.callTool({name: 'apply_change', arguments: {request, fingerprint: preview.fingerprint, ticketId: 'T-P0', agentId: 'intruder'}});
  expect(unleased.isError).toBe(true);
  const invalid = {...request, changes: [...request.changes, {action: 'delete_file', filePath: 'absent.ts'}]};
  const bad = await payload(client, 'preview_change', {...invalid, ...context});
  expect(bad.blocked).toBe(true);
  const invalidApply = await client.callTool({name: 'apply_change', arguments: {request: invalid, fingerprint: preview.fingerprint, ...context}});
  expect(invalidApply.isError).toBe(true);
  expect(fs.existsSync(path.join(root, 'obsolete.ts'))).toBe(true);
  fs.appendFileSync(path.join(root, 'math.ts'), '// concurrent work\n');
  expect((await client.callTool({name: 'apply_change', arguments: {request, fingerprint: preview.fingerprint, ...context}})).isError).toBe(true);
  expect(fs.readFileSync(path.join(root, 'math.ts'), 'utf8')).toContain('// concurrent work');
  fs.writeFileSync(path.join(root, 'math.ts'), 'export const value = 1;\n');
  const result = await payload(client, 'apply_change', {request, fingerprint: preview.fingerprint, ...context});
  expect(result.ok).toBe(true);
  expect(fs.readFileSync(path.join(root, 'math.ts'), 'utf8')).toContain('value = 2');
  expect(fs.existsSync(path.join(root, 'obsolete.ts'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'created.ts'), 'utf8')).toContain('created = true');
  expect(fs.readFileSync(path.join(root, 'unrelated.txt'), 'utf8')).toBe('preserved local work\n');
  const check = Bun.spawnSync(['bun', '-e', 'const {value}=await import("./math.ts");if(value!==2)throw Error("wrong result")'], {cwd: root});
  expect(check.exitCode).toBe(0);
  const dirtyRequest = {action: 'replace_text', filePath: 'unrelated.txt', oldText: 'preserved', newText: 'lost'};
  expect((await client.callTool({name: 'preview_change', arguments: {...dirtyRequest, ...context}})).isError).toBe(true);
  const proposal = await payload(client, 'preview_change', {action: 'product_change', mutations: [{kind: 'product_create', entityType: 'Goal', id: 'SELF-APPROVED', fields: {title: 'Unreviewed intent'}}]});
  const selfApproved = await payload(client, 'apply_change', {request: proposal.request, fingerprint: proposal.fingerprint, decision: 'accept'});
  expect(selfApproved.ok).toBe(false);expect(selfApproved.status).toBe('review_required');
  const rename = {action: 'rename_file', oldPath: 'created.ts', newPath: 'renamed.ts'};
  const renaming = await payload(client, 'preview_change', {...rename, ...context});
  expect((await payload(client, 'apply_change', {request: rename, fingerprint: renaming.fingerprint, ...context})).ok).toBe(true);
  expect(fs.existsSync(path.join(root, 'created.ts'))).toBe(false);
  expect(fs.readFileSync(path.join(root, 'renamed.ts'), 'utf8')).toContain('created = true');
  await payload(client, 'release_ticket', {ticketId: 'T-P0'});
  const proof=await payload(client, 'get_ticket', {ticketId: 'T-P0'});
  expect(proof.verification).toBeNull();expect('verificationState' in proof).toBe(false);
}, 30000);
it('P0 default installed host refuses self-granted write authority and raw patch bypass', async () => {
  const {client, root} = await installed();
  for (const [name, args] of [
    ['create_ticket', {id: 'SELF', title: 'Self grant', kind: 'task', lane: 'Todo', priority: 0, executionAuthority: 'project-write'}],
    ['apply_block_patch', {filePath: 'math.ts', targetContent: 'value = 1', replacementContent: 'value = 99'}]
  ] as const) expect((await client.callTool({name, arguments: args})).isError).toBe(true);
  expect(fs.readFileSync(path.join(root, 'math.ts'), 'utf8')).toContain('value = 1');
}, 15000);
it('P0 canonical source namespace forms share the CLI and Shell parser', async () => {
  for (const topic of [['source:change'], ['source', 'change']]) {
    const parsed = await parseCommand([...topic, 'PREVIEW', '{"action":"delete_file","filePath":"obsolete.ts"}', '--ticket', 'T-P0', '--agent', 'external-p0']);
    expect(parsed).toMatchObject({family: 'artifact', tool: 'preview_change', args: {action: 'delete_file', filePath: 'obsolete.ts', ticketId: 'T-P0', agentId: 'external-p0'}});
  }
});
