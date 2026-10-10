import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { WorkflowActor } from '../src/actor/engine.ts';
import { Ticket, SymbolNode } from '../src/graph/ontology.ts';
import { initializeTools } from '../src/tools/index.ts';
import { saveConfig, loadConfig } from '../src/config.ts';
import { indexCodebase } from '../src/graph/indexer.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';
import { Window, type CSSStyleRule } from 'happy-dom';

const cli = path.resolve(import.meta.dir, '../src/cli.ts');
const live = process.env.AIWF_LIVE_ACCEPTANCE === '1';
const model = process.env.AIWF_ACCEPTANCE_MODEL || 'openrouter/openai/gpt-4o-mini';

describe('Skill and synthesis production journeys', () => {
  let root: string;
  let store: WorkflowStore;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-acceptance-'));
    store = new WorkflowStore(root, true);
    initializeTools();
    if (live) {
      // Reuse the repository's configured credentials; global defaults may differ.
      const configured = loadConfig(path.resolve(import.meta.dir, '..'));
      saveConfig(root, {openrouterApiKey: configured.openrouterApiKey});
    }
    const dir = path.join(root, 'skills/project-design');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({
      id: 'project-design', name: 'Project design', description: 'Project frontend design',
      keys: {primary: ['frontend', 'design'], secondary: []},
      tools: ['generateTheme', 'createMainFrame'].map(name => ({name, description: name, inputSchema: {type: 'object'}})),
    }));
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '# Checkout design\nCreate theme.css with :root tokens --brand-primary: #174ea6; --surface: #f4f7fb; --radius: 12px. Style .checkout-card using var(--surface) for background and var(--radius) for border-radius.');
  });
  afterEach(async () => {
    await closeAllTsLspClients();
    await closeAllTs6RefactorClients();
    store.close();
    fs.rmSync(root, {recursive: true, force: true});
  });
  const runCli = async (...args: string[]) => {
    const process = Bun.spawn(['bun', cli, ...args], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
    const [stdout, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    return {stdout, stderr, exit};
  };
  it('a developer finds project design guidance and its tools through the CLI', async () => {
    for (const args of [['kb', 'list', 'skill'], ['kb', 'search', 'frontend'], ['kb', 'show', 'project-design']]) {
      const result = await runCli(...args);
      expect(result.exit).toBe(0);
      expect(result.stdout).toContain(args[1] === 'show' ? '--brand-primary: #174ea6' : 'project-design');
      if (args[1] === 'show') {
        expect(result.stdout).toContain('generateTheme');
        expect(result.stdout).toContain('createMainFrame');
      }
    }
  }, 30000);
  it('returns a failing CLI exit for malformed project skills', async () => {
    fs.writeFileSync(path.join(root, 'skills/project-design/skill.json'), '{broken');
    const result = await runCli('kb', 'show', 'project-design');
    expect(result.exit).not.toBe(0);
    expect(result.stderr).toContain('SkillManager sync failed');
    expect(result.stderr).not.toContain('not found in knowledgebase');
  }, 30000);
  it.skipIf(!live)('a developer gets a checkout stylesheet grounded in the project design skill', async () => {
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'tests/theme.test.ts'), 'import {test,expect} from "bun:test"; import fs from "node:fs"; import {Window} from "happy-dom"; test("checkout CSS parses",async()=>{const w=new Window();try{const s=new w.CSSStyleSheet();s.replaceSync(fs.readFileSync("theme.css","utf8"));expect(Array.from(s.cssRules).map(r=>("selectorText" in r?r.selectorText:""))).toContain(".checkout-card")}finally{await w.happyDOM.close()}});');
    saveConfig(root, {model, modelRoutes: {dev: model, critic: model, design: model}});
    const actor = new WorkflowActor({store, projectRoot: root, maxSteps: 8, timeoutMs: 60000});
    const result = await actor.execute(
      'I need a checkout card stylesheet consistent with this project. Discover and read the project frontend design skill, then create theme.css following its exact design tokens and checkout-card rules. Run bun test tests/theme.test.ts and fix any failure before concluding. Report the skill ID. You can use aiwf kb search <query> and aiwf kb show <id> through run_command.',
      'dev', {forceModel: model});
    console.log(JSON.stringify({journey: 'actor-skill', model: result.targetModel, failed: result.failed, events: result.events, answer: result.answer}));
    expect(result.failed).not.toBe(true);
    expect(result.events.some(event => event.toolCall || event.toolCalls?.length)).toBe(true);
    const css = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
    const window = new Window();
    try {
      const sheet = new window.CSSStyleSheet(); sheet.replaceSync(css);
      const rules = Array.from(sheet.cssRules) as CSSStyleRule[];
      const tokens = rules.find(rule => rule.selectorText === ':root')!.style;
      const card = rules.find(rule => rule.selectorText === '.checkout-card')!.style;
      expect(tokens.getPropertyValue('--brand-primary').toLowerCase()).toBe('#174ea6');
      expect(tokens.getPropertyValue('--surface').toLowerCase()).toBe('#f4f7fb');
      expect(tokens.getPropertyValue('--radius')).toBe('12px');
      expect(card.getPropertyValue('background') || card.getPropertyValue('background-color')).toBe('var(--surface)');
      expect(card.getPropertyValue('border-radius')).toBe('var(--radius)');
    } finally { await window.happyDOM.close(); }
    const activation = JSON.stringify(result.events.flatMap(event => event.toolResults?.filter(observation => !observation.isError).map(observation => observation.result) ?? []));
    expect(activation).toContain('generateTheme');
    expect(activation).toContain('createMainFrame');
    expect(activation).toContain('--brand-primary: #174ea6');
    expect(result.events.some(event => event.toolCalls?.some(call => call.toolName === 'run_command' && String(call.parameters.command).includes('tests/theme.test.ts')) && event.toolResults?.some(observation => !observation.isError && (observation.result as {exitCode?: number})?.exitCode === 0))).toBe(true);
  }, 180000);
  it.skipIf(!live)('a maintainer repairs checkout surcharges and discounts through the exact authored ticket', async () => {
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ai-workflow\n*.md\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions: {target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', types: ['bun'], skipLibCheck: true}, include: ['src/**/*.ts', 'tests/**/*.ts']}));
    fs.writeFileSync(path.join(root, 'src/price.ts'), 'export function totalWithAdjustment(subtotal: number, adjustment: number) { return subtotal - adjustment; }\n');
    fs.writeFileSync(path.join(root, 'tests/price.test.ts'), 'import {test,expect} from "bun:test"; import {totalWithAdjustment} from "../src/price"; test("checkout totals",()=>{expect(totalWithAdjustment(100,20)).toBe(120);expect(totalWithAdjustment(100,-15)).toBe(85);expect(totalWithAdjustment(100,0)).toBe(100)});');
    for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']]) {
      expect(Bun.spawnSync(['git', ...args], {cwd: root, stderr: 'pipe'}).success).toBe(true);
    }
    saveConfig(root, {model, modelRoutes: {dev: model, critic: model, design: model}});
    await indexCodebase(store, root);
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/price.ts' && s.title === 'totalWithAdjustment')!;
    const ticket = await store.upsertEntity<Ticket>(Ticket.dcr, {id: 'LIVE-EXACT', title: 'Correct checkout adjustments', body: 'A checkout customer pays the subtotal plus a signed adjustment: a positive surcharge raises the total, a negative discount lowers it, and zero leaves it unchanged. Preserve totalWithAdjustment and its signature.', lane: 'Todo', acceptanceCriteria: ['Checkout totals correctly apply surcharges, discounts, and zero adjustments']});
    await store.relate(ticket, 'modifies', symbol);
    const assertions = fs.readFileSync(path.join(root, 'tests/price.test.ts'), 'utf8');
    expect(Bun.spawnSync(['bun', 'test', 'tests/price.test.ts'], {cwd: root}).success).toBe(false);
    const result = await ticket.resolve(store, {agentId: 'acceptance', depth: 0, maxArtifacts: 1, maxRepairs: 0, critic: 'none', systemOne: {assess: async () => null}, testCommands: [['bun', 'test', 'tests/price.test.ts']]});
    console.log(JSON.stringify({journey: 'real-host-synthesis', model, result}));
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(JSON.stringify(result));
    expect(result.value.files).toEqual(['src/price.ts']);
    expect(fs.readFileSync(path.join(root, 'tests/price.test.ts'), 'utf8')).toBe(assertions);
    expect((await store.getEntity<Ticket>(ticket.id, Ticket.dcr))?.status).toBe('verified');
    expect(await store.getEntity('VERIFY-LIVE-EXACT')).not.toBeNull();
    const execution = Bun.spawnSync(['bun', 'test', 'tests/price.test.ts'], {cwd: root});
    expect(execution.success).toBe(true);
    expect(fs.readFileSync(path.join(root, 'src/price.ts'), 'utf8')).toContain('export function totalWithAdjustment');
  }, 180000);
});
