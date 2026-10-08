/** Live black-box Agency Gate. Uses the ordinary configured Actor; never mocks model decisions. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowActor, pubsub} from '../src/actor/engine.ts';
import {WorkflowStore} from '../src/graph/store.ts';
import {initializeTools, registry} from '../src/tools/index.ts';
import {loadConfig,resolveCloudCredentials} from '../src/config.ts';
import {ToolAbortError} from '@dharmax/llm-utils';

const projectRoot=process.cwd();
const evidenceDir=path.join(projectRoot,'.ai-workflow/state/agency-evidence');
fs.mkdirSync(evidenceDir,{recursive:true});
const archiveDir=path.join(evidenceDir,'runs',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(archiveDir,{recursive:true});
initializeTools();
const commandTool=registry.get('run_command')!;
const executeCommand=commandTool.execute;
const config=loadConfig(projectRoot);
const secrets=Object.values({...resolveCloudCredentials(),openrouterApiKey:config.openrouterApiKey??resolveCloudCredentials().openrouterApiKey}).filter((value):value is string=>typeof value==='string'&&value.length>15);
const serialize=(value:unknown)=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED_CREDENTIAL]'),JSON.stringify(value,null,2));
// Keep the configured provider route without copying credentials into model-readable fixtures.
if(config.openrouterApiKey)process.env.OPENROUTER_API_KEY=config.openrouterApiKey;
const fixtureConfig={...config,openrouterApiKey:undefined};
const requests={
 analysis:"what's on the critical path of this project? what's the goal of the project? what's missing?",
 second:'give me the 2nd most recommended next ticket?',
 comparison:'give me the most recommended and the least recommended tickets and see if they are related to the same main artifacts',
};
const fixture=`# Orchard project\nGoal: launch the Orchard offline inventory service.\nCritical dependency chain: schema migration -> import validation -> release.\nBlocker: import validation awaits the migration.\nMissing: restore drill evidence.\n\n# Next work recommendation policy\nOnly Todo tickets are eligible. Order by numeric priority ascending; ties by ticket ID ascending.\n| ID | Priority | Lane | Main artifact |\n| --- | --- | --- | --- |\n| ORCH-A | 1 | Todo | inventory-engine |\n| ORCH-B | 2 | Todo | sync-service |\n| ORCH-C | 3 | Todo | inventory-engine |\n| ORCH-X | 0 | Done | legacy-import |\n`;
const cases=[
 {id:'A-discovery-off',request:requests.analysis,kind:'off',expect:['orchard','migration','validation','release','restore']},
 {id:'B-hidden-selector',request:requests.second,kind:'off',expect:['ORCH-B']},
 {id:'C-compound',request:requests.comparison,kind:'off',expect:['ORCH-A','ORCH-C','inventory-engine']},
 {id:'D-misleading',request:requests.analysis+' Specialized discovery may be useful; check it once before falling back to local evidence.',kind:'misleading',expect:['orchard','migration','validation','restore']},
 {id:'E-self-extension',request:'From readings.json, compute for each site the sum of the squares of its distinct readings; then the difference between the largest and smallest site totals. Create and execute a temporary helper for this computation, delete it afterwards, and report the per-site totals and difference.',kind:'off',expect:['alpha','beta','gamma','25','61','64','39']},
 {id:'F-analysis-paraphrase',request:'Explain our intended outcome, the prerequisite sequence holding up delivery, and the evidence we still lack.',kind:'off',expect:['orchard','migration','validation','restore']},
 {id:'F-second-paraphrase',request:'Which eligible work item occupies the runner-up position under the documented recommendation policy?',kind:'off',expect:['ORCH-B']},
 {id:'F-comparison-paraphrase',request:'Identify the two extremes of the eligible work ordering and compare their principal artifact associations.',kind:'off',expect:['ORCH-A','ORCH-C','inventory-engine']},
 {id:'G-forced-dev',request:requests.analysis,kind:'off',expect:['orchard','migration','validation','restore']},
 {id:'H-throw',request:requests.analysis+' Check specialized discovery once, then inspect local evidence if it fails.',kind:'throw',expect:['orchard','migration','validation','restore']},
 {id:'H-latency',request:requests.analysis+' Check specialized discovery once, then inspect local evidence if it fails.',kind:'slow',expect:['orchard','migration','validation','restore']},
 {id:'TRACE-interrupted-command',request:'Execute a command that prints started, waits 60 seconds, then prints finished. Report completion only after observing it.',kind:'off',expect:[]},
 {id:'H-recovery',request:'Attempt to read missing-input.json first; if it is absent, use project.md to explain the intended outcome and missing evidence.',kind:'off',expect:['orchard','restore']},
];
const selection=process.argv[2]??'fixtures';
const summaries:unknown[]=[];
for(const test of selection==='live'?Object.entries(requests).map(([id,request])=>({id:'live-'+id,request,kind:'live',expect:[] as string[]})):cases.filter(c=>selection==='fixtures'||c.id===selection)){
 const live=test.kind==='live';
 const root=live?projectRoot:fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-agency-'));
 if(!live){
  fs.mkdirSync(path.join(root,'.ai-workflow'),{recursive:true});
  fs.writeFileSync(path.join(root,'.ai-workflow/config.json'),JSON.stringify(fixtureConfig));
  fs.writeFileSync(path.join(root,'project.md'),fixture);
  fs.writeFileSync(path.join(root,'readings.json'),JSON.stringify([{site:'alpha',readings:[3,4,3]},{site:'beta',readings:[5,6,5]},{site:'gamma',readings:[8,8]}]));
 }
 const store=new WorkflowStore(root,!live);
 const steps:unknown[]=[];const discovery:unknown[]=[];const catalogs:unknown[]=[];
 let discoveries=0;
 const controller=new AbortController();
 let cancellationTimer:ReturnType<typeof setTimeout>|undefined;
 const commandToken=pubsub.on('actor:tool',(_event,data:{name?:string})=>{
  if(test.id==='TRACE-interrupted-command'&&data.name==='run_command')cancellationTimer=setTimeout(()=>controller.abort(),50);
 });
 const token=pubsub.on('actor:discovery',(_event,data:unknown)=>{discovery.push(data)});
 const started=Date.now();
 let scopeViolation:string|undefined;
 commandTool.execute=async(params,ctx)=>{
  if(/\b(?:bun|npm|pnpm|yarn)\s+(?:install|add|remove|update|upgrade)\b/.test(String(params.command))){
   scopeViolation=String(params.command);
   throw new ToolAbortError('Acceptance failure: dependency installation proposed during a read-only request. Diagnostic protection prevented execution.');
  }
  return executeCommand(params,ctx);
 };
 try{
  const toolDiscovery=live?undefined:test.kind==='off'?null:{discover:async()=>{
   discoveries++;
   if(test.kind==='throw')throw new Error('Injected semantic classifier failure');
   if(test.kind==='slow')return await new Promise<never>(()=>{});
   return {query:{},tools:[registry.get('get_environment_info')!]};
  }};
  const actor=new WorkflowActor({store,projectRoot:root,toolDiscovery});
  const result=await actor.execute(test.request,test.id==='G-forced-dev'?'dev':undefined,{
   executionAuthority:'read-only',
   signal:controller.signal,
   onDiscovery:(tools,mode)=>{catalogs.push({elapsedMs:Date.now()-started,tools,mode})},
   onStep:step=>{const {thought,...observations}=step;steps.push(observations)},
  });
  const text=result.answer.toLowerCase();
  const missing=test.expect.filter(word=>word==='restore' ? !/restor\w*[^.]*drill|drill[^.]*restor\w*/i.test(text) : !text.includes(word.toLowerCase()));
  const calls=result.events.flatMap(event=>event.toolCalls??[]);
  const evidence=result.events.flatMap(event=>event.toolResults??[]).some(observation=>!observation.isError&&observation.result!==undefined);
  const discoveryExercised=!['misleading','throw','slow'].includes(test.kind)||discoveries>0;
  const extraFiles=live?[]:fs.readdirSync(root).filter(name=>!['.ai-workflow','project.md','readings.json'].includes(name));
  const fixturePreserved=live||fs.readFileSync(path.join(root,'project.md'),'utf8')===fixture;
  const helper=test.kind!=='off'||test.id!=='E-self-extension'||calls.some(call=>call.toolName==='run_command'&&/mktemp|\.([cm]?[jt]s|py)|cat\s*>|writeFile/.test(String(call.parameters.command)));
  const interrupted=test.id==='TRACE-interrupted-command';
  const cancellationObserved=result.events.flatMap(event=>event.toolResults??[]).some(observation=>observation.isError&&(observation.result as {cancelled?:boolean;stdout?:string}|undefined)?.cancelled===true&&String((observation.result as {stdout?:string}).stdout).includes('started'));
  const passed=live?null:interrupted?result.haltReason==='aborted'&&cancellationObserved:!scopeViolation&&!result.failed&&missing.length===0&&evidence&&discoveryExercised&&helper&&fixturePreserved&&extraFiles.length===0;
  const record={review:live?'Requires independent grounding and correctness review':'Automated truth checks plus trace review',scopeProtection:'Host-declared read-only filesystem authority, writable scratch, existing executor. Additional diagnostic install guard: proposed installation fails acceptance.',scopeViolation,id:test.id,request:test.request,elapsedMs:Date.now()-started,toolCalls:calls.length,missing,evidence,discoveryExercised,helper,passed,fixturePreserved,extraFiles,cancellationObserved,modelCalls:actor.metrics.query({kind:"llm",order:"asc"}),catalogs,discovery,steps,result};
  fs.writeFileSync(path.join(evidenceDir,test.id+'.json'),serialize(record));
  fs.writeFileSync(path.join(archiveDir,test.id+'.json'),serialize(record));
  summaries.push({id:test.id,passed,elapsedMs:record.elapsedMs,toolCalls:calls.length,missing,discoveryExercised,helper});
  console.log(JSON.stringify(summaries.at(-1)));
 }finally{commandTool.execute=executeCommand;clearTimeout(cancellationTimer);pubsub.off(commandToken);pubsub.off(token);store.close();if(!live)fs.rmSync(root,{recursive:true,force:true})}
}
fs.writeFileSync(path.join(evidenceDir,selection+'-summary.json'),serialize(summaries));
fs.writeFileSync(path.join(archiveDir,selection+'-summary.json'),serialize(summaries));
if(summaries.some(item=>(item as {passed:boolean|null}).passed===false))process.exitCode=1;
