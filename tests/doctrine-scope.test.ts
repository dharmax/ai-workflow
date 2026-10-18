import {createAspect} from './product-review.ts';
import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {createHash} from 'node:crypto';
import {WorkflowStore} from '../src/graph/store.ts';
import {Ticket, FileNode, ModuleNode, Artifact, Aspect, Decision} from '../src/graph/ontology.ts';
import {RuleStore} from '../src/rules/store.ts';
import {indexCodebase} from '../src/graph/indexer.ts';
import {closeAllTsLspClients} from '../src/change/ts-lsp.ts';
import {currentTestEvidence} from '../src/graph/test-artifacts.ts';
import {readVerificationReceipt, type ResolutionOptions, type ResolutionVerificationInput} from '../src/ticket-operation-types.ts';
import {artifactCommand} from '../src/artifact-command.ts';
import {initializeTools} from '../src/tools/index.ts';
import {registry} from '../src/tools/registry.ts';
import {loadConfig, saveConfig} from '../src/config.ts';

const assessment = (input: ResolutionVerificationInput) => ({
  criteria: input.dossier.ticket.acceptanceCriteria.map(criterion => ({criterion, passed: true, evidence: 'Actual assertion execution is independently recorded.'})),
  aspects: input.dossier.aspects.aspects.map(aspect => ({id: aspect.id, passed: true, evidence: 'Current module source inspected in the controller fixture.'})),
  rules: input.dossier.governance!.rules.filter(rule => rule.importance >= 5).map(rule => ({ruleId: rule.ruleId, revision: rule.revision,
    fingerprint: rule.fingerprint, verdict: 'pass' as const, evidence: 'Controller fixture assessment; configured live verification is a separate journey.',
    evidenceIds: ['src/other.ts'], limitations: []})),
});
const sha = (source: string) => createHash('sha256').update(source).digest('hex');

describe('Gate 5 Actor Stories through public Ticket and governance operations', () => {
  let root: string, store: WorkflowStore, rules: RuleStore, ticket: Ticket;
  const moduleRule = {id: 'other-one', ruleId: 'other-one', scope: {kind: 'module' as const, moduleId: 'OTHER'}, type: 'coding' as const,
    importance: 10, rule: 'other() must return exactly one; returning two is a mandatory violation, even if addition tests pass.',
    status: 'active' as const, revision: 1, provenance: 'fixture', examples: [], references: [], test: {kind: 'llm' as const}};
  const options = (): ResolutionOptions => ({systemOne: {assess: async () => null}, critic: 'none', maxRepairs: 0,
    testCommands: [['bun', 'test', 'tests/add.test.ts']], implement: async () => ({changes: [], testCommands: []}), verify: async input => assessment(input)});
  const propose = async () => ({changes: [{action: 'replace_text' as const, filePath: 'src/other.ts', oldText: 'return 1', newText: 'return 2'}], testCommands: []});
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-g5-story-'));
    fs.mkdirSync(path.join(root, 'src')); fs.mkdirSync(path.join(root, 'tests'));
    fs.symlinkSync(path.resolve(import.meta.dir, '../node_modules'), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n.ai-workflow\n*.md\n');
    fs.writeFileSync(path.join(root, 'src/add.ts'), 'export function add(a:number,b:number){return a+b;}\n');
    fs.writeFileSync(path.join(root, 'src/other.ts'), 'export function other(){return 1;}\n');
    fs.writeFileSync(path.join(root, 'tests/add.test.ts'), 'import {test,expect} from "bun:test";import {add} from "../src/add";test("sum",()=>expect(add(2,3)).toBe(5));\n');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({compilerOptions:{target:'ESNext', module:'ESNext', moduleResolution:'bundler',types:['bun'],skipLibCheck:true}}));
    for (const args of [['init','-q'],['add','.'],['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture']]) {
      const result = Bun.spawnSync(['git',...args],{cwd:root,stderr:'pipe'}); if(!result.success)throw Error(result.stderr.toString());
    }
    store = new WorkflowStore(root); await indexCodebase(store, root); rules = new RuleStore(store);
    const owner = await store.upsertEntity<ModuleNode>(ModuleNode.dcr,{id:'OTHER',title:'Other module'});
    await store.relate(owner,'contains',(await store.getEntity('src/other.ts',FileNode.dcr))!);
    await rules.saveRule(moduleRule);
    ticket = await store.upsertEntity<Ticket>(Ticket.dcr,{id:'T',title:'Keep addition direct',body:'Preserve signed addition.',lane:'Todo',acceptanceCriteria:['sum is correct']});
    await store.relate(ticket,'modifies',(await store.getEntity('src/add.ts',FileNode.dcr))!);
  });
  afterEach(async () => {await closeAllTsLspClients();store.close();fs.rmSync(root,{recursive:true,force:true});});

  test('unlinked module expansion is refused before mutation or acceptance (PD-01)', async () => {
    let reviews=0;
    const result=await ticket.resolve(store,{...options(),implement:propose,verify:async input=>{reviews++;return assessment(input);}});
    expect(result.status).toBe('needs_input');expect(JSON.stringify(result)).toContain('Scope expansion requires input');
    expect(reviews).toBe(0);expect(fs.readFileSync(path.join(root,'src/other.ts'),'utf8')).toContain('return 1');
    expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
  });

  test('authorized expansion supplies module Rule, Decision and Aspect to producer and verifier; violation prevents Done', async () => {
    const owner=(await store.getEntity('OTHER',ModuleNode.dcr))!;
    // Seed a pre-existing accepted Decision; generic authoring cannot mint acceptance.
    const decisions=await store.sp.collectionForEntityType(Decision.dcr);
    store.sqliteStore.applyBatch([{collectionName:decisions.name,id:store.formatId(Decision.dcr,'D'),expectedVersion:null,
      record:{title:'Preserve other',decision:'Return one',context:'The existing consumer requires it',consequences:'Two breaks the contract',status:'accepted'}}]);
    const decision=(await store.getEntity('D',Decision.dcr))!;
    await store.relate(decision,'governs',owner);
    const aspect=await createAspect(store,{id:'A',title:'Other contract',status:'accepted',acceptanceCriteria:['other returns one']});
    await store.relate(aspect,'applies_to',owner);
    let producers=0,reviews=0;
    const result=await ticket.resolve(store,{...options(),authorizedFiles:{T:['src/other.ts']},implement:async dossier=>{
      producers++;expect(dossier.governance!.rules.some(rule=>rule.ruleId==='other-one')).toBe(true);
      expect(dossier.governance!.decisions[0].consequences).toBe('Two breaks the contract');
      expect(dossier.aspects.aspects.some(aspect=>aspect.id==='A')).toBe(true);return propose();
    },verify:async input=>{
      reviews++;expect(input.files).toContain('src/other.ts');expect(input.dossier.scope!.effects).toHaveLength(1);
      const accepted=assessment(input);return {...accepted,rules:accepted.rules.map(rule=>({...rule,verdict:'fail' as const,evidence:'The guarded current source returns two.'}))};
    }});
    expect(result.status).toBe('blocked');expect(JSON.stringify(result)).toContain("Mandatory Rule 'other-one': fail");
    expect(producers).toBe(1);expect(reviews).toBe(1);expect((await currentTestEvidence(store,['test:tests/add.test.ts']))[0].passed).toBe(true);
    expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
  });

  test('explicit dirty authorization preserves user bytes and attributes only guarded effects; unexpected edit is refused', async () => {
    const user='// user-owned work must survive exactly\r\n';
    const before=user+fs.readFileSync(path.join(root,'src/other.ts'),'utf8');fs.writeFileSync(path.join(root,'src/other.ts'),before);
    const authorized={...options(),authorizedFiles:{T:['src/other.ts']},allowDirtyTargets:['src/other.ts']};
    const result=await ticket.resolve(store,{...authorized,implement:propose});expect(result.status).toBe('complete');
    const after=fs.readFileSync(path.join(root,'src/other.ts'),'utf8');expect(after).toBe(before.replace('return 1','return 2'));
    const proof=readVerificationReceipt((await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!.body)!;
    expect(proof.scope.effects).toHaveLength(1);expect(proof.scope.effects[0].before['src/other.ts']).toBe(sha(before));
    expect(proof.scope.effects[0].after['src/other.ts']).toBe(sha(after));
    await store.upsertEntity(Ticket.dcr,{id:'T',lane:'Todo',acceptanceCriteria:['sum is still correct']});
    const concurrent=await ticket.resolve(store,{...authorized,implement:async()=>{
      fs.appendFileSync(path.join(root,'src/other.ts'),'// unexpected concurrent owner\n');
      return {changes:[{action:'replace_text',filePath:'src/other.ts',oldText:'return 2',newText:'return 1'}],testCommands:[]};
    }});
    expect(concurrent.status).toBe('blocked');expect(JSON.stringify(concurrent)).toContain('Unexpected concurrent source modification');
    expect(fs.readFileSync(path.join(root,'src/other.ts'),'utf8')).toBe(after+'// unexpected concurrent owner\n');
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
  });

  test('active governed work excludes Rule text, entity update/erase and applicability mutations', async () => {
    const token=await store.admitGovernance('governed');
    try {
      const second=await store.admitGovernance('governed');await store.releaseGovernance(second);
      await expect(rules.saveRule({...moduleRule,rule:'Return two'})).rejects.toThrow('Governance admission conflict');
      const entity=(await store.getEntity(RuleStore.entityIdForScope(moduleRule.ruleId,moduleRule.scope),'Rule'))!;
      await expect(entity.update({importance:1},true,false)).rejects.toThrow('Governance admission conflict');
      await expect(entity.erase()).rejects.toThrow('Governance admission conflict');
      const file=(await store.getEntity('src/other.ts',FileNode.dcr))!;
      await expect(file.update({language:'python'},true,false)).rejects.toThrow('Governance admission conflict');
      await expect(file.erase()).rejects.toThrow('Governance admission conflict');
      await expect(store.deleteEntity(file.id)).rejects.toThrow('Governance admission conflict');
      const symbols=await store.getOutgoing(file.id,'contains');
      await expect(store.unrelate(file.id,'contains',symbols[0].targetId)).rejects.toThrow('Governance admission conflict');
      const module=(await store.getEntity('OTHER',ModuleNode.dcr))!;
      await expect(store.unrelate(module.id,'contains',(await store.getEntity('src/other.ts',FileNode.dcr))!.id)).rejects.toThrow('Governance admission conflict');
      await expect(store.relate(module,'contains',(await store.getEntity('src/add.ts',FileNode.dcr))!)).rejects.toThrow('Governance admission conflict');
      expect((await rules.getRule(moduleRule.ruleId,moduleRule.scope))!.importance).toBe(10);
    } finally {await store.releaseGovernance(token);}
    const operator=await store.admitGovernance('governance');
    await expect(store.admitGovernance('governed')).rejects.toThrow('Governance admission conflict');await store.releaseGovernance(operator);
  });

  test('index-derived authority ends with its callback, including detached asynchronous descendants', async () => {
    const token=await store.admitGovernance('governed');
    let resume!:()=>void, descendant!:Promise<ModuleNode>;
    const deferred=new Promise<void>(resolve=>{resume=resolve;});
    try {
      await store.withGovernedIndexing(token,['src/late/new.ts'],async()=>{
        descendant=(async()=>{await deferred;return store.upsertEntity<ModuleNode>(ModuleNode.dcr,{id:'mod:src/late',title:'src/late',path:'src/late',status:'implemented'});})();
      });
      resume();
      await expect(descendant).rejects.toThrow('Governance admission conflict');
      expect(await store.getEntity('mod:src/late',ModuleNode.dcr)).toBeNull();
      await expect(store.withGovernedIndexing(token,['src/add.ts'],async()=>{
        throw Error('index callback failure');
      })).rejects.toThrow('index callback failure');
      await expect(store.upsertEntity(ModuleNode.dcr,{id:'mod:src/late',title:'late'})).rejects.toThrow('Governance admission conflict');
    } finally {resume();await store.releaseGovernance(token);}
  });

  test('fresh processes race admission; abandonment expires and stale owners cannot commit after restart', async () => {
    const module=path.resolve(import.meta.dir,'../src/graph/store.ts');
    const code=`import {WorkflowStore} from ${JSON.stringify(module)};const s=new WorkflowStore(process.argv[1]);try{console.log(JSON.stringify({token:await s.admitGovernance(process.argv[2],0.01)}))}catch(e){console.log(JSON.stringify({error:String(e)}))}finally{s.close()}`;
    for(let attempt=0;attempt<4;attempt++) {
      const processes=['governed','governance'].map(mode=>Bun.spawn(['bun','-e',code,root,mode],{stdout:'pipe',stderr:'pipe'}));
      const outputs=await Promise.all(processes.map(async process=>{const body=await new Response(process.stdout).text();expect(await process.exited).toBe(0);return JSON.parse(body) as {token?:string;error?:string};}));
      expect(outputs.filter(result=>result.token)).toHaveLength(1);expect(outputs.find(result=>result.error)!.error).toContain('Governance admission conflict');
      await store.releaseGovernance(outputs.find(result=>result.token)!.token!);
    }
    const abandoned=await store.admitGovernance('governed',0.001);store.close();await Bun.sleep(90);store=new WorkflowStore(root);
    const recovered=await store.admitGovernance('governance');
    await expect(store.governanceAssertion(abandoned)).rejects.toThrow('expired or was recovered');
    await expect(store.renewGovernance(abandoned)).rejects.toThrow('expired or was recovered');
    for(const duration of [0,-1,NaN,Infinity]) await expect(store.renewGovernance(recovered,duration)).rejects.toThrow('positive lease duration');
    await store.releaseGovernance(abandoned);await store.governanceAssertion(recovered);
    await store.releaseGovernance(recovered);await store.releaseGovernance(recovered);
    const work=await store.admitGovernance('governed');await store.releaseGovernance(work);
  },30000);

  test('injected SQL failure rolls back proof, relationship and Done together, and restart preserves that result', async () => {
    store.db.exec("CREATE TRIGGER reject_done BEFORE UPDATE ON aiwf_Ticket WHEN json_extract(NEW.data,'$.lane') = 'Done' AND json_extract(OLD.data,'$.lane') != 'Done' BEGIN SELECT RAISE(ABORT,'injected completion failure'); END");
    const result=await ticket.resolve(store,options());expect(result.status).toBe('blocked');expect(JSON.stringify(result)).toContain('injected completion failure');
    store.close();store=new WorkflowStore(root);rules=new RuleStore(store);
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
    expect((await store.getIncoming(ticket.id,'verifies')).filter(edge=>edge.sourceId.includes('VERIFY-T'))).toHaveLength(0);
    expect((await store.getEntity<Ticket & {metadata:{governedScope?:unknown}}>('T',Ticket.dcr))!.metadata.governedScope).toBeDefined();
    store.db.exec('DROP TRIGGER reject_done');expect((await ticket.resolve(store,options())).status).toBe('complete');
    const old=(await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!;
    expect((await store.getEntity<Ticket & {metadata:{governedScope?:unknown}}>('T',Ticket.dcr))!.metadata.governedScope).toBeUndefined();
    await rules.saveRule({...moduleRule,revision:2}); // unrelated to the authored/actual addition scope
    let review=0;expect((await ticket.resolve(store,{...options(),verify:async input=>{review++;return assessment(input);}})).status).toBe('complete');expect(review).toBe(0);
    await store.upsertEntity(Ticket.dcr,{id:'T',acceptanceCriteria:['current sum is correct']});
    store.db.exec("CREATE TRIGGER reject_done BEFORE UPDATE ON aiwf_Ticket WHEN json_extract(NEW.data,'$.lane') = 'Done' AND json_extract(OLD.data,'$.lane') != 'Done' BEGIN SELECT RAISE(ABORT,'replacement failure'); END");
    const replacement=await ticket.resolve(store,options());expect(replacement.status).toBe('blocked');
    expect((await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!.body).toBe(old.body);
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
  });

  test('shared command adapter and MCP registry preserve per-Ticket expansion authorization', async () => {
    initializeTools();const command=(await artifactCommand(['resolve','T','--authorize-file','T=src/other.ts','--authorize-file','CHILD=src/new.ts']))!;
    expect(command.args.authorizedFiles).toEqual({T:['src/other.ts'],CHILD:['src/new.ts']});
    expect(registry.get('resolve_ticket')!.parameters.parse(command.args)).toMatchObject({authorizedFiles:{T:['src/other.ts'],CHILD:['src/new.ts']}});
    await expect(artifactCommand(['prepare','T','--authorize-file','T=src/other.ts'])).rejects.toThrow('unknown option');
  });

  test('new files receive their index-derived module obligations before creation and real assertions verify them', async () => {
    const owner=await store.upsertEntity<ModuleNode>(ModuleNode.dcr,{id:'mod:src/owned',title:'Owned new code',path:'src/owned'});
    await rules.saveRule({...moduleRule,ruleId:'new-nine',id:'new-nine',scope:{kind:'module',moduleId:store.localId(owner.id)},rule:'newValue() must return nine.'});
    fs.writeFileSync(path.join(root,'tests/new.test.ts'),'import {test,expect} from "bun:test";import {newValue} from "../src/owned/new";test("new value",()=>expect(newValue()).toBe(9));\n');
    await indexCodebase(store,root);
    let produced=false,reviewed=false;
    const result=await ticket.resolve(store,{...options(),authorizedFiles:{T:['src/owned/new.ts']},
      testCommands:[['bun','test','tests/add.test.ts','tests/new.test.ts']],implement:async dossier=>{
        produced=true;expect(dossier.governance!.rules.some(rule=>rule.ruleId==='new-nine')).toBe(true);
        return {changes:[{action:'create_file',filePath:'src/owned/new.ts',content:'export function newValue(){return 9;}\n'}],testCommands:[]};
      },verify:async input=>{reviewed=true;expect(input.dossier.governance!.targets.find(target=>target.filePath==='src/owned/new.ts')!.moduleIds).toContain('mod:src/owned');
        const accepted=assessment(input);return {...accepted,rules:accepted.rules.map(rule=>({...rule,evidenceIds:['src/owned/new.ts']}))};}});
    if(result.status!=='complete')throw Error(JSON.stringify(result));
    expect(produced&&reviewed).toBe(true);
    const proof=readVerificationReceipt((await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!.body)!;
    expect(proof.scope.effects[0].before['src/owned/new.ts']).toBe('missing');expect(proof.scope.effects[0].edits[0].edits[0].newText).toContain('return 9');
    expect((await currentTestEvidence(store,['test:tests/new.test.ts']))[0].passed).toBe(true);
  });

  test('file rename discovers both endpoints and secondary LSP edits; persisted evidence identifies the attributable rename', async () => {
    fs.writeFileSync(path.join(root,'tests/other.test.ts'),'import {test,expect} from "bun:test";import {other} from "../src/other";test("other",()=>expect(other()).toBe(1));\n');
    await indexCodebase(store,root);
    await store.relate(ticket,'modifies',(await store.getEntity('src/other.ts',FileNode.dcr))!);
    const result=await ticket.resolve(store,{...options(),authorizedFiles:{T:['src/other.ts','src/renamed.ts','tests/other.test.ts']},allowDirtyTargets:['tests/other.test.ts'],
      testCommands:[['bun','test','tests/add.test.ts','tests/other.test.ts']],implement:async()=>({changes:[{action:'rename_file',oldPath:'src/other.ts',newPath:'src/renamed.ts'}],testCommands:[]}),
      verify:async input=>{const accepted=assessment(input);return {...accepted,rules:accepted.rules.map(rule=>({...rule,evidenceIds:['src/renamed.ts']}))};}});
    if(result.status!=='complete')throw Error(JSON.stringify(result));
    expect(fs.existsSync(path.join(root,'src/other.ts'))).toBe(false);expect(fs.readFileSync(path.join(root,'tests/other.test.ts'),'utf8')).toContain('../src/renamed');
    const proof=readVerificationReceipt((await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!.body)!;
    expect(proof.scope.effects[0].renames).toEqual([{from:'src/other.ts',to:'src/renamed.ts'}]);
    expect(proof.scope.effects[0].after['src/other.ts']).toBe('missing');expect(proof.scope.effects[0].before['src/renamed.ts']).toBe('missing');
    expect(proof.acceptance.rules.some(rule=>rule.ruleId==='other-one')).toBe(true);
    expect((await store.getOutgoing(ticket.id,'modifies')).some(edge=>store.localId(edge.targetId)==='src/renamed.ts')).toBe(true);
    expect((await ticket.resolve(store,{...options(),authorizedFiles:{T:['src/renamed.ts']},verify:async()=>{throw Error('Current rename proof should be reused');}})).status).toBe('complete');
  });

  test('child attribution remains separate from parent reporting and parent acceptance', async () => {
    fs.writeFileSync(path.join(root,'tests/other.test.ts'),'import {test,expect} from "bun:test";import {other} from "../src/other";test("other",()=>expect(other()).toBe(1));\n');
    await indexCodebase(store,root);
    const child=await store.upsertEntity<Ticket>(Ticket.dcr,{id:'C',title:'Preserve other',body:'Keep one while simplifying',lane:'Todo',acceptanceCriteria:['other returns one']});
    await store.relate(child,'modifies',(await store.getEntity('src/other.ts',FileNode.dcr))!);await store.relate(ticket,'contains',child);
    let parentReviewed=false;
    const result=await ticket.resolve(store,{...options(),implement:async dossier=>{
      expect(dossier.ticket.id).toBe('C');return {changes:[{action:'replace_text',filePath:'src/other.ts',oldText:'return 1',newText:'return 1 + 0'}],testCommands:[]};
    },verify:async input=>{
      if(input.dossier.ticket.id==='T') {parentReviewed=true;expect(input.dossier.scope!.effects).toHaveLength(0);expect(input.files).not.toContain('src/other.ts');expect(input.children).toEqual(['C']);}
      else {expect(input.dossier.scope!.effects).toHaveLength(1);expect(input.files).toContain('src/other.ts');}
      return assessment(input);
    }});
    expect(result.status).toBe('complete');expect(parentReviewed).toBe(true);
    const parent=readVerificationReceipt((await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!.body)!;
    const childProof=readVerificationReceipt((await store.getEntity<Artifact & {body:string}>('VERIFY-C',Artifact.dcr))!.body)!;
    expect(parent.scope.effects).toHaveLength(0);expect(childProof.scope.effects).toHaveLength(1);
  });

  test('a failed acceptance cannot forget the original module after guarded file relocation on retry', async () => {
    await store.relate(ticket,'modifies',(await store.getEntity('src/other.ts',FileNode.dcr))!);
    const first=await ticket.resolve(store,{...options(),authorizedFiles:{T:['src/renamed.ts']},implement:async()=>({changes:[
      {action:'rename_file',oldPath:'src/other.ts',newPath:'src/renamed.ts'},
      {action:'replace_text',filePath:'src/renamed.ts',oldText:'return 1',newText:'return 2'}],testCommands:[]}),
      verify:async()=>{throw Error('Independent provider unavailable after guarded relocation');}});
    expect(first.status).toBe('blocked');expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
    let supplied=false;
    const retry=await ticket.resolve(store,{...options(),authorizedFiles:{T:['src/renamed.ts']},allowDirtyTargets:['src/renamed.ts'],verify:async input=>{
      supplied=input.dossier.governance!.rules.some(rule=>rule.ruleId==='other-one');
      const accepted=assessment(input);return {...accepted,rules:accepted.rules.map(rule=>({...rule,evidenceIds:['src/renamed.ts'],verdict:'fail' as const,evidence:'The relocated other() still returns two.'}))};
    }});
    expect(supplied).toBe(true);expect(retry.status).toBe('blocked');
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).not.toBe('Done');
  });

  test.skipIf(process.env.AIWF_G5_LIVE!=='1')('configured live independent verifier rejects the actual unlinked module violation and accepts its guarded repair', async () => {
    const critic=loadConfig(path.resolve(import.meta.dir,'..')).modelRoutes?.critic;
    if(!critic)throw Error('A configured independent critic route is required.');
    saveConfig(root,{model:critic,modelRoutes:{critic},llmOutputTokens:4096});
    const live: ResolutionOptions={systemOne:{assess:async()=>null},critic:'none',maxRepairs:0,authorizedFiles:{T:['src/other.ts']},
      testCommands:[['bun','test','tests/add.test.ts']],signal:AbortSignal.timeout(150000)};
    const violation=await ticket.resolve(store,{...live,implement:propose});
    const evidence: Record<string,unknown>={critic,violation,tests:await currentTestEvidence(store,['test:tests/add.test.ts'])};
    const record=()=>fs.writeFileSync('/tmp/g5-live-acceptance.json',JSON.stringify(evidence,null,2));record();
    expect(violation.status).toBe('blocked');expect(JSON.stringify(violation)).toContain("Mandatory Rule 'other-one': fail");
    expect(await store.getEntity('VERIFY-T',Artifact.dcr)).toBeNull();
    await store.upsertEntity(Ticket.dcr,{id:'T',body:'Repair other() to return exactly one, preserving addition. The authorized unlinked file is src/other.ts.'});
    const repaired=await ticket.resolve(store,{...live,allowDirtyTargets:['src/other.ts']});
    evidence.repaired=repaired;record();expect(repaired.status).toBe('complete');
    const proof=readVerificationReceipt((await store.getEntity<Artifact & {body:string}>('VERIFY-T',Artifact.dcr))!.body)!;
    evidence.proof=proof;record();expect(proof.acceptance.rules.find(rule=>rule.ruleId==='other-one')!.verdict).toBe('pass');
    expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.status).toBe('verified');
    store.close();store=new WorkflowStore(root);expect((await store.getEntity<Ticket>('T',Ticket.dcr))!.lane).toBe('Done');
  },180000);
});
