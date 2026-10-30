/**
 * Responsibility: Explicit public command contracts over registered domain owners.
 * Scope: One registration path for CLI, Shell UI, MCP and Workspace projections.
 */
import {z} from 'zod';
import {commandRegistry as r} from './registry.ts';
import {artifactBranches} from './product.ts';
import {reviewPublicProductChange} from '../product/links.ts';
import {reviewRuleChange} from './rules.ts';
import {formatConfigResult} from '../config-command.ts';
import {ChangeRequestSchema,DirtyTargetsSchema} from './change.ts';
import {TicketReadActionSchema} from './tickets.ts';
import {GraphPredicateActionSchema,GraphLinkActionSchema} from '../product/links.ts';
/** Complete domain bootstrap precedes this opt-in public declaration sweep. */
export function registerPublicCommands(){
 for(const [topic,subtopic,owner,schema] of [
  ['ticket',undefined,'ticket',TicketReadActionSchema],
  ['graph','predicate','graph.predicate',GraphPredicateActionSchema],
  ['graph','link','graph.link',GraphLinkActionSchema]
 ] as const)for(const option of schema.options){
  const action=option.shape.action.value;
  const parameters=(option as z.ZodObject).omit({action:true}).strict();
  const positionals=action==='check'?['sourceKind','predicate','targetKind']:action==='show'&&topic==='graph'?['sourceId','predicate','targetId']:topic==='ticket'&&action!=='list'?['ticketId']:[];
  r.registerCommand({topic,subtopic,action,description:r.get(owner)!.description,owner,bind:{action},parameters,positionals,
   flags:{sourceId:'source',targetId:'target'},exposure:['cli','shell','mcp','rest'],authority:'read-only',
   http:{method:action==='investigate'?'POST':'GET',...(topic==='ticket'&&action!=='list'?{identity:'ticketId'}:{}),...(subtopic==='link'?{queryIdentity:['sourceId','predicate','targetId']}:{})},
   ...(topic==='ticket'?{legacyMcp:action==='show'?['get_ticket','get_bug']:action==='list'?['list_tickets','list_bugs']:action==='investigate'?['investigate_ticket']:[]}:subtopic==='predicate'?{legacyMcp:action==='list'?[{name:'link',action:'allowed'}]:[]}:subtopic==='link'?{legacyMcp:action==='list'?[{name:'link',action:'inspect'}]:[]}:{})});
 }
 registerExistingCommands();
}

function registerExistingCommands(){
 const all=['cli','shell','mcp','rest'] as const;
 const add=(resource:string,action:string,owner:string,positionals:string[]=[],write=false,method:'GET'|'POST'|'PATCH'|'DELETE'='GET',aliases:string[]=[owner])=>{
  const [topic,subtopic]=resource.split(':');const tool=r.get(owner)!;
  if(!(tool.parameters instanceof z.ZodObject))throw Error('Expected object owner schema: '+owner);
  r.registerCommand({topic:topic!,subtopic,action,owner,description:tool.description,parameters:tool.parameters.strict(),positionals,
   exposure:[...all],authority:write?'project-write':'read-only',http:{method,...(positionals.length===1&&!['list','create','find','plan'].includes(action)?{identity:positionals[0]}:{})},legacyMcp:aliases});
 };
 // Definition reads and inert write proposals reuse the specialist Artifact owner and its exact field schemas.
 const resources:Record<string,string>={Product:'product:manifest',Goal:'product:goal',Concept:'product:concept',Flow:'product:journey',Feature:'product:feature',UserStory:'product:story',Aspect:'product:aspect',Module:'arch:module',Epic:'flow:epic',Decision:'product:decision',Idea:'product:idea'};
 const legacyReads:Record<string,[string,string]>={Product:['get_product',''],Goal:['get_goal','list_goals'],Concept:['get_concept','list_concepts'],Flow:['get_flow','list_flows'],Feature:['get_feature','list_features'],UserStory:['get_user_story','list_user_stories'],Aspect:['get_aspect','list_aspects'],Module:['get_module',''],Epic:['get_epic','list_epics'],Decision:['get_decision','list_decisions']};
 for(const branch of artifactBranches){
  const option=branch as z.ZodObject;const shape=option.shape;const kind=shape.kind instanceof z.ZodLiteral?shape.kind.value as string:undefined;
  const original=shape.action instanceof z.ZodLiteral?shape.action.value as string:undefined;
  if(!kind||!resources[kind]||!original)continue;
  // Decision authoring is conditional; read it without inventing an acceptance path.
  if(kind==='Decision'&&!['show','list'].includes(original)||kind==='Product'&&original==='list'||kind==='Module'&&original==='preview_retire')continue;
  const action=({preview_new:'create',preview_edit:'update',preview_retire:'retire'} as Record<string,string>)[original]??original;
  const [topic,subtopic]=resources[kind]!.split(':');
  let parameters=option.omit({action:true,kind:true}).strict();
  const aliases=original==='show'?legacyReads[kind]?.[0]:original==='list'?legacyReads[kind]?.[1]:undefined;
  const reader=original==='show'&&aliases?r.get(aliases):undefined;
  if(reader)parameters=(reader.parameters as z.ZodObject).strict();
  const positions=reader?Object.keys(parameters.shape).filter(field=>!parameters.shape[field]!.isOptional()):parameters.shape.id&&!parameters.shape.id.isOptional()?['id']:[];
  const moduleList=kind==='Module'&&original==='list';
  if(moduleList)parameters=(r.get('search_graph')!.parameters as z.ZodObject).pick({query:true,limit:true}).strict();
  r.registerCommand({topic:topic!,subtopic,action,owner:reader?aliases!:moduleList?'search_graph':'artifact',...(!reader&&!moduleList?{bind:{action:original,kind}}:{}),...(moduleList?{normalize:(input:Record<string,unknown>)=>({...input,entityType:'ModuleNode',limit:input.limit??25})}:{}),parameters,positionals:positions,
   description:(original.startsWith('preview_')?'Inert reviewed proposal; does not apply. ':'Bounded canonical definition. ')+kind+' '+action,
   exposure:[...all],authority:'read-only',http:{method:action==='create'?'POST':action==='update'?'PATCH':action==='retire'?'POST':'GET',...(positions.length===1?{identity:positions[0]}:{})},legacyMcp:[...(aliases?[aliases]:[]),{name:'artifact',action:original,kind}]});
 }
 for(const [resource,action,owner,id,write,method] of [
  ['ticket','create','create_ticket','',true,'POST'],['ticket','update','update_ticket','ticketId',true,'PATCH'],
  ['ticket','history','get_ticket_history','ticketId',false,'GET'],['ticket','claim','claim_ticket','ticketId',true,'POST'],['ticket','release','release_ticket','ticketId',true,'POST'],['ticket','move','update_ticket_state','ticketId',true,'POST'],
  ['ticket','prepare','prepare_ticket','ticketId',true,'POST'],['ticket','resolve','resolve_ticket','ticketId',true,'POST'],
  ['ticket:history','record','record_ticket_event','ticketId',true,'POST'],['ticket:history','condense','condense_ticket_history','ticketId',true,'POST'],
  ['flow','next','recommend_next_task','',false,'GET'],['project','metrics','get_performance_metrics','',false,'GET'],
  ['product:coverage','show','get_product_coverage','entityId',false,'GET'],['product:impact','analyze','get_product_impact','entityId',false,'POST'],
  ['product:aspect','applicable','get_applicable_aspects','entityId',false,'GET'],['product:aspect','assess','assess_aspects','entityId',false,'POST'],
  ['source:symbol','find','find_symbol','name',false,'GET'],['source:symbol','show','get_symbol_source','',false,'GET'],
  ['source:symbol','callers','get_exact_callers','filePath',false,'GET'],['source:symbol','references','get_exact_references','filePath',false,'GET'],
  ['source:file','read','read_workspace_file','filePath',false,'GET'],['source:file','outline','get_file_outline','filePath',false,'GET'],
  ['source:file','blast','analyze_blast_radius','target',false,'POST'],['graph:query','search','search_graph','',false,'GET'],
  ['test','target','resolve_test_target','filePath',false,'GET'],['test','triage','triage_test_failures','',true,'POST'],
  ['test:story','status','get_story_test_status','storyId',false,'GET'],['test:story','run','run_story_test','storyId',true,'POST'],
  ['test:story','prepare','prepare_story_test','',false,'POST'],['test:ticket','prepare','prepare_test_binding','',false,'POST'],
  ['rule','list','list_rules','',false,'GET'],['rule','show','get_rule','ruleId',false,'GET'],['rule','export','export_rules','',false,'GET'],['rule:change','preview','preview_rule_change','',false,'POST'],
  ['knowledge','find','search_knowledgebase','',false,'GET'],['knowledge','show','get_knowledge_item','id',false,'GET'],['knowledge:skill','find','find_skills','query',false,'GET'],
  ['git','status','get_git_status','',false,'GET'],['git','diff','get_git_diff','',false,'GET']
 ] as const)add(resource,action,owner,id?[id]:[],write,method);
 const ruleApply=r.get('apply_rule_change')!;
 r.registerCommand({topic:'rule',subtopic:'change',action:'apply',owner:'apply_rule_change',description:'Apply the exact Rule preview only after trusted host review.',parameters:(ruleApply.parameters as z.ZodObject).strict(),exposure:['cli','shell','rest'],authority:'project-write',http:{method:'POST'},review:reviewRuleChange});
 add('project','status','project_status');
 add('project','doctor','project_doctor',[],false,'POST');
 add('project','export','export_project',[],true,'POST');
 add('graph:index','refresh','refresh_graph_index',[],true,'POST');
 add('config','list','inspect_config');
 add('config','get','inspect_config',['key']);
 add('completeness','get','get_completeness_target',['entityId']);
 add('completeness','set','set_completeness_target',['entityId','level'],true,'POST');
 add('model','list','inspect_models');
 add('source:file','show','read_workspace_file',['filePath']);
 add('agent','exec','execute_shell_wish',['wish'],false,'POST');
 // Process owners produce inert delivery proposals; no resolver or decomposition redesign.
 add('flow','plan','plan_intent',['kind','id'],false,'POST',['process_epic','process_feature','process_story']);
 for(const action of ['preview','apply'] as const){
  const owner=action+'_change';const tool=r.get(owner)!;
  const parameters=action==='preview'?z.object({request:ChangeRequestSchema,ticketId:z.string().min(1).optional(),agentId:z.string().min(1).optional(),allowDirtyTargets:DirtyTargetsSchema}).strict():(tool.parameters as z.ZodObject).strict();
  r.registerCommand({topic:'source',subtopic:'change',action,owner,description:tool.description,parameters,positionals:['request'],flags:{ticketId:'ticket',agentId:'agent'},exposure:[...all],authority:action==='apply'?'project-write':'read-only',http:{method:'POST'},legacyMcp:[owner],
   ...(action==='preview'?{normalize:({request,...rest})=>({...request as Record<string,unknown>,...rest})}:{review:(input,ctx,confirm,respond)=>reviewPublicProductChange(input as Parameters<typeof reviewPublicProductChange>[0],ctx,confirm,respond)})});
 }
 const describe=artifactBranches[0] as z.ZodObject;
 r.registerCommand({topic:'artifact',action:'types',description:'Discover the existing typed Artifact schemas and owner boundaries.',owner:'artifact',bind:{action:'describe'},parameters:describe.omit({action:true}).strict(),exposure:[...all],authority:'read-only',http:{method:'GET'},mcpFamily:'artifact.discovery',legacyMcp:[{name:'artifact',action:'describe'}]});
 // Compatibility is attached to the canonical operations, never another public allowlist.
 const attach=(id:string,aliases:NonNullable<import('./registry.ts').CommandDefinition['legacyMcp']>)=>{
  const command=r.getCommands().find(c=>c.topic+(c.subtopic?':'+c.subtopic:'')+' '+c.action===id)!;
  command.legacyMcp=[...(command.legacyMcp??[]),...aliases];
 };
 const configCommands=r.getCommands().filter(c=>c.topic==='config');
 for(const command of configCommands)command.format=result=>formatConfigResult({rows:result as ReturnType<typeof import('../services/config-service.ts').inspectConfig>,mutated:false,scope:'project'});
 const completeness=r.getCommands().find(c=>c.topic==='completeness'&&c.action==='set')!;
 completeness.cliParse={level:value=>value==='clear'?null:value};
 attach('ticket create',['create_bug',{name:'artifact',action:'preview_new',kind:'Ticket'},{name:'artifact',action:'preview_new',kind:'Bug'}]);
 attach('ticket update',['update_bug',{name:'artifact',action:'preview_edit',kind:'Ticket'},{name:'artifact',action:'preview_edit',kind:'Bug'}]);
 attach('ticket show',[{name:'artifact',action:'show',kind:'Ticket'},{name:'artifact',action:'show',kind:'Bug'}]);
 attach('ticket list',[{name:'artifact',action:'list',kind:'Ticket'},{name:'artifact',action:'list',kind:'Bug'}]);
 attach('graph:link list',[{name:'link',action:'preview_add'},{name:'link',action:'preview_remove'}]);
 attach('test:story status',[{name:'verify',action:'show',kind:'story'},{name:'verify',action:'describe'}]);
 attach('source:file read',['search_workspace_text']);
 attach('test:story run',[{name:'verify',action:'run',kind:'story'}]);

}
