import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifactCommand } from '../src/artifact-command.ts';
import { WorkflowStore } from '../src/graph/store.ts';
import { Ticket, Feature } from '../src/model/ontology.ts';
import { initializeTools } from '../src/tools/index.ts';
import { processShellInput } from '../src/shell.ts';
import { WorkflowActor } from '../src/helpers/actor/engine.ts';
import { CANONICAL_SKILL_MD, MCP_INSTRUCTIONS_2_0 } from '../src/setup.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.ts';

describe('artifact-first shell/CLI/Actor delegation', () => {
  let root: string, store: WorkflowStore;
  beforeEach(async () => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-command-')); store = new WorkflowStore(root); initializeTools(); await store.upsertEntity(Ticket.dcr, { id: 'T', title: 'Concrete task', body: 'Preserve an authored API', acceptanceCriteria: ['API remains compatible'], lane: 'Todo' }); await store.upsertEntity(Feature.dcr, { id: 'F', title: 'Capability', body: 'Stable behavior' }); });
  afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  it('validates the same policy, custom critic IDs and explicit dirty authorization without guessing parameters', async () => {
    expect((await artifactCommand('resolve T --completeness production --depth all --max-artifacts 12 --critic strict --tag study=consuela --tag variant=aiwf --max-repairs 1 --allow-dirty-target src/a.ts'.split(' ')))).toEqual({ tool: 'resolve_ticket', args: { ticketId: 'T', completeness: 'production', depth: 'all', maxArtifacts: 12, critic: { id: 'strict' }, tags: { study: 'consuela', variant: 'aiwf' }, maxRepairs: 1, allowDirtyTargets: ['src/a.ts'] } });
    expect((await artifactCommand(['resolve', 'T', '--verify-only']))?.args).toEqual({ticketId: 'T', verifyOnly: true});
    expect((await artifactCommand(['process', 'story', 'S', '--depth', '0']))?.args).toEqual({ storyId: 'S', depth: 0 });
    await expect(artifactCommand(['resolve', 'T', '--depth', '-1'])).rejects.toThrow(); await expect(artifactCommand(['resolve', 'T', '--max-artifacts', 'NaN'])).rejects.toThrow(); await expect(artifactCommand(['process', 'feature', 'F', '--agent', 'a'])).rejects.toThrow();
    await expect(artifactCommand(['resolve', 'T', '--unknown', 'x'])).rejects.toThrow(); await expect(artifactCommand(['resolve', 'T', '--tag', 'broken'])).rejects.toThrow(); expect((await artifactCommand(['inspect', 'something']))).toBeNull();
  });
  it('refuses malformed explicit command prefixes before any Actor fallback', async () => {
    for (const text of ['resolve next open or in-progress ticket','please resolve next open or in-progress ticket','please resolve the next suitable ticket','process the next useful ticket','completeness of the current epic'])
      await expect(artifactCommand(text.split(' '))).rejects.toThrow();
    expect((await artifactCommand('inspect the next suitable ticket'.split(' ')))).toBeNull();

    expect((await artifactCommand('resolve T --critic auto'.split(' ')))).toEqual({
      tool: 'resolve_ticket',
      args: {ticketId: 'T', critic: 'auto'},
    });
    await expect(artifactCommand('resolve T --unknown x'.split(' '))).rejects.toThrow();
  });
  it('routes an explicit natural-language Ticket request through the entity once without outer Actor inference', async () => {
    const actor = new WorkflowActor({ store, projectRoot: root, offline: true }); let calls = 0;
    const original = Ticket.prototype.resolve;
    try { Ticket.prototype.resolve = async function (_store, options) { calls++; expect(this.title).toBe('Concrete task'); expect(options?.depth).toBe(0); return { status: 'needs_input', artifactId: 'T', required: [{ question: 'Authored review required', why: 'Precise blocker', target: 'acceptance' }] }; };
      const shell = await processShellInput('please resolve ticket T --depth 0', { store, projectRoot: root, actor, codeMutationAllowed:true }); expect(JSON.parse(shell.output).status).toBe('needs_input'); expect(calls).toBe(1);
      const direct = await actor.execute('resolve ticket T --depth 0',{executionAuthority:'project-write',codeMutationAllowed:true}); expect(direct.stepsCount).toBe(1); expect(direct.events[0].toolCall?.name).toBe('resolve_ticket'); expect(calls).toBe(2);
    } finally { Ticket.prototype.resolve = original; }
  });
  it('persists completeness only on explicit set/clear and keeps help/installed skill artifact-first', async () => {
    const actor = new WorkflowActor({ store, projectRoot: root, offline: true });
    await processShellInput('completeness set F production', { store, projectRoot: root, actor }); expect((await store.getEntity<Feature>('F', Feature.dcr))!.completenessTarget).toBe('production');
    await processShellInput('completeness set F clear', { store, projectRoot: root, actor }); expect((await store.getEntity<Feature>('F', Feature.dcr))!.completenessTarget).toBeNull();
    const help = (await processShellInput('help', { store, projectRoot: root, actor })).output; expect(help.indexOf('resolve <')).toBeLessThan(help.indexOf('symbol [args'));
    expect(fs.readFileSync(path.resolve(import.meta.dir, '../skills/ai-workflow/SKILL.md'), 'utf8')).toBe(CANONICAL_SKILL_MD);
    expect(MCP_INSTRUCTIONS_2_0).toContain('Delegate Ticket work first');
  });
  it('runs documented CLI investigation and completeness commands in a real outside repository', async () => {
    const cli = path.resolve(import.meta.dir, '../src/cli.ts');
    const run = (...args: string[]) => Bun.spawnSync(['bun', cli, ...args], { cwd: root, stderr: 'pipe' });
    const investigation = run('investigate', 'T'); expect(investigation.success).toBe(true); expect(JSON.parse(investigation.stdout.toString()).status).toBe('complete');
    const set = run('completeness', 'set', 'F', 'production'); expect(set.success).toBe(true);
    const get = run('completeness', 'get', 'F'); expect(get.success).toBe(true); expect(JSON.parse(get.stdout.toString()).effective).toBe('production');
    const invalid = run('process', 'story', 'S', '--depth', 'invalid'); expect(invalid.success).toBe(false);
  }, 30000);
  it('advertises delegation and identical policy over the actual MCP protocol', async () => {
    const actor = new WorkflowActor({ store, projectRoot: root, offline: true });
    const { server } = createMcpServer({ store, projectRoot: root, actor }); const client = new Client({ name: 'regression', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      expect(client.getInstructions()).toContain('resolve_ticket first');
      const list = await client.listTools();
      expect(list.tools.find(tool => tool.name === 'preview_change')?.inputSchema.oneOf).toBeArray();
      for (const name of ['resolve_ticket', 'prepare_ticket', 'investigate_ticket', 'process_epic', 'process_feature', 'process_story']) {
        const tool = list.tools.find(tool => tool.name === name)!; expect(tool).toBeDefined();
        for (const key of ['completeness', 'depth', 'maxArtifacts', 'critic']) expect(tool.inputSchema.properties).toHaveProperty(key);
      }
      const response = await client.callTool({ name: 'get_completeness_target', arguments: { entityId: 'F' } });
      expect(response.isError).not.toBe(true);
    } finally { await client.close(); await server.close(); }
  });
});
