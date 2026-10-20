import {createProduct,acceptProduct} from './product-review.ts';
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
  const call = (name: string, params: Record<string, unknown>) => registry.execute(name, params, {store, projectRoot: root, executionAuthority: 'project-write' as const});
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
      const local = startWorkspace({store, projectRoot: root, executionAuthority: 'project-write' as const}, 0);
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
  const snapshot = () => {
    using tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    return Object.fromEntries((tables.all() as {name:string}[]).map(({name}) => {
      using rows = store.db.prepare('SELECT * FROM "' + name + '" ORDER BY rowid');
      return [name, rows.all()];
    }));
  };
  afterEach(async () => {
    await browser?.close(); browser = undefined as any;
    await workspace?.stop(); workspace = undefined as any;
    store?.close(); store = undefined as any;
    if (root) { fs.rmSync(root, {recursive:true, force:true}); root = undefined as any; }
  });

  it('PC5 explains charter fields, names linked endpoints and makes Bugs and missing proof discoverable', async () => {
    const page=await setup();
    await page.getByRole('button',{name:'Define Product',exact:true}).click();
    await page.getByText('Scope describes what this product covers. Example: assess one patient at a time.',{exact:true}).waitFor();
    await page.getByText('Non-goals describe what this product deliberately does not provide. Example: emergency diagnosis.',{exact:true}).waitFor();
    await page.getByText('Bounds describe limits that apply inside the scope. Example: adults only; clinician review required.',{exact:true}).waitFor();
    await createProduct(store,'Goal',{id:'g1',title:'Assessment',body:'Explain an assessment',status:'draft'});
    await createProduct(store,'Flow',{id:'flow1',title:'Clinical intake',body:'Collect symptoms',actor:'Clinician',status:'draft'});
    await acceptProduct(store,[{kind:'product_link',sourceId:'flow1',predicate:'serves',targetId:'g1'}]);
    await page.getByRole('button',{name:'Reload canonical data',exact:true}).click();
    await page.getByRole('button',{name:'Clinical intake',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Loaded flow1'}).waitFor();
    expect(await page.getByTestId('related').innerText()).toContain('Clinical intake (flow1) → serves → Assessment (g1)');
    await page.getByRole('button',{name:'Report Bug',exact:true}).click();
    await fill(page,{'Stable ID':'B1','Title':'Observed trial defect'});await save(page);
    await page.getByRole('button',{name:'Browse Bugs',exact:true}).click();
    expect(await page.getByLabel('Entity type',{exact:true}).inputValue()).toBe('Bug');
    await page.getByRole('button',{name:'Observed trial defect',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Loaded B1'}).waitFor();
    expect(await page.getByRole('region',{name:'Ticket verification'}).innerText()).toContain('No independent verification receipt');
    expect((await call('get_bug',{ticketId:'B1'})).verification).toBeNull();
  },20000);

  it('PC5 paginates a large catalog without losing selection, draft or reviewed preview', async () => {
    const page=await setup();
    for(let index=0;index<26;index++) await createProduct(store,'Feature',{id:'F-'+index,title:'Catalog item '+index,status:'draft'});
    await page.getByRole('button',{name:'Reload canonical data',exact:true}).click();
    await page.getByLabel('Entity type',{exact:true}).selectOption('Feature');
    expect(await page.locator('#results .result').count()).toBe(25);
    await page.locator('#results .result button').first().click();
    await page.getByLabel('Description',{exact:true}).fill('Retained catalog draft');
    await page.getByRole('button',{name:'Review changes',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    const selectedId=await page.locator('[name=id]').inputValue();
    await page.getByRole('button',{name:'Next page',exact:true}).click();
    expect(await page.locator('#results .result').count()).toBe(1);
    expect(await page.locator('[name=id]').inputValue()).toBe(selectedId);
    expect(await page.getByLabel('Description',{exact:true}).inputValue()).toBe('Retained catalog draft');
    expect(await page.getByRole('button',{name:'Accept and save',exact:true}).isEnabled()).toBe(true);
    await page.getByRole('button',{name:'Previous page',exact:true}).click();
    expect(await page.locator('#results .result').count()).toBe(25);
    await page.getByLabel('Search product',{exact:true}).fill('Catalog item 25');
    expect(await page.locator('#results .result').count()).toBe(1);
    expect(await page.getByRole('button',{name:'Next page',exact:true,includeHidden:true}).isDisabled()).toBe(true);
    await page.getByLabel('Search product',{exact:true}).fill('no matching catalog record');
    await expect(page.getByText('No matching entities. Try a shorter search or create a definition.',{exact:true}).isVisible()).resolves.toBe(true);
    expect(await page.getByLabel('Description',{exact:true}).inputValue()).toBe('Retained catalog draft');
    await page.getByLabel('Search product',{exact:true}).fill('');
    await page.getByRole('button',{name:'Accept and save',exact:true}).click();
    await page.getByRole('status').filter({hasText:/^Saved[.]/}).waitFor();
    expect((await call('get_feature',{featureId:selectedId})).body).toBe('Retained catalog draft');
  },30000);

  it('reports and edits a first-class Bug through the actual reviewed Workspace', async () => {
    const page=await setup();
    await page.getByRole('button',{name:'Report Bug',exact:true}).click();
    await fill(page, {'Stable ID':'B-UI',Title:'Decimal totals are truncated',Description:'Existing total CLI loses decimal fractions'});
    await page.locator('[name=reproduction]').fill('total 1.5 2.5');
    await page.locator('[name=expected]').fill('4');
    await page.locator('[name=actual]').fill('3');
    await page.locator('[name=severity]').selectOption('high');
    await save(page);
    expect((await call('get_bug',{ticketId:'B-UI'})).defect.severity).toBe('high');
    await page.locator('[name=actual]').fill('3 instead of 4');
    await save(page);
    await page.reload();
    await page.getByLabel('Entity type',{exact:true}).selectOption('Bug');
    await page.getByRole('button',{name:'Decimal totals are truncated',exact:true}).click();
    expect(await page.locator('[name=actual]').inputValue()).toBe('3 instead of 4');
    expect((await call('get_bug',{ticketId:'B-UI'})).kind).toBe('bug');
  },30000);

  it('PC-J1/J8 reviews charter and Goal forms and preserves indexed Module intent across restart', async () => {
    const page = await setup();
    await page.getByRole('button', {name:'Define Product',exact:true}).click();
    expect(await page.getByLabel('Stable ID', {exact:true}).inputValue()).toBe('PRODUCT');
    await fill(page, {Title:'Ledger', Purpose:'Understand totals', Actors:'Accountant\nAuditor', Scope:'Local arithmetic', 'Non-goals':'Banking', Bounds:'Offline'});
    await page.getByLabel('Definition status', {exact:true}).selectOption('accepted');
    await page.getByRole('button', {name:'Review changes',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    expect((await call('get_product', {})).defined).toBe(false);
    await page.getByRole('button', {name:'Cancel review',exact:true}).click();
    expect(await page.getByLabel('Purpose', {exact:true}).inputValue()).toBe('Understand totals');
    await save(page);
    expect((await call('get_product', {})).product).toMatchObject({id:'PRODUCT',actors:['Accountant','Auditor'],status:'accepted'});
    await page.getByRole('button', {name:'New Goal',exact:true}).click();
    await fill(page, {'Stable ID':'G',Title:'Accurate totals',Description:'Return exact decimal totals'});
    await page.getByLabel('Definition status', {exact:true}).selectOption('accepted');
    await save(page);
    fs.mkdirSync(path.join(root,'src'), {recursive:true});
    fs.writeFileSync(path.join(root,'src/ledger.ts'), 'export const total = 0;\n');
    const {ensureAstFresh} = await import('../src/graph/indexer.ts');
    await ensureAstFresh(store);
    await page.getByRole('button', {name:'Reload canonical data',exact:true}).click();
    await page.getByLabel('Entity type', {exact:true}).selectOption('Module');
    await page.locator('#results button').first().click();
    await page.getByRole('heading', {name:/^Module · /}).waitFor();
    const moduleId = await page.getByLabel('Stable ID', {exact:true}).inputValue();
    expect(await page.locator('[name=title]').count()).toBe(0);
    await fill(page, {Purpose:'Own decimal operations',Responsibilities:'Total\nMean',Boundaries:'No networking'});
    await page.getByLabel('Definition status', {exact:true}).selectOption('accepted');
    await save(page);
    await workspace.stop(); store.close(); store = new WorkflowStore(root);
    await page.goto(await start());
    await page.getByLabel('Entity type', {exact:true}).selectOption('Module');
    await page.locator('#results button').first().click();
    expect(await page.getByLabel('Stable ID', {exact:true}).inputValue()).toBe(moduleId);
    expect(await page.getByLabel('Purpose', {exact:true}).inputValue()).toBe('Own decimal operations');
    expect(await page.getByLabel('Responsibilities', {exact:true}).inputValue()).toBe('Total\nMean');
    const moduleEdit = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'arch','module','edit',moduleId,'--status','accepted','--body','Own decimal operations','--yes'],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(moduleEdit.exitCode).toBe(0);
    const modules = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'arch','module','list'],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(modules.exitCode).toBe(0);
    expect(JSON.parse(modules.stdout.toString()).results.some((item:{id:string})=>item.id===moduleId)).toBe(true);
    const moduleRead = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'arch','module','show',moduleId],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(moduleRead.exitCode).toBe(0);
    expect(JSON.parse(moduleRead.stdout.toString())).toMatchObject({id:moduleId,body:'Own decimal operations',intentStatus:'accepted',sourceStatus:'indexed'});
    const linked = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'link',moduleId,'to','G','as','serves','--yes'],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(linked.exitCode).toBe(0);
    const client = new Client({name:'workspace-module-proof',version:'1'});
    try {
      await client.connect(new StdioClientTransport({command:'bun',args:[path.resolve(import.meta.dir,'../src/mcp.ts')],cwd:root,stderr:'pipe'}));
      const response = await client.callTool({name:'get_module',arguments:{moduleId}});
      expect(response.isError).not.toBe(true);
      const content = response.content as Array<{type:string;text?:string}>;
      const module = JSON.parse(content.find(item=>item.type==='text')!.text!);
      expect(module).toMatchObject({id:moduleId,body:'Own decimal operations',responsibilities:['Total','Mean'],intentStatus:'accepted',sourceStatus:'indexed'});
      expect(module.version).toBeGreaterThan(0);
      fs.unlinkSync(path.join(root,'src/ledger.ts'));
      const missing = await client.callTool({name:'get_module',arguments:{moduleId}});
      expect(JSON.parse((missing.content as Array<{text:string}>)[0]!.text)).toMatchObject({id:moduleId,body:'Own decimal operations',sourceStatus:'missing_source'});
    } finally { await client.close(); }
    const productRead = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'product','show'],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(JSON.parse(productRead.stdout.toString()).product.actors).toEqual(['Accountant','Auditor']);
    const product = await call('get_product', {});
    expect(product.product.actors).toEqual(['Accountant','Auditor']);
    expect(await call('get_goal', {id:'G'})).toMatchObject({body:'Return exact decimal totals',status:'accepted'});
  }, 30000);

  it('PC5 Epic definition edits cannot manufacture delivery completion', async () => {
    const page = await setup();
    const forged = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'product','epic','new','--id','E-FALSE','--title','False delivery','--status','completed','--yes'],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(forged.exitCode).not.toBe(0);
    expect(await store.getEntity('E-FALSE')).toBeNull();
    await page.getByRole('button',{name:'New Epic',exact:true}).click();
    await fill(page,{'Stable ID':'E-PLAN',Title:'Plan delivery',Description:'Organize reviewed work'});
    expect(await page.locator('select[name=status] option[value=completed]').getAttribute('disabled')).not.toBeNull();
    await page.getByLabel('Delivery status',{exact:true}).selectOption('active');
    await page.getByLabel('Delivery status',{exact:true}).focus();
    await page.keyboard.press('ArrowDown');
    expect(await page.getByLabel('Delivery status',{exact:true}).inputValue()).toBe('cancelled');
    await page.getByLabel('Delivery status',{exact:true}).selectOption('planned');
    await save(page);
    expect((await call('get_epic',{epicId:'E-PLAN'})).status).toBe('planned');
  },30000);

  it('PC5 everyday Decision authoring requires reviewed meaning and persists one identity', async () => {
    const page = await setup();
    await page.getByRole('button',{name:'New Decision',exact:true}).click();
    await fill(page,{'Stable ID':'ADR-LOCAL',Title:'Keep calculations local',Decision:'Compute without a network',Context:'Offline use',Consequences:'No remote synchronization'});
    await page.getByLabel('Definition status',{exact:true}).selectOption('accepted');
    await page.getByRole('button',{name:'Review changes',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Review ready'}).waitFor();
    expect(await store.getEntity('ADR-LOCAL')).toBeNull();
    await page.getByRole('button',{name:'Reject proposal',exact:true}).click();
    expect(await store.getEntity('ADR-LOCAL')).toBeNull();
    await save(page);
    await page.getByLabel('Decision',{exact:true}).fill('Compute locally with exact decimal arithmetic');
    await save(page);
    await workspace.stop(); store.close(); store = new WorkflowStore(root);
    await page.goto(await start());
    await page.getByRole('button',{name:'Keep calculations local',exact:true}).click();
    expect(await page.getByLabel('Decision',{exact:true}).inputValue()).toBe('Compute locally with exact decimal arithmetic');
    const read = Bun.spawnSync(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'product','decision','show','ADR-LOCAL'],{cwd:root,stdout:'pipe',stderr:'pipe'});
    expect(read.exitCode).toBe(0);
    expect(JSON.parse(read.stdout.toString())).toMatchObject({id:'ADR-LOCAL',decision:'Compute locally with exact decimal arithmetic',context:'Offline use',consequences:'No remote synchronization',status:'accepted'});
    await page.getByLabel('Decision',{exact:true}).fill('');
    await page.getByRole('button',{name:'Review changes',exact:true}).click();
    await page.getByRole('alert').filter({hasText:/decision/i}).waitFor();
    expect(await page.locator('#accept').isDisabled()).toBe(true);
    const proposal = await call('preview_change',{action:'product_change',mutations:[{kind:'product_update',entityType:'Decision',id:'ADR-LOCAL',fields:{decision:'Agent replacement'}}]});
    expect((await call('apply_change',{request:proposal.request,fingerprint:proposal.fingerprint,decision:'accept'})).status).toBe('review_required');
    expect((await call('get_decision',{id:'ADR-LOCAL'})).decision).toBe('Compute locally with exact decimal arithmetic');
  },30000);

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
    const cli = Bun.spawnSync([...(binary ? [binary] : ['bun', path.resolve(import.meta.dir,'../src/cli.ts')]), 'story','S'], {cwd:root,stdout:'pipe',stderr:'pipe'});
    const stdout = cli.stdout.toString(); expect(cli.exitCode).toBe(0);
    expect(stdout).toContain('Activate Save after preview');
    const client = new Client({name:'workspace-story-proof',version:'1'});
    try {
      await client.connect(new StdioClientTransport({command:binary || 'bun',args:binary ? ['mcp'] : [path.resolve(import.meta.dir,'../src/mcp.ts')],cwd:root,stderr:'pipe',env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'}}));
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
      {kind:'product_create',entityType:'Feature',id:'P',fields:{title:'Proposed filters',body:'Preview and save filtered avatars',status:'proposed'}}
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
    await createProduct(store, "Feature", {id:'F',title:'Avatar Filters'});
    await createProduct(store, "Feature", {id:'G',title:'Avatar Profile'});
    await createProduct(store, "UserStory", {id:'S',title:'Save avatar',actor:'User',intent:'Keep preview',initialState:'Unsaved preview',action:'Save',expectedResult:'Preview persists',status:'accepted'});
    for(const sourceId of ['F','G']) await acceptProduct(store, [{kind:"product_link",sourceId,predicate:'enables',targetId:'S'}]);
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
