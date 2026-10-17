import { z } from 'zod';
import {Command,CommanderError,InvalidArgumentError,Option} from 'commander';
import {formatBuildInfo} from './version.ts';
import {LinkActionSchema,type LinkAction} from './product/links.ts';
import {normalizeLinkPayload} from './product/mutation.ts';
import {ParameterFacilitator} from '@dharmax/shell-ui';
import type {ToolContext} from './tools/index.ts';
import {facilitateEntityId, type EntityViewKind} from './entity-view.ts';
import { ArtifactTransportOptionsSchema, CompletenessSchema } from './artifact-policy.ts';

export const ARTIFACT_HELP = `Delegate artifact work first:
  resolve <ticketId>          Implement, test, repair and explicitly verify a Ticket
  prepare <ticketId>          Enrich/decompose only when necessary
  investigate <ticketId>      Obtain grounded read-only evidence
  process epic|feature|story <id>  Reconcile intent into reviewed useful work
  completeness get <id>       Read effective completeness and provenance
  completeness set <id> <poc|functional|advanced|production|clear>

Operation options: --completeness <level> --depth <N|all> --max-artifacts <N>
                   --critic <auto|none|configured-id> --tag <key=value> (repeatable)
Resolution options: --agent <id> --max-repairs <0..3> --allow-dirty-target <path> --authorize-file <ticketId=path>
Completeness on an operation is temporary. Persist it only with completeness set.
needs_input/blocked are results to inspect; Done requires explicit acceptance proof.
Use symbol/graph/slice/blast/change/test primitives for explicit drill-down.`;

/** Fill only missing identifiers in interactive shell; parsing and mutation remain canonical. */
export async function facilitateArtifactCommand(tokens: string[], ctx: ToolContext, facilitator: ParameterFacilitator): Promise<string[] | null> {
  const words = [...tokens];
  const offset = words[0]?.toLowerCase() === 'please' ? 1 : 0;
  const verb = words[offset]?.toLowerCase();
  let kind: EntityViewKind;
  let idIndex: number;
  if (verb === 'process') {
    if (!words[offset + 1] || words[offset + 1]!.startsWith('--')) {
      const values = await facilitator.facilitate({kind: {type: 'select', description: 'Product artifact kind', choices: ['epic', 'feature', 'story']}}, {}, {interactive: true});
      if (typeof values.kind !== 'string') return null;
      words.splice(offset + 1, 0, values.kind);
    }
    if (!['epic', 'feature', 'story'].includes(words[offset + 1]!)) return words;
    kind = words[offset + 1] as EntityViewKind;
    idIndex = offset + 2;
  } else if (['resolve', 'prepare', 'investigate', 'resolve_ticket', 'prepare_ticket', 'investigate_ticket'].includes(verb || '')) {
    kind = 'ticket';
    idIndex = offset + 1;
    if (words[idIndex]?.toLowerCase() === 'ticket') idIndex++;
  } else if (['process_epic', 'process_feature', 'process_story'].includes(verb || '')) {
    kind = verb!.slice(8) as EntityViewKind;
    idIndex = offset + 1;
  } else return words;
  if (!words[idIndex] || words[idIndex]!.startsWith('--')) {
    const id = await facilitateEntityId(ctx, kind, facilitator);
    if (!id) return null;
    words.splice(idIndex, 0, id);
  }
  return words;
}

export const LINK_HELP = `Governed relations:
  link types [SourceKind [TargetKind]]  Discover H/O/L modes and specialist owners
  links ID [--incoming|--outgoing] [--predicate NAME] [--limit 1..100] [--cursor TOKEN] [--json]
  link SOURCE to TARGET as PREDICATE [--note TEXT|--clear-note] [--yes]
  unlink SOURCE from TARGET as PREDICATE [--yes]
Default: exact preview, interactive human review; noninteractive preview is inert.
--yes confirms only this deterministic local operation. MCP/Actor cannot self-approve.
Notes are uninterpreted text, at most 4000 characters. O edges require their owner;
L edges can only be removed. Source/test identities require exact spelling.`;

/** Shell-only lexical pass: no expansion, substitution or evaluation. CLI passes argv directly. */
export function lexCommand(input: string): string[] {
  const tokens: string[]=[];
  let token='',quote: "'"|'"'|undefined,started=false;
  for(let i=0;i<input.length;i++) {
    const c=input[i]!;
    if(c==='\\'&&quote!=="'") {
      if(++i===input.length) throw Error('Invalid dangling escape.');
      token+=input[i];started=true;
    } else if(quote) {
      if(c===quote) quote=undefined; else token+=c;
    } else if(c==="'"||c==='"') {quote=c;started=true;}
    else if(/\s/.test(c)) {if(started) tokens.push(token);token='';started=false;}
    else {token+=c;started=true;}
  }
  if(quote) throw Error('Invalid unmatched quote.');
  if(started) tokens.push(token);
  return tokens;
}

export function isExplicitCommand(input:string):boolean {
  const [verb,...rest]=input.trim().split(/\s+/);
  const command=createCommandTree(()=>{},()=>{}).commands.find(command=>[command.name(),...command.aliases()].includes(verb!.toLowerCase()));
  if(rest.length && command?.registeredArguments.length===0) return true;
  return /^(?:please\s+)?(?:link|links|unlink|resolve|prepare|investigate|process|completeness|product|arch|work|verify|resolve_ticket|prepare_ticket|investigate_ticket|process_epic|process_feature|process_story)(?:[:\s]|$)/i.test(input.trim()) || /^(?:[^\s:]+:|help(?:\s|$))/i.test(input.trim());
}

export type NormalizedCommand =
  | {family:'link';tool:'link';args:LinkAction;yes:boolean}
  | {family:'help';tool:'help';args:{text:string}}
  | {family:'artifact';tool:string;args:Record<string,unknown>}
  | {family:'legacy';command:string;tokens:string[]};

function linkIntent(args: unknown, yes = false): NormalizedCommand {
  return {family:'link',tool:'link',yes,args:LinkActionSchema.parse(args)};
}

function artifactIntent(tool: string, id: string, input: Record<string, unknown>): NormalizedCommand {
  const {tag, authorizeFile, allowDirtyTarget, agent, ...options} = input;
  if(agent!==undefined) options.agentId=agent;
  if (tag) options.tags = Object.fromEntries((tag as string[]).map(value => {
    const split=value.indexOf('=');
    if(split<1 || split===value.length-1 || !/^[A-Za-z0-9_.-]+$/.test(value.slice(0,split))) throw Error('--tag requires key=value.');
    return [value.slice(0,split),value.slice(split+1)];
  }));
  if (authorizeFile) {
    const files: Record<string,string[]> = {};
    for(const value of authorizeFile as string[]) {
      const split=value.indexOf('=');
      if(split<1 || split===value.length-1) throw Error('--authorize-file requires ticketId=path; applies only to resolution.');
      (files[value.slice(0,split)]??=[]).push(value.slice(split+1));
    }
    options.authorizedFiles=files;
  }
  if(allowDirtyTarget) options.allowDirtyTargets=allowDirtyTarget;
  if(typeof options.critic==='string' && !['auto','none'].includes(options.critic)) options.critic={id:options.critic};
  const schema=ArtifactTransportOptionsSchema.extend({agentId:z.string().optional(),maxRepairs:z.number().int().min(0).max(3).optional(),allowDirtyTargets:z.array(z.string()).optional(),authorizedFiles:z.record(z.string(),z.array(z.string())).optional()}).strict();
  const key=tool.endsWith('_ticket')?'ticketId':tool==='process_epic'?'epicId':tool==='process_feature'?'featureId':'storyId';
  return {family:'artifact',tool,args:{[key]:id,...schema.parse(options)}};
}

function completenessIntent(entityId:string,level:string):NormalizedCommand {
  return {family:'artifact',tool:'set_completeness_target',args:{entityId,level:level.toLowerCase()==='clear'?null:CompletenessSchema.parse(level.toLowerCase())}};
}

/** One shared syntax tree. Actions only adapt parsed values into domain intent. */
export function createCommandTree(emit: (intent: NormalizedCommand) => void | Promise<void>, write: (text:string)=>void) {
  const root=new Command('aiwf').usage('<command> [options]').description('AI-Workflow 2.0')
    .exitOverride().configureOutput({writeOut:write,writeErr:()=>{}}).enablePositionalOptions();
  root.addHelpText('before', ARTIFACT_HELP+'\n');
  root.addHelpText('after', '\n'+LINK_HELP);
  const collect=(value:string,previous:string[]=[])=>[...previous,value];
  const lower=(value:string)=>value.toLowerCase();
  const operation=(command:Command,tool:string)=>{
    command.option('--completeness <level>','Temporary completeness',lower)
      .option('--depth <depth>','Expansion depth or all',value=>value.toLowerCase()==='all'?'all':Number(value))
      .option('--max-artifacts <count>','Maximum artifacts',Number)
      .option('--critic <id>','Critic selection',value=>['auto','none'].includes(value.toLowerCase())?value.toLowerCase():value)
      .option('--tag <key=value>','Metric tag (repeatable)',collect);
    if(tool==='resolve_ticket') command.option('--agent <id>','Agent ID')
      .option('--max-repairs <count>','Repair bound',Number)
      .option('--allow-dirty-target <path>','Authorized dirty path (repeatable)',collect)
      .option('--authorize-file <ticket=path>','Authorized scope (repeatable)',collect);
    command.action((id:string,opts:Record<string,unknown>)=>emit(artifactIntent(tool,id,opts)));
  };
  for(const verb of ['resolve','prepare','investigate']) {
    const tool=verb+'_ticket';
    const command=root.command(verb+' <id>').alias(tool).description(verb+' a Ticket');
    operation(command,tool);
    operation(command.command('ticket <id>',{hidden:true}),tool);
  }
  const process=root.command('process').description('Reconcile reviewed Product intent');
  for(const kind of ['epic','feature','story']) {
    operation(process.command(kind+' <id>'),'process_'+kind);
    operation(root.command('process_'+kind+' <id>',{hidden:true}),'process_'+kind);
  }
  const completeness=root.command('completeness').description('Read or set artifact completeness');
  completeness.command('get <id>').action((entityId:string)=>emit({family:'artifact',tool:'get_completeness_target',args:{entityId}}));
  completeness.command('set <id> <level>').action((entityId:string,level:string)=>emit(completenessIntent(entityId,level)));

  const link=root.command('link <source> <to> <target> <as> <predicate>').description('Preview a governed relation')
    .addOption(new Option('--note <text>','Replace relation rationale').conflicts('clearNote'))
    .addOption(new Option('--clear-note','Clear rationale, preserving the edge').conflicts('note'))
    .option('--yes','Confirm this exact local deterministic operation');
  link.addHelpText('after','\n'+LINK_HELP);
  link.action((sourceId:string,to:string,targetId:string,as:string,predicate:string,opts:{note?:string;clearNote?:boolean;yes?:boolean})=>{
    if(to.toLowerCase()!=='to'||as.toLowerCase()!=='as') throw new InvalidArgumentError('Usage: link SOURCE to TARGET as PREDICATE');
    return emit(linkIntent({action:'preview_add',sourceId,targetId,predicate:predicate.toLowerCase(),idMatch:'human',
      ...(opts.note!==undefined?{payload:normalizeLinkPayload({note:opts.note})}:opts.clearNote?{payload:{}}:{})},opts.yes));
  });
  link.command('types [sourceKind] [targetKind]').description('Discover H/O/L relations and owning operations').action((sourceKind?:string,targetKind?:string)=>{
    if(Object.keys(link.opts()).length) throw new InvalidArgumentError('link types cannot combine with mutation flags.');
    const kind=(value:string|undefined)=>value===undefined?undefined:LinkActionSchema.options[0].shape.sourceKind.unwrap().options.find(k=>k.toLowerCase()===value.toLowerCase())??value;
    return emit(linkIntent({action:'allowed',sourceKind:kind(sourceKind),targetKind:kind(targetKind)}));
  });
  root.command('unlink <source> <from> <target> <as> <predicate>').description('Preview relation removal; endpoints remain')
    .option('--yes','Confirm this exact local deterministic operation')
    .action((sourceId:string,from:string,targetId:string,as:string,predicate:string,opts:{yes?:boolean})=>{
      if(from.toLowerCase()!=='from'||as.toLowerCase()!=='as') throw new InvalidArgumentError('Usage: unlink SOURCE from TARGET as PREDICATE');
      return emit(linkIntent({action:'preview_remove',sourceId,targetId,predicate:predicate.toLowerCase(),idMatch:'human'},opts.yes));
    });
  root.command('links <id>').description('Inspect bounded incoming/outgoing relations')
    .addOption(new Option('--incoming','Incoming only').conflicts('outgoing'))
    .addOption(new Option('--outgoing','Outgoing only').conflicts('incoming'))
    .option('--predicate <name>','Filter predicate',lower).option('--limit <count>','Page size',Number)
    .option('--cursor <token>','Continue a page').option('--json','JSON output')
    .action((id:string,opts:{incoming?:boolean;outgoing?:boolean;predicate?:string;limit?:number;cursor?:string})=>
      emit(linkIntent({action:'inspect',id,idMatch:'human',direction:opts.incoming?'incoming':opts.outgoing?'outgoing':'both',
        ...(opts.predicate!==undefined?{predicate:opts.predicate}:{}),...(opts.limit!==undefined?{limit:opts.limit}:{}),...(opts.cursor!==undefined?{cursor:opts.cursor}:{})})));
  const productCmd = root.command('product').description('Read or export Product definitions');
  productCmd.command('show').description('Show Product charter definition')
    .action(() => emit({family: 'artifact', tool: 'get_product', args: {}}));
  productCmd.command('export').description('Export product manifest and authored snapshot')
    .action(() => emit({family: 'legacy', command: 'product-export', tokens: []}));
  productCmd.command('goal').description('Existing Goal reader').command('show <id>')
    .action((id:string)=>emit({family:'artifact',tool:'get_goal',args:{id}}));
  const productFeature = productCmd.command('feature').description('Product Feature operations');
  productFeature.command('show <id>').description('Show detailed Feature definition')
    .action((id:string)=>emit({family:'artifact',tool:'get_feature',args:{featureId:id}}));
  productFeature.command('list').description('List Features')
    .action(()=>emit({family:'artifact',tool:'list_features',args:{}}));
  // Commander owns syntax for ordinary reads/lifecycle entrypoints too.
  for(const signature of ['sync','status','doctor','audit','init','diff','index','shell','mcp',
    'tickets [lane]','epics [status]','ticket <id>','epic <id>','feature <id>','story <id>',
    'features [status]','stories [status]','coverage <id>','impact <id>','next [agent]',
    'release <ticketId>','done <ticketId>','move <ticketId> <lane...>',
    'callers <symbol>','deps <file>','slice <file> <symbol>','outline <file>','blast <target>',
    'debug <target>','scaffold <path> [description...]','workspace [port]']) {
    const command=root.command(signature).description(signature.split(' ')[0]!+' operation');
    command.action(()=>emit({family:'legacy',command:command.name(),tokens:command.args}));
  }
  // Retain the established argument owners for specialist grammars, not a second parser here.
  for(const name of ['triage','product-change','metrics','setup','epic-create','epic-add','create','new',
    'claim','symbol','graph','patch','rule','config','exec','eval','model','kb']) {
    root.command(name+' [args...]').description(name+' operation').allowUnknownOption()
      .action((tokens:string[])=>emit({family:'legacy',command:name,tokens}));
  }
  root.version(formatBuildInfo('AIWF'),'-V, --version');
  root.command('version').action(()=>emit({family:'help',tool:'help',args:{text:formatBuildInfo('AIWF')}}));
  // Commander passes the previous option value to argParser, including for booleans.
  const configure=(command:Command)=>{
    command.allowExcessArguments(false);
    for(const option of command.options) if(!['tag','allow-dirty-target','authorize-file'].includes(option.name())) {
      const parse=option.parseArg;
      option.argParser((value,previous:unknown)=>{
        if(previous!==undefined) throw new InvalidArgumentError(`Duplicate option '${option.flags}'.`);
        return parse?parse(value,previous):value;
      });
    }
    for(const child of command.commands) configure(child);
  };
  configure(root);
  return root;
}

/** Only case/namespace normalization; Commander remains the argument grammar owner. */
function commandTokens(tokens:string[],root:Command):string[] {
  const words=[...tokens];
  if(words[0]?.toLowerCase()==='please') words.shift();
  if(words[0]?.includes(':')) words.splice(0,1,...words[0].split(':'));
  let command=root,positional=false;
  if(words[0]?.toLowerCase()==='help') {words.shift();words.push('--help');}
  for(let i=0;i<words.length;i++) {
    const token=words[i]!;
    if(token==='--') break;
    if(token.startsWith('-')) {
      const equal=token.indexOf('='),flag=(equal<0?token:token.slice(0,equal)).toLowerCase();
      const canonical=flag==='--maxartifacts'?'--max-artifacts':flag;
      const option=command.options.find(o=>o.long?.toLowerCase()===canonical||o.short===canonical);
      if(option||['--help','-h'].includes(canonical)) words[i]=canonical+(equal<0?'':token.slice(equal));
      if(option?.required&&equal<0) {
        const next=words[i+1]?.toLowerCase();
        if(next&&([...command.options.map(o=>o.long),'--help','-h'].includes(next))) throw new InvalidArgumentError(`Missing value for '${canonical}'.`);
        i++;
      }
    } else if(!positional) {
      const child=command.commands.find(c=>[c.name(),...c.aliases()].includes(token.toLowerCase()));
      if(child) {words[i]=token.toLowerCase();command=child;} else positional=true;
    }
  }
  return words;
}

export async function parseCommand(tokens:string[]):Promise<NormalizedCommand> {
  let intent:NormalizedCommand|undefined,output='';
  const tree=createCommandTree(value=>{intent=value;},text=>{output+=text;});
  try {await tree.parseAsync(commandTokens(tokens,tree),{from:'user'});}
  catch(error) {
    if(error instanceof CommanderError&&error.exitCode===0) return {family:'help',tool:'help',args:{text:output}};
    throw error;
  }
  if(!intent) return {family:'help',tool:'help',args:{text:output||tree.helpInformation()}};
  return intent;
}

/** Actor adaptation strips local confirmation; it can only obtain a link preview. */
export async function artifactCommand(tokens:string[]):Promise<{tool:string;args:Record<string,unknown>}|null> {
  if(!isExplicitCommand(tokens.join(' '))) return null;
  const command=await parseCommand(tokens);
  return command.family==='artifact'||command.family==='link'?{tool:command.tool,args:command.args}:null;
}
