import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {WorkflowStore} from '/home/dharmax/work/ai-workflow/src/graph/store.ts';
import {Product,Feature} from '/home/dharmax/work/ai-workflow/src/graph/ontology.ts';
import {initializeTools,registry} from '/home/dharmax/work/ai-workflow/src/tools/index.ts';
import {loadConfig,getConfigPath,getGlobalConfigPath} from '/home/dharmax/work/ai-workflow/src/config.ts';
const project='/home/dharmax/work/ai-workflow',out='/tmp/aiwf-charter-o3-20261022';
const hash=(p:string)=>fs.existsSync(p)?createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const configFiles=[getConfigPath(project),getGlobalConfigPath()];
const before=configFiles.map(p=>({path:p,sha256:hash(p)}));
initializeTools();
const canonical=new WorkflowStore(project);
const product=(await registry.execute('get_product',{}, {store:canonical,projectRoot:project})).product;
canonical.close();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiwf-feature-qualification-'));
fs.mkdirSync(path.dirname(getConfigPath(root)),{recursive:true});
fs.copyFileSync(getConfigPath(project),getConfigPath(root));
const disposableConfig=JSON.parse(fs.readFileSync(getConfigPath(root),'utf8'));
disposableConfig.gateway='openrouter';
disposableConfig.modelRoutes={...disposableConfig.modelRoutes,critic:'openrouter/openai/o3-mini'};
fs.writeFileSync(getConfigPath(root),JSON.stringify(disposableConfig));
const store=new WorkflowStore(root);
const {version:charterVersion,...charterFields}=product;
await store.upsertEntity(Product.dcr,charterFields);
initializeTools();
const config=loadConfig(root);
const record:any={ticket:'TKT-PRODUCT-CHARTER-FEATURE',head:'eeaf9e6',startedAt:new Date().toISOString(),surface:'registry.execute preview_change (public Product change tool)',root,model:config.modelRoutes?.critic,configBefore:before,charter:product,cases:[]};
fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(record,null,2));
const realFetch=globalThis.fetch;
let active:any;
globalThis.fetch=Object.assign(async (...args:Parameters<typeof fetch>)=>{
 const began=performance.now();
 const call:any={startedAt:new Date().toISOString(),url:String(args[0])};
 if(typeof args[1]?.body==='string') {try {const b=JSON.parse(args[1].body);call.model=b.model;call.request=b;}catch{}}
 active?.transport.push(call);
 try {const response=await realFetch(...args);call.httpStatus=response.status;call.rawResponse=await response.clone().text();call.elapsedMs=performance.now()-began;return response;}
 catch(e){call.elapsedMs=performance.now()-began;call.error=String(e);throw e;}
},realFetch);
try {
 const credentials=(await import('/home/dharmax/work/ai-workflow/src/config.ts')).resolveCloudCredentials();
 const began=performance.now();
 const probe=await realFetch('https://openrouter.ai/api/v1/auth/key',{headers:{Authorization:'Bearer '+credentials.openrouterApiKey},signal:AbortSignal.timeout(60000)});
 record.providerCheck={endpoint:'https://openrouter.ai/api/v1/auth/key',httpStatus:probe.status,elapsedMs:performance.now()-began,response:(()=>undefined)(),credentialSource:'saved credential; stale environment override removed for child process only'};
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(record,null,2));
 if(!probe.ok) throw new Error('Authorized provider credential probe failed: '+probe.status);
 for(const item of [
 {name:'aligned',id:'QUALIFY-ALIGNED',title:'Repository defect investigation',body:'Help developers and AI coding agents investigate software defects using targeted semantic graph retrieval, exact source references and test evidence. Produce grounded diagnosis and proposed repairs for explicit developer review. Preserve developer authority; operate only on software engineering objectives.'},
 {name:'contradictory',id:'QUALIFY-CONTRADICTORY',title:'General-purpose public chatbot and creative writing',body:'Provide unrestricted conversation on any topic, poetry, fiction and entertainment content for the general public, independent of any software engineering objective. Make AIWF a general-purpose chatbot and content-generation application.'}
 ]) {
  active={...item,startedAt:new Date().toISOString(),transport:[]};record.cases.push(active);
  const request={action:'product_change',basis:[{id:'PRODUCT',entityType:'Product',version:product.version}],mutations:[{kind:'product_create',entityType:'Feature',id:item.id,fields:{title:item.title,body:item.body,status:'accepted'}}]};
  active.request=request;const began=performance.now();
  try{active.response=await registry.execute('preview_change',request,{store,projectRoot:root,executionAuthority:'project-write'});}catch(e){active.error=String(e);}
  active.elapsedMs=performance.now()-began;
  active.featureWritten=Boolean(await store.getEntity(item.id,Feature.dcr));
  fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify({case:item.name,elapsedMs:active.elapsedMs,response:active.response,error:active.error,featureWritten:active.featureWritten}));
 }
} finally {
 globalThis.fetch=realFetch;
 record.fixtureProductUnchanged=JSON.stringify((await registry.execute('get_product',{}, {store,projectRoot:root})).product)===JSON.stringify(product);
 store.close();
 const check=new WorkflowStore(project);
 record.canonicalProductUnchanged=JSON.stringify((await registry.execute('get_product',{}, {store:check,projectRoot:project})).product)===JSON.stringify(product);
 check.close();
 record.configAfter=configFiles.map(p=>({path:p,sha256:hash(p)}));record.finishedAt=new Date().toISOString();
 fs.rmSync(root,{recursive:true,force:true});record.disposableStateRemoved=true;
 fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify(record,null,2));
 console.log(JSON.stringify({evidence:path.join(out,'evidence.json'),canonicalProductUnchanged:record.canonicalProductUnchanged,fixtureProductUnchanged:record.fixtureProductUnchanged,configUnchanged:JSON.stringify(record.configBefore)===JSON.stringify(record.configAfter)}));
}
