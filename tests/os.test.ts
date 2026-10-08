import {describe,it,expect,beforeEach,afterEach} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../src/graph/store.ts';
import {initializeTools,registry} from '../src/tools/index.ts';
describe('run_command observation contract',()=>{
 let root:string,store:WorkflowStore;
 beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-os-'));store=new WorkflowStore(root,true);initializeTools()});
 afterEach(()=>{store.close();fs.rmSync(root,{recursive:true,force:true})});
 const run=(command:string,extra:Record<string,unknown>={},signal?:AbortSignal)=>registry.execute('run_command',{command,...extra},{projectRoot:root,store,signal});
 it('distinguishes empty success and nonzero exit with both streams',async()=>{
  expect(await run('true')).toMatchObject({success:true,exitCode:0,stdout:'',stderr:'',stdoutTruncated:false,stderrTruncated:false});
  expect(await run('printf out; printf err >&2; exit 7')).toMatchObject({success:false,exitCode:7,stdout:'out',stderr:'err',timedOut:false,cancelled:false});
 });
 it('reports truncation independently for both streams',async()=>{
  const result=await run("bun -e 'process.stdout.write(\"x\".repeat(11000));process.stderr.write(\"y\".repeat(6000))'");
  expect(result.stdout.length).toBe(10000);expect(result.stderr.length).toBe(5000);
  expect(result).toMatchObject({success:true,stdoutTruncated:true,stderrTruncated:true});
 });
 it('resolves working directories and reports spawn failure',async()=>{
  fs.mkdirSync(path.join(root,'sub'));expect((await run('pwd',{cwd:'sub'})).stdout.trim()).toBe(path.join(root,'sub'));
  expect(await run('true',{cwd:'absent'})).toMatchObject({success:false,exitCode:null,stdout:'',stderr:''});
 });
 it('distinguishes timeout and parent cancellation and terminates descendants',async()=>{
  const start=Date.now();expect(await run('sleep 10',{timeoutMs:30})).toMatchObject({success:false,timedOut:true,cancelled:false});
  const controller=new AbortController();setTimeout(()=>controller.abort(),30);
  expect(await run('sleep 10',{timeoutMs:10000},controller.signal)).toMatchObject({success:false,timedOut:false,cancelled:true});
  expect(Date.now()-start).toBeLessThan(2000);
 });
 it('does not execute a command after cancellation',async()=>{
  const controller=new AbortController();controller.abort();
  expect(await run('touch forbidden',{},controller.signal)).toMatchObject({success:false,cancelled:true,exitCode:null});
  expect(fs.existsSync(path.join(root,'forbidden'))).toBe(false);
 });
 it('enforces host read-only project authority while permitting scratch computation',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-scratch-'));
  try{
   fs.writeFileSync(path.join(root,'records.json'),'[3,4]');
   const scoped=(command:string)=>registry.execute('run_command',{command,timeoutMs:5000},{projectRoot:root,store,executionAuthority:'read-only',scratchRoot:scratch});
   const denied=await scoped("printf 'fabricated' > records.json");
   expect(denied.success).toBe(false);
   expect(fs.readFileSync(path.join(root,'records.json'),'utf8')).toBe('[3,4]');
   expect(await scoped('cat records.json')).toMatchObject({success:true,observationOnly:true});
   const result=await scoped('bun -e \'const fs=require("fs");const input=JSON.parse(fs.readFileSync("records.json","utf8"));fs.writeFileSync(process.env.TMPDIR+"/helper-output.json",JSON.stringify(input.map(x=>x*x)));console.log(input.reduce((sum,x)=>sum+x*x,0));\'');
   expect(result).toMatchObject({success:true,stdout:'25\n',authority:'read-only',scratchRoot:scratch,observationOnly:false});
   expect(fs.readFileSync(path.join(scratch,'helper-output.json'),'utf8')).toBe('[9,16]');
   for(let i=0;i<2;i++)expect(await scoped('printf x >> "$TMPDIR/helper-output.json"')).toMatchObject({success:true,observationOnly:false});
   expect(await scoped('cat records.json')).toMatchObject({success:true,observationOnly:true});
   expect(await run("printf 'authorized' > records.json")).toMatchObject({success:true});
   expect(fs.readFileSync(path.join(root,'records.json'),'utf8')).toBe('authorized');
  }finally{fs.rmSync(scratch,{recursive:true,force:true})}
 });
 it('rejects overlapping scratch mounts and cannot write project through scratch symlinks',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-scratch-'));
  try{
   fs.writeFileSync(path.join(root,'records'),'real');
   fs.symlinkSync(root,path.join(scratch,'source'));
   const runScoped=(scratchRoot:string,command:string)=>registry.execute('run_command',{command,timeoutMs:5000},{projectRoot:root,store,executionAuthority:'read-only',scratchRoot});
   expect((await runScoped(scratch,'printf fake > "$TMPDIR/source/records"')).success).toBe(false);
   expect(await runScoped(root,'printf fake > records')).toMatchObject({success:false,exitCode:null});
   expect(fs.readFileSync(path.join(root,'records'),'utf8')).toBe('real');
  }finally{fs.rmSync(scratch,{recursive:true,force:true})}
 });
 it('blocks dependency installation into a read-only project without command-name rules',async()=>{
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-scratch-'));
  try{
   fs.mkdirSync(path.join(root,'dependency'));
   fs.writeFileSync(path.join(root,'dependency/package.json'),JSON.stringify({name:'fixture-dep',version:'1.0.0'}));
   fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{'fixture-dep':'file:./dependency'}}));
   const result=await registry.execute('run_command',{command:'bun install --offline --ignore-scripts',timeoutMs:5000},{projectRoot:root,store,executionAuthority:'read-only',scratchRoot:scratch});
   expect(result.success).toBe(false);
   expect(fs.existsSync(path.join(root,'node_modules'))).toBe(false);
   expect(fs.existsSync(path.join(root,'bun.lock'))).toBe(false);
  }finally{fs.rmSync(scratch,{recursive:true,force:true})}
 });
});
