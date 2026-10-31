import {afterEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createMigrationFixture,discoverMigrationImpact,authorizeMigration,executeFieldMigration,runFixtureCommand,
  migrationFiles,acceptMigrationStory,reviewMigrationStoryTest,migrationStoryTest,migrationContractChanges,type MigrationFixture} from '../fixtures/graph-field-migration.ts';
import {FileNode,SymbolNode,Ticket,UserStory,TestNode,Artifact} from '../../src/model/ontology.ts';
import {ensureAstFresh,indexCodebase,indexSingleFile} from '../../src/graph/indexer.ts';
import {commandRegistry,initializeTools} from '../../src/tools/index.ts';
import {closeAllTsLspClients} from '../../src/change/ts-lsp.ts';
import {WorkflowStore} from '../../src/graph/store.ts';
import {resolveCodeTarget} from '../../src/change/target-resolver.ts';
import {getTsLspClient} from '../../src/change/ts-lsp.ts';
import {productReviewFixture} from '../product-review-fixture.ts';
import {acceptProduct,reviewedApply} from '../product-review.ts';
import {loadConfig,saveConfig} from '../../src/services/config-service.ts';
import {storyTestStatus} from '../../src/product/story-tests.ts';
import {currentTicketReceipt} from '../../src/ticket/verification.ts';
import type {ResolutionOptions} from '../../src/ticket-operation-types.ts';


describe('Issue 6 real field-contract migration and structural lifecycle',()=>{
  let fixture:MigrationFixture|undefined;
  afterEach(async()=>{await closeAllTsLspClients();if(fixture){fixture.store.close();fs.rmSync(fixture.root,{recursive:true,force:true});fixture=undefined;}});

  it('discovers semantic and textual contracts, applies guarded changes and preserves the genuine oracle',async()=>{
    fixture=await createMigrationFixture();
    const {root,store}=fixture;
    const testBefore=fs.readFileSync(path.join(root,'tests/policy.test.ts'),'utf8');
    const baseline=runFixtureCommand(root,['bun','test','tests/policy.test.ts']);
    expect(baseline.exitCode).toBe(1);
    expect(baseline.output).toContain('Expected: 3000');
    const impact=await discoverMigrationImpact(fixture);
    expect(await store.listEntities<SymbolNode>(SymbolNode.dcr)).toEqual([]);
    expect(impact.semantic.exact).toBe(true);
    expect(impact.semantic.coverage.scope).toBe('typescript-project');
    expect(impact.references).toContain('src/consumer.ts');
    expect(impact.references).toContain('src/serialization.ts');
    expect(impact.references).not.toContain('src/schema.ts');
    // Structural import impact must retain escaped-key consumers independently of compiler reference coverage.
    expect(impact.text.matches.some((match:{filePath:string})=>match.filePath==='src/schema.ts')).toBe(true);
    expect(impact.text.matches.some((match:{filePath:string})=>match.filePath==='settings/retry.cfg')).toBe(true);
    expect(impact.text.matches.some((match:{filePath:string})=>match.filePath==='fixtures/wire-example.cfg')).toBe(true);
    expect(impact.text.matches.some((match:{filePath:string})=>match.filePath==='notes/decoy.txt')).toBe(true);
    expect(impact.text.exact).toBe(false);
    expect(impact.text.completeWithinScope).toBe(true);
    const {dossier,structural,escaped}=await authorizeMigration(fixture);
    expect(structural.affectedFiles).toContain('src/escaped.ts');
    expect(escaped.matches.some((match:{filePath:string})=>match.filePath==='src/escaped.ts')).toBe(true);
    expect(escaped.exact).toBe(false);
    expect(dossier.evidence.some(item=>item.filePath==='src/policy.ts')).toBe(true);
    const result=await executeFieldMigration(fixture);
    expect(result.rename.result.filesTouched).toContain('src/consumer.ts');
    expect(result.contracts.result.filesTouched).toContain('settings/retry.cfg');
    expect(result.properties.filter(symbol=>symbol.status!=='deprecated')).toHaveLength(1);
    // Retained Ticket intent, explanatory text and a genuine negative test are textual candidates, not active contracts.
    expect([...new Set(result.after.matches.map((match:{filePath:string})=>match.filePath))].sort()).toEqual(['kanban.md','notes/decoy.txt','tests/policy.test.ts']);
    expect(result.after.matches.some((match:{filePath:string})=>match.filePath.startsWith('src/')||match.filePath.endsWith('.cfg'))).toBe(false);
    expect(fs.readFileSync(path.join(root,'src/consumer.ts'),'utf8')).not.toContain('wait\\u0053econds');
    expect(fs.readFileSync(path.join(root,'tests/policy.test.ts'),'utf8')).toBe(testBefore);
    const tests=runFixtureCommand(root,['bun','test','tests/policy.test.ts']);
    expect(tests.exitCode).toBe(0);
    expect(tests.output).toContain('2 pass');
    const typecheck=runFixtureCommand(root,[path.resolve(import.meta.dir,'../../node_modules/.bin/tsc'),'--noEmit']);
    expect(typecheck.exitCode).toBe(0);
    // Guarded application and a passing test are not an independent acceptance receipt.
    expect(await store.getEntity('VERIFY-FIELD-MIGRATION')).toBeNull();
  },20000);

  it('replays scripted resolution and validates its receipts (not an autonomous US acceptance)',async()=>{
    fixture=await createMigrationFixture();
    const {root,store,context}=fixture;
    const live=Boolean(process.env.AIWF_GRAPH_ACCEPTANCE_EVIDENCE);
    const evidence:Record<string,unknown>={root,live,startedAt:new Date().toISOString()};
    const stop=live?()=>{}:await productReviewFixture(store,false);
    try {
      if(live) {
        const config=loadConfig(path.resolve(import.meta.dir,'../..'));
        saveConfig(root,{gateway:'ollama',ollamaUrl:config.ollamaUrl,model:'ollama/gemma4:e4b',
          modelRoutes:{critic:'ollama/gemma4:e4b',reasoning:'ollama/gemma4:e4b'},llmOutputTokens:8192});
      }
      await acceptMigrationStory(fixture);
      const story=(await store.getEntity<UserStory>('LOAD-POLICY',UserStory.dcr))!;
      expect(story.definitionReview.status).toBe('complete');
      evidence.reviews=await reviewMigrationStoryTest(fixture);
      expect((await storyTestStatus(store,'LOAD-POLICY')).state).toBe('skipped');
      expect((await story.getEffectiveState(store)).state).toBe('ready');
      const oracle=fs.readFileSync(path.join(root,'tests/policy.test.ts'),'utf8');
      const publicFixture=fs.readFileSync(path.join(root,'src/config.ts'),'utf8');
      const skipped=fs.readFileSync(path.join(root,migrationStoryTest.filePath),'utf8');
      // Commit the reviewed fixture baseline so dirty-target checks retain their normal meaning.
      expect(runFixtureCommand(root,['git','add','.']).exitCode).toBe(0);
      expect(runFixtureCommand(root,['git','-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','reviewed migration Story and test']).exitCode).toBe(0);
      await ensureAstFresh(store,root);
      for(const file of Object.keys(migrationFiles).filter(file=>file.startsWith('src/'))) {
        await store.relate(fixture.ticket,'modifies',(await store.getEntity<FileNode>(file,FileNode.dcr))!);
      }
      let implementations=0;
      const options:ResolutionOptions={agentId:'migration-host',maxRepairs:0,systemOne:{assess:async()=>null},
        authorizedFiles:{'FIELD-MIGRATION':Object.keys(migrationFiles).filter(file=>file.startsWith('src/')||file.endsWith('.cfg'))},
        testCommands:[['bun','test'],['bun','run','typecheck']],
        implement:async()=>{
          implementations++;
          const baseline=await storyTestStatus(store,'LOAD-POLICY');
          evidence.baseline=baseline;evidence.activeStory=await story.getEffectiveState(store);
          expect(baseline.state).toBe('expected-red');expect(baseline.tests[0]!.passed).toBe(false);
          expect((await story.getEffectiveState(store)).state).toBe('in-progress');
          const test=(await store.getEntity<TestNode>('test:'+migrationStoryTest.filePath,TestNode.dcr))!;
          evidence.baselineOutput=test.output;expect(test.output).toContain('Expected');
          return {changes:[{action:'source_change',changes:migrationContractChanges(fixture!)}],testCommands:[]};
        },
        // Controlled acceptance proves regression mechanics only; live mode uses the genuine reviewer.
        ...(live?{}:{verify:async input=>({criteria:input.dossier.ticket.acceptanceCriteria.map(criterion=>({criterion,passed:input.tests.every(test=>test.passed),evidence:'Controlled regression: unchanged public assertions and typecheck passed.'})),aspects:[],rules:[]})})
      };
      const result=await store.withExecutionContext('project-write',undefined,()=>fixture!.ticket.resolve(store,options));
      evidence.resolution=result;
      if(result.status!=='complete')throw Error(JSON.stringify(result));
      expect(implementations).toBe(1);
      expect(fs.readFileSync(path.join(root,'tests/policy.test.ts'),'utf8')).toBe(oracle);
      expect(fs.readFileSync(path.join(root,'src/config.ts'),'utf8')).toBe(publicFixture);
      const active=fs.readFileSync(path.join(root,migrationStoryTest.filePath),'utf8');
      expect(active).toBe(skipped.replace('it.skip(','it('));
      expect((await storyTestStatus(store,'LOAD-POLICY')).state).toBe('green');
      expect((await story.getEffectiveState(store)).state).toBe('done');
      const receipt=await currentTicketReceipt(store,(await store.getEntity<Ticket>('FIELD-MIGRATION',Ticket.dcr))!);
      expect(receipt).not.toBeNull();evidence.receipt=receipt;
      const artifact=await store.getEntity<Artifact>('VERIFY-FIELD-MIGRATION',Artifact.dcr);
      store.close();fixture.store=new WorkflowStore(root);fixture.context.store=fixture.store;
      const restarted=fixture.store;
      const persistedStory=(await restarted.getEntity<UserStory>('LOAD-POLICY',UserStory.dcr))!;
      const persistedTicket=(await restarted.getEntity<Ticket>('FIELD-MIGRATION',Ticket.dcr))!;
      expect(await currentTicketReceipt(restarted,persistedTicket)).toEqual(receipt);
      expect((await persistedStory.getEffectiveState(restarted)).state).toBe('done');
      expect((await restarted.getIncoming(persistedStory.id,'verifies')).map(edge=>restarted.localId(edge.sourceId))).toEqual(['test:'+migrationStoryTest.filePath]);
      evidence.restart={receiptCurrent:true,story:await persistedStory.getEffectiveState(restarted),ticketLane:persistedTicket.lane};
      // External test edits invalidate the receipt and reviewed oracle without rewriting history.
      fs.appendFileSync(path.join(root,migrationStoryTest.filePath),'\n// external evidence change\n');
      expect((await storyTestStatus(restarted,'LOAD-POLICY')).state).toBe('stale');
      expect(await currentTicketReceipt(restarted,persistedTicket)).toBeNull();
      expect((await persistedStory.getEffectiveState(restarted)).state).not.toBe('done');
      fs.writeFileSync(path.join(root,migrationStoryTest.filePath),active);
      expect(await currentTicketReceipt(restarted,persistedTicket)).toEqual(receipt);
      // Changed non-TypeScript configuration is also part of receipt freshness.
      fs.writeFileSync(path.join(root,'settings/retry.cfg'),' {"delayMs":3000}\n');
      expect(await currentTicketReceipt(restarted,persistedTicket)).toBeNull();
      fs.writeFileSync(path.join(root,'settings/retry.cfg'),'{"delayMs":3000}\n');
      expect(await currentTicketReceipt(restarted,persistedTicket)).toEqual(receipt);
      const request={action:'product_change' as const,mutations:[{kind:'product_update' as const,entityType:'UserStory',id:'LOAD-POLICY',fields:{title:'Load the configured millisecond delay'}}]};
      const pending=await commandRegistry.execute('preview_change',request,fixture.context);
      await acceptProduct(restarted,[{kind:'product_update',entityType:'UserStory',id:'LOAD-POLICY',fields:{title:'Read the configured retry delay in milliseconds'}}]);
      await expect(reviewedApply(restarted,{request,fingerprint:pending.fingerprint,decision:'accept'}))
        .rejects.toThrow('Stale change preview');
      expect((await restarted.getEntity<UserStory>('LOAD-POLICY',UserStory.dcr))!.title)
        .toBe('Read the configured retry delay in milliseconds');
      expect((await storyTestStatus(restarted,'LOAD-POLICY')).state).toBe('stale');
      expect(await currentTicketReceipt(restarted,persistedTicket)).toBeNull();
      expect((await (await restarted.getEntity<UserStory>('LOAD-POLICY',UserStory.dcr))!.getEffectiveState(restarted)).state).not.toBe('done');
      expect((await restarted.getEntity<Artifact>('VERIFY-FIELD-MIGRATION',Artifact.dcr))!.body).toBe(artifact!.body);
      evidence.negatives={changedTest:'stale; receipt invalid',changedConfiguration:'receipt invalid',revisedStory:'stale; receipt invalid',staleApproval:'rejected without mutation',historicalReceiptPreserved:true};
    } finally {
      stop();
      if(process.env.AIWF_GRAPH_ACCEPTANCE_EVIDENCE)fs.writeFileSync(process.env.AIWF_GRAPH_ACCEPTANCE_EVIDENCE,JSON.stringify(evidence,null,2));
    }
  },300000);

  it('reconciles nested/static declarations and durable missing targets across edits, deletion and restart',async()=>{
    fixture=await createMigrationFixture();
    const {root,store}=fixture;
    const file='src/nested_contract.ts';
    const source='export class Outer { static value=1; value=2; method(){ function nested() {return 1} return nested(); } }\n';
    fs.writeFileSync(path.join(root,file),source);
    await indexCodebase(store,root);
    const symbols=await store.listEntities<SymbolNode>(SymbolNode.dcr,{filePath:file});
    expect(symbols.filter(symbol=>symbol.title==='value')).toHaveLength(2);
    const method=symbols.find(symbol=>symbol.title==='method')!;
    const nested=symbols.find(symbol=>symbol.title==='nested')!;
    expect((await store.getOutgoing(method.id,'contains')).some(edge=>edge.targetId===nested.id)).toBe(true);
    const value=symbols.find(symbol=>symbol.title==='value'&&!symbol.metadata?.static)!;
    await store.relate(fixture.ticket,'modifies',value);
    const resolved=await resolveCodeTarget({type:'entity',entityId:value.id},store,getTsLspClient(root),root);
    expect(resolved.position.character).toBe(value.column! - 1);
    const before=symbols.map(symbol=>[symbol.id,symbol.version]);
    await indexCodebase(store,root);
    expect((await store.listEntities<SymbolNode>(SymbolNode.dcr,{filePath:file})).map(symbol=>[symbol.id,symbol.version])).toEqual(before);
    fs.writeFileSync(path.join(root,file),'\n\n'+source);
    await ensureAstFresh(store,root);
    expect((await store.getEntity<SymbolNode>(value.id,SymbolNode.dcr))!.line).toBe(3);
    expect((await store.getEntity<SymbolNode>(value.id,SymbolNode.dcr))!.status).toBe('implemented');
    fs.unlinkSync(path.join(root,file));
    await ensureAstFresh(store,root);
    expect((await store.getEntity<SymbolNode>(value.id,SymbolNode.dcr))!.status).toBe('deprecated');
    expect((await store.getEntity<SymbolNode>(value.id,SymbolNode.dcr))!.metadata?.missing).toBe(true);
    expect(await store.getOutgoing(file,'contains')).toEqual([]);
    expect(await store.getOutgoing(file,'calls')).toEqual([]);
    expect((await store.getOutgoing(fixture.ticket.id,'modifies')).some(edge=>edge.targetId===value.id)).toBe(true);
    store.close();fixture.store=new WorkflowStore(root);fixture.context.store=fixture.store;
    fs.writeFileSync(path.join(root,file),source);
    await ensureAstFresh(fixture.store,root);
    const restored=(await fixture.store.getEntity<SymbolNode>(value.id,SymbolNode.dcr))!;
    expect(restored.status).toBe('implemented');expect(restored.metadata?.missing).toBe(false);
    const outlined=await commandRegistry.execute('get_file_outline',{filePath:file},fixture.context);
    expect(outlined.symbols.map((symbol:{name:string})=>symbol.name)).toContain('nested');
  },20000);

  it('keeps source-position and literal reads independent of Graph writes and refuses escapes',async()=>{
    fixture=await createMigrationFixture();initializeTools();
    const {root,store}=fixture;
    const readOnly={...fixture.context,executionAuthority:'read-only' as const};
    const position={filePath:'src/policy.ts',line:0,character:migrationFiles['src/policy.ts']!.indexOf('waitSeconds')};
    expect((await commandRegistry.execute('get_exact_references',position,readOnly)).references.length).toBeGreaterThan(2);
    expect((await commandRegistry.execute('search_workspace_text',{text:'waitSeconds'},readOnly)).matches.length).toBeGreaterThan(4);
    const newConsumer=path.join(root,'src/new_consumer.ts');
    fs.writeFileSync(newConsumer,"import type {RetryPolicy} from './policy.ts'; export const consume=(value:RetryPolicy)=>value.waitSeconds;\n");
    const afterCreate=await commandRegistry.execute('get_exact_references',position,readOnly);
    expect(afterCreate.references.some((reference:{uri:string})=>reference.uri.endsWith('/src/new_consumer.ts'))).toBe(true);
    const rename=await getTsLspClient(root).willRenameFiles([{oldPath:'src/policy.ts',newPath:'src/policy_next.ts'}]);
    expect(JSON.stringify(rename)).toContain('new_consumer.ts');
    expect(JSON.stringify(rename)).toContain('policy_next');
    fs.unlinkSync(newConsumer);
    const afterDelete=await commandRegistry.execute('get_exact_references',position,readOnly);
    expect(afterDelete.references.some((reference:{uri:string})=>reference.uri.endsWith('/src/new_consumer.ts'))).toBe(false);

    expect(await store.listEntities<FileNode>(FileNode.dcr)).toEqual([]);
    await expect(commandRegistry.execute('get_exact_references',{...position,filePath:'../outside.ts'},readOnly)).rejects.toThrow('escapes');
    await expect(commandRegistry.execute('get_exact_references',{...position,line:9999},readOnly)).rejects.toThrow('outside');
    const exactLimit=await commandRegistry.execute('search_workspace_text',{text:'not an active field contract.',limit:1},readOnly);
    expect(exactLimit.matches).toHaveLength(1);expect(exactLimit.truncated).toBe(false);expect(exactLimit.completeWithinScope).toBe(true);
    const outside=path.join(root,'escape.ts');fs.symlinkSync('/etc/passwd',outside);
    fs.writeFileSync(path.join(root,'binary.cfg'),Buffer.from([0,119,97,105,116]));
    const bounded=await commandRegistry.execute('search_workspace_text',{text:'waitSeconds'},readOnly);
    expect(bounded.completeWithinScope).toBe(false);
    expect(bounded.skippedFiles).toContain('escape.ts');expect(bounded.skippedFiles).toContain('binary.cfg');
    await expect(commandRegistry.execute('get_exact_references',{...position,filePath:'escape.ts'},readOnly)).rejects.toThrow('symlink');
    await expect(commandRegistry.execute('find_symbol',{name:'RetryPolicy'},readOnly)).rejects.toThrow('AST index is stale; refresh it with project-write authority');
    expect(await store.listEntities<FileNode>(FileNode.dcr)).toEqual([]);
  });
  it('uses the same stable structural owner for external public members and retires deleted dependency targets',async()=>{
    fixture=await createMigrationFixture();
    const dependency=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-public-dependency-'));
    try {
      fs.mkdirSync(path.join(dependency,'src'));
      fs.writeFileSync(path.join(dependency,'package.json'),JSON.stringify({name:'@example/policy',exports:'./src/index.ts'}));
      fs.writeFileSync(path.join(dependency,'src/index.ts'),"export {Client} from './client.ts';\n");
      const source='export class Client { delayMs=1; send(){return this.delayMs;} }\n';
      fs.writeFileSync(path.join(dependency,'src/client.ts'),source);
      fs.writeFileSync(path.join(fixture.root,'package.json'),JSON.stringify({dependencies:{'@example/policy':'link:'+dependency}}));
      await ensureAstFresh(fixture.store,fixture.root);
      const member=(await fixture.store.listEntities<SymbolNode>(SymbolNode.dcr,{title:'delayMs',filePath:'@example/policy/src/client.ts'}))[0];
      expect(member).toBeDefined();
      await fixture.store.relate(fixture.ticket,'modifies',member!);
      fs.writeFileSync(path.join(dependency,'src/client.ts'),'\n\n'+source);
      await ensureAstFresh(fixture.store,fixture.root);
      const shifted=(await fixture.store.getEntity<SymbolNode>(member!.id,SymbolNode.dcr))!;
      expect(shifted.line).toBe(3);
      expect((await fixture.store.getOutgoing(fixture.ticket.id,'modifies')).some(edge=>edge.targetId===member!.id)).toBe(true);
      fs.unlinkSync(path.join(dependency,'src/client.ts'));
      await ensureAstFresh(fixture.store,fixture.root);
      expect((await fixture.store.getEntity<SymbolNode>(member!.id,SymbolNode.dcr))!.status).toBe('deprecated');
    } finally {fs.rmSync(dependency,{recursive:true,force:true});}
  });

  it('refreshes same-size edits with restored or backwards timestamps',async()=>{
    fixture=await createMigrationFixture();
    const file='src/stable.ts',full=path.join(fixture.root,file),stamp=new Date('2020-01-01T00:00:00Z');
    const before='export function run() { return send() }';
    const after='export function run() { return save() }';
    fs.writeFileSync(full,before);fs.utimesSync(full,stamp,stamp);
    await ensureAstFresh(fixture.store,fixture.root);
    const stat=fs.statSync(full);
    fs.writeFileSync(full,after);fs.utimesSync(full,stamp,stamp);
    expect(fs.statSync(full).size).toBe(stat.size);expect(fs.statSync(full).mtimeMs).toBe(stat.mtimeMs);
    expect((await ensureAstFresh(fixture.store,fixture.root)).updatedFiles).toContain(file);
    expect((await fixture.store.getEntity<FileNode>(file,FileNode.dcr))!.metadata?.callCandidates).toContainEqual({name:'save',confidence:0.52,provenance:'parser-syntax',resolution:'unresolved'});
    fs.writeFileSync(full,before);fs.utimesSync(full,new Date('2019-01-01'),new Date('2019-01-01'));
    expect((await ensureAstFresh(fixture.store,fixture.root)).updatedFiles).toContain(file);
    expect((await fixture.store.getEntity<FileNode>(file,FileNode.dcr))!.metadata?.callCandidates).toContainEqual({name:'send',confidence:0.52,provenance:'parser-syntax',resolution:'unresolved'});
  });

  it('serializes index refreshes across independent stores and rechecks after waiting',async()=>{
    fixture=await createMigrationFixture();
    const {root,store}=fixture;
    const other=new WorkflowStore(root);
    try {
      const file='src/concurrent.ts',full=path.join(root,file);
      fs.writeFileSync(full,'export const concurrent = 42;\n');
      const order:string[]=[];
      const first=store.withIndexCriticalSection(async()=>{
        order.push('first-enter');
        // Index synchronization must not block unrelated authored governance work.
        const governance=await other.admitGovernance('governance');
        await other.releaseGovernance(governance);
        await Bun.sleep(80);
        await indexSingleFile(store,full,file,root);
        order.push('first-exit');
      });
      while(!order.length) await Bun.sleep(5);
      const second=ensureAstFresh(other,root).then(result=>{order.push('second-exit');return result;});
      await first;
      const result=await second;
      expect(order).toEqual(['first-enter','first-exit','second-exit']);
      expect(result.updatedFiles).not.toContain(file);
      expect((await other.getEntity<FileNode>(file,FileNode.dcr))?.status).toBe('implemented');
      fs.writeFileSync(full,'export const concurrent = 430;\n');
      const [a,b]=await Promise.all([ensureAstFresh(store,root),ensureAstFresh(other,root)]);
      expect([a,b].filter(value=>value.updatedFiles.includes(file))).toHaveLength(1);
    } finally {other.close();}
  },20000);

  it('keeps explicit read-only refreshes non-mutating and releases a failed index section',async()=>{
    fixture=await createMigrationFixture();
    const {root,store}=fixture;
    await ensureAstFresh(store,root);
    const count=(await store.listEntities<FileNode>(FileNode.dcr)).length;
    await store.withExecutionContext('read-only',undefined,()=>ensureAstFresh(store,root));
    expect((await store.listEntities<FileNode>(FileNode.dcr)).length).toBe(count);
    const file='src/new_contract.ts';
    fs.writeFileSync(path.join(root,file),'export const answer = 42;\n');
    await expect(store.withExecutionContext('read-only',undefined,()=>ensureAstFresh(store,root)))
      .rejects.toThrow('AST index is stale; refresh it with project-write authority');
    expect(await store.getEntity(file,FileNode.dcr)).toBeNull();
    await expect(store.withIndexCriticalSection(async()=>{throw Error('simulated failure');}))
      .rejects.toThrow('simulated failure');
    expect((await ensureAstFresh(store,root)).updatedFiles).toContain(file);
  },20000);

  it('ships Oxc and public Graph/LSP/literal tools in a standalone MCP executable',async()=>{
    const repository=path.resolve(import.meta.dir,'../..');
    const build=Bun.spawnSync(['bun','run','pack'],{cwd:repository,stdout:'pipe',stderr:'pipe'});
    if(build.exitCode!==0) throw Error(build.stdout.toString()+build.stderr.toString());
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-standalone-graph-'));
    const source='export interface Options { delayMs: number }\nconst options: Options = {delayMs:3};\nexport const read=options.delayMs;\n';
    fs.writeFileSync(path.join(root,'contract.ts'),source);
    fs.writeFileSync(path.join(root,'wire.cfg'),'{"delayMs":3}');
    fs.writeFileSync(path.join(root,'tsconfig.json'),'{"compilerOptions":{"module":"esnext","moduleResolution":"bundler"},"include":["*.ts"]}');
    const client=new Client({name:'standalone-graph-acceptance',version:'1'});
    const transport=new StdioClientTransport({command:path.join(repository,'dist/aiwf'),args:['mcp'],cwd:root,
      stderr:'pipe',env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write'}});
    let stderr='';transport.stderr?.on('data',chunk=>{stderr+=chunk.toString()});
    const call=async(name:string,args:Record<string,unknown>)=>{
      const response=await client.callTool({name,arguments:args});
      if(response.isError) throw Error(JSON.stringify(response)+'\n'+stderr);
      return JSON.parse((response.content as Array<{text:string}>)[0]!.text);
    };
    try {
      await client.connect(transport);
      expect(fs.existsSync(path.join(root,'node_modules'))).toBe(false);
      expect((await client.listTools()).tools.some(tool=>tool.name==='search_workspace_text')).toBe(true);
      const references=await call('get_exact_references',{filePath:'contract.ts',line:0,character:source.indexOf('delayMs')});
      expect(references.references.length).toBeGreaterThanOrEqual(3);
      const symbols=await call('find_symbol',{name:'delayMs',kind:'property',exact:true});
      expect(symbols.some((symbol:{containerName:string;provenance:string})=>symbol.containerName==='Options'&&symbol.provenance==='oxc-ast')).toBe(true);
      const text=await call('search_workspace_text',{text:'delayMs'});
      expect(text.exact).toBe(false);
      expect(text.matches.some((match:{filePath:string})=>match.filePath==='wire.cfg')).toBe(true);
    } finally {await client.close();fs.rmSync(root,{recursive:true,force:true});}
  },20000);

});
