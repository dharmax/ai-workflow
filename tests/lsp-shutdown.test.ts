import {afterEach, describe, expect, it} from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {TsLspClient} from '../src/change/ts-lsp.ts';
import {Ts6RefactorClient} from '../src/change/ts6-refactor.ts';

// The subprocess speaks real JSON-RPC; shutdown stalls and ignores TERM deliberately.
// This isolates transport ownership, including concurrent close and a stuck child.
describe('bounded native LSP teardown', () => {
 let root: string;
 let client: TsLspClient | Ts6RefactorClient | undefined;
 afterEach(async () => {
  await client?.close();
  if (root) fs.rmSync(root, {recursive:true, force:true});
 });
 for (const kind of ['ts7','ts6'] as const) for (const mode of ['normal','stalled']) {
  it(`${kind}: ${mode} shutdown disposes and reaps its owned child`, async () => {
   root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-lsp-close-'));
   const bin=path.join(root,'node_modules','.bin','typescript-language-server');
   fs.mkdirSync(path.dirname(bin),{recursive:true});
   fs.mkdirSync(path.join(root,'node_modules','typescript6','lib'),{recursive:true});
   fs.writeFileSync(path.join(root,'node_modules','typescript6','lib','tsserver.js'),'');
   fs.writeFileSync(bin, `#!${Bun.which('node')!}
const rpc=require(${JSON.stringify(require.resolve('vscode-jsonrpc/node'))});
const fs=require('node:fs');
if(process.argv.includes('--version')){console.log('6.0.2');process.exit(0);}
fs.writeFileSync('server.pid',String(process.pid));
const connection=rpc.createMessageConnection(new rpc.StreamMessageReader(process.stdin),new rpc.StreamMessageWriter(process.stdout));
connection.onRequest('initialize',()=>({capabilities:{}}));
connection.onRequest('shutdown',()=>${mode === 'stalled' ? 'new Promise(()=>{})' : 'null'});
connection.onNotification('exit',()=>process.exit(0));
${mode === 'stalled' ? "process.on('SIGTERM',()=>{});" : ''}
connection.listen();
`);
   fs.chmodSync(bin,0o755);
   client=kind==='ts7' ? new TsLspClient({projectRoot:root,customExecutable:bin}) : new Ts6RefactorClient({projectRoot:root});
   await client.ensureStarted();
   const pid=Number(fs.readFileSync(path.join(root,'server.pid'),'utf8'));
   const started=performance.now();
   await Promise.all([client.close(),client.close()]);
   expect(performance.now()-started).toBeLessThan(2500);
   expect(()=>process.kill(pid,0)).toThrow();
   await client.close();
   await expect(client.ensureStarted()).rejects.toThrow('closed');
  },5000);
 }
 it('settles an in-flight document-symbol request when its client closes', async () => {
  root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-lsp-request-close-'));
  fs.writeFileSync(path.join(root,'example.ts'),'export const value = 1;\n');
  const bin=path.join(root,'node_modules','.bin','typescript-language-server');
  fs.mkdirSync(path.dirname(bin),{recursive:true});
  fs.writeFileSync(bin, `#!${Bun.which('node')!}
const rpc=require(${JSON.stringify(require.resolve('vscode-jsonrpc/node'))});
const fs=require('node:fs');
if(process.argv.includes('--version')){console.log('6.0.2');process.exit(0);}
const connection=rpc.createMessageConnection(new rpc.StreamMessageReader(process.stdin),new rpc.StreamMessageWriter(process.stdout));
connection.onRequest('initialize',()=>({capabilities:{documentSymbolProvider:true}}));
connection.onRequest('textDocument/documentSymbol',()=>{fs.writeFileSync('document-symbol.started','yes');return new Promise(()=>{});});
connection.onRequest('shutdown',()=>null);
connection.onNotification('exit',()=>process.exit(0));
connection.listen();
`);
  fs.chmodSync(bin,0o755);
  client=new TsLspClient({projectRoot:root,customExecutable:bin});
  await client.ensureStarted();
  const request=client.getDocumentSymbols('example.ts').then(()=>null,error=>error);
  const started=path.join(root,'document-symbol.started'), deadline=Date.now()+1500;
  while(!fs.existsSync(started)&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
  expect(fs.existsSync(started)).toBe(true);
  await client.close();
  const error=await request;
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toMatch(/null is not an object|Cannot read properties of null/);
 },5000);
});
