import {afterEach,beforeEach,describe,expect,it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {Epic,Goal} from '../src/graph/ontology.ts';
import {initializeTools} from '../src/tools/index.ts';
import {createCommandTree,type NormalizedCommand} from '../src/artifact-command.ts';
import {processShellInput} from '../src/shell.ts';
import {WorkflowActor} from '../src/actor/engine.ts';

const binary=process.env.AIWF_PUBLIC_BINARY;
const cli=path.resolve(import.meta.dir,'../src/cli.ts');
describe('PC1b human public link journeys',()=>{
 let root:string,store:WorkflowStore;
 const run=(...args:string[])=>Bun.spawnSync(binary?[binary,...args]:['bun',cli,...args],{cwd:root,stderr:'pipe'});
 const reopen=()=>{store.close();store=new WorkflowStore(root);};
 beforeEach(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-pc1b-'));store=new WorkflowStore(root);initializeTools();
  await store.upsertEntity(Epic.dcr,{id:'E1',title:'Delivery'});await store.upsertEntity(Goal.dcr,{id:'G1',title:'Outcome'});});
 afterEach(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
 it('discovers modes and previews without writing, then explicitly applies and reopens',async()=>{
  const types=run('link','types','Epic','Goal');expect(types.success).toBe(true);expect(types.stdout.toString()).toContain('targets');
  const preview=run('link','E1','to','G1','as','targets','--note','Delivery scope');expect(preview.success).toBe(true);
  reopen();expect(await store.getOutgoing('E1','targets')).toHaveLength(0);
  const applied=run('link','E1','to','G1','as','targets','--note','Delivery scope','--yes');expect(applied.success).toBe(true);
  reopen();expect(await store.getOutgoing('E1','targets')).toHaveLength(1);
  const inspected=run('links','E1','--json');expect(inspected.success).toBe(true);expect(inspected.stdout.toString()).toContain('Delivery scope');
 });
 it('lexes shell quotes once and invalid explicit grammar never reaches the Actor',async()=>{
  const actor=new WorkflowActor({store,projectRoot:root,offline:true});let calls=0;
  actor.execute=async()=>{calls++;throw Error('Actor must not run');};
  const session={store,projectRoot:root,actor,interactive:false};
  const added=await processShellInput(`link E1 to G1 as targets --note 'A "quoted" scope' --yes`,session);
  expect(added.output).toContain('applied');reopen();
  const inspected=run('links','E1','--json');expect(inspected.stdout.toString()).toContain('quoted');
  for(const input of ['status --unknown','unknown2:verb','link E1 G1 targets','link E1 to G1 as targets -p note','unlink E1 from G1 as targets --note bad','link types --allowed','link E1 to G1 as targets --yes --yes',`link E1 to G1 as targets --note 'broken`]){
   const result=await processShellInput(input,{...session,store});expect(result.output).toMatch(/error|invalid|usage|quote|option/i);
  }expect(calls).toBe(0);
 });
 it('confirms and cancels through the executable CLI on a real terminal',async()=>{
  const script=`import errno,json,os,pty,select,subprocess,sys,time
master,slave=pty.openpty()
child=subprocess.Popen(json.loads(sys.argv[1]),cwd=sys.argv[2],stdin=slave,stdout=slave,stderr=slave,close_fds=True)
os.close(slave)
output=b''
answered=False
deadline=time.monotonic()+15
while time.monotonic()<deadline:
 ready,_,_=select.select([master],[],[],0.1)
 if ready:
  try: chunk=os.read(master,65536)
  except OSError as error:
   if error.errno==errno.EIO: break
   raise
  if not chunk: break
  output+=chunk
  if b'Apply this exact link change?' in output and not answered:
   os.write(master,(sys.argv[3]+'\\n').encode());answered=True
 if child.poll() is not None and not ready: break
if child.poll() is None: child.kill()
code=child.wait()
os.close(master)
print(json.dumps({'code':code,'output':output.decode(errors='replace'),'answered':answered}))`;
  const command=binary?[binary,'link','E1','to','G1','as','targets','--note','Terminal note']:['bun',cli,'link','E1','to','G1','as','targets','--note','Terminal note'];
  const terminal=(answer:string)=>{
   const result=Bun.spawnSync(['python','-c',script,JSON.stringify(command),root,answer],{stderr:'pipe'});
   expect(result.success).toBe(true);return JSON.parse(result.stdout.toString());
  };
  const cancelled=terminal('n');expect(cancelled.answered).toBe(true);expect(cancelled.code).toBe(0);expect(cancelled.output).toContain('cancelled');reopen();expect(await store.getOutgoing('E1','targets')).toEqual([]);
  const applied=terminal('y');expect(applied.code).toBe(0);expect(applied.output).toContain('applied');reopen();expect(await store.getOutgoing('E1','targets')).toHaveLength(1);
 },35000);
 it('respects --, keeps option-like notes literal and serves scoped help without a database',async()=>{
  await store.upsertEntity(Epic.dcr,{id:'-E',title:'Dash source'});await store.upsertEntity(Goal.dcr,{id:'-G',title:'Dash target'});
  expect(run('link','--yes','--note','-literal','--','-E','to','-G','as','targets').success).toBe(true);reopen();expect(await store.getOutgoing('-E','targets')).toHaveLength(1);
  const fresh=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-pc1b-help-'));
  try {const result=Bun.spawnSync(binary?[binary,'help','link']:['bun',cli,'help','link'],{cwd:fresh,stderr:'pipe'});expect(result.success).toBe(true);expect(result.stdout.toString()).toContain('Governed relations');expect(fs.existsSync(path.join(fresh,'.ai-workflow'))).toBe(false);}
  finally {fs.rmSync(fresh,{recursive:true,force:true});}
 });
 it('reuses Commander definitions safely and awaits asynchronous intent dispatch',async()=>{
  const intents:NormalizedCommand[]=[];
  const tree=createCommandTree(async intent=>{await Promise.resolve();intents.push(intent);},()=>{});
  const args=['link','E1','to','G1','as','targets','--yes'];
  await tree.parseAsync(args,{from:'user'});await tree.parseAsync(args,{from:'user'});
  expect(intents).toHaveLength(2);expect(intents[0]).toEqual(intents[1]);expect(intents[0]!.family).toBe('link');
  await expect(tree.parseAsync([...args,'--yes'],{from:'user'})).rejects.toThrow('Duplicate');
  expect(await store.getOutgoing('E1','targets')).toEqual([]);
 });
 it('shares Commander routing for namespaced Goal reads through CLI and shell',async()=>{
  const space=run('product','goal','show','G1'),colon=run('product:goal','show','G1');
  expect(space.success).toBe(true);expect(colon.success).toBe(true);expect(JSON.parse(colon.stdout.toString())).toEqual(JSON.parse(space.stdout.toString()));
  const actor=new WorkflowActor({store,projectRoot:root,offline:true});let calls=0;
  actor.execute=async()=>{calls++;throw Error('Actor must not run');};
  const session={store,projectRoot:root,actor,interactive:false};
  expect((await processShellInput('PRODUCT:GOAL SHOW G1',session)).output).toBe((await processShellInput('product goal show G1',session)).output);
  const before=(await store.getEntity('G1',Goal.dcr))!.version;
  expect((await processShellInput('product goal --help',session)).output).toContain('show');
  const helpStore=new Proxy(store,{get(target,key,receiver){if(['getEntity','listEntities','withExecutionContext'].includes(String(key))) throw Error('Help accessed the database');return Reflect.get(target,key,receiver);}});
  const facilitator={facilitate:async()=>{throw Error('Help opened a form');}};
  expect((await processShellInput('resolve --help',{...session,store:helpStore,interactive:true,facilitator:facilitator as any})).output).toContain('Usage: aiwf resolve');
  expect((await processShellInput('help product goal',session)).output).toContain('show');
  expect((await processShellInput('product goal show',session)).output).toContain('Error:');
  expect((await processShellInput('link E1 TO G1 AS targets --yes --YES',session)).output).toContain('Duplicate');
  expect(calls).toBe(0);reopen();expect((await store.getEntity('G1',Goal.dcr))!.version).toBe(before);
 });
 it('rejects fixed-word changes, duplicate scalars and discovery mutation flags',()=>{
  for(const args of [
   ['link','E1','toward','G1','as','targets'],['unlink','E1','to','G1','as','targets'],
   ['link','E1','to','G1','with','targets'],['links','E1','--limit','1','--limit','2'],
   ['link','E1','to','G1','as','targets','--note','a','--note','b'],
   ['link','--yes','types'],['link','types','--note','x'],['product','goal','show','G1','extra']
  ]) expect(run(...args).success).toBe(false);
 });
 it('uses built-in scoped help without accessing a database for every namespaced spelling',()=>{
  const fresh=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-commander-help-'));
  try {
   const outputs=[];
   for(const args of [['product','goal','--help'],['product:goal','help'],['help','product','goal']]) {
    const result=Bun.spawnSync(binary?[binary,...args]:['bun',cli,...args],{cwd:fresh,stderr:'pipe'});
    expect(result.success).toBe(true);expect(result.stdout.toString()).toContain('show');outputs.push(result.stdout.toString());
   }
   expect(outputs[0]).toBe(outputs[1]);expect(outputs[0]).toBe(outputs[2]);expect(fs.readdirSync(fresh)).toEqual([]);
  } finally {fs.rmSync(fresh,{recursive:true,force:true});}
 });
 it('rejects old syntax and conflicting flags at the executable boundary',()=>{
  for(const args of [['status','--unknown'],['status','extra'],['link','E1'],['link','E1','to','G1','as','targets','--apply'],['link','E1','to','G1','as','targets','--note','x','--clear-note'],['links','E1','--incoming','--outgoing']]) expect(run(...args).success).toBe(false);
 });
});
