import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMcpServer} from '../src/mcp.ts';
import {createProduct,acceptProduct} from './product-review.ts';
import {productReviewFixture} from './product-review-fixture.ts';
import {createAspect} from './product-review.ts';
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { CompletionEngine, LayaSystemOne } from '@dharmax/llm-utils';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkflowStore } from '../src/graph/store.ts';
import { UserStory, Ticket, FileNode, Aspect, SymbolNode, TestNode, Artifact } from '../src/graph/ontology.ts';
import { saveConfig } from '../src/services/config-service.ts';
import { recordTestExecution, reconcileTestVerificationEdges, currentTestEvidence, verifyingTestsForTargets } from '../src/graph/test-artifacts.ts';
import { indexCodebase } from '../src/graph/indexer.ts';
import { closeAllTsLspClients } from '../src/change/ts-lsp.ts';
import { closeAllTs6RefactorClients } from '../src/change/ts6-refactor.ts';
import type { ResolutionVerificationInput, ResolutionOptions } from '../src/ticket-operation-types.ts';
import { queryPerformance } from '../src/performance-metrics.ts';
import { buildVerificationContext } from '../src/verification-context.ts';
import { initializeTools, registry } from '../src/tools/index.ts';
import { CausalChangeEngine } from '../src/change/engine.ts';

describe('Ticket-owned bounded resolution', () => {
  let root: string, store: WorkflowStore;
  const systemOne = { assess: async () => null };
  const verify = async (input: ResolutionVerificationInput) => ({ criteria: input.dossier.ticket.acceptanceCriteria.map(criterion => ({ criterion, passed: input.tests.every(test => test.passed), evidence: 'Authored deterministic assertions passed' })), aspects: input.dossier.aspects.aspects.map(aspect => ({ id: aspect.id, passed: input.tests.every(test => test.passed), evidence: 'Explicit material regression passed' })) });
  const git = (...args: string[]) => { const result = Bun.spawnSync(['git', ...args], { cwd: root, stderr: 'pipe' }); if (!result.success) throw Error(result.stderr.toString()); };
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-resolve-')); fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'tests'));
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ai-workflow\n*.md\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'bundler', types: ['bun'], skipLibCheck: true }, include: ['src/**/*.ts', 'tests/**/*.ts'] }));
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a - b; }\n');
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test"; import {add} from "../src/add"; test("adds positives and negatives",()=>{expect(add(2,3)).toBe(5);expect(add(-2,3)).toBe(1);});\n');
    git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    store = new WorkflowStore(root); await indexCodebase(store, root);
  });
  afterEach(async () => { await closeAllTsLspClients(); await closeAllTs6RefactorClients(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const ticket = async (id = 'T', title = 'Fix addition') => {
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id, title, body: 'Use arithmetic addition, preserving signed values.', lane: 'Todo', acceptanceCriteria: ['Positive and negative inputs add correctly'] });
    await store.relate(t, 'modifies', (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!); return t;
  };
  const fix: ResolutionOptions = { systemOne, critic: 'none', verify, implement: async () => ({ changes: [{ action: 'replace_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, replacement: 'export function add(a: number, b: number) { return a + b; }' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] }) };

  for (const initial of ['red','green','infrastructure','rejected','dependency','read-only','stale','public','public-duplicate','multiple'] as const) it(`resolves reviewed Story lifecycle without manual preparation: ${initial}`,async()=>{
    const stop=await productReviewFixture(store);
    try {
      await createProduct(store,'UserStory',{id:'S',title:'Add signed values',actor:'User',intent:'Calculate a sum',initialState:'Two signed numbers are available',action:'Add the numbers',expectedResult:'Their sum is returned',status:'accepted'});
      const t=await ticket();
      await acceptProduct(store,[{kind:'product_link',sourceId:'T',predicate:'addresses',targetId:'S'}]);
      initializeTools();const ctx={store,projectRoot:root,executionAuthority:'project-write' as const};
      if(initial==='green') fs.writeFileSync(path.join(root,'src/add.ts'),'export function add(a: number,b: number){return a+b;}');
      if(initial==='infrastructure') fs.writeFileSync(path.join(root,'src/add.ts'),'throw new Error("provider unavailable"); export function add(a:number,b:number){return a+b;}');
      const specification={storyId:'S',filePath:'tests/signed-story.test.ts',fixturePath:'src/add.ts',interfaceName:'add',body:'expect(subject(2,3)).toBe(5);expect(subject(-2,3)).toBe(1);'};
      let preview=await registry.execute('prepare_story_test',{specification},ctx);
      let applied=await store.withExecutionContext('project-write',undefined,()=>registry.execute('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'},ctx),preview.fingerprint);
      if(applied.status==='file-created-unlinked') {
        preview=await registry.execute('prepare_story_test',{specification},ctx);
        applied=await store.withExecutionContext('project-write',undefined,()=>registry.execute('apply_story_test',{specification,fingerprint:preview.fingerprint,decision:'accept'},ctx),preview.fingerprint);
      }
      expect(applied.status).toBe('linked');
      if(initial==='multiple') {
        await createProduct(store,'UserStory',{id:'EXISTING',title:'Add zero',actor:'User',intent:'Preserve the value',initialState:'A number and zero',action:'Add zero',expectedResult:'Original number is returned',status:'accepted'});
        await acceptProduct(store,[{kind:'product_link',sourceId:'T',predicate:'addresses',targetId:'EXISTING'}]);
        const existing={...specification,storyId:'EXISTING',filePath:'tests/zero-story.test.ts',body:'expect(subject(2,0)).toBe(2);'};
        for(let attempt=0;attempt<2;attempt++) {
          const preview=await registry.execute('prepare_story_test',{specification:existing},ctx);
          const result=await store.withExecutionContext('project-write',undefined,()=>registry.execute('apply_story_test',{specification:existing,fingerprint:preview.fingerprint,decision:'accept'},ctx),preview.fingerprint);
          if(result.status==='linked')break;
        }
      }
      const story=(await store.getEntity<UserStory>('S',UserStory.dcr))!;
      git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','reviewed story');
      if(initial==='dependency') {
        await store.upsertEntity(Ticket.dcr,{id:'PREREQUISITE',title:'External approval',lane:'Todo',acceptanceCriteria:['Approved']});
        await acceptProduct(store,[{kind:'product_link',sourceId:'T',predicate:'depends_on',targetId:'PREREQUISITE'}]);
      }
      if(initial==='stale') fs.appendFileSync(path.join(root,specification.filePath),'\n// unreviewed test change');
      if(initial!=='stale') expect((await story.getEffectiveState(store)).state).toBe(initial==='dependency'?'blocked':'ready');
      const testBefore=fs.readFileSync(path.join(root,specification.filePath),'utf8');
      const sourceBefore=fs.readFileSync(path.join(root,'src/add.ts'),'utf8');
      let implementations=0,reviews=0;
      const options:ResolutionOptions={...fix,maxRepairs:0,implement:async(dossier,feedback)=>{
        implementations++;
        const baseline=(await store.getEntity<TestNode>('test:tests/signed-story.test.ts',TestNode.dcr))!;
        expect(baseline.testState).toBe('expected-red');expect(baseline.passed).toBe(false);expect(baseline.lastRun).toBeTruthy();
        return fix.implement!(dossier,feedback);
      },verify:async input=>{reviews++;expect(input.tests.every(t=>t.passed)).toBe(true);
        const accepted=await verify(input);
        if(initial==='rejected') accepted.criteria[0].passed=false;
        return accepted;
      }};
      let result:Awaited<ReturnType<typeof t.resolve>>;
      if(initial==='public'||initial==='public-duplicate') {
        const routing=spyOn(LayaSystemOne.prototype,'assess').mockResolvedValue(null);
        const provider=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(prompt,model)=>{
          if(prompt.includes('Independently verify EVERY')) {
            reviews++;expect(prompt).toContain('return a + b');expect(prompt).toContain('"passed":true');
            return {model,ok:true,text:JSON.stringify({criteria:[{criterion:'Positive and negative inputs add correctly',passed:true,evidence:'Current signed arithmetic source and both executed public Story assertions agree.'}],aspects:[],rules:[]})};
          }
          implementations++;
          expect(prompt).toContain("Story 'S' baseline: expected-red");
          expect(prompt).not.toContain('it.skip(');
          expect(prompt).toContain('export function add(a: number, b: number) { return a - b; }');
          expect(prompt).toContain('expect(subject(2,3)).toBe(5)');
          expect(prompt).toContain('Their sum is returned');
          const baseline=(await store.getEntity<TestNode>('test:tests/signed-story.test.ts',TestNode.dcr))!;
          expect(baseline.testState).toBe('expected-red');expect(baseline.passed).toBe(false);
          const decision=implementations===1
            ? {thought:'Correct the inspected arithmetic operator',action:'tool_call',toolCalls:[{name:'safe_change',parameters:{action:'replace_text',filePath:'src/add.ts',oldText:'a - b',newText:'a + b'}}]}
            : {thought:'Request tests and independent acceptance',action:'final_answer',finalAnswer:JSON.stringify({changes:initial==='public-duplicate'?[{action:'replace_text',filePath:'src/add.ts',oldText:'a - b',newText:'a + b'}]:[],testCommands:[['bun','test','tests/signed-story.test.ts']]})};
          return {model,ok:true,text:JSON.stringify(decision)};
        });
        try {result=await registry.execute('resolve_ticket',{ticketId:'T',maxRepairs:0},ctx);}
        finally {provider.mockRestore();routing.mockRestore();}
      } else result=await store.withExecutionContext(initial==='read-only'?'read-only':'project-write',undefined,()=>t.resolve(store,options));
      expect(fs.readFileSync(path.join(root,specification.filePath),'utf8')).toBe(
        ['dependency','read-only','stale'].includes(initial)?testBefore:testBefore.replace(/\bit\.skip\s*\(/g,'it('));
      if(['infrastructure','rejected','dependency','read-only','stale'].includes(initial)) {
        expect(result.status).toBe('blocked');expect(await store.getEntity('VERIFY-T')).toBeNull();expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
        if(initial==='rejected'){expect(implementations).toBe(1);expect(reviews).toBe(1);}
        else {expect(implementations).toBe(0);expect(reviews).toBe(0);expect(fs.readFileSync(path.join(root,'src/add.ts'),'utf8')).toBe(sourceBefore);}
        if(initial==='infrastructure')expect((await store.getEntity<TestNode>('test:tests/signed-story.test.ts',TestNode.dcr))!.testState).toBe('blocked');
        if(initial==='dependency')expect(JSON.stringify(result)).toContain('PREREQUISITE');
      } else {
        if(result.status!=='complete')throw Error(JSON.stringify(result));expect(result.status).toBe('complete');
        expect(implementations).toBe(initial==='green'?0:(initial==='public'||initial==='public-duplicate')?2:1);expect(reviews).toBe(1);
        expect((await story.getEffectiveState(store)).state).toBe('done');
        expect((await store.getEntity<TestNode>('test:tests/signed-story.test.ts',TestNode.dcr))!.testState).toBe('green');
        expect((await store.getEntity<Ticket>('T',Ticket.dcr))!).toMatchObject({lane:'Done',claim:null});
        expect(await store.getEntity('VERIFY-T')).not.toBeNull();
        store.close();store=new WorkflowStore(root);
        expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Done');expect(await store.getEntity('VERIFY-T')).not.toBeNull();
        expect((await story.getEffectiveState(store)).state).toBe('done');
        if(initial==='green') {
          // A generated projection may be newly tracked after resolution. Reading the Story
          // must neither index that unrelated file nor weaken the existing acceptance receipt.
          expect(fs.existsSync(path.join(root, 'decisions.md'))).toBe(true);
          git('add', '-f', 'decisions.md');
          expect(await store.getEntity<FileNode>('decisions.md', FileNode.dcr)).toBeNull();
          const unchangedWrites=store.db.query<{count:number},[]>("SELECT total_changes() AS count").get()!.count;
          expect((await story.getEffectiveState(store)).state).toBe('done');
          expect(store.db.query<{count:number},[]>("SELECT total_changes() AS count").get()!.count).toBe(unchangedWrites);
          expect(await store.getEntity<FileNode>('decisions.md', FileNode.dcr)).toBeNull();
          const writes=store.db.query<{count:number},[]>("SELECT total_changes() AS count").get()!.count;
          expect((await story.getEffectiveState(store)).state).toBe('done');
          expect(store.db.query<{count:number},[]>("SELECT total_changes() AS count").get()!.count).toBe(writes);
          const followup=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'FOLLOWUP',title:'Remaining Story work',lane:'Todo'});
          await store.relate(followup,'addresses',story);
          expect((await story.getEffectiveState(store)).state).toBe('tested');
          await followup.update({lane:'Blocked'});
          expect((await story.getEffectiveState(store)).state).toBe('blocked');
          await followup.update({lane:'In Progress'});
          expect((await story.getEffectiveState(store)).state).toBe('in-progress');
          await followup.update({lane:'Cancelled'});
          expect((await story.getEffectiveState(store)).state).toBe('done');
          // Historical Done without current independent proof cannot satisfy remaining Story work.
          store.db.query("UPDATE aiwf_Ticket SET data=json_set(data,'$.lane','Done') WHERE _id=?").run(followup.id);
          expect((await story.getEffectiveState(store)).state).toBe('tested');
          await store.upsertEntity(Ticket.dcr,{id:'T',body:'Changed completion obligation'});
          expect((await story.getEffectiveState(store)).state).toBe('tested');
        }
        if(initial==='red') {
          const version=(await store.getEntity<Ticket>('T',Ticket.dcr))!.version;
          fs.writeFileSync(path.join(root,'src/add.ts'),sourceBefore);
          const staleState=await story.getEffectiveState(store);
          expect(staleState.state).toBe('ready');
          expect(staleState.reasons.join(' ')).toContain('stale');
          expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.version).toBe(version);
          git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','external source regression');
          const stale=await t.resolve(store,{...options,verifyOnly:true});
          expect(stale.status).toBe('blocked');expect(implementations).toBe(1);
          expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
        }
      }
    } finally {stop();}
  },30000);

  for (const target of ['root','child'] as const) for (const status of ['blocked','needs_input','exception'] as const)
  it(`public resolver stops all owned reservations after ${target} preparation ${status}`, async () => {
    await ticket();
    if(target==='child') {
      const parent=(await store.getEntity<Ticket>('T',Ticket.dcr))!;
      const child=await ticket('CHILD','Separate child contract');await store.upsertEntity(Ticket.dcr,{id:'CHILD',body:'Bounded independent subtask',acceptanceCriteria:['Child contract is satisfied']});await store.relate(parent,'contains',child);
    }
    const original=Ticket.prototype.prepare;
    const routing=spyOn(LayaSystemOne.prototype,'assess').mockResolvedValue(null);
    const preparation=spyOn(Ticket.prototype,'prepare').mockImplementation(async function(this:Ticket,s,options) {
      const id=s.localId(this.id);
      if(id!==(target==='root'?'T':'CHILD'))return original.call(this,s,options);
      if(status==='exception')throw Error('Preparation exception preserves work');
      return status==='blocked'?{status,artifactId:id,blockers:[{reason:'Nested preparation blocker'}]}:
        {status,artifactId:id,required:[{question:'Developer decision',why:'Nested preparation needs input',target:'Ticket scope'}]};
    });
    try {
      initializeTools();
      const result=await registry.execute('resolve_ticket',{ticketId:'T',agentId:'executor',maxRepairs:0},
        {store,projectRoot:root,executionAuthority:'project-write'});
      expect(result.status).toBe(status==='exception'?'blocked':status);
      for(const id of target==='child'?['T','CHILD']:['T']) {
        expect(await store.getEntity<Ticket>(id,Ticket.dcr)).toMatchObject({lane:'Blocked',claim:null});
        expect(await store.getEntity('VERIFY-'+id,Artifact.dcr)).toBeNull();
        const history=await registry.execute('get_ticket_history',{ticketId:id,limit:100},{store,projectRoot:root});
        expect(JSON.stringify(history)).toContain(status==='exception'?'Preparation exception':status==='blocked'?'Nested preparation blocker':'Nested preparation needs input');
      }
      expect(await store.getActiveClaims()).toEqual([]);
    } finally {preparation.mockRestore();routing.mockRestore();}
  });

  it('surgically fixes a function, verifies material Aspects, records proof/metrics and reuses only matching proof', async () => {
    const t = await ticket(); const a = await createAspect(store,{ id: 'A', title: 'Signed arithmetic', acceptanceCriteria: ['Preserve signed inputs'] }); await store.relate(t, 'addresses', a);
    const result = await t.resolve(store, fix); expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result));
    expect(result.value).toMatchObject({ verification: true, resolved: ['T'], repairs: 0 }); expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('return a + b');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!).toMatchObject({ lane: 'Done', claim: null });
    expect(await store.getEntity('VERIFY-T')).not.toBeNull(); expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].verification).toBe(true);
    expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].resolution?.outcome).toBe('implemented');
    const rerun = await t.resolve(store, { ...fix, implement: async () => { throw Error('must reuse verified work'); } }); expect(rerun.status).toBe('complete');
    expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[1].counters.artifactsReused).toBe(1);
    expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[1].resolution?.outcome).toBe('proof_reused');
  }, 30000);

  for (const stage of ['implementation', 'verification'] as const) it(`records a blocker at the actual ${stage} stage`, async () => {
    const t = await ticket();
    const result = await t.resolve(store, {...fix, maxRepairs: 0, implement: async () => {
      if (stage === 'implementation') throw Error('Fixture implementation failure');
      return {changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']]};
    }});
    expect(result.status).toBe('blocked');
    expect(queryPerformance(root, {operation: 'resolve_ticket', artifactId: 'T'}).rows[0].resolution).toEqual({stage, outcome: `blocked_${stage}`});
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
  });
  for (const interruption of ['abort','replacement','same-agent'] as const) it(`public resolution releases only its owned execution after ${interruption}`, async () => {
    fs.writeFileSync(path.join(root,'src/add.ts'),'export function add(a: number, b: number) { return a + b; }\n');
    await ticket();
    const oracle=await graphOracle((await store.getEntity<FileNode>('src/add.ts',FileNode.dcr))!);
    git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','current source');
    const controller=new AbortController();
    const completion=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async()=>{
      expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.claim?.agentId).toBe('resolver');
      if(interruption!=='abort') {
        await store.upsertEntity(Ticket.dcr,{id:'T',claim:{agentId:'resolver',claimedAt:new Date(0).toISOString(),expiresAt:new Date(0).toISOString()}});
        expect((await store.claimTicket('T',interruption==='same-agent'?'resolver':'replacement',30)).success).toBe(true);
      }
      controller.abort(Error('Interrupted at independent review'));
      throw controller.signal.reason;
    });
    try {
      initializeTools();
      const result=await registry.execute('resolve_ticket',{ticketId:'T',agentId:'resolver',verifyOnly:true,critic:'none',maxRepairs:0,
        testCommands:[['bun','test',oracle.filePath!]]},{store,projectRoot:root,executionAuthority:'project-write',signal:controller.signal});
      expect(result.status).toBe('blocked');
      const current=await store.getEntity<Ticket>('T',Ticket.dcr);
      expect(current?.lane).toBe(interruption!=='abort'?'In Progress':'Blocked');
      expect(current?.claim?.agentId??null).toBe(interruption==='same-agent'?'resolver':interruption==='replacement'?'replacement':null);
      expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
      if(interruption==='abort') {
        const history=await registry.execute('get_ticket_history',{ticketId:'T',limit:100},{store,projectRoot:root});
        expect(JSON.stringify(history)).toContain('Interrupted at independent review');
      }
      expect(JSON.parse((await store.getEntity<Artifact>('GOVERNANCE-ADMISSION',Artifact.dcr))!.body!)).toEqual([]);
    } finally {completion.mockRestore();}
  },30000);
  it('cancels actual MCP resolution during independent review and waits for durable cleanup',async()=>{
    fs.writeFileSync(path.join(root,'src/add.ts'),'export function add(a:number,b:number){return a+b;}');
    await ticket();const oracle=await graphOracle((await store.getEntity<FileNode>('src/add.ts',FileNode.dcr))!);
    git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','correct source');
    let reviewing!:()=>void,finished!:()=>void;
    const entered=new Promise<void>(resolve=>{reviewing=resolve});
    const settled=new Promise<void>(resolve=>{finished=resolve});
    const original=Ticket.prototype.resolve;
    const observe=spyOn(Ticket.prototype,'resolve').mockImplementation(async function(this:Ticket,s,o){
      try{return await original.call(this,s,o);}finally{finished();}
    });
    const routing=spyOn(LayaSystemOne.prototype,'assess').mockResolvedValue(null);
    const completion=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(_p,_m,_c,options)=>{
      expect(options?.signal).toBeDefined();reviewing();
      return await new Promise((_,reject)=>options!.signal!.addEventListener('abort',()=>reject(options!.signal!.reason),{once:true}));
    });
    const server=createMcpServer({store,projectRoot:root,executionAuthority:'project-write'}).server;
    const client=new Client({name:'cancellation-regression',version:'1'});
    const [ct,st]=InMemoryTransport.createLinkedPair();
    await server.connect(st);await client.connect(ct);
    try{
      const controller=new AbortController();
      const pending=client.callTool({name:'resolve_ticket',arguments:{ticketId:'T',agentId:'resolver',verifyOnly:true,critic:'none',maxRepairs:0,testCommands:[['bun','test',oracle.filePath!]]}},undefined,{signal:controller.signal}).catch(error=>error);
      await entered;controller.abort(Error('Cancel independent acceptance'));await pending;
      expect(await Promise.race([settled.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),2000))])).toBe(true);
      expect(await store.getEntity<Ticket>('T',Ticket.dcr)).toMatchObject({lane:'Blocked',claim:null});
      expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
      expect(await store.getActiveClaims()).toEqual([]);
    }finally{await client.close();await server.close();completion.mockRestore();routing.mockRestore();observe.mockRestore();}
  },10000);

  for(const status of ['blocked','needs_input'] as const) it(`public resolver preserves an investigation ${status} returned after preparation`,async()=>{
    const t=await ticket();const dossier=await t.investigate(store,{systemOne});
    if(dossier.status!=='complete')throw Error(JSON.stringify(dossier));
    const prep=spyOn(Ticket.prototype,'prepare').mockResolvedValue({status:'complete',artifactId:'T',value:{dossier:dossier.value,children:[],created:[],reused:[],applied:true,criticRounds:0,rationale:'Controlled preparation boundary'}});
    const investigation=spyOn(Ticket.prototype,'investigate').mockResolvedValue(status==='blocked'?
      {status,artifactId:'T',blockers:[{reason:'Investigation stopped'}]}:
      {status,artifactId:'T',required:[{question:'Inspect missing evidence',why:'Investigation stopped',target:'source evidence'}]});
    try{
      initializeTools();const result=await registry.execute('resolve_ticket',{ticketId:'T',maxRepairs:0},{store,projectRoot:root,executionAuthority:'project-write'});
      expect(result.status).toBe(status);
      expect(await store.getEntity<Ticket>('T',Ticket.dcr)).toMatchObject({lane:'Blocked',claim:null});
      expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
    }finally{investigation.mockRestore();prep.mockRestore();}
  });

  it('public resolver fences source commit after same-agent replacement inside guarded apply',async()=>{
    await ticket();let calls=0,replaced=false;
    const original=CausalChangeEngine.prototype.applyChange;
    const guarded=spyOn(CausalChangeEngine.prototype,'applyChange').mockImplementation(async function(this:CausalChangeEngine,request,fingerprint){
      if(!replaced && request.action==='replace_text' && request.filePath==='src/add.ts') {
        replaced=true;expect((await store.claimTicket('T','resolver',30,false)).success).toBe(true);
      }
      return original.call(this,request,fingerprint);
    });
    const routing=spyOn(LayaSystemOne.prototype,'assess').mockResolvedValue(null);
    const completion=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(prompt,model)=>{
      if(prompt.includes('Independently verify EVERY'))return {model,ok:true,text:JSON.stringify({criteria:[],aspects:[],rules:[]})};
      return {model,ok:true,text:JSON.stringify(calls++===0?
        {thought:'Apply authorized change',action:'tool_call',toolCalls:[{name:'safe_change',parameters:{action:'replace_text',filePath:'src/add.ts',oldText:'a - b',newText:'a + b'}}]}:
        {thought:'Stop for verification',action:'final_answer',finalAnswer:JSON.stringify({changes:[],testCommands:[['bun','test','tests/add.test.ts']]})})};
    });
    try{
      initializeTools();const result=await registry.execute('resolve_ticket',{ticketId:'T',agentId:'resolver',maxRepairs:0},{store,projectRoot:root,executionAuthority:'project-write'});
      expect(result.status).toBe('blocked');expect(replaced).toBe(true);
      expect(fs.readFileSync(path.join(root,'src/add.ts'),'utf8')).toContain('a - b');
      expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.claim?.agentId).toBe('resolver');
      expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
    }finally{completion.mockRestore();routing.mockRestore();guarded.mockRestore();}
  });

  it('distinguishes newly verified unchanged source from reused proof', async () => {
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'correct source');
    const t = await ticket();
    const result = await t.resolve(store, {...fix, implement: async () => ({changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']]})});
    expect(result.status).toBe('complete');
    expect(queryPerformance(root, {operation: 'resolve_ticket', artifactId: 'T'}).rows[0].resolution?.outcome).toBe('verified_no_change');
  });


  it('Story: resolves already implemented narrow work using caller evidence through the public lifecycle', async () => {
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    const t = await ticket();
    const oracle = await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!);
    const commands = [['bun', 'test', oracle.filePath!]];
    const source = fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8');
    const calls: string[] = [];
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      if (prompt.includes('Independently verify EVERY')) {
        calls.push('acceptance');
        expect(prompt).toContain('return a + b');
        expect(prompt).toContain('"passed":true');
        return { model, ok: true, text: JSON.stringify({
          criteria: [{ criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'Current signed addition source and executed contract assertions agree.' }],
          aspects: [], rules: []
        }) };
      }
      expect(prompt).toContain('Caller-supplied verification commands: ' + JSON.stringify(commands));
      calls.push('implementation');
      const decision = calls.length === 1
        ? { thought: 'Inspect the supplied behavioral evidence', action: 'tool_call', toolCalls: [{ name: 'read_workspace_file', parameters: { filePath: oracle.filePath! } }] }
        : { thought: 'Existing implementation satisfies the assertions; request independent verification', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: commands }) };
      if (calls.length === 2) expect(prompt).toContain('signed addition contract');
      return { model, ok: true, text: JSON.stringify(decision) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', testCommands: commands, maxRepairs: 0 });
      expect(result.status).toBe('complete');
      if (result.status !== 'complete') throw Error(JSON.stringify(result));
      expect(calls).toEqual(['implementation', 'implementation', 'acceptance']);
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toBe(source);
      expect((await store.getEntity<Ticket>('T', Ticket.dcr))!).toMatchObject({ lane: 'Done', claim: null });
      const receipt = await store.getEntity<Artifact>('VERIFY-T', Artifact.dcr);
      expect(receipt).not.toBeNull();
      expect(JSON.parse(receipt!.body!).tests).toContainEqual({ command: commands[0], passed: true });
      expect((await currentTestEvidence(store, [oracle.id]))[0].passed).toBe(true);
      expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].resolution?.outcome).toBe('verified_no_change');
    } finally { completion.mockRestore(); }
  }, 30000);

  for (const implemented of [true, false, 'stale-framework'] as const) it(`public verify-only resolves existing work without a producer (implemented=${implemented})`, async () => {
    if (implemented) fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }\n');
    const t = await ticket();
    const oracle = await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!);
    if(implemented==='stale-framework') await store.upsertEntity(TestNode.dcr,{id:oracle.id,framework:'bun:test'});
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'verification baseline');
    const source = fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8');
    await (await import('../src/services/projection-service.ts')).exportProjections(store);
    const staleBoard=fs.readFileSync(path.join(root,'kanban.md'),'utf8');
    const calls: string[] = [];
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      if (!prompt.includes('Independently verify EVERY')) throw Error('verify-only must not invoke an implementation model');
      calls.push('acceptance');
      expect(prompt).toContain('return a + b');
      expect(prompt).toContain('"passed":true');
      return {model, ok: true, text: JSON.stringify({criteria: [{criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'Executed signed addition contract agrees with current source.'}], aspects: [], rules: []})};
    });
    try {
      initializeTools();
      const result = await registry.execute('resolve_ticket', {ticketId: 'T', verifyOnly: true, critic: 'none', testCommands: [['bun', 'test', oracle.filePath!]]}, {store, projectRoot: root, executionAuthority: 'project-write'});
      expect(result.status).toBe(implemented ? 'complete' : 'blocked');
      expect(calls).toEqual(implemented ? ['acceptance'] : []);
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toBe(source);
      expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
      const receipt = await store.getEntity<Artifact>('VERIFY-T', Artifact.dcr);
      expect(!!receipt).toBe(Boolean(implemented));
      if(implemented==='stale-framework') expect((await store.getEntity<TestNode>(oracle.id,TestNode.dcr))!.framework).toBe('bun');
      if(implemented) {
        fs.writeFileSync(path.join(root,'kanban.md'),staleBoard);
        const later=new Date(Date.now()+5000);fs.utimesSync(path.join(root,'kanban.md'),later,later);
        const synced=Bun.spawnSync(['bun',path.resolve('src/cli.ts'),'sync'],{cwd:root,stderr:'pipe'});
        expect(synced.success).toBe(true);
        expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Done');
        expect((await store.getEntity<Artifact>('VERIFY-T',Artifact.dcr))!.body).toBe(receipt!.body);
      }
      store.close(); store = new WorkflowStore(root);
      expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).toBe(implemented ? 'Done' : 'Blocked');
      if (implemented) expect(queryPerformance(root, {operation: 'resolve_ticket'}).rows[0].resolution?.outcome).toBe('verified_no_change');
      else expect(queryPerformance(root, {operation: 'resolve_ticket'}).rows[0].resolution?.outcome).toBe('blocked_verification');
    } finally { completion.mockRestore(); }
  }, 30000);

  const graphOracle = async (target: FileNode | SymbolNode, file = 'tests/contract.spec.ts') => {
    fs.writeFileSync(path.join(root, file), 'import {test,expect} from "bun:test"; const modulePath="../src/add"; const {add}=await import(modulePath); test("signed addition contract",()=>{expect(add(2,3)).toBe(5); expect(add(-2,3)).toBe(1)});');
    await indexCodebase(store, root);
    const test = (await store.getEntity<TestNode>(`test:${file}`, TestNode.dcr))!;
    await store.withTestArtifactWrite(test.id,()=>store.relate(test, 'verifies', target, {state: 'authored', note: 'Explicit behavioral contract'}));
    return test;
  };

  for (const symbolOnly of [false, true]) it(`selects ${symbolOnly ? 'symbol-only' : 'file'} verifies edges before fallback and producer guesses`, async () => {
    const t = await ticket();
    const target = symbolOnly ? (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/add.ts' && s.title === 'add')! : (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!;
    const oracle = await graphOracle(target);
    const original = registry.execute.bind(registry), fallbackFiles: string[] = [];
    const execution = spyOn(registry, 'execute').mockImplementation(async (name, params, ctx) => { if (name === 'resolve_test_target') fallbackFiles.push(params.filePath); return original(name, params, ctx); });
    let sawEvidence = false;
    try {
      const result = await t.resolve(store, {...fix, implement: async () => ({...(await fix.implement!({} as never, [])), testCommands: []}), verify: async input => {
        const evidence = input.testNodes.find(node => node.id === store.localId(oracle.id))!;
        expect(evidence).toMatchObject({passed: true, filePath: 'tests/contract.spec.ts'});
        expect(evidence.verifies).toContain(store.localId(target.id));
        expect(evidence.hashes['src/add.ts']).toBeDefined(); sawEvidence = true;
        return verify(input);
      }});
      expect(result.status).toBe('complete'); expect(sawEvidence).toBe(true); expect(fallbackFiles).not.toContain('src/add.ts');
    } finally { execution.mockRestore(); }
    expect((await store.getEntity<TestNode>(oracle.id, TestNode.dcr))!).toMatchObject({passed: true, status: 'verified', command: ['bun', 'test', 'tests/contract.spec.ts']});
  }, 30000);

  it('uses filename fallback only for an uncovered source and persists its canonical evidence', async () => {
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test"; const modulePath="../src/add"; const {add}=await import(modulePath); test("addition",()=>expect(add(2,3)).toBe(5));');
    await indexCodebase(store, root);
    const t = await ticket(); const original = registry.execute.bind(registry); let fallbacks = 0;
    const execution = spyOn(registry, 'execute').mockImplementation(async (name, params, ctx) => { if (name === 'resolve_test_target') fallbacks++; return original(name, params, ctx); });
    try {
      const result = await t.resolve(store, {...fix, implement: async dossier => ({...(await fix.implement!(dossier, [])), testCommands: []})});
      expect(result.status).toBe('complete'); expect(fallbacks).toBe(1);
      expect((await currentTestEvidence(store, ['test:tests/add.test.ts']))[0]?.passed).toBe(true);
    } finally { execution.mockRestore(); }
  }, 30000);

  it('repairs a failing graph obligation even when the producer supplies a passing decoy', async () => {
    const t = await ticket(); await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!);
    fs.writeFileSync(path.join(root, 'tests/decoy.test.ts'), 'import {test,expect} from "bun:test"; test("unrelated",()=>expect(true).toBe(true));');
    let attempts = 0;
    const result = await t.resolve(store, {...fix, implement: async dossier => {
      const proposal = await fix.implement!(dossier, []); attempts++;
      if (attempts === 1) proposal.changes = [];
      return {...proposal, testCommands: [['bun', 'test', 'tests/decoy.test.ts']]};
    }});
    expect(result.status).toBe('complete'); expect(attempts).toBe(2);
  }, 30000);

  it('hashes full-suite TestNodes, rejects changed spec proof, and reuses unchanged full-suite proof', async () => {
    const t = await ticket(); const oracle = await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!);
    const options = {...fix, testCommands: [['bun', 'test']]};
    expect((await t.resolve(store, options)).status).toBe('complete');
    const proof = JSON.parse(((await store.getEntity<Artifact>('VERIFY-T', Artifact.dcr))! as Artifact & {body: string}).body);
    expect(proof.hashes['tests/contract.spec.ts']).toBeDefined(); expect(proof.testNodes.length).toBe(2);
    expect(proof.testNodes.find((test: {filePath: string}) => test.filePath === 'tests/add.test.ts').output).not.toContain('tests/contract.spec.ts:\n');
    expect((await t.resolve(store, {...options, implement: async () => {throw Error('unchanged proof must be reused')}, verify: async () => {throw Error('unchanged proof must be reused')}})).status).toBe('complete');
    fs.appendFileSync(path.join(root, 'tests/contract.spec.ts'), '\ntest("new oracle",()=>expect(add(1,1)).toBe(99));');
    const result = await t.resolve(store, {...options, maxRepairs: 0}); expect(result.status).toBe('blocked');
    expect((await store.getEntity<TestNode>(oracle.id, TestNode.dcr))!.passed).toBe(false);
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
  }, 30000);

  it('invalidates receipt when source changes and repairs formerly Done work', async () => {
    const t = await ticket(); expect((await t.resolve(store, fix)).status).toBe('complete');
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a:number,b:number){return a-b;}');
    let attempts = 0;
    const result = await t.resolve(store, {...fix, allowDirtyTargets: ['src/add.ts'], implement: async dossier => {attempts++; return fix.implement!(dossier, [])}});
    expect(result.status).toBe('complete'); expect(attempts).toBe(1); if (result.status === 'complete') expect(result.value.repairs).toBe(1);
  }, 30000);

  it('rejects later failing TestNode evidence and invalid persisted receipts without false failure', async () => {
    const t = await ticket(); expect((await t.resolve(store, fix)).status).toBe('complete');
    await recordTestExecution(store, root, ['bun', 'test', 'tests/add.test.ts'], {passed: false, exitCode: 1, output: 'environment regression'});
    let reviews = 0; const options = {...fix, verify: async (input: ResolutionVerificationInput) => {reviews++; return verify(input)}};
    expect((await t.resolve(store, options)).status).toBe('complete'); expect(reviews).toBe(1);
    const receipt = (await store.getEntity<Artifact>('VERIFY-T', Artifact.dcr))!; await (await store.sp.collectionForEntityType(Artifact.dcr)).updateDocument(receipt.id,{body:'{broken JSON'},receipt.version);
    expect((await t.resolve(store, options)).status).toBe('complete'); expect(reviews).toBe(2);
  }, 30000);

  it('preserves authored verifies edges and reproduces derived edges on repeated reconciliation', async () => {
    const test = (await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr))!;
    const file = (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!;
    await store.withTestArtifactWrite(test.id,()=>store.unrelate(test.id, 'verifies', file.id)); await store.withTestArtifactWrite(test.id,()=>store.relate(test, 'verifies', file, {state: 'authored', note: 'Manual contract'}));
    await reconcileTestVerificationEdges(store); await reconcileTestVerificationEdges(store);
    const edges = await store.getOutgoing(test.id, 'verifies');
    expect((edges.find(edge => edge.targetId === file.id) as unknown as {payload: {state: string; note: string}}).payload).toMatchObject({state: 'authored', note: 'Manual contract'});
    const before = edges.map(edge => ({target: edge.targetId, payload: (edge as unknown as {payload: unknown}).payload}));
    await reconcileTestVerificationEdges(store);
    expect((await store.getOutgoing(test.id, 'verifies')).map(edge => ({target: edge.targetId, payload: (edge as unknown as {payload: unknown}).payload}))).toEqual(before);
    const derived = await graphOracle(file, 'tests/derived.test.ts');
    fs.writeFileSync(path.join(root, 'tests/derived.test.ts'), 'import {test,expect} from "bun:test";\nimport {add} from "../src/add";\ntest("addition",()=>expect(add(2,3)).toBe(5));');
    await store.withTestArtifactWrite(derived.id,()=>store.unrelate(derived.id, 'verifies', file.id)); await indexCodebase(store, root);
    await reconcileTestVerificationEdges(store);
    expect((await store.getOutgoing(derived.id, 'verifies')).some(edge => (edge as unknown as {payload?: {state?: string}}).payload?.state === 'derived')).toBe(true);
  });

  it('updates authored TestNodes with custom IDs and does not invent full-suite evidence for filtered/no-test runs', async () => {
    const authored = await store.upsertEntity<TestNode>(TestNode.dcr, {id: 'AUTHORED', filePath: 'tests/add.test.ts', framework: 'bun'});
    await recordTestExecution(store, root, ['bun', 'test', 'tests/add.test.ts'], {passed: false, exitCode: 1, output: 'failed'});
    expect((await store.getEntity<TestNode>(authored.id, TestNode.dcr))!.passed).toBe(false);
    await recordTestExecution(store, root, ['bun', 'test', '--test-name-pattern', 'missing'], {passed: true, exitCode: 0, output: 'No tests found'});
    expect((await store.getEntity<TestNode>(authored.id, TestNode.dcr))!.passed).toBe(false);
  });

  it('backfills unchanged legacy indexed tests before discovery and records every full-suite file', async () => {
    const t = await ticket();
    await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!);
    await store.withTestArtifactWrite('test:tests/add.test.ts',async()=>store.deleteEntity((await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr))!.id));
    await store.withTestArtifactWrite('test:tests/contract.spec.ts',async()=>store.deleteEntity((await store.getEntity<TestNode>('test:tests/contract.spec.ts', TestNode.dcr))!.id));
    const original = registry.execute.bind(registry); let fallbacks = 0;
    const execution = spyOn(registry, 'execute').mockImplementation(async (name, params, ctx) => {if (name === 'resolve_test_target') fallbacks++; return original(name, params, ctx)});
    try {
      const result = await t.resolve(store, {...fix, testCommands: [['bun', 'test']], implement: async dossier => {
        expect(await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr)).not.toBeNull();
        expect(await store.getEntity<TestNode>('test:tests/contract.spec.ts', TestNode.dcr)).not.toBeNull();
        return fix.implement!(dossier, []);
      }, verify: async input => {
        expect(input.testNodes.map(test => test.filePath).sort()).toEqual(['tests/add.test.ts', 'tests/contract.spec.ts']);
        expect(input.testNodes.every(test => test.passed)).toBe(true);
        return verify(input);
      }});
      expect(result.status).toBe('complete'); expect(fallbacks).toBeLessThanOrEqual(1);
      expect(await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr)).not.toBeNull();
    } finally {execution.mockRestore()}
  }, 30000);

  it('rejects acceptance proof if its source changes during independent review', async () => {
    const t = await ticket();
    const result = await t.resolve(store, {...fix, maxRepairs: 0, verify: async input => {fs.appendFileSync(path.join(root, 'src/add.ts'), '// concurrent edit'); return verify(input)}});
    expect(result.status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
  }, 30000);

  it('keeps passing executions distinct from an explicitly unproved criterion', async () => {
    const t = await ticket();
    const result = await t.resolve(store, {...fix, maxRepairs: 0, verify: async input => {
      expect(input.testNodes.every(test => test.passed)).toBe(true);
      return {criteria: [{criterion: input.dossier.ticket.acceptanceCriteria[0], passed: false, evidence: 'The requested invariant requires additional proof.'}], aspects: []};
    }});
    expect(result.status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
  }, 30000);

  it('rejects contradictory acceptance checks instead of picking the passing duplicate', async () => {
    const t = await ticket();
    const result = await t.resolve(store, {...fix, maxRepairs: 0, verify: async input => ({criteria: [
      {criterion: input.dossier.ticket.acceptanceCriteria[0], passed: true, evidence: 'Tests passed'},
      {criterion: input.dossier.ticket.acceptanceCriteria[0], passed: false, evidence: 'Required behavior unproved'}
    ], aspects: []})});
    expect(result.status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
  }, 30000);

  it('rejects evidence when a test mutates its verified source during execution', async () => {
    const t = await ticket();
    fs.appendFileSync(path.join(root, 'tests/add.test.ts'), '\nimport fs from "node:fs"; test("concurrent writer",()=>fs.appendFileSync("src/add.ts","// mutation during tests"));');
    let reviews = 0;
    const result = await t.resolve(store, {...fix, maxRepairs: 0, verify: async input => {reviews++; return verify(input)}});
    expect(result.status).toBe('blocked'); expect(reviews).toBe(0);
    expect((await currentTestEvidence(store, ['test:tests/add.test.ts']))[0]?.passed).toBe(false);
  }, 30000);

  it('reverifies a new authored target even when an earlier receipt already hashed it as an import', async () => {
    fs.writeFileSync(path.join(root, 'src/consumer.ts'), 'export const consumer = "not an addition implementation";');
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test";\nimport "../src/consumer";\nimport {add} from "../src/add";\ntest("signed addition",()=>{expect(add(2,3)).toBe(5);expect(add(-2,3)).toBe(1)});');
    await indexCodebase(store, root);
    const t = await ticket(); await store.upsertEntity(Ticket.dcr, {id: t.id, acceptanceCriteria: ['Every authored code target implements signed addition']});
    let reviews = 0;
    const options = {...fix, maxRepairs: 0, verify: async (input: ResolutionVerificationInput) => {
      reviews++;
      if (input.dossier.evidence.some(item => item.mandatory && item.filePath === 'src/consumer.ts')) return {criteria: [{criterion: input.dossier.ticket.acceptanceCriteria[0], passed: false, evidence: 'The newly authored consumer target has no addition implementation'}], aspects: []};
      return verify(input);
    }};
    expect((await t.resolve(store, options)).status).toBe('complete');
    const proof = JSON.parse(((await store.getEntity('VERIFY-T')) as Artifact & {body: string}).body);
    expect(proof.hashes['src/consumer.ts']).toBeDefined();
    await store.relate(t, 'modifies', (await store.getEntity<FileNode>('src/consumer.ts', FileNode.dcr))!);
    const result = await t.resolve(store, {...options, implement: async () => {throw Error('Reverify scope without editing')}});
    expect(result.status).toBe('blocked'); expect(reviews).toBe(2);
    expect((await store.getEntity<Ticket>(t.id, Ticket.dcr))!.lane).not.toBe('Done');
  }, 30000);

  it('refuses Done when the authored contract changes during independent verification', async () => {
    const t = await ticket();
    const result = await t.resolve(store, {...fix, maxRepairs: 0, verify: async input => {
      await store.upsertEntity(Ticket.dcr, {id: t.id, acceptanceCriteria: ['A newly authored unproved behavior']});
      return verify(input);
    }});
    expect(result.status).toBe('needs_input');
    expect((await store.getEntity<Ticket>(t.id, Ticket.dcr))!.lane).not.toBe('Done');
    expect(await store.getEntity('VERIFY-T')).toBeNull();
  }, 30000);

  it('records the actual verifying TestNode when its path contains spaces', async () => {
    const t = await ticket();
    const oracle = await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!, 'tests/signed values.spec.ts');
    const result = await t.resolve(store, {...fix, maxRepairs: 0});
    expect(result.status).toBe('complete');
    expect((await store.getEntity<TestNode>(oracle.id, TestNode.dcr))!.passed).toBe(true);
  }, 30000);

  it('preserves native authored-symbol migration during an authorized rename and reuses its new proof', async () => {
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a:number,b:number){return a+b;}');
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'correct addition');
    await indexCodebase(store, root);
    const t = await ticket();
    await store.unrelate(t.id, 'modifies', (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!.id);
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/add.ts' && s.title === 'add')!;
    await store.relate(t, 'modifies', symbol);
    const options = {...fix, authorizedFiles: {T: ['tests/add.test.ts']}, maxRepairs: 0, implement: async () => ({changes: [{action: 'rename_symbol' as const, target: {type: 'symbol' as const, filePath: 'src/add.ts', symbolName: 'add'}, newName: 'sum'}], testCommands: [['bun', 'test', 'tests/add.test.ts']]})};
    expect((await t.resolve(store, options)).status).toBe('complete');
    const current = (await store.getOutgoing(t.id, 'modifies'))[0]!;
    expect((await store.getEntity<SymbolNode>(current.targetId, SymbolNode.dcr))!.title).toBe('sum');
    expect((await t.resolve(store, {...options, implement: async () => {throw Error('Unchanged renamed proof must be reused')}, verify: async () => {throw Error('Unchanged renamed proof must be reused')}})).status).toBe('complete');
  }, 30000);

  it('does not mark a skipped file passing merely because another full-suite file passed', async () => {
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a:number,b:number){return a+b;}');
    const t = await ticket();
    const disabled = await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!, 'tests/disabled.spec.ts');
    fs.writeFileSync(path.join(root, 'tests/disabled.spec.ts'), 'import {test,expect} from "bun:test"; test.skip("unproved behavior",()=>expect(1).toBe(99));');
    await indexCodebase(store, root);
    await store.withTestArtifactWrite(disabled.id,()=>store.upsertEntity(TestNode.dcr, {id: disabled.id, passed: false, lastRun: '2000-01-01T00:00:00.000Z'}));
    const process = Bun.spawn(['bun', 'test'], {cwd: root, stdout: 'pipe', stderr: 'pipe'});
    const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    expect(exitCode).toBe(0);
    const execution = await recordTestExecution(store, root, ['bun', 'test'], {passed: true, output: stdout + '\n' + stderr, exitCode});
    expect(execution.testFiles).toContain('tests/add.test.ts'); expect(execution.testFiles).not.toContain('tests/disabled.spec.ts');
    expect((await store.getEntity<TestNode>(disabled.id, TestNode.dcr))!).toMatchObject({passed: false, lastRun: '2000-01-01T00:00:00.000Z'});
    let reviews = 0;
    const result = await t.resolve(store, {...fix, maxRepairs: 0, implement: async () => ({changes: [], testCommands: [['bun', 'test']]}), verify: async input => {reviews++; return verify(input)}});
    expect(result.status).toBe('blocked'); expect(reviews).toBe(0);
  }, 30000);

  it('projects canonical execution evidence into acceptance review without duplicating test files or raw hashes', async () => {
    const t = await ticket(); await graphOracle((await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!);
    let context: {code: Array<{file: string}>; testNodes: Array<Record<string, unknown>>; tests: Array<Record<string, unknown>>} | undefined;
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      context = JSON.parse(prompt.slice(prompt.indexOf('Context: ') + 9));
      console.info('AIWF acceptance prompt bytes:', Buffer.byteLength(prompt));
      return {model, ok: true, text: JSON.stringify({criteria: [{criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'Signed addition assertions and current source prove this requirement'}], aspects: []})};
    });
    try {
      expect((await t.resolve(store, {...fix, verify: undefined})).status).toBe('complete');
      const testFiles = context!.code.map(source => source.file).filter(file => file.startsWith('tests/')).sort();
      expect(testFiles).toEqual(['tests/add.test.ts', 'tests/contract.spec.ts']);
      expect(new Set(context!.code.map(source => source.file)).size).toBe(context!.code.length);
      expect(context!.testNodes.every((test: object) => !('hashes' in test))).toBe(true);
      expect(context!.testNodes.every((test: object) => !('output' in test))).toBe(true);
      expect(context!.tests.every((test: object) => !('output' in test))).toBe(true);
    } finally {completion.mockRestore()}
  }, 30000);

  it('allows and preserves unrelated dirty files but stops before editing a dirty target', async () => {
    const t = await ticket(); fs.writeFileSync(path.join(root, 'notes.txt'), 'user work');
    const result = await t.resolve(store, fix); expect(result.status).toBe('complete'); expect(fs.readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('user work');
    const another = await ticket('U', 'Preserve user-edited addition'); fs.appendFileSync(path.join(root, 'src/add.ts'), '// user work\n');
    const dirty = fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8');
    const blocked = await another.resolve(store, fix); expect(blocked.status).toBe('needs_input'); expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toBe(dirty);
    expect((await store.getEntity<Ticket>('U', Ticket.dcr))!.claim).toBeNull(); expect((await store.getEntity<Ticket>('U', Ticket.dcr))!.lane).toBe('Blocked');
  }, 30000);

  it('invalidates Done when the authored test oracle changes', async () => {
    const t = await ticket(); expect((await t.resolve(store, fix)).status).toBe('complete');
    fs.appendFileSync(path.join(root, 'tests/add.test.ts'), 'test("changed contract",()=>{expect(add(1,1)).toBe(3);});\n');
    const result = await t.resolve(store, { ...fix, maxRepairs: 0, testCommands: [['bun', 'test', 'tests/add.test.ts']], implement: async () => { throw Error('Done proof must be checked again'); } });
    expect(result.status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.lane).not.toBe('Done');
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
  }, 30000);

  it('reverifies a broader authored source scope instead of reusing narrower proof', async () => {
    const t = await ticket(); expect((await t.resolve(store, fix)).status).toBe('complete');
    fs.writeFileSync(path.join(root, 'src/consumer.ts'), 'export const contract = "new scope";');
    const file = await store.upsertEntity(FileNode.dcr, { id: 'src/consumer.ts', filePath: 'src/consumer.ts' }); await store.relate(t, 'modifies', file);
    let verifications = 0;
    const result = await t.resolve(store, { ...fix, implement: async () => { throw Error('Done code should be verified, not changed'); }, verify: async input => { verifications++; return verify(input); } });
    expect(result.status).toBe('complete'); expect(verifications).toBe(1);
    const proof = await store.getEntity('VERIFY-T') as unknown as { body: string }; expect(JSON.parse(proof.body).hashes['src/consumer.ts']).toBeDefined();
  }, 30000);

  it('repairs a real failing test exactly once and never marks failed acceptance Done', async () => {
    const t = await ticket(); let attempts = 0;
    const result = await t.resolve(store, { ...fix, implement: async (_dossier, feedback) => { attempts++; if (attempts > 1) expect(feedback.join('\n')).toContain('Expected: 5'); return { changes: [{ action: 'replace_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, replacement: attempts === 1 ? 'export function add(a: number, b: number) { return a + b + 1; }' : 'export function add(a: number, b: number) { return a + b; }' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] }; } });
    expect(result.status).toBe('complete'); if (result.status === 'complete') expect(result.value.repairs).toBe(1); expect(attempts).toBe(2);
    const u = await ticket('U', 'Verify a new unsupported outcome'); await store.upsertEntity(Ticket.dcr, { id: 'U', acceptanceCriteria: ['Unproved outcome'] });
    const unverified = await u.resolve(store, { ...fix, maxRepairs: 0, allowDirtyTargets: ['src/add.ts'], implement: async () => ({ changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }), verify: async () => ({ criteria: [], aspects: [] }) });
    expect(unverified.status).toBe('blocked'); expect((await store.getEntity<Ticket>('U', Ticket.dcr))!.lane).not.toBe('Done');
    expect(queryPerformance(root, {operation: 'resolve_ticket', artifactId: 'U'}).rows[0].resolution).toEqual({stage: 'acceptance', outcome: 'blocked_acceptance'});
  }, 30000);

  it('resolves bounded ordinary children in dependency order and verifies the parent separately', async () => {
    const p = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'P', title: 'Parent', body: 'Fix arithmetic then verify its consumer.', lane: 'Todo', acceptanceCriteria: ['Arithmetic and consumer both verified'] });
    const a = await ticket('A', 'Fix arithmetic');
    const b = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'B', title: 'Verify consumer', body: 'Check the consumer after arithmetic is fixed.', lane: 'Backlog', acceptanceCriteria: ['Consumer sees correct results'] });
    await store.relate(p, 'contains', a); await store.relate(p, 'contains', b); await store.relate(b, 'depends_on', a);
    const order: string[] = [];
    const result = await p.resolve(store, { ...fix, testCommands: [['bun', 'test', 'tests/add.test.ts']], implement: async dossier => { order.push(dossier.ticket.id); return dossier.ticket.id === 'A' ? await fix.implement!(dossier, []) : { changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }; } });
    expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result)); expect(order).toEqual(['A', 'B']); expect(result.value.resolved).toEqual(['A', 'B', 'P']);
    for (const id of ['A', 'B', 'P']) expect((await store.getEntity<Ticket>(id, Ticket.dcr))!).toMatchObject({ lane: 'Done', claim: null });
  }, 30000);

  it('runs a safe TypeScript rename through the normal fingerprint boundary and targeted assertions', async () => {
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }\n'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'correct arithmetic');
    const t = await ticket();
    const result = await t.resolve(store, { ...fix, authorizedFiles: {T: ['tests/add.test.ts']}, implement: async () => ({ changes: [{ action: 'rename_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, newName: 'sum' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] }), verify: async input => { expect(fs.readFileSync(path.join(root, 'tests/add.test.ts'), 'utf8')).toContain('sum'); return verify(input); } });
    expect(result.status).toBe('complete'); expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('function sum');
  }, 30000);

  it('returns precise missing-input and prerequisite/lease/budget blockers without leaked leases', async () => {
    const t = await ticket();
    const required = await t.resolve(store, { ...fix, implement: async () => ({ changes: [], testCommands: [], required: [{ question: 'Which rounding contract applies?', why: 'No authored rule', target: 'Ticket acceptanceCriteria' }] }) });
    expect(required.status).toBe('needs_input'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
    const other = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'OTHER', title: 'Prerequisite', body: 'Define rounding', acceptanceCriteria: ['Rounding defined'], lane: 'Todo' }); await store.relate(t, 'depends_on', other);
    const dependency = await t.resolve(store, fix); expect(dependency.status).toBe('blocked'); if (dependency.status === 'blocked') expect(dependency.blockers[0].reason).toContain('Unresolved prerequisite');
    expect(queryPerformance(root, {operation: 'resolve_ticket'}).rows.at(-1)?.resolution).toEqual({stage: 'preparation', outcome: 'blocked_preparation'});
    expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim).toBeNull();
    await store.unrelate(t.id, 'depends_on', other.id); await store.claimTicket('T', 'other-agent', 30, false);
    expect((await t.resolve(store, { ...fix, agentId: 'resolver' })).status).toBe('blocked'); expect((await store.getEntity<Ticket>('T', Ticket.dcr))!.claim!.agentId).toBe('other-agent');
  });

  it('creates missing source through Causal Change, refuses overwrite and rejects symlink/path escapes', async () => {
    const engine = new CausalChangeEngine({ store, projectRoot: root });
    const request = { action: 'create_file' as const, filePath: 'src/new.ts', content: 'export function fresh() { return 1; }\n' };
    const preview = await engine.previewChange(request); expect(preview.blocked).toBe(false); expect(fs.existsSync(path.join(root, 'src/new.ts'))).toBe(false);
    expect((await engine.applyChange(request, preview.fingerprint)).verification.passed).toBe(true);
    expect((await engine.previewChange(request)).blocked).toBe(true);
    expect((await engine.previewChange({ ...request, filePath: '../escape.ts' })).blocked).toBe(true);
    fs.symlinkSync(os.tmpdir(), path.join(root, 'outside'));
    expect((await engine.previewChange({ ...request, filePath: 'outside/escape.ts' })).blocked).toBe(true);
  }, 30000);

  it('reviews the complete authored checkout test while retaining broader regression executions', async () => {
    const t = await ticket();
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a: number, b: number) { return a + b; }');
    const storySource = 'import {test,expect} from "bun:test"; import {add} from "../src/add"; test("checkout surcharge and discount",()=>{expect(add(100,20)).toBe(120);expect(add(100,-15)).toBe(85);});';
    fs.writeFileSync(path.join(root, 'tests/checkout.test.ts'), storySource);
    fs.writeFileSync(path.join(root, 'tests/infrastructure.test.ts'), 'import {test,expect} from "bun:test"; test("infrastructure",()=>expect(true).toBe(true));\n//' + 'UNRELATED-INFRASTRUCTURE'.repeat(4000));
    await indexCodebase(store, root);
    const story = (await store.getEntity<TestNode>('test:tests/checkout.test.ts', TestNode.dcr))!;
    const regression = (await store.getEntity<TestNode>('test:tests/infrastructure.test.ts', TestNode.dcr))!;
    await store.withTestArtifactWrite(story.id,()=>store.relate(story, 'verifies', t, {state: 'authored'}));
    const command = ['bun', 'test', 'tests/checkout.test.ts', 'tests/infrastructure.test.ts'];
    const run = Bun.spawnSync(command, {cwd: root});
    expect(run.success).toBe(true);
    await recordTestExecution(store, root, command, {passed: run.success, output: run.stdout.toString() + run.stderr.toString(), exitCode: run.exitCode, durationMs: 0});
    const executed = await currentTestEvidence(store, [story.id, regression.id]);
    expect(executed).toHaveLength(2);
    expect(executed.every(test => test.passed)).toBe(true);
    const investigation = await t.investigate(store, {systemOne, critic: 'none', depth: 0});
    if (investigation.status !== 'complete') throw new Error(JSON.stringify(investigation));
    const context = await buildVerificationContext(store, root, {dossier: investigation.value, files: [], testNodes: executed});
    expect(context.files.find(file => file.file === 'tests/checkout.test.ts')!.snippets[0].source).toBe(storySource);
    expect(JSON.stringify(context)).not.toContain('UNRELATED-INFRASTRUCTURE');
    await expect(buildVerificationContext(store, root, {dossier: investigation.value, files: [], testNodes: executed.filter(test => test.id !== store.localId(story.id))})).rejects.toThrow('Authored acceptance tests lack current execution evidence');
  }, 30000);

  it('keeps exact-symbol verification separate from neighboring file obligations', async () => {
    fs.appendFileSync(path.join(root, 'src/add.ts'), '\nexport function multiply(a: number, b: number) { return a * b; }\n');
    fs.writeFileSync(path.join(root, 'tests/multiply.test.ts'), 'import {test,expect} from "bun:test"; import {multiply} from "../src/add"; test("multiply",()=>expect(multiply(2,3)).toBe(6));');
    await indexCodebase(store, root);
    const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr);
    const add = symbols.find(s => s.filePath === 'src/add.ts' && s.title === 'add')!;
    const multiply = symbols.find(s => s.filePath === 'src/add.ts' && s.title === 'multiply')!;
    const addTest = (await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr))!;
    const multiplyTest = (await store.getEntity<TestNode>('test:tests/multiply.test.ts', TestNode.dcr))!;
    await store.withTestArtifactWrite(addTest.id,()=>store.relate(addTest, 'verifies', add, {state: 'authored'}));
    await store.withTestArtifactWrite(multiplyTest.id,()=>store.relate(multiplyTest, 'verifies', multiply, {state: 'authored'}));
    const exact = await verifyingTestsForTargets(store, [add.id], ['src/add.ts']);
    expect(exact.tests.map(t => t.filePath)).toEqual(['tests/add.test.ts']);
    const wholeFile = await verifyingTestsForTargets(store, [add.id, 'src/add.ts'], ['src/add.ts']);
    expect(wholeFile.tests.map(t => t.filePath).sort()).toEqual(['tests/add.test.ts', 'tests/multiply.test.ts']);
  }, 30000);

  for (const mode of ['optional', 'authorized-with-optional', 'ambiguous'] as const) it(`selects synthesis only for one authorized exact target: ${mode}`, async () => {
    fs.writeFileSync(path.join(root, 'src/multiply.ts'), 'export function multiply(a: number, b: number) { return a * b; }\n');
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'reuse candidate');
    await indexCodebase(store, root);
    const t = await ticket('T', mode === 'optional' ? 'Repair add' : 'Repair add and inspect multiply');
    const symbols = await store.listEntities<SymbolNode>(SymbolNode.dcr);
    const add = symbols.find(s => s.filePath === 'src/add.ts' && s.title === 'add')!;
    const multiply = symbols.find(s => s.filePath === 'src/multiply.ts' && s.title === 'multiply')!;
    if (mode !== 'optional') await store.relate(t, 'modifies', add);
    if (mode === 'ambiguous') await store.relate(t, 'modifies', multiply);
    const dossier = await t.investigate(store, { systemOne });
    expect(dossier.status).toBe('complete');
    if (dossier.status !== 'complete') throw Error(JSON.stringify(dossier));
    expect(dossier.value.evidence.find(e => e.id === store.localId(add.id))).toMatchObject({ exact: true, mandatory: mode !== 'optional' });
    if (mode === 'optional') expect(dossier.value.evidence.find(e => e.id === store.localId(multiply.id))).toBeUndefined();
    else expect(dossier.value.evidence.find(e => e.id === store.localId(multiply.id))).toMatchObject({ exact: true, mandatory: mode === 'ambiguous' });
    const untouched = fs.readFileSync(path.join(root, 'src/multiply.ts'), 'utf8');
    let synthesisCalls = 0, actorCalls = 0;
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const synthesis = prompt.includes('"existingSource":');
      const proposal = { changes: [{ action: 'replace_symbol', target: { type: 'symbol', filePath: 'src/add.ts', symbolName: 'add' }, replacement: 'export function add(a: number, b: number) { return a + b; }' }], testCommands: [['bun', 'test', 'tests/add.test.ts']] };
      let reply: unknown;
      if (synthesis) {
        synthesisCalls++;
        reply = { source: proposal.changes[0].replacement };
      } else if (actorCalls++ === 0) {
        reply = { thought: 'Inspect the actual target before proposing the bounded fix', action: 'tool_call', toolCalls: [{ name: 'get_symbol_source', parameters: { filePath: 'src/add.ts', symbolName: 'add' } }] };
      } else {
        expect(prompt).toContain('return a - b');
        reply = { thought: 'Propose the inspected addition fix', action: 'final_answer', finalAnswer: JSON.stringify(proposal) };
      }
      return { model, ok: true, text: JSON.stringify(reply) };
    });
    try {
      const synthesisHint = { assess: async (_input: unknown, questions: Record<string, unknown>) => 'mechanism' in questions
        ? { quality: 'high' as const, backendId: 'fixture', latencyMs: 0, answers: { mechanism: { choice: 'synthesis' } } }
        : null };
      const result = await t.resolve(store, { systemOne: synthesisHint, critic: 'none', verify, maxRepairs: 0, testCommands: [['bun', 'test', 'tests/add.test.ts']] });
      if (result.status !== 'complete') throw Error(JSON.stringify(result));
      expect(result.status).toBe('complete');
      expect(synthesisCalls).toBe(mode === 'authorized-with-optional' ? 1 : 0);
      expect(actorCalls).toBe(mode === 'authorized-with-optional' ? 0 : 2);
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('return a + b;');
      expect(fs.readFileSync(path.join(root, 'src/multiply.ts'), 'utf8')).toBe(untouched);
      expect((await store.getOutgoing(t.id, 'modifies')).some(e => e.targetId === multiply.id)).toBe(mode === 'ambiguous');
    } finally { completion.mockRestore(); }
  }, 30000);

  it('binds synthesis to the exact authored target and uses an independent verification call', async () => {
    const t = await ticket();
    const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/add.ts' && s.title === 'add')!; await store.relate(t, 'modifies', symbol);
    const prompts: string[] = [];
    const server = Bun.serve({ port: 0, fetch: async request => {
      const body = await request.json() as { messages: Array<{ role: string; content: string }> };
      const prompt = body.messages.map(message => message.content).join('\n'); prompts.push(prompt);
      if (prompts.length === 1) expect(body.messages.find(message => message.role === 'system')?.content).toContain('AIWF Grounded Source Synthesizer');
      const reply = prompt.includes('AIWF Grounded Source Synthesizer') ? { source: 'export function add(a: number, b: number) { return a + b; }' } : { criteria: [{ criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'tests/add.test.ts asserts 5 and 1; command passed' }], aspects: [] };
      return Response.json({ message: { content: JSON.stringify(reply) }, prompt_eval_count: 10, eval_count: 5 });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture', ollamaUrl: server.url.toString() });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', testCommands: [['bun', 'test', 'tests/add.test.ts']] });
      expect(result.status).toBe('complete'); if (result.status !== 'complete') throw Error(JSON.stringify(result));
      expect(prompts).toHaveLength(2); expect(prompts[0]).toContain('"symbolName":"add"'); expect(prompts[1]).toContain('Independently verify EVERY');
      expect(prompts[1]).not.toContain('return a - b'); expect(prompts[1]).toContain('return a + b');
      expect(queryPerformance(root, { operation: 'resolve_ticket' }).rows[0].cognition.llm.calls).toBe(2);
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);
  it('sends current graph proof rather than unrelated files or prior acceptance receipts to the default verifier', async () => {
    const t = await ticket();
    const priorReceipt = await store.sp.createEntity<Artifact>(Artifact.dcr, {id:store.formatId(Artifact.dcr,'VERIFY-T'),_id:store.formatId(Artifact.dcr,'VERIFY-T'), body: 'OLD-ACCEPTANCE-RECEIPT' + 'x'.repeat(90_000), status: 'verified'},true,false);
    await store.sp.createPredicate(priorReceipt,store.sp.ontology.pdcr('verifies'),t);
    const irrelevant = 'IRRELEVANT-CONTEXT-' + 'x'.repeat(12_000);
    fs.writeFileSync(path.join(root, 'src/add.ts'), `export function add(a: number, b: number) { return a + b; }\n\n\n\n\n\n\n\n\n\n\n\n/*${irrelevant}*/\n`);
    fs.appendFileSync(path.join(root, 'tests/add.test.ts'), `\n\n\n\n\n\n\n\n\n\n\n\n/*${irrelevant}*/\n`);
    await indexCodebase(store, root);
    const target = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(symbol => symbol.filePath === 'src/add.ts' && symbol.title === 'add')!;
    await store.unrelate(t.id, 'modifies', (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!.id);
    await store.relate(t, 'modifies', target);
    const test = (await store.getEntity<TestNode>('test:tests/add.test.ts', TestNode.dcr))!;
    await store.withTestArtifactWrite(test.id,()=>store.relate(test, 'verifies', target, {state: 'authored'}));
    // A referenced fixture helper is not part of this Ticket's production scope.
    fs.writeFileSync(path.join(root, 'src/fixture.ts'), `export function fixtureSetup() { return '${'FIXTURE-INFRASTRUCTURE'.repeat(4000)}'; }`);
    await indexCodebase(store, root);
    const fixture = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(symbol => symbol.filePath === 'src/fixture.ts' && symbol.title === 'fixtureSetup')!;
    await store.withTestArtifactWrite(test.id,()=>store.relate(test, 'verifies', fixture, {state: 'inferred'}));
    let prompt = '';
    const server = Bun.serve({ port: 0, fetch: async request => {
      const body = await request.json() as { messages: Array<{ content: string }> }; prompt = body.messages[0].content;
      return Response.json({ message: { content: JSON.stringify({ criteria: [{ criterion: 'Positive and negative inputs add correctly', passed: true, evidence: 'Current add implementation and graph-selected test assertion passed' }], aspects: [] }) } });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture', ollamaUrl: server.url.toString() });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', implement: async () => ({ changes: [], testCommands: [] }), testCommands: [['bun', 'test', 'tests/add.test.ts']] });
      if (result.status !== 'complete') throw Error(JSON.stringify(result));
      expect(result.status).toBe('complete');
      expect(prompt).toContain('"code":');
      expect(prompt).toContain('"outline":');
      expect(prompt).toContain('"snippets":');
      expect(prompt).toContain('export function add(a: number, b: number) { return a + b; }');
      expect(prompt).toContain('test usage/assertion context');
      expect(prompt).not.toContain('IRRELEVANT-CONTEXT-');
      expect(prompt).not.toContain('OLD-ACCEPTANCE-RECEIPT');
      expect(prompt).not.toContain('FIXTURE-INFRASTRUCTURE');
      expect(prompt).not.toContain('"file":"src/fixture.ts"');
      expect(prompt).not.toContain('"testSources":');
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);
  for (const mode of ['zero', 'continue', 'ordinary', 'limit', 'error', 'failed-edit', 'no-op'] as const) it(`bounds real implementation Actor tranches: ${mode}`, async () => {
    const t = await ticket();
    const targetFile = mode === 'ordinary' ? 'package.json' : 'src/add.ts';
    if (mode === 'ordinary') {
      await store.unrelate(t.id, 'modifies', (await store.getEntity<FileNode>('src/add.ts', FileNode.dcr))!.id);
      await store.upsertEntity(Ticket.dcr, {id: t.id, title: 'Repair runnable test script', acceptanceCriteria: ['The test script runs bun test']});
      fs.writeFileSync(path.join(root, targetFile), '{"scripts":{"test":"pending"}}\n');
      fs.writeFileSync(path.join(root, 'tests/package.test.ts'), 'import {test,expect} from "bun:test"; import fs from "node:fs"; test("Consuela runnable test script",()=>expect(JSON.parse(fs.readFileSync("package.json","utf8")).scripts.test).toBe("bun test"));');
      git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'ordinary target');
      await store.relate(t, 'modifies', await store.upsertEntity(FileNode.dcr, { id: targetFile, filePath: targetFile }));
    } else {
      const symbol = (await store.listEntities<SymbolNode>(SymbolNode.dcr)).find(s => s.filePath === 'src/add.ts' && s.title === 'add')!;
      await store.relate(t, 'modifies', symbol);
    }
    const completes = mode === 'continue' || mode === 'ordinary';
    let calls = 0;
    const refreshed: string[] = [];
    const interactive = { assess: async (_input: unknown, spec: Record<string, unknown>) => 'mechanism' in spec
      ? { quality: 'high' as const, backendId: 'fixture', latencyMs: 0, answers: { mechanism: { choice: 'interactive' } } } : null };
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const tranche = Math.floor(calls / 16), step = calls++ % 16;
      if (!step) refreshed.push(prompt);
      if (mode === 'error') return { model, ok: false, text: '', failure: { kind: 'invalid_response', message: 'fixture provider failed', retryable: false, fatal: false } };
      const oldText = mode === 'ordinary' ? (tranche === 0 ? 'pending' : 'bun test --todo') : tranche === 0 ? 'a - b' : tranche === 1 ? 'a + b + 0' : 'a + b + 0 + 0';
      const newText = mode === 'no-op' ? oldText : mode === 'ordinary' ? (tranche === 0 ? 'bun test --todo' : 'bun test') : mode === 'continue' && tranche === 1 ? 'a + b' : oldText.replace('a - b', 'a + b') + ' + 0';
      const request = { action: 'replace_text' as const, filePath: targetFile, oldText: mode === 'failed-edit' ? 'absent' : oldText, newText };
      let decision: unknown;
      if (completes && tranche === 1 && step === 3) decision = { thought: 'Complete', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', mode === 'ordinary' ? 'tests/package.test.ts' : 'tests/add.test.ts']] }) };
      else {
        let name = 'read_workspace_file', parameters: Record<string, unknown> = { filePath: targetFile };
        if (step >= 3 || mode === 'zero') { name = 'find_symbol'; parameters = { name: `distinct_observation_${step}` }; }
        if (mode !== 'zero' && step === 1) { name = 'safe_change'; parameters = request; }
        if (mode !== 'zero' && step === 2) {
          name = 'find_symbol'; parameters = { name: `distinct_observation_${step}` };
        }
        decision = { thought: 'Bounded fixture work', action: 'tool_call', toolCalls: [{ name, parameters }] };
      }
      return { model, ok: true, text: JSON.stringify(decision), usage: {available: true, promptTokens: Math.ceil(prompt.length / 4), completionTokens: 128, totalTokens: Math.ceil(prompt.length / 4) + 128} };
    });
    try {
      const result = await t.resolve(store, { systemOne: interactive, critic: 'none', verify, maxRepairs: 0, maxActorTokens: 500000 });
      expect(result.status).toBe(completes ? 'complete' : 'blocked');
      expect(calls).toBe(completes ? 20 : mode === 'limit' ? 48 : mode === 'error' ? 1 : 16);
      if (mode === 'ordinary') {
        expect(refreshed[1]).toContain('bun test --todo');
        expect(JSON.parse(fs.readFileSync(path.join(root, targetFile), 'utf8')).scripts.test).toBe('bun test');
      } else if (mode === 'continue' || mode === 'limit') {
        expect(refreshed[0]).toContain('return a - b');
        expect(refreshed[1]).toContain('return a + b + 0');
        expect(refreshed[1]).not.toContain('return a - b');
        expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain(mode === 'continue' ? 'return a + b;' : 'return a + b + 0 + 0 + 0;');
      } else expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('return a - b');
      if (result.status === 'blocked') {
        expect(result.blockers[0].reason).toContain(mode === 'error' ? 'error' : 'max_steps_exceeded');
        expect(result.blockers[0].reason).toContain('recent observations:');
        if (mode === 'zero') expect(result.blockers[0].reason).toContain('find_symbol');
      }
    } finally { completion.mockRestore(); }
  }, 30000);

  for(const partial of [false,true]) it(`public resolver bounds repeated no-op mutations and retains partial work: ${partial}`,async()=>{
    await ticket();let calls=0;
    const routing=spyOn(LayaSystemOne.prototype,'assess').mockResolvedValue(null);
    const completion=spyOn(CompletionEngine.prototype,'generate').mockImplementation(async(_prompt,model)=>{
      const first=calls++===0;
      const oldText=partial&&!first?'a + b':'a - b';
      const newText=partial?'a + b':oldText;
      return {model,ok:true,text:JSON.stringify({thought:'Apply change',action:'tool_call',toolCalls:[{name:'safe_change',parameters:{action:'replace_text',filePath:'src/add.ts',oldText,newText}}]})};
    });
    try{
      initializeTools();
      const result=await registry.execute('resolve_ticket',{ticketId:'T',agentId:'executor',maxRepairs:0},
        {store,projectRoot:root,executionAuthority:'project-write'});
      expect(result.status).toBe('blocked');expect(calls).toBe(partial?4:3);
      expect(JSON.stringify(result)).toContain('Stalled navigation');
      expect(fs.readFileSync(path.join(root,'src/add.ts'),'utf8')).toContain(partial?'a + b':'a - b');
      expect(await store.getEntity<Ticket>('T',Ticket.dcr)).toMatchObject({lane:'Blocked',claim:null});
      expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
    }finally{completion.mockRestore();routing.mockRestore();}
  });

  for (const partial of [false, true]) it(`hands an applied edit from stalled navigation to real checks and repair: ${partial}`, async () => {
    const t = await ticket()
    let calls = 0, reviews = 0
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const call = ++calls
      if (call === 1 || call === 5) {
        if (call === 5) {
          expect(partial).toBe(true)
          expect(prompt).toContain('Expected: 5')
          expect(prompt).toContain('Received: 6')
        }
        return {model, ok: true, text: JSON.stringify({thought: 'Apply the grounded arithmetic change', action: 'tool_call',
          toolCalls: [{name: 'safe_change', parameters: {action: 'replace_text', filePath: 'src/add.ts',
            oldText: call === 1 ? 'a - b' : 'a + b + 1', newText: call === 1 && partial ? 'a + b + 1' : 'a + b'}}]})}
      }
      if (call === 6) return {model, ok: true, text: JSON.stringify({thought: 'Hand off the correction', action: 'final_answer',
        finalAnswer: {changes: [], testCommands: []}})}
      return {model, ok: true, text: JSON.stringify({thought: 'Observe the file again', action: 'tool_call',
        toolCalls: [{name: 'read_workspace_file', parameters: {filePath: 'src/add.ts'}}]})}
    })
    try {
      const result = await t.resolve(store, {systemOne, critic: 'none', maxRepairs: 1,
        testCommands: [['bun', 'test', 'tests/add.test.ts']], verify: async input => {
          reviews++
          expect(input.tests.every(test => test.passed)).toBe(true)
          return verify(input)
        }})
      expect(result.status, JSON.stringify(result)).toBe('complete')
      expect(calls).toBe(partial ? 6 : 4)
      expect(reviews).toBe(1)
      expect(await store.getEntity<Ticket>('T', Ticket.dcr)).toMatchObject({lane: 'Done', claim: null})
      expect(await store.getEntity('VERIFY-T')).not.toBeNull()
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('return a + b;')
    } finally { completion.mockRestore() }
  }, 30000)

  for (const failure of ['cancellation', 'failed-mutation', 'unauthorized-mutation', 'malformed-final', 'unattributed-edit'] as const)
  it(`keeps guarded navigation handoff fail-closed after ${failure}`, async () => {
    const t = await ticket()
    const controller = new AbortController()
    let calls = 0, reviews = 0
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (_prompt, model) => {
      const call = ++calls
      if (call === 1) return {model, ok: true, text: JSON.stringify({thought: 'Apply an authorized edit', action: 'tool_call',
        toolCalls: [{name: 'safe_change', parameters: {action: 'replace_text', filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b'}}]})}
      if (call === 2 && (failure === 'failed-mutation' || failure === 'unauthorized-mutation'))
        return {model, ok: true, text: JSON.stringify({thought: 'Attempt another edit', action: 'tool_call',
          toolCalls: [{name: 'safe_change', parameters: {action: 'replace_text',
            filePath: failure === 'unauthorized-mutation' ? 'tests/add.test.ts' : 'src/add.ts',
            oldText: failure === 'unauthorized-mutation' ? 'toBe(5)' : 'missing source anchor',
            newText: 'toBe(999)'}}]})}
      if (call === 2 && failure === 'malformed-final') return {model, ok: true,
        text: JSON.stringify({thought: 'Done', action: 'final_answer', finalAnswer: 'Finished the edit.'})}
      if (call === 2 && failure === 'unattributed-edit')
        fs.appendFileSync(path.join(root, 'src/add.ts'), '// external source modification\n')
      if (call === 4 && failure === 'cancellation') controller.abort(Error('Cancelled while navigation stalls'))
      return {model, ok: true, text: JSON.stringify({thought: 'Read again', action: 'tool_call',
        toolCalls: [{name: 'read_workspace_file', parameters: {filePath: 'src/add.ts'}}]})}
    })
    const oracleBefore = fs.readFileSync(path.join(root, 'tests/add.test.ts'), 'utf8')
    try {
      const result = await t.resolve(store, {systemOne, critic: 'none', maxRepairs: 0, signal: controller.signal,
        testCommands: [['bun', 'test', 'tests/add.test.ts']], verify: async input => {reviews++; return verify(input)}})
      expect(result.status, JSON.stringify(result)).toBe('blocked')
      expect(reviews).toBe(0)
      expect(calls).toBeLessThanOrEqual(6)
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a + b')
      expect(fs.readFileSync(path.join(root, 'tests/add.test.ts'), 'utf8')).toBe(oracleBefore)
      expect(await store.getEntity<Ticket>('T', Ticket.dcr)).toMatchObject({lane: 'Blocked', claim: null})
      expect(await store.getEntity('VERIFY-T')).toBeNull()
      if (failure === 'unattributed-edit') expect(JSON.stringify(result)).toContain('outside guarded effects')
      if (failure === 'cancellation') expect(JSON.stringify(result)).toContain('Cancelled while navigation stalls')
    } finally { completion.mockRestore() }
  }, 30000)

  it('rejects repeated unchanged navigation and permits re-reading after a real edit', async () => {
    const t = await ticket(); let calls = 0;
    const request = { action: 'replace_text' as const, filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b' };
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const step = calls++;
      if (step === 2) expect(prompt).toContain('Stalled navigation: this identical observation');
      if (step === 4) {
        expect(prompt).toContain('return a + b');
        return { model, ok: true, usage: {available: true, promptTokens: Math.ceil(prompt.length / 4), completionTokens: 128, totalTokens: Math.ceil(prompt.length / 4) + 128}, text: JSON.stringify({ thought: 'Done', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }) }) };
      }
      const name = step === 2 ? 'safe_change' : 'read_workspace_file';
      const parameters = step === 2 ? request : { filePath: 'src/add.ts' };
      return { model, ok: true, text: JSON.stringify({ thought: 'Inspect or edit', action: 'tool_call', toolCalls: [{ name, parameters }] }) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('complete'); expect(calls).toBe(5);
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a + b');
    } finally { completion.mockRestore(); }
  }, 30000);

  for (const name of ['get_file_outline', 'read_workspace_file']) {
    it(`stops identical ${name} observations after three steps and executes once`, async () => {
      const t = await ticket(); let calls = 0, executions = 0;
      const original = registry.execute.bind(registry);
      const execution = spyOn(registry, 'execute').mockImplementation(async (tool, params, ctx) => {
        if (tool === name && calls > 0) executions++;
        return original(tool, params, ctx);
      });
      const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
        if (calls === 2) expect(prompt).toContain('Replan using existing evidence');
        calls++;
        return { model, ok: true, text: JSON.stringify({ thought: 'Inspect', action: 'tool_call', toolCalls: [{ name, parameters: { filePath: 'src/add.ts' } }] }) };
      });
      try {
        const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
        expect(result.status).toBe('blocked'); expect(JSON.stringify(result)).toContain('Stalled navigation');
        expect(calls).toBe(3); expect(executions).toBe(1);
        if (result.status !== 'blocked') throw Error(JSON.stringify(result));
        const reason = result.blockers[0].reason;
        expect(reason).toContain('mutation epoch 0; recent observations:');
        const observations = JSON.parse(reason.split('recent observations: ')[1]);
        expect(observations).toHaveLength(3);
        expect(observations[0].calls).toEqual([{ tool: name, parameters: { filePath: 'src/add.ts' } }]);
        expect(observations[0].outcomes).toEqual([{ tool: name, outcome: 'success' }]);
        expect(observations[2].outcomes[0]).toMatchObject({ tool: name, outcome: 'error' });
        expect(observations[2].outcomes[0].error).toContain('Stalled navigation');
        expect(reason).not.toContain('return a - b');
        expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a - b');
      } finally { completion.mockRestore(); execution.mockRestore(); }
    }, 30000);
  }

  it('bounds stalled report arguments and errors and omits arbitrary parameters', async () => {
    const t = await ticket();
    const symbolName = 'missing_' + 'x'.repeat(2000);
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (_prompt, model) => ({
      model, ok: true, text: JSON.stringify({
        thought: 'Inspect', action: 'tool_call',
        toolCalls: [{ name: 'get_symbol_source', parameters: { filePath: 'src/add.ts', symbolName, credential: 'PRIVATE-PARAMETER' } }]
      })
    }));
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('blocked');
      if (result.status !== 'blocked') throw Error(JSON.stringify(result));
      const reason = result.blockers[0].reason;
      const observations = JSON.parse(reason.split('recent observations: ')[1]);
      expect(observations).toHaveLength(3);
      expect(observations[0].calls[0].parameters.symbolName).toBe(symbolName.slice(0, 200));
      expect(observations[0].outcomes[0].error).toHaveLength(500);
      expect(reason.length).toBeLessThan(5000);
      expect(reason).not.toContain('PRIVATE-PARAMETER');
      expect(reason).not.toContain('return a - b');
    } finally { completion.mockRestore(); }
  }, 30000);

  it('allows different observations and rejects reordered canonical parameters', async () => {
    const t = await ticket(); let calls = 0, reads = 0;
    const original = registry.execute.bind(registry);
    const execution = spyOn(registry, 'execute').mockImplementation(async (name, params, ctx) => {
      if (name === 'find_symbol') reads++;
      return original(name, params, ctx);
    });
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      const step = calls++;
      if (step === 3) expect(prompt).toContain('Stalled navigation: this identical observation');
      const parameters = step === 0 ? { name: 'add', filePath: 'src/add.ts' }
        : step === 1 ? { name: 'different', filePath: 'src/add.ts' }
        : { filePath: 'src/add.ts', name: 'add' };
      return { model, ok: true, text: JSON.stringify({ thought: 'Inspect', action: 'tool_call', toolCalls: [{ name: 'find_symbol', parameters }] }) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('blocked'); expect(calls).toBe(4); expect(reads).toBe(2);
    } finally { completion.mockRestore(); execution.mockRestore(); }
  }, 30000);

  it('keeps the three-tranche total across acceptance repair attempts', async () => {
    const t = await ticket(); let calls = 0;
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (_prompt, model) => {
      calls++;
      const oldText = calls === 1 ? 'a - b' : 'a + b' + ' + 0'.repeat(calls - 2);
      return { model, ok: true, text: JSON.stringify({ thought: 'Propose exact edit', action: 'final_answer', finalAnswer: JSON.stringify({
        changes: [{ action: 'replace_text', filePath: 'src/add.ts', oldText, newText: calls === 1 ? 'a + b' : oldText + ' + 0' }],
        testCommands: [['bun', 'test', 'tests/add.test.ts']]
      }) }) };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', maxRepairs: 3, verify: async () => ({ criteria: [], aspects: [] }) });
      expect(result.status).toBe('blocked'); expect(calls).toBe(3);
      if (result.status === 'blocked') expect(result.blockers[0].reason).toContain('tranche limit');
    } finally { completion.mockRestore(); }
  }, 30000);

  it('grounds dependency work before edits and sends the complete Actor catalog through Ollama with explicit context', async () => {
    fs.writeFileSync(path.join(root, 'package.json'), '{"dependencies":{}}');
    fs.writeFileSync(path.join(root, 'tests/package.test.ts'), 'import {test,expect} from "bun:test"; import fs from "node:fs"; test("local context-manager dependency",()=>expect(JSON.parse(fs.readFileSync("package.json","utf8")).dependencies["@dharmax/context-manager"]).toBe("file:../context-manager"));');
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'dependency fixture');
    await indexCodebase(store, root);
    const t = await store.upsertEntity<Ticket>(Ticket.dcr, { id: 'DEPENDENCY', title: 'Add context-manager dependency', body: 'The package is not installed yet. Add the existing local sibling as a dependency in package.json.', lane: 'Todo', acceptanceCriteria: ['The package references the local context-manager sibling'] });
    await store.relate(t, 'modifies', (await store.getEntity<FileNode>('package.json', FileNode.dcr))!);
    let calls = 0;
    const request = { action: 'replace_text' as const, filePath: 'package.json', oldText: '"dependencies":{}', newText: '"dependencies":{"@dharmax/context-manager":"file:../context-manager"}' };
    const server = Bun.serve({ port: 0, fetch: async incoming => {
      const body = await incoming.json() as { options: { num_ctx?: number }; messages: Array<{ role: string; content: string }> };
      calls++;
      expect(body.options.num_ctx).toBe(32768);
      const system = body.messages.find(message => message.role === 'system')!.content;
      const goal = body.messages.find(message => message.role === 'user')!.content;
      expect(system).toContain('safe_change'); expect(system).not.toContain('preview_change'); expect(system).not.toContain('apply_change'); expect(system).not.toContain('product_change'); expect(system).not.toContain('ProductMutation');
      expect(system).toContain('"$defs"'); expect(system.length).toBeLessThan(30000);
      expect(goal).toContain(root); expect(goal).toContain('"package.json"'); expect(goal).toContain('a package that needs adding will not yet have indexed symbols');
      if (calls === 2) { expect(goal).toContain('RECOVERY / REPLANNING TURN'); expect(goal).toContain('contents are not indexed symbols: use read_workspace_file'); }
      if (calls === 4) { expect(goal).toContain('RECOVERY / REPLANNING TURN'); expect(goal).toContain('Change preview blocked'); expect(goal).toContain('replace an existing anchor'); }
      let decision: unknown;
      if (calls === 6) {
        const observations = [...goal.matchAll(/- read_workspace_file\(.*\) -> Result: (.*)/g)];
        expect(JSON.parse(observations.at(-1)![1]!).content).toContain('"@dharmax/context-manager":"file:../context-manager"');
        decision = { thought: 'Completed dependency edit', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', 'tests/package.test.ts']] }) };
      }
      else if (calls === 5) {
        const observation = JSON.parse([...goal.matchAll(/- safe_change\(.*\) -> Result: (.*)/g)].at(-1)![1]!);
        expect(observation.ok).toBe(true); expect(observation.verification.passed).toBe(true);
        expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toContain('file:../context-manager');
        decision = { thought: 'Verify current disk after safe change', action: 'tool_call', toolCalls: [{ name: 'read_workspace_file', parameters: { filePath: 'package.json' } }] };
      }
      else if (calls === 3) decision = { thought: 'Incorrect insertion anchor', action: 'tool_call', toolCalls: [{ name: 'safe_change', parameters: { ...request, oldText: '"@dharmax/context-manager":"file:../context-manager"' } }] };
      else decision = { thought: 'Use the existing relative target', action: 'tool_call', toolCalls: [{
        name: calls === 1 ? 'find_symbol' : calls === 2 ? 'read_workspace_file' : 'safe_change',
        parameters: calls === 1 ? { name: '@dharmax/context-manager', filePath: 'package.json' } : calls === 2 ? { filePath: 'package.json' } : request
      }] };
      return Response.json({ message: { content: JSON.stringify(decision) } });
    } });
    const previous = process.env.OLLAMA_HOST; process.env.OLLAMA_HOST = server.url.toString(); saveConfig(root, { model: 'ollama/fixture', ollamaUrl: server.url.toString() });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('complete'); expect(calls).toBe(6);
      expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['@dharmax/context-manager']).toBe('file:../context-manager');
    } finally { server.stop(true); if (previous === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = previous; }
  }, 30000);

  it('refreshes derived discovery state before read-only Actor navigation after an edit', async () => {
    fs.writeFileSync(path.join(root, 'src/helper.ts'), 'export function oldHelper() { return 1; }\n')
    await indexCodebase(store, root)
    const t = await ticket()
    let calls = 0
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      calls++
      if (calls === 2) {
        // Simulate an external edit arriving while inference is in flight.
        fs.writeFileSync(path.join(root, 'src/helper.ts'), 'export function discoveredHelper() { return 42; }\n')
        return {model, ok: true, text: JSON.stringify({thought: 'Discover the new declaration', action: 'tool_call',
          toolCalls: [{name: 'find_symbol', parameters: {name: 'discoveredHelper'}}]})}
      }
      if (calls === 3) {
        expect(prompt).not.toContain('read-only execution cannot write')
        expect(prompt).toContain('"name":"discoveredHelper","fullName":"discoveredHelper"')
        return {model, ok: true, text: JSON.stringify({thought: 'Hand off for checks', action: 'final_answer',
          finalAnswer: {changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']]}})}
      }
      return {model, ok: true, text: JSON.stringify({thought: 'Correct the arithmetic', action: 'tool_call',
        toolCalls: [{name: 'safe_change', parameters: {action: 'replace_text', filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b'}}]})}
    })
    try {
      const result = await t.resolve(store, {systemOne, critic: 'none', verify, maxRepairs: 0})
      expect(result.status, JSON.stringify(result)).toBe('complete')
      expect(calls).toBe(3)
    } finally { completion.mockRestore() }
  }, 30000)

  it('uses one guarded safe change after parameter repair and parses a structured final proposal', async () => {
    const t = await ticket()
    let calls = 0
    const request = {action: 'replace_text' as const, filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b'}
    const applies = spyOn(CausalChangeEngine.prototype, 'applyChange')
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model, _provider, options) => {
      calls++
      if (calls === 1) {
        expect(options?.system).toContain('safe_change')
        expect(options?.system).not.toContain('preview_change')
        expect(options?.system).not.toContain('apply_change')
      }
      if (calls === 2) {
        expect(prompt).toContain('RECOVERY / REPLANNING TURN')
        expect(applies).toHaveBeenCalledTimes(0)
      }
      const decision = calls === 3
        ? {thought: 'Done', action: 'final_answer', finalAnswer: JSON.stringify({changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']]})}
        : {thought: 'Apply grounded change', action: 'tool_call', toolCalls: [{name: 'safe_change', parameters: calls === 1 ? {request, fingerprint: 'invented'} : request}]}
      return {model, ok: true, text: JSON.stringify(decision)}
    })
    try {
      const result = await t.resolve(store, {systemOne, critic: 'none', verify, maxRepairs: 0})
      expect(result.status).toBe('complete')
      expect(calls).toBe(3)
      expect(applies).toHaveBeenCalledTimes(1)
      expect(applies.mock.calls[0]?.[0]).toEqual(request)
      expect(applies.mock.calls[0]?.[1]).toMatch(/^[a-f0-9]{64}$/)
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a + b')
      expect(await store.getEntity<Ticket>('T', Ticket.dcr)).toMatchObject({lane: 'Done', claim: null})
    } finally {
      completion.mockRestore()
      applies.mockRestore()
    }
  }, 30000)

  it('keeps an actual Actor edit unaccepted when final prose supplies no structured proposal', async () => {
    const t = await ticket()
    let calls = 0
    let acceptanceCalls = 0
    const request = {action: 'replace_text' as const, filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b'}
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (_prompt, model) => {
      calls++
      const decision = calls === 1
        ? {thought: 'Apply grounded change', action: 'tool_call', toolCalls: [{name: 'safe_change', parameters: request}]}
        : {thought: 'Done', action: 'final_answer', finalAnswer: 'The implementation is complete.'}
      return {model, ok: true, text: JSON.stringify(decision)}
    })
    try {
      const result = await t.resolve(store, {systemOne, critic: 'none', maxRepairs: 0, verify: async input => {
        acceptanceCalls++
        return verify(input)
      }})
      expect(result.status).toBe('blocked')
      expect(calls).toBe(2)
      expect(acceptanceCalls).toBe(0)
      expect(fs.readFileSync(path.join(root, 'src/add.ts'), 'utf8')).toContain('a + b')
      expect(await store.getEntity('VERIFY-T')).toBeNull()
      const current = await store.getEntity<Ticket>('T', Ticket.dcr)
      expect(current?.lane).not.toBe('Done')
      expect(current?.claim).toBeNull()
    } finally {
      completion.mockRestore()
    }
  }, 30000)

  it('treats a missing symbol slice as a recovery observation instead of successful source', async () => {
    const t = await ticket(); let calls = 0;
    const request = { action: 'replace_text' as const, filePath: 'src/add.ts', oldText: 'a - b', newText: 'a + b' };
    const completion = spyOn(CompletionEngine.prototype, 'generate').mockImplementation(async (prompt, model) => {
      calls++;
      if (calls === 2) {
        expect(prompt).toContain('RECOVERY / REPLANNING TURN');
        expect(prompt).toContain("Symbol 'InventedTarget' was not found in 'src/add.ts'");
        expect(prompt).toContain('Use get_file_outline for actual declaration names');
      }
      const name = calls === 1 ? 'get_symbol_source' : calls === 2 ? 'get_file_outline' : 'safe_change';
      const parameters = calls === 1 ? { filePath: 'src/add.ts', symbolName: 'InventedTarget' } : calls === 2 ? { filePath: 'src/add.ts' } : request;
      const decision = calls === 4 ? { thought: 'Verified tool edit', action: 'final_answer', finalAnswer: JSON.stringify({ changes: [], testCommands: [['bun', 'test', 'tests/add.test.ts']] }) } : { thought: 'Use grounded observations', action: 'tool_call', toolCalls: [{ name, parameters }] };
      return { model, ok: true, text: JSON.stringify(decision), usage: {available: true, promptTokens: Math.ceil(prompt.length / 4), completionTokens: 128, totalTokens: Math.ceil(prompt.length / 4) + 128} };
    });
    try {
      const result = await t.resolve(store, { systemOne, critic: 'none', verify, maxRepairs: 0 });
      expect(result.status).toBe('complete'); expect(calls).toBe(4);
    } finally { completion.mockRestore(); }
  }, 30000);

});
