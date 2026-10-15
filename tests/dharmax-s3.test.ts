import { describe, it, expect, afterEach } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { WorkflowStore } from '../src/graph/store.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { entityDescriptors } from '../src/graph/ontology.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('S3 Workspace public developer journeys', () => {
  let root: string, store: WorkflowStore, browser: Browser;
  let workspace: {url: string; stop: () => Promise<void>};
  const binary = process.env.AIWF_WORKSPACE_BINARY ? path.resolve(process.env.AIWF_WORKSPACE_BINARY) : undefined;
  const call = (name: string, params: Record<string, unknown>) => registry.execute(name, params, {store, projectRoot: root});
  const scenario = { Actor: 'Signed-in user', Intent: 'Keep my filtered avatar', 'Initial State': 'Unsaved filtered preview; previous saved avatar exists',
    Action: 'Activate Save', 'Expected Result': 'Saved avatar matches preview after reload', Exceptions: 'Failure preserves the previous avatar', Bounds: 'Current account only' };
  const start = async () => {
    if (binary) {
      const proc = Bun.spawn([binary, 'workspace'], {cwd:root, stdout:'pipe', stderr:'pipe'});
      workspace = {url:'', stop:async () => { proc.kill('SIGTERM'); await proc.exited; }};
      const reader = proc.stdout.getReader();
      let output = '';
      try {
        while (!output.includes('\n')) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('Compiled Workspace exited before printing its URL: ' + await new Response(proc.stderr).text());
          output += new TextDecoder().decode(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const line = output.split('\n').find(line => line.startsWith('AIWF Workspace: '));
      if (!line) throw new Error('Compiled Workspace did not print a session URL: ' + output);
      workspace.url = line.slice('AIWF Workspace: '.length).trim();
    } else {
      const {startWorkspace} = await import('../src/workspace/server.ts');
      const local = startWorkspace({store, projectRoot: root}, 0);
      workspace = {url:local.url, stop:async () => { local.server.stop(true); }};
    }
    return workspace.url;
  };
  const setup = async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-s3-'));
    store = new WorkflowStore(root); initializeTools();
    for (const dcr of entityDescriptors) await store.listEntities(dcr);
    const url = await start();
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage(); page.setDefaultTimeout(5000);
    page.on('dialog', dialog => dialog.accept());
    if (process.env.AIWF_S3_TRACE) page.on('request', request => {
      if (request.url().endsWith('/api/apply') || request.url().endsWith('/api/preview')) console.error(request.url(),request.postData());
    });
    await page.goto(url);
    await page.getByRole('button', {name:'New Feature', exact:true}).waitFor();
    return page;
  };
  const fill = async (page: Page, values: Record<string, string>) => {
    for (const [label, value] of Object.entries(values)) await page.getByLabel(label, {exact:true}).fill(value);
  };
  const save = async (page: Page) => {
    await page.getByRole('button', {name:'Review changes', exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    await page.getByRole('button', {name:'Accept and save', exact:true}).click();
    await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
  };
  const snapshot = () => Object.fromEntries((store.db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[])
    .map(({name}) => [name, store.db.query('SELECT * FROM "' + name + '" ORDER BY rowid').all()]));
  afterEach(async () => {
    await browser?.close(); await workspace?.stop(); store?.close();
    if (root) fs.rmSync(root, {recursive:true, force:true});
  });

  it('DW-01/02 creates, edits, reviews and reloads Avatar Filters and a complete Save Story, consistent with CLI/MCP', async () => {
    const page = await setup();
    await page.getByRole('button', {name:'New Feature',exact:true}).click();
    await fill(page, {'Stable ID':'F', Title:'Avatar Filters', Description:'Preview image filters before saving', Priority:'1'});
    await page.getByLabel('Definition status', {exact:true}).selectOption('accepted');
    await save(page);
    await page.getByRole('button', {name:'New Story',exact:true}).click();
    await fill(page, {'Stable ID':'S', Title:'Save filtered avatar', ...scenario});
    await page.getByLabel('Definition status', {exact:true}).selectOption('accepted');
    await page.getByLabel('Feature', {exact:true}).selectOption('F');
    await save(page);
    await page.getByLabel('Action', {exact:true}).fill('Activate Save once');
    await page.getByRole('button', {name:'Review changes', exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    await page.getByLabel('Action', {exact:true}).fill('Activate Save after preview');
    await page.getByRole('button', {name:'Update review', exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    expect(await page.getByTestId('diff').innerText()).toContain('Activate Save after preview');
    await page.getByRole('button', {name:'Accept and save',exact:true}).click();
    await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
    await workspace.stop(); store.close(); store = new WorkflowStore(root);
    const url = await start(); await page.goto(url);
    await page.getByLabel('Search product', {exact:true}).fill('Save filtered');
    await page.getByRole('button', {name:'Save filtered avatar',exact:true}).click();
    for (const [label, value] of Object.entries({...scenario, Action:'Activate Save after preview'}))
      expect(await page.getByLabel(label,{exact:true}).inputValue()).toBe(value);
    expect(await page.getByLabel('Feature',{exact:true}).inputValue()).toBe('F');
    if (process.env.AIWF_S3_EVIDENCE_DIR) await page.screenshot({path:path.join(process.env.AIWF_S3_EVIDENCE_DIR,'story-desktop.png'),fullPage:true});
    const cli = Bun.spawn([...(binary ? [binary] : ['bun', path.resolve(import.meta.dir,'../src/cli.ts')]), 'story','S'], {cwd:root,stdout:'pipe',stderr:'pipe'});
    const stdout = await new Response(cli.stdout).text(); expect(await cli.exited).toBe(0);
    expect(stdout).toContain('Activate Save after preview');
    const client = new Client({name:'workspace-story-proof',version:'1'});
    try {
      await client.connect(new StdioClientTransport({command:binary || 'bun',args:binary ? ['mcp'] : [path.resolve(import.meta.dir,'../src/mcp.ts')],cwd:root,stderr:'pipe'}));
      const result = await client.callTool({name:'get_user_story', arguments:{storyId:'S'}});
      expect(result.isError).not.toBe(true);
      const content = result.content as {type:string;text?:string}[];
      expect(JSON.parse(content.find(c=>c.type==='text')!.text!)).toMatchObject({action:'Activate Save after preview',enablingFeatures:['F'],status:'accepted'});
    } finally { await client.close(); }
  }, 40000);

  it('DW-02 cancel and reject leave every canonical row unchanged; proposal import is editable and explicitly accepted', async () => {
    const page = await setup();
    await page.getByRole('button',{name:'New Feature',exact:true}).click();
    await fill(page, {'Stable ID':'F', Title:'Canceled Feature'});
    const before = snapshot();
    await page.getByRole('button',{name:'Review changes',exact:true}).click();
    await page.getByRole('button',{name:'Cancel review',exact:true}).click();
    expect(snapshot()).toEqual(before);
    await page.getByRole('button',{name:'Review changes',exact:true}).click();
    await page.getByRole('button',{name:'Reject proposal',exact:true}).click();
    expect(snapshot()).toEqual(before);
    await page.getByRole('button',{name:'Review proposal',exact:true}).click();
    await page.getByLabel('Proposal JSON',{exact:true}).fill(JSON.stringify({action:'product_change',originalRequest:'Avatar filters',mutations:[
      {kind:'product_create',entityType:'Feature',id:'P',fields:{title:'Proposed filters',status:'proposed'}}
    ]}));
    await page.getByRole('button',{name:'Load proposal',exact:true}).click();
    await page.getByLabel('Title',{exact:true}).fill('Reviewed filters');
    await page.getByLabel('Definition status',{exact:true}).selectOption('accepted');
    await page.getByRole('button',{name:'Update review',exact:true}).click();
    expect(snapshot()).toEqual(before);
    await page.getByText('Edit complete proposal request',{exact:true}).click();
    const advanced=JSON.parse(await page.getByLabel('Complete proposal request',{exact:true}).inputValue());
    advanced.mutations[0].fields.priority=2;
    await page.getByLabel('Complete proposal request',{exact:true}).fill(JSON.stringify(advanced));
    await page.getByRole('button',{name:'Update review',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    expect(await page.getByTestId('diff').innerText()).toContain('Priority');
    if (process.env.AIWF_S3_EVIDENCE_DIR) await page.screenshot({path:path.join(process.env.AIWF_S3_EVIDENCE_DIR,'proposal-review.png'),fullPage:true});
    await page.getByRole('button',{name:'Accept and save',exact:true}).click();
    await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
    expect(await call('get_feature',{featureId:'P'})).toMatchObject({title:'Reviewed filters',status:'accepted',priority:2});
  }, 25000);

  it('DW-06 refuses the stale second editor, retaining its text and the first saved revision', async () => {
    const page = await setup();
    await page.getByRole('button',{name:'New Feature',exact:true}).click();
    await fill(page, {'Stable ID':'F',Title:'Avatar Filters'}); await save(page);
    const other = await browser.newPage(); await other.goto(workspace.url);
    await other.getByRole('button',{name:'Avatar Filters',exact:true}).click();
    await other.getByLabel('Description',{exact:true}).fill('Second editor text');
    await page.getByLabel('Description',{exact:true}).fill('First saved revision'); await save(page);
    await other.getByRole('button',{name:'Review changes',exact:true}).click();
    await other.getByRole('alert').filter({hasText:/stale|conflict/i}).waitFor();
    expect(await other.getByLabel('Description',{exact:true}).inputValue()).toBe('Second editor text');
    expect((await call('get_feature',{featureId:'F'})).body).toBe('First saved revision');
  }, 25000);

  it('DW-05 revises one Aspect, shows applicable policy and exact linked objects, and removes relationships', async () => {
    const page = await setup();
    await page.getByRole('button',{name:'New Feature',exact:true}).click();
    await fill(page, {'Stable ID':'F',Title:'Avatar Filters'}); await save(page);
    await page.getByRole('button',{name:'New Aspect',exact:true}).click();
    await fill(page, {'Stable ID':'A',Title:'Persistency',Description:'Saved avatar survives reload'});
    await page.getByLabel('Definition status',{exact:true}).selectOption('accepted'); await save(page);
    await page.getByText('Manage relationships',{exact:true}).click();
    await page.getByLabel('Relationship target',{exact:true}).selectOption('F');
    await page.getByRole('button',{name:'Add relationship',exact:true}).click(); await save(page);
    await page.getByLabel('Description',{exact:true}).fill('Saved avatar survives a new session'); await save(page);
    expect((await call('get_aspect',{id:'A'})).body).toBe('Saved avatar survives a new session');
    await page.reload(); await page.getByRole('button',{name:'Persistency',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Loaded A'}).waitFor();
    expect(await page.getByLabel('Description',{exact:true}).inputValue()).toBe('Saved avatar survives a new session');
    expect(await page.getByTestId('related').innerText()).toContain('F');
    await page.getByRole('button',{name:'Avatar Filters',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Loaded F'}).waitFor();
    expect(await page.getByTestId('aspects').innerText()).toContain('Saved avatar survives a new session');
    await page.getByRole('button',{name:'Remove A applies_to F',exact:true}).click(); await save(page);
    expect((await call('get_aspect',{id:'A'})).scopes).toEqual([]);
  }, 30000);

  it('DW-02 edits a Story without dropping its other existing Feature relationships', async () => {
    const page=await setup();
    await call('create_feature',{id:'F',title:'Avatar Filters'});
    await call('create_feature',{id:'G',title:'Avatar Profile'});
    await call('create_user_story',{id:'S',title:'Save avatar',actor:'User',intent:'Keep preview',initialState:'Unsaved preview',action:'Save',expectedResult:'Preview persists',status:'accepted'});
    for(const sourceId of ['F','G']) await call('link_product',{sourceId,predicate:'enables',targetId:'S'});
    await page.getByRole('button',{name:'Reload canonical data',exact:true}).click();
    await page.getByRole('button',{name:'Save avatar',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Loaded S'}).waitFor();
    await page.getByLabel('Action',{exact:true}).fill('Activate Save once'); await save(page);
    expect((await call('get_user_story',{storyId:'S'})).enablingFeatures).toEqual(['F','G']);
  },15000);

  it('DW-02 blocks incomplete acceptance, preserves the form, and supports keyboard review/cancel', async () => {
    const page = await setup();
    await page.getByRole('button',{name:'New Story',exact:true}).click();
    await fill(page, {'Stable ID':'S',Title:'Save filtered avatar',Actor:'Signed-in user'});
    await page.getByLabel('Definition status',{exact:true}).selectOption('accepted');
    const before=snapshot();
    await page.keyboard.press('Control+s');
    await page.getByRole('alert').filter({hasText:'complete Story fields'}).waitFor();
    expect(snapshot()).toEqual(before);
    expect(await page.getByLabel('Actor',{exact:true}).inputValue()).toBe('Signed-in user');
    await fill(page,scenario);
    await page.keyboard.press('Control+s');
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('status').filter({hasText:'Review canceled'}).waitFor();
    expect(snapshot()).toEqual(before);
    await page.keyboard.press('Control+k');
    expect(await page.getByLabel('Search product',{exact:true}).evaluate(input=>input===document.activeElement)).toBe(true);
  },15000);

  it('DW-06 refuses a stale reviewed commit and a stale imported preview without refreshing either', async () => {
    const page=await setup();
    await page.getByRole('button',{name:'New Feature',exact:true}).click();
    await fill(page,{'Stable ID':'F',Title:'Avatar Filters'}); await save(page);
    const other=await browser.newPage(); other.setDefaultTimeout(5000); await other.goto(workspace.url);
    await other.getByRole('button',{name:'Avatar Filters',exact:true}).click();
    await other.getByRole('status').filter({hasText:'Loaded F'}).waitFor();
    await other.getByLabel('Description',{exact:true}).fill('Stale reviewed draft');
    await other.getByRole('button',{name:'Review changes',exact:true}).click();
    await other.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    const oldPreview=await call('preview_change',{action:'product_change',mutations:[
      {kind:'product_update',entityType:'Feature',id:'F',fields:{body:'Old imported proposal'}}
    ]});
    await page.getByLabel('Description',{exact:true}).fill('Current saved definition'); await save(page);
    await other.getByRole('button',{name:'Accept and save',exact:true}).click();
    await other.getByRole('alert').filter({hasText:/fingerprint|stale/i}).waitFor();
    expect(await other.getByLabel('Description',{exact:true}).inputValue()).toBe('Stale reviewed draft');
    await page.getByRole('button',{name:'Review proposal',exact:true}).click();
    await page.getByLabel('Proposal JSON',{exact:true}).fill(JSON.stringify(oldPreview));
    await page.getByRole('button',{name:'Load proposal',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Stale proposal fingerprint'}).waitFor();
    expect((await call('get_feature',{featureId:'F'})).body).toBe('Current saved definition');
  },20000);

  it('DW-01 reports a committed save separately from a failed reload, then recovers through Reload', async () => {
    const page=await setup();
    await page.getByRole('button',{name:'New Feature',exact:true}).click();
    await fill(page,{'Stable ID':'F',Title:'Avatar Filters'});
    await page.getByRole('button',{name:'Review changes',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    await page.route('**/api/catalog',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Injected catalog outage'})}));
    await page.getByRole('button',{name:'Accept and save',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Saved, but reload failed'}).waitFor();
    expect((await call('get_feature',{featureId:'F'})).title).toBe('Avatar Filters');
    await page.unroute('**/api/catalog');
    await page.getByRole('button',{name:'Reload canonical data',exact:true}).click();
    await page.getByRole('button',{name:'Avatar Filters',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Loaded F'}).waitFor();
    expect(await page.getByLabel('Title',{exact:true}).inputValue()).toBe('Avatar Filters');
  },15000);

  it('protects local host transport and never exposes source mutation through the Workspace', async () => {
    await setup();
    expect((await fetch(workspace.url.split('#')[0]+'api/catalog')).status).toBe(403);
    const base=workspace.url.split('#')[0], token=new URL(workspace.url).hash.slice(1);
    const headers={'x-aiwf-token':token,'content-type':'application/json'};
    expect((await fetch(base+'api/preview',{method:'POST',headers:{...headers,origin:'https://untrusted.invalid'},body:'{}'})).status).toBe(403);
    expect((await fetch(base+'api/preview',{method:'POST',headers,body:JSON.stringify({action:'create_file',filePath:'bad.ts',content:'bad'})})).status).toBe(400);
    expect(fs.existsSync(path.join(root,'bad.ts'))).toBe(false);
  }, 15000);
});
