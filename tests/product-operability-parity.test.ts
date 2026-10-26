import {afterEach,expect,it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';

const roots:string[]=[];
const clients:Client[]=[];
afterEach(async()=>{for(const client of clients.splice(0)) await client.close();for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});});
async function connect(compact=false){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-pc5-parity-'));roots.push(root);
 fs.mkdirSync(path.join(root,'.ai-workflow'));
 const client=new Client({name:'pc5-public-parity',version:'1'});clients.push(client);
 await client.connect(new StdioClientTransport({command:'bun',args:[path.resolve(import.meta.dir,'../src/mcp.ts')],cwd:root,stderr:'pipe',env:{...process.env,AIWF_EXECUTION_AUTHORITY:'project-write',AIWF_MCP_SURFACE:compact?'compact':'legacy'} as Record<string,string>}));
 return {root,client};
}
it('PC-J8 advertises typed artifact and verification families through actual stdio',async()=>{
 const {client}=await connect();const listing=await client.listTools();
 expect(listing.tools.map(t=>t.name)).toContain('artifact');
 expect(listing.tools.map(t=>t.name)).toContain('verify');
 const absent=await client.callTool({name:'artifact',arguments:{action:'show',kind:'Product'}});
 expect(absent.isError).not.toBe(true);expect(JSON.stringify(absent.content)).toContain('defined');
 const refused=await client.callTool({name:'verify',arguments:{action:'run',kind:'ticket',id:'T'}});
 expect(refused.isError).toBe(true);
},15000);

async function payload(client:Client,name:string,args:Record<string,unknown>){
 const result=await client.callTool({name,arguments:args});
 if(result.isError) throw Error(JSON.stringify(result.content));
 const text=result.content as Array<{type:string;text?:string}>;
 return JSON.parse(text.find(item=>item.type==='text')!.text!);
}
async function hostAccept(root:string,preview:{request:unknown;fingerprint:string}){
 const file=path.join(root,'review.json');fs.writeFileSync(file,JSON.stringify({request:preview.request,fingerprint:preview.fingerprint}));
 const proc=Bun.spawn(['bun',path.resolve(import.meta.dir,'../src/cli.ts'),'product-change','accept',file],{cwd:root,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(proc.stdout).text(),new Response(proc.stderr).text(),proc.exited]);
 return {code,stdout,stderr};
}
it('PC-J8 typed MCP preview stays inert until exact local host review, revisions persist and stale review refuses',async()=>{
 const {client,root}=await connect();
 const preview=await payload(client,'artifact',{action:'preview_new',kind:'Goal',id:'G1',fields:{title:'Outcome',body:'Useful outcome',status:'accepted'}});
 expect(preview.status).toBe('preview');
 expect((await payload(client,'artifact',{action:'list',kind:'Goal'})).items).toEqual([]);
 const unapproved=await payload(client,'apply_change',{request:preview.request,fingerprint:preview.fingerprint,decision:'accept'});
 expect(unapproved.ok).toBe(false);expect(unapproved.status).toBe('review_required');
 const accepted=await hostAccept(root,preview);expect(accepted.code).toBe(0);
 const first=await payload(client,'artifact',{action:'show',kind:'Goal',id:'g1',idMatch:'human'});
 expect(first.id).toBe('G1');expect(first.definition.body).toBe('Useful outcome');expect(first.version).toBeGreaterThan(0);
 const edit=await payload(client,'artifact',{action:'preview_edit',kind:'Goal',id:'G1',version:first.version,fields:{body:'Revised outcome'}});
 const stale=await payload(client,'artifact',{action:'preview_edit',kind:'Goal',id:'G1',version:first.version,fields:{body:'Obsolete draft'}});
 expect((await hostAccept(root,edit)).code).toBe(0);expect((await hostAccept(root,stale)).code).toBe(1);
 const current=await payload(client,'artifact',{action:'show',kind:'Goal',id:'G1'});
 expect(current.version).toBe(first.version+1);expect(current.definition.body).toBe('Revised outcome');
 const retire=await payload(client,'artifact',{action:'preview_retire',kind:'Goal',id:'G1',version:current.version});
 expect(retire.dependents).toEqual([]);expect((await hostAccept(root,retire)).code).toBe(0);
 expect((await payload(client,'artifact',{action:'show',kind:'Goal',id:'G1'})).definition.status).toBe('deprecated');
},20000);
it('PC5 advertised strict union and runtime agree on foreign fields, versions and project-root branches',async()=>{
 const {client,root}=await connect();const listing=await client.listTools();
 const validator=new AjvJsonSchemaValidator();
 for(const name of ['artifact','verify']) {
  const tool=listing.tools.find(item=>item.name===name)!;
  const validate=validator.getValidator(tool.inputSchema);
  const good=name==='artifact'?{action:'show',kind:'Product',projectRoot:root}:{action:'describe',kind:'ticket',projectRoot:root};
  expect(validate(good).valid).toBe(true);
  const negatives=name==='artifact'?[
   {action:'preview_edit',kind:'Module',id:'mod:src',version:1,fields:{path:'elsewhere'}},
   {action:'preview_edit',kind:'Ticket',id:'T',version:1,fields:{status:'verified'}},
   {action:'preview_edit',kind:'Goal',id:'G',version:0,fields:{body:'text'}},
   {action:'preview_edit',kind:'Goal',id:'G',version:1,fields:{}},
   {action:'preview_new',kind:'Epic',fields:{title:'False delivery',status:'completed'}},
   {action:'preview_new',kind:'Module',fields:{title:'Invented module'}},
   {action:'preview_new',kind:'Bug',fields:{title:'False bug',kind:'task'}},
   {action:'show',kind:'Product',authority:'project-write'},
  ]:[{action:'run',kind:'ticket',id:'T'},{action:'run',kind:'story',id:'S',command:['echo','false']},{action:'show',kind:'ticket',id:'T',proof:'accepted'}];
  for(const args of negatives){expect(validate({...args,projectRoot:root}).valid).toBe(false);expect((await client.callTool({name,arguments:{...args,projectRoot:root}})).isError).toBe(true);}
 }
},15000);
it('PC5 bounded literal list uses snapshot cursors and missing Ticket verification stays missing',async()=>{
 const {root,client}=await connect();
 for(const id of ['G1','G2','G3']) expect((await hostAccept(root,await payload(client,'artifact',{action:'preview_new',kind:'Goal',id,fields:{title:'Outcome [literal]',body:id}}))).code).toBe(0);
 const args={action:'list',kind:'Goal',query:'[LITERAL]',limit:1};
 const first=await payload(client,'artifact',args);expect(first.items.map((item:{id:string})=>item.id)).toEqual(['G1']);expect(first.cursor).toBeString();
 const second=await payload(client,'artifact',{...args,cursor:first.cursor});expect(second.items.map((item:{id:string})=>item.id)).toEqual(['G2']);
 expect((await client.callTool({name:'artifact',arguments:{...args,query:'other',cursor:first.cursor}})).isError).toBe(true);
 const g=await payload(client,'artifact',{action:'show',kind:'Goal',id:'G1'});
 expect((await hostAccept(root,await payload(client,'artifact',{action:'preview_edit',kind:'Goal',id:'G1',version:g.version,fields:{body:'changed'}}))).code).toBe(0);
 expect((await client.callTool({name:'artifact',arguments:{...args,cursor:first.cursor}})).isError).toBe(true);
 const bug=await payload(client,'create_bug',{id:'B1',title:'Observed defect'});
 const id=bug.id??bug.ticketId;
 const proof=await payload(client,'verify',{action:'show',kind:'ticket',id});
 expect('verificationState' in proof).toBe(false);expect(proof.verification).toBeNull();
},20000);
it('PC5 compact advertisement is opt-in and retains legacy calls with identical family schemas',async()=>{
 const legacy=await connect();const compact=await connect(true);
 const [all,small]=await Promise.all([legacy.client.listTools(),compact.client.listTools()]);
 expect(all.tools.some(tool=>tool.name==='get_goal')).toBe(true);
 expect(small.tools.some(tool=>tool.name==='get_goal')).toBe(false);
 for(const name of ['artifact','link','verify','resolve_ticket','prepare_story_test','apply_story_test','preview_change','apply_change','claim_ticket','release_ticket','find_symbol','preview_rule_change']) expect(small.tools.some(tool=>tool.name===name)).toBe(true);
 expect(small.tools.find(tool=>tool.name==='artifact')!.inputSchema).toEqual(all.tools.find(tool=>tool.name==='artifact')!.inputSchema);
 expect((await compact.client.callTool({name:'get_product',arguments:{}})).isError).not.toBe(true);
 console.info(JSON.stringify({measurement:'actual stdio tools/list serialized UTF8 bytes; no paid-token or usability inference',legacy:{tools:all.tools.length,bytes:Buffer.byteLength(JSON.stringify(all))},compact:{tools:small.tools.length,bytes:Buffer.byteLength(JSON.stringify(small))}}));
},15000);
