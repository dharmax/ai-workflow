/**
 * Responsibility: Compile eligible registered commands into Workspace REST routes and OpenAPI.
 * Scope: Transport validation and projection; existing owners enforce authority and state.
 */
import {z} from 'zod';
import {commandRegistry,commandId,commandRoute,type CommandDefinition,type ToolContext} from '../tools/registry.ts';
import {initializeTools} from '../tools/index.ts';
import {parsePublicJson} from '../public-json.ts';
export function publicApiError(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 const status=error instanceof z.ZodError||error instanceof SyntaxError||error instanceof URIError?400:/read-only|authority|approval|permission|escapes/i.test(message)?403:/not found|does not exist/i.test(message)?404:/stale|changed while|conflict/i.test(message)?409:/aborted|cancelled/i.test(message)?499:500;
 return {status,body:{status:status===404?'not_found':status===409?'stale':status===403?'denied':status===400?'invalid':status===499?'cancelled':'failed',error:message}};
}
export function compilePublicRoutes(trustedReview=false){
 initializeTools();
 return commandRegistry.getCommands('rest').filter(c=>!c.review||trustedReview).map(command=>({command,path:commandRoute(command)}));
}
type Routes=ReturnType<typeof compilePublicRoutes>;
export async function publicApi(req:Request,ctx:ToolContext,routes:Routes=compilePublicRoutes(),review?: {confirm:(preview:unknown)=>Promise<boolean>;respond?: (question:string,id:string)=>Promise<string|undefined>}):Promise<{body:unknown;status?:number}>{
 const url=new URL(req.url);
 if(req.method==='GET'&&url.pathname==='/api/v1/openapi.json')return {body:publicOpenApi(routes)};
 const query:Record<string,unknown>={};
 for(const [key,value] of url.searchParams){if(key in query)throw new SyntaxError('Duplicate query parameter: '+key);query[key]=value;}
 const candidates=routes.flatMap(route=>{
  const pattern=route.path.split('/'),actual=url.pathname.split('/');
  if(pattern.length!==actual.length)return [];
  const pathArgs:Record<string,string>={};
  for(let i=0;i<pattern.length;i++){
   const segment=pattern[i]!;
   if(segment.startsWith('{'))pathArgs[segment.slice(1,-1)]=decodeURIComponent(actual[i]!);
   else if(segment!==actual[i])return [];
  }
  return [{...route,pathArgs,specificity:pattern.filter(p=>!p.startsWith('{')).length}];
 });
 if(!candidates.length)return {status:404,body:{status:'unsupported',error:'No eligible registered route'}};
 const matching=candidates.filter(r=>r.command.http.method===req.method);
 if(!matching.length)return {status:405,body:{status:'unsupported',error:'Method not allowed'}};
 const best=Math.max(...matching.map(r=>r.specificity));
 const selected=matching.filter(r=>r.specificity===best).filter(({command:c})=>{
  if(!c.http.queryIdentity)return true;
  const complete=c.http.queryIdentity.every(key=>query[key]!==undefined);
  return c.action==='show'?complete:!complete;
 });
 if(selected.length!==1)throw new SyntaxError('No unambiguous registered input shape');
 const {command:c,pathArgs}=selected[0]!;
 if(!commandRegistry.getCommands('rest').includes(c))return {status:404,body:{error:'Command is no longer exposed'}};
 const native={...query};
 const json=z.toJSONSchema(c.parameters) as {properties:Record<string,{type?:string}>};
 for(const [key,value] of Object.entries(native)){
  const type=json.properties[key]?.type;
  if(type==='number'||type==='integer'){if(!/^-?\d+(?:\.\d+)?$/.test(String(value)))throw new SyntaxError(key+' must be numeric');native[key]=parsePublicJson(String(value));}
  else if(type==='boolean'){if(value!=='true'&&value!=='false')throw new SyntaxError(key+' must be boolean');native[key]=value==='true';}
  else if(type==='array'||type==='object')native[key]=parsePublicJson(String(value));
 }
 const body=req.method==='GET'?{}:parsePublicJson(await req.text()||'{}');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new SyntaxError('Expected request object');
 for(const key of Object.keys(body))if(key in native||key in pathArgs)throw new SyntaxError('Conflicting input field: '+key);
 for(const key of Object.keys(pathArgs))if(key in native)throw new SyntaxError('Conflicting identity: '+key);
 const input=c.parameters.parse({...native,...body,...pathArgs});
 if(c.review)return {body:await c.review(input,{...ctx,signal:req.signal},review?.confirm,review?.respond)};
 return {body:await commandRegistry.execute(commandId(c),input,{...ctx,signal:req.signal})};
}
export function publicOpenApi(routes:Routes=compilePublicRoutes()){
 const paths:Record<string,Record<string,unknown>>={};
 for(const {command:c,path} of routes){
  const schema=z.toJSONSchema(c.parameters) as {properties:Record<string,unknown>;required?:string[]};
  const method=c.http.method.toLowerCase();
  const parameters=Object.entries(schema.properties).filter(([field])=>c.http.method==='GET'||field===c.http.identity).map(([field,type])=>({name:field,in:field===c.http.identity?'path':'query',required:field===c.http.identity||schema.required?.includes(field)||false,schema:type}));
  const operation={description:c.description,'x-aiwf-commands':[commandId(c)],parameters,responses:{'200':{description:'Canonical domain result, including preview, uncertainty and blockers'},'400':{description:'Invalid input'},'403':{description:'Denied'},'404':{description:'Not found'},'409':{description:'Stale or conflicting state'}},...(c.http.method!=='GET'?{requestBody:{required:false,content:{'application/json':{schema:z.toJSONSchema(c.http.identity?z.object(Object.fromEntries(Object.entries(c.parameters.shape).filter(([field])=>field!==c.http.identity))).strict():c.parameters)}}}}:{})};
  const prior=paths[path]?.[method] as typeof operation|undefined;
  paths[path]??={};
  paths[path]![method]=prior?{...prior,description:prior.description+'\n'+operation.description,'x-aiwf-commands':[...prior['x-aiwf-commands'],...operation['x-aiwf-commands']],parameters:prior.parameters.map(p=>({...p,required:false}))}:operation;
 }
 return {openapi:'3.1.0',info:{title:'AIWF registered public commands',version:'1'},security:[{workspaceToken:[]}],components:{securitySchemes:{workspaceToken:{type:'apiKey',in:'header',name:'x-aiwf-token'}}},paths};
}
