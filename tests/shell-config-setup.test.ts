import {afterEach, beforeEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FakeRenderer} from '@dharmax/shell-ui';
import {WorkflowStore} from '../src/graph/store.ts';
import {WorkflowActor} from '../src/actor/engine.ts';
import {processShellInput, type ShellSession} from '../src/shell.ts';
import {loadConfig, getConfigPath} from '../src/config.ts';
import {runConfigCommand} from '../src/config-command.ts';
import {runSetup} from '../src/setup.ts';

const cli = path.resolve(import.meta.dir, '../src/cli.ts');
describe('shared config and setup commands', () => {
  let root: string;
  let oldHome: string | undefined;
  let store: WorkflowStore;
  let session: ShellSession;
  let renderer: FakeRenderer;
  beforeEach(() => {
    oldHome = process.env.HOME;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-command-'));
    process.env.HOME = path.join(root, 'home');
    fs.mkdirSync(process.env.HOME);
    store = new WorkflowStore(root);
    renderer = new FakeRenderer();
    session = {store, actor: new WorkflowActor({store, projectRoot: root, offline: true}), projectRoot: root, interactive: true, renderer};
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
  it('runs complete shell inputs without elicitation and matches the real CLI provenance journey', async () => {
    expect((await execCli(['config', 'set', 'model', 'global-X', '--global'])).code).toBe(0);
    expect((await processShellInput('config set model project-Y', session)).output).toContain('project-Y');
    expect(renderer.requests).toEqual([]);
    const cliRead = await execCli(['config', 'get', 'model']);
    expect(cliRead.stdout).toContain('project-Y');
    expect(cliRead.stdout).toContain('(project)');
    expect((await execCli(['config', 'reset', 'model'])).code).toBe(0);
    expect(loadConfig(root).model).toBe('global-X');
    expect(JSON.parse(fs.readFileSync(getConfigPath(root), 'utf8'))).toEqual({});
  });
  it('facilitates only missing inputs and cancellation cannot create a config file', async () => {
    renderer.answer('parameter:key', 'model').answer('parameter:value', 'chosen');
    expect((await processShellInput('config set', session)).output).toContain('chosen');
    expect(renderer.requests.map(request => request.id)).toEqual(['parameter:key', 'parameter:value']);
    const bytes = fs.readFileSync(getConfigPath(root), 'utf8');
    renderer.answer('parameter:value', 'cancelled');
    expect((await processShellInput('config set model', session)).output).toBe('Cancelled.');
    expect(fs.readFileSync(getConfigPath(root), 'utf8')).toBe(bytes);
  });
  it('uses a structured inspection view and rejects incomplete plain commands without elicitation', async () => {
    await processShellInput('config', session);
    expect(renderer.requests[0]?.id).toBe('configuration');
    renderer.requests.length = 0;
    session.interactive = false;
    expect((await processShellInput('config set', session)).output).toContain('Missing setting');
    expect(renderer.requests).toEqual([]);
    const result = await execCli(['config', 'set']);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Missing setting');
    expect(fs.existsSync(getConfigPath(root))).toBe(false);
  });
  it('setup --check never interacts or writes even from the interactive shell', async () => {
    fs.mkdirSync(path.join(process.env.HOME!, '.cursor'));
    const result = await processShellInput('setup --check', session);
    expect(result.output).toContain('[needed] Cursor');
    expect(renderer.requests).toEqual([]);
    expect(fs.readdirSync(process.env.HOME!)).toEqual(['.cursor']);
    const checked = await execCli(['setup', '--check']);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain('[needed] Cursor');
    expect(fs.readdirSync(path.join(process.env.HOME!, '.cursor'))).toEqual([]);
  });
  it('cancelling setup review leaves the home unchanged', async () => {
    fs.mkdirSync(path.join(process.env.HOME!, '.cursor'));
    renderer.reviewWith('setup:apply', {status: 'cancelled'});
    expect((await processShellInput('setup', session)).output).toBe('Cancelled.');
    expect(fs.readdirSync(process.env.HOME!)).toEqual(['.cursor']);
    expect(fs.readdirSync(path.join(process.env.HOME!, '.cursor'))).toEqual([]);
  });
  it('represents provisioning failures explicitly using existing runtime seams', async () => {
    const calls: string[][] = [];
    const steps = await runSetup(root, {homeDir: process.env.HOME, global: false, mcp: false, seams: {pathEnv: '', fsExists: () => false, execCommand: async cmd => {calls.push(cmd); return {exitCode: 1, stdout: '', stderr: 'provisioning denied'};}}});
    expect(steps.map(step => step.state)).toEqual(['failed', 'failed']);
    expect(calls.some(cmd => cmd[0] === 'bun')).toBe(true);
    expect(steps.every(step => step.message.includes('provisioning denied'))).toBe(true);
  });
  it('shares core validation without accepting an unknown option or secret', async () => {
    await expect(runConfigCommand(root, ['set', 'model', 'x', '--invalid'])).rejects.toThrow('Usage');
    await expect(runConfigCommand(root, ['get', 'openrouterApiKey'])).rejects.toThrow('sensitive');
  });
});
