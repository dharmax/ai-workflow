import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FakeRenderer, ParameterFacilitator} from '@dharmax/shell-ui';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket} from '../src/graph/ontology.ts';
import {WorkflowActor} from '../src/actor/engine.ts';
import {initializeTools} from '../src/tools/index.ts';
import {processShellInput, type ShellSession} from '../src/shell.ts';
import {artifactCommand, facilitateArtifactCommand} from '../src/artifact-command.ts';
import {loadConfig, readConfigOverrides, setConfigOverride} from '../src/config.ts';
const cli = path.resolve(import.meta.dir, '../src/cli.ts');
describe('daily shared shell commands', () => {
  let root: string;
  let oldHome: string | undefined;
  let store: WorkflowStore;
  let session: ShellSession;
  let renderer: FakeRenderer;
  const registry = initializeTools();
  beforeEach(async () => {
    oldHome = process.env.HOME;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-daily-'));
    process.env.HOME = path.join(root, 'home');
    fs.mkdirSync(process.env.HOME);
    store = new WorkflowStore(root);
    renderer = new FakeRenderer();
    session = {store, actor: new WorkflowActor({store, projectRoot: root, offline: true}), projectRoot: root, renderer, interactive: true};
    for (const [id, lane] of [['T', 'Todo'], ['FINISHED', 'Done'], ['BLOCKED', 'Blocked'], ['LEASED', 'Todo']] as const) {
      await registry.execute('create_ticket', {id, title: id, lane}, {store, projectRoot: root});
    }
    await registry.execute('claim_ticket', {ticketId: 'LEASED', agentId: 'other'}, {store, projectRoot: root});
  });
  afterEach(() => {
    store.close();
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    fs.rmSync(root, {recursive: true, force: true});
  });
  const execCli = async (args: string[]) => {
    const proc = Bun.spawn(['bun', cli, ...args], {cwd: root, env: {...process.env}, stdout: 'pipe', stderr: 'pipe'});
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return {stdout, stderr, code};
  };
  it('executes complete inputs immediately and the real CLI sees the same graph lease', async () => {
    const result = await processShellInput('claim T --agent expert --minutes 15', session);
    expect(result.output).toContain("Claimed ticket T for 15m by 'expert'");
    expect(renderer.requests).toEqual([]);
    expect((await store.getEntity<Ticket & {claim: {agentId: string}}>('T'))?.claim.agentId).toBe('expert');
    expect((await execCli(['release', 'T'])).code).toBe(0);
    expect((await store.getEntity<Ticket & {claim: unknown}>('T'))?.claim).toBeNull();
    expect((await execCli(['claim', 'T', '--agent', 'expert', '--minutes', '15'])).code).toBe(0);
    expect((await processShellInput('release T', session)).output).toContain('Released ticket T');
  });
  it('offers only eligible claims and cancellation leaves state unchanged', async () => {
    const before = JSON.stringify(await store.getEntity('T'));
    renderer.answer('parameter:ticketId', 'cancelled');
    const result = await processShellInput('claim', session);
    expect(result.output).toBe('Cancelled.');
    const request = renderer.requests[0];
    expect(request && 'kind' in request ? request.kind : undefined).toBe('select');
    if (request && 'choices' in request) expect(request.choices.map(choice => choice.id)).toEqual(['T']);
    expect(JSON.stringify(await store.getEntity('T'))).toBe(before);
    renderer.answer('parameter:ticketId', 'T');
    expect((await processShellInput('claim', session)).output).toContain('Claimed ticket T');
  });
  it('facilitates only a missing lane, validates plain commands, and done releases the lease', async () => {
    await processShellInput('claim T', session);
    renderer.answer('parameter:lane', 'In Progress');
    expect((await processShellInput('move T', session)).output).toContain("to 'In Progress'");
    expect(renderer.requests.map(request => request.id)).toEqual(['parameter:lane']);
    await processShellInput('done T', session);
    expect((await store.getEntity<Ticket & {claim: unknown; lane: string}>('T'))).toMatchObject({claim: null, lane: 'Done'});
    session.interactive = false;
    renderer.requests.length = 0;
    expect((await processShellInput('move', session)).output).toContain('Usage');
    expect(renderer.requests).toEqual([]);
    expect((await execCli(['claim'])).code).not.toBe(0);
  });
  it('uses the existing artifact parser after facilitating only missing identifiers', async () => {
    const facilitator = new ParameterFacilitator(renderer);
    const ctx = {store, projectRoot: root};
    renderer.answer('parameter:entityId', 'T');
    const tokens = await facilitateArtifactCommand(['resolve', '--depth', '0'], ctx, facilitator);
    expect(artifactCommand(tokens!)).toEqual({tool: 'resolve_ticket', args: {ticketId: 'T', depth: 0}});
    renderer.requests.length = 0;
    expect(await facilitateArtifactCommand(['resolve', 'T'], ctx, facilitator)).toEqual(['resolve', 'T']);
    expect(renderer.requests).toEqual([]);
    renderer.answer('parameter:entityId', 'cancelled');
    expect(await facilitateArtifactCommand(['prepare'], ctx, facilitator)).toBeNull();
  });
  it('facilitates entity navigation and shares the plain entity view with CLI', async () => {
    renderer.answer('parameter:entityId', 'T');
    expect((await processShellInput('ticket', session)).output).toContain('T');
    expect(renderer.requests.map(request => request.id)).toEqual(['parameter:entityId', 'ticket:T']);
    session.interactive = false;
    renderer.requests.length = 0;
    const shell = await processShellInput('ticket T', session);
    const read = await execCli(['ticket', 'T']);
    expect(read.code).toBe(0);
    expect(read.stdout.trim()).toBe(shell.output);
    expect(renderer.requests).toEqual([]);
  });
  it('updates only local model routes and shares model inspection with CLI', async () => {
    setConfigOverride(root, 'modelRoutes', '{"design":"ollama/global-design"}', 'global');
    expect((await processShellInput('model set dev ollama/project-dev', session)).output).toContain('project-dev');
    expect(readConfigOverrides(root).modelRoutes).toEqual({dev: 'ollama/project-dev'});
    expect(loadConfig(root).modelRoutes?.design).toBe('ollama/global-design');
    expect((await execCli(['model', 'set', 'triage', 'ollama/project-triage'])).code).toBe(0);
    expect(loadConfig(root).modelRoutes?.triage).toBe('ollama/project-triage');
    session.actor.reloadConfig();
    session.interactive = false;
    expect((await processShellInput('model', session)).output).toContain('Configured Providers:');
    expect((await execCli(['model', 'list'])).stdout).toContain('Effective:');
  });
});
