import {PrioritySchema} from './graph/types.ts';
import { z } from 'zod';
import {ChangeRequestSchema} from './tools/change.ts';
import {TestBindingSpecificationSchema} from './graph/test-proof-types.ts';
import {Command,CommanderError,InvalidArgumentError,Option} from 'commander';
import {formatBuildInfo} from './version.ts';
import {CONFIG_HELP} from './config-command.ts';
import {TicketDefectSchema} from './graph/ticket-state.ts';
import {LinkActionSchema,type LinkAction,type DefinitionReviewInput} from './product/links.ts';
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
Resolution options: --agent <id> --verify-only --max-repairs <0..3> --allow-dirty-target <path> --authorize-file <ticketId=path>
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
  if(command && (command.name()==='next' || rest.some(token=>token.toLowerCase()==='--help'||token.toLowerCase()==='-h') || command.commands.some(child=>[child.name(),...child.aliases()].includes(rest[0]?.toLowerCase()??'')))) return true;
  if(rest.length && command?.registeredArguments.length===0) return true;
  return /^(?:please\s+)?(?:story-test|bug|bugs|link|links|unlink|resolve|prepare|investigate|process|completeness|product-change|product|arch|work|verify|resolve_ticket|prepare_ticket|investigate_ticket|process_epic|process_feature|process_story)(?:[:\s]|$)/i.test(input.trim()) || /^(?:[^\s:]+:|help(?:\s|$))/i.test(input.trim());
}

export type NormalizedCommand =
  | {family:'link';tool:'link';args:LinkAction;yes:boolean}
  | {family:'definition';input:DefinitionReviewInput;yes:boolean}
  | {family:'help';tool:'help';args:{text:string}}
  | {family:'artifact';tool:string;args:Record<string,unknown>;reviewFingerprint?:string}
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
  const schema=ArtifactTransportOptionsSchema.extend({agentId:z.string().optional(),verifyOnly:z.boolean().optional(),maxRepairs:z.number().int().min(0).max(3).optional(),allowDirtyTargets:z.array(z.string()).optional(),authorizedFiles:z.record(z.string(),z.array(z.string())).optional()}).strict();
  const key=tool.endsWith('_ticket')?'ticketId':tool==='process_epic'?'epicId':tool==='process_feature'?'featureId':'storyId';
  return {family:'artifact',tool,args:{[key]:id,...schema.parse(options)}};
}

function completenessIntent(entityId:string,level:string):NormalizedCommand {
  return {family:'artifact',tool:'set_completeness_target',args:{entityId,level:level.toLowerCase()==='clear'?null:CompletenessSchema.parse(level.toLowerCase())}};
}

/** One shared syntax tree. Actions only adapt parsed values into domain intent. */
export function createCommandTree(emit: (intent: NormalizedCommand) => void | Promise<void>, write: (text:string)=>void) {
  const root=new Command('aiwf').usage('<topic[:sub-topic]> <VERB> [options]').description('AI-Workflow 2.0')
    .exitOverride().configureOutput({writeOut:write,writeErr:()=>{}}).enablePositionalOptions();
  root.addHelpText('before', ARTIFACT_HELP+'\n');
  root.addHelpText('after', '\n'+LINK_HELP);
  root.addHelpText('after', '\nEngineering: source:change PREVIEW|APPLY <request-json> --ticket <id> --agent <id> [--fingerprint <hash>]\nNamespace forms are equivalent: source:change PREVIEW / source change PREVIEW.\nShell uses the same grammar without aiwf. Typed MCP tools take semantic parameters, never command strings.\n');
  const collect=(value:string,previous:string[]=[])=>[...previous,value];
  const lower=(value:string)=>value.toLowerCase();
  const operation=(command:Command,tool:string,kind?:'bug')=>{
    command.option('--completeness <level>','Temporary completeness',lower)
      .option('--depth <depth>','Expansion depth or all',value=>value.toLowerCase()==='all'?'all':Number(value))
      .option('--max-artifacts <count>','Maximum artifacts',Number)
      .option('--critic <id>','Critic selection',value=>['auto','none'].includes(value.toLowerCase())?value.toLowerCase():value)
      .option('--tag <key=value>','Metric tag (repeatable)',collect);
    if(tool==='resolve_ticket') command.option('--agent <id>','Agent ID')
      .option('--verify-only','Verify existing work without implementation or source repair')
      .option('--max-repairs <count>','Repair bound',Number)
      .option('--allow-dirty-target <path>','Authorized dirty path (repeatable)',collect)
      .option('--authorize-file <ticket=path>','Authorized scope (repeatable)',collect);
    command.action((id:string,opts:Record<string,unknown>)=>{
      const intent=artifactIntent(tool,id,opts);
      if(kind && intent.family==='artifact') intent.args.kind=kind;
      return emit(intent);
    });
  };
  for(const verb of ['resolve','prepare','investigate']) {
    const tool=verb+'_ticket';
    const command=root.command(verb+' <id>').alias(tool).description(verb+' a Ticket');
    operation(command,tool);
    operation(command.command('ticket <id>',{hidden:true}),tool);
  }
  const source = root.command('source').description('Investigate source and preview guarded engineering changes');
  const file = source.command('file').description('Inspect exact workspace files');
  file.command('show <filePath>').action((filePath: string) => emit({family: 'artifact', tool: 'read_workspace_file', args: {filePath}}));
  file.command('outline <filePath>').action((filePath: string) => emit({family: 'artifact', tool: 'get_file_outline', args: {filePath}}));
  const symbol = source.command('symbol').description('Inspect fresh symbols and references');
  symbol.command('find <name>').option('--file <path>', 'File filter').option('--exact', 'Exact name')
    .action((name: string, opts: {file?: string; exact?: boolean}) => emit({family: 'artifact', tool: 'find_symbol', args: {name, ...(opts.file ? {filePath: opts.file} : {}), ...(opts.exact ? {exact: true} : {})}}));
  symbol.command('show <filePath> <symbolName>').action((filePath: string, symbolName: string) => emit({family: 'artifact', tool: 'get_symbol_source', args: {filePath, symbolName}}));
  const change = source.command('change').description('Use the Causal Change Engine');
  for (const action of ['preview', 'apply']) {
    const command = change.command(action + ' <request>').description(action + ' a typed JSON source change')
      .requiredOption('--ticket <id>', 'Owning Ticket')
      .requiredOption('--agent <id>', 'Owning lease agent');
    if (action === 'apply') command.requiredOption('--fingerprint <hash>', 'Exact preview fingerprint');
    command.action((json: string, opts: {ticket: string; agent: string; fingerprint?: string}) => {
      const request = ChangeRequestSchema.parse(JSON.parse(json));
      return emit({family: 'artifact', tool: action + '_change', args: {
        ...(action === 'preview' ? request : {request, fingerprint: opts.fingerprint}),
        ticketId: opts.ticket, agentId: opts.agent
      }});
    });
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
  const bugCommands = (parent: Command) => {
    const report = (command: Command, create: boolean) => {
      if (create) command.option('--id <id>', 'Stable Ticket ID').requiredOption('--title <text>', 'Observed defect title');
      else command.option('--title <text>', 'Observed defect title');
      command.option('--body <text>', 'Context and diagnostic bounds')
        .addOption(new Option('--priority <priority>', 'Integer 0-5; default 2; lower ranks first').argParser(value => PrioritySchema.parse(value.trim() ? Number(value) : NaN)))
        .option('--criterion <text>', 'Acceptance criterion (repeatable)', collect);
      for (const key of ['reproduction','expected','actual','impact','environment'])
        command.option(`--${key} <text>`, `Defect ${key}; omitted fields remain unknown`);
      command.addOption(new Option('--severity <severity>', 'Observed defect severity').choices(TicketDefectSchema.shape.severity.unwrap().options))
        .option('--evidence <path-or-url>', 'Evidence reference (repeatable); never proof by itself', collect);
      const dispatch = (id: string | undefined, opts: Record<string, unknown>) => {
        const {reproduction,expected,actual,impact,environment,severity,evidence,criterion,...fields}=opts;
        const defect=Object.fromEntries(Object.entries({reproduction,expected,actual,impact,environment,severity,evidence}).filter(([,value])=>value!==undefined));
        return emit({family:'artifact',tool:create?'create_bug':'update_bug',args:{...fields,...(id?{ticketId:id}:{}),
          ...(criterion?{acceptanceCriteria:criterion}:{}),...(Object.keys(defect).length?{defect}:{})}});
      };
      if(create) command.action((opts:Record<string,unknown>)=>dispatch(undefined,opts));
      else command.action((id:string,opts:Record<string,unknown>)=>dispatch(id,opts));
    };
    report(parent.command('new').aliases(['report','create']).description('Report a Bug; unknown fields remain unknown'),true);
    report(parent.command('edit <id>').description('Complete a report in place, preserving identity and unspecified fields'),false);
    parent.command('show <id>').description('Read a Bug; a task ID is refused')
      .action((ticketId:string)=>emit({family:'artifact',tool:'get_bug',args:{ticketId}}));
    parent.command('triage <id>').alias('history').description('Inspect readiness, dependencies, relations and verification evidence')
      .option('--agent <id>','Agent for claim eligibility')
      .action((ticketId:string,opts:{agent?:string})=>emit({family:'artifact',tool:'triage_bug',args:{ticketId,agentId:opts.agent}}));
    parent.command('list').description('Filter canonical Bugs')
      .option('--lane <lane>','Kanban lane').option('--severity <severity>','Observed severity').option('--query <text>','Find ID/title/context')
      .action((args:Record<string,unknown>)=>emit({family:'artifact',tool:'list_bugs',args}));
    parent.command('start <id>').description('Recheck readiness and prerequisites, claim and activate linked Story tests')
      .option('--agent <id>','Leasing agent').option('--minutes <number>','Lease duration',Number)
      .action((ticketId:string,opts:{agent?:string;minutes?:number})=>emit({family:'artifact',tool:'bug_action',args:{action:'start',ticketId,agentId:opts.agent,durationMinutes:opts.minutes}}));
    for(const action of ['release','block','reopen','cancel']) parent.command(action+' <id>')
      .description(action === 'cancel' ? 'Reject work into Backlog; preserve existing proof history' : action+' through the existing Ticket lifecycle')
      .action((ticketId:string)=>emit({family:'artifact',tool:'bug_action',args:{action,ticketId}}));
    for(const action of ['resolve','prepare','investigate']) operation(parent.command(action+' <id>').description(action+' this Bug through the existing Ticket owner'),action+'_ticket','bug');
    parent.addHelpText('after', '\nUse link BUG to EXISTING as addresses|implements|targets|modifies|depends_on --yes for reviewed relations.\nPartial reports cannot start or resolve. Priority is explicit; title words do not classify work.');
  };
  bugCommands(root.command('bug').description('Report, triage and execute a typed Bug on the existing Ticket lifecycle'));
  bugCommands(root.command('work').description('Work artifact operations').command('bug').description('First-class Bug operations'));
  root.command('bugs').description('List/filter canonical Bugs')
    .option('--lane <lane>','Kanban lane').option('--severity <severity>','Observed severity').option('--query <text>','Find ID/title/context')
    .action((args:Record<string,unknown>)=>emit({family:'artifact',tool:'list_bugs',args}));
  const testBinding=root.command('test-binding').description('Review existing TestNode evidence for a technical Ticket; no fabricated Story or test');
  for(const action of ['prepare','apply']) {
    const command=testBinding.command(action+' <specification-json>').description('Use the typed Test binding specification shared with MCP');
    if(action==='apply')command.requiredOption('--fingerprint <hash>','Exact current preview fingerprint').requiredOption('--yes','Confirm this exact local proof-meaning review');
    command.action((json:string,opts:{fingerprint?:string})=>emit({family:'artifact',tool:action==='prepare'?'prepare_test_binding':'apply_test_binding',
      args:{specification:TestBindingSpecificationSchema.parse(JSON.parse(json)),...(action==='apply'?{fingerprint:opts.fingerprint,decision:'accept'}:{})},
      ...(action==='apply'?{reviewFingerprint:opts.fingerprint}:{})}));
  }
  const storyTest=root.command('story-test').description('Review/materialize a public-interface Story test and inspect/run its lifecycle');
  for(const action of ['status','run']) storyTest.command(action+' <storyId>')
    .description(action==='status'?'Show uncovered/skipped/red/green/blocked/stale evidence':'Execute the active reviewed Story test; infrastructure failure is not expected red')
    .action((storyId:string)=>emit({family:'artifact',tool:action==='status'?'get_story_test_status':'run_story_test',args:{storyId}}));
  for(const action of ['prepare','apply']) {
    const command=storyTest.command(action+' <storyId>').description(action==='prepare'?'Preview actual source and canonical test basis; no writes':'Apply only an explicitly reviewed current test specification')
      .requiredOption('--file <path>','Project-relative .test.ts path')
      .requiredOption('--fixture <path>','Existing executable public-interface fixture')
      .requiredOption('--interface <name>','Exported fixture entry point invoked as subject')
      .requiredOption('--body <javascript>','Executable test body that calls subject and asserts observable behavior');
    if(action==='apply') command.requiredOption('--fingerprint <hash>','Exact current prepare fingerprint')
      .requiredOption('--yes','Confirm this exact local test review; never Product intent');
    command.action((storyId:string,opts:{file:string;fixture:string;interface:string;body:string;fingerprint?:string})=>
      emit({family:'artifact',tool:action==='prepare'?'prepare_story_test':'apply_story_test',args:{
        specification:{storyId,filePath:opts.file,fixturePath:opts.fixture,interfaceName:opts.interface,body:opts.body},
        ...(action==='apply'?{fingerprint:opts.fingerprint,decision:'accept'}:{})}}));
  }
  storyTest.addHelpText('after','\nMaterialized tests are skipped until claim/start activates them. A missing fixture is uncovered.\nIf apply reports file-created-unlinked, prepare and review the same identity again before applying.');
  const productCmd = root.command('product').description('Read, author, or export Product definitions');
  productCmd.command('show').description('Show Product charter definition')
    .action(() => emit({family: 'artifact', tool: 'get_product', args: {}}));
  productCmd.command('define').description('Define Product charter')
    .option('--title <text>', 'Product title')
    .option('--purpose <text>', 'Product purpose')
    .option('--scope <text>', 'Product scope')
    .option('--actor <name>', 'Add actor', (v, prev: string[] = []) => [...prev, v])
    .option('--non-goal <text>', 'Add non-goal', (v, prev: string[] = []) => [...prev, v])
    .option('--bounds <text>', 'Product bounds')
    .option('--status <status>', 'Product status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((opts: any) => {
      const { yes, actor, nonGoal, ...rest } = opts;
      const fields: Record<string, unknown> = { ...rest };
      if (actor) fields.actors = actor;
      if (nonGoal) fields.nonGoals = nonGoal;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Product', id: 'PRODUCT', create: true, fields }
      });
    });
  productCmd.command('edit').description('Edit Product charter')
    .option('--title <text>', 'Product title')
    .option('--purpose <text>', 'Product purpose')
    .option('--scope <text>', 'Product scope')
    .option('--actor <name>', 'Add actor', (v, prev: string[] = []) => [...prev, v])
    .option('--non-goal <text>', 'Add non-goal', (v, prev: string[] = []) => [...prev, v])
    .option('--bounds <text>', 'Product bounds')
    .option('--status <status>', 'Product status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((opts: any) => {
      const { yes, actor, nonGoal, ...rest } = opts;
      const fields: Record<string, unknown> = { ...rest };
      if (actor) fields.actors = actor;
      if (nonGoal) fields.nonGoals = nonGoal;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Product', id: 'PRODUCT', create: false, fields }
      });
    });
  productCmd.command('export').description('Export product manifest and authored snapshot')
    .action(() => emit({family: 'legacy', command: 'product-export', tokens: []}));

  productCmd.addHelpText('after', '\nNew definitions and edits are inert previews by default. Review before local --yes.\nUse product story new --help for the complete scenario; process story derives inert work proposals.\nFind source Modules with arch module list; inspect or revise their purpose with arch module show|edit <id>.\nA preview is unsaved. Have the developer review and apply new definitions before relating them.');
  const productGoal = productCmd.command('goal').description('Goal operations');
  productGoal.command('list').description('List canonical Goals').action(()=>emit({family:'artifact',tool:'list_goals',args:{}}));
  productGoal.command('show <id>').description('Existing Goal reader')
    .action((id:string)=>emit({family:'artifact',tool:'get_goal',args:{id}}));
  productGoal.command('new').description('Create a new Goal')
    .requiredOption('--id <id>', 'Goal ID')
    .requiredOption('--title <text>', 'Goal title')
    .option('--body <text>', 'Goal rationale')
    .option('--status <status>', 'Goal status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((opts: any) => {
      const { id, yes, ...fields } = opts;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Goal', id, create: true, fields }
      });
    });
  productGoal.command('edit <id>').description('Edit an existing Goal')
    .option('--title <text>', 'Goal title')
    .option('--body <text>', 'Goal rationale')
    .option('--status <status>', 'Goal status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((id: string, opts: any) => {
      const { yes, ...fields } = opts;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Goal', id, create: false, fields }
      });
    });

  const productFeature = productCmd.command('feature').description('Product Feature operations');
  productFeature.command('show <id>').description('Show detailed Feature definition')
    .action((id:string)=>emit({family:'artifact',tool:'get_feature',args:{featureId:id}}));
  productFeature.command('list').description('List Features')
    .action(()=>emit({family:'artifact',tool:'list_features',args:{}}));
  productFeature.command('new').description('Create a new Feature')
    .requiredOption('--id <id>', 'Feature ID')
    .requiredOption('--title <text>', 'Feature title')
    .option('--body <text>', 'Feature responsibility')
    .option('--status <status>', 'Feature status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((opts: any) => {
      const { id, yes, outcome, behavioralRule, ...fields } = opts;
      if(outcome) fields.outcomes=outcome;
      if(behavioralRule) fields.behavioralRules=behavioralRule;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Feature', id, create: true, fields }
      });
    });
  productFeature.command('edit <id>').description('Edit an existing Feature')
    .option('--title <text>', 'Feature title')
    .option('--body <text>', 'Feature responsibility')
    .option('--status <status>', 'Feature status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((id: string, opts: any) => {
      const { yes, outcome, behavioralRule, ...fields } = opts;
      if(outcome) fields.outcomes=outcome;
      if(behavioralRule) fields.behavioralRules=behavioralRule;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Feature', id, create: false, fields }
      });
    });

  for(const command of productFeature.commands.filter(command=>['new','edit'].includes(command.name()))) command
    .option('--scope <text>','Feature scope').option('--boundaries <text>','Feature boundaries')
    .option('--outcome <text>','Observable outcome (repeatable)',collect)
    .option('--behavioral-rule <text>','Behavioral rule (repeatable)',collect);
  for (const spec of [
    {name:'epic',kind:'Epic' as const,read:'get_epic',list:'list_epics',key:'epicId',fields:['title','body','status']},
    {name:'concept',kind:'Concept' as const,read:'get_concept',list:'list_concepts',key:'id',fields:['title','body','status']},
    {name:'decision',kind:'Decision' as const,read:'get_decision',list:'list_decisions',key:'id',fields:['title','decision','context','consequences','status']},
    {name:'flow',kind:'Flow' as const,read:'get_flow',list:'list_flows',key:'id',fields:['title','body','actor','context','status']},
    {name:'aspect',kind:'Aspect' as const,read:'get_aspect',list:'list_aspects',key:'id',fields:['title','body','status']},
    {name:'story',kind:'UserStory' as const,read:'get_user_story',list:'list_user_stories',key:'storyId',fields:['title','actor','intent','initialState','action','expectedResult','exceptions','bounds','status']}
  ]) {
    const parent=productCmd.command(spec.name).description(`Read or review ${spec.kind} definitions`);
    parent.command('show <id>').description('Show current canonical definition').action((id:string)=>emit({family:'artifact',tool:spec.read,args:{[spec.key]:id}}));
    parent.command('list').description('List canonical definitions').action(()=>emit({family:'artifact',tool:spec.list,args:{}}));
    for (const create of [true,false]) {
      const command=parent.command(create?'new':'edit <id>').description(create?'Preview a new definition':'Preview an in-place revision');
      if (create) command.requiredOption('--id <id>','Stable canonical ID').requiredOption('--title <text>','Definition title');
      else command.option('--title <text>','Definition title');
      for(const field of spec.fields.filter(field=>field!=='title'))
        command.option('--'+field.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+' <text>',field);
      if(spec.kind==='UserStory' || spec.kind==='Aspect') command.option('--criterion <text>','Observable acceptance criterion (repeatable)',collect);
      command.option('--yes','Confirm this exact local reviewed revision');
      const dispatch=(id:string,opts:Record<string,unknown>)=>{
        const {yes,criterion,...fields}=opts;
        if(criterion) fields.acceptanceCriteria=criterion;
        return emit({family:'definition',yes:!!yes,input:{kind:spec.kind,id,create,fields}});
      };
      if(create) command.action((opts:Record<string,unknown>)=>{const {id,...fields}=opts;return dispatch(String(id),fields);});
      else command.action((id:string,opts:Record<string,unknown>)=>dispatch(id,opts));
    }
  }

  const archCmd = root.command('arch').description('Discover indexed Modules and review their intent');
  const archModule = archCmd.command('module').description('Architecture module operations');
  archModule.command('list').description('Discover indexed Modules through the existing source graph')
    .option('--query <text>','Literal Module search').option('--limit <count>','Maximum results (1–100)',Number)
    .action((opts:{query?:string;limit?:number})=>{
      const limit=z.number().int().min(1).max(100).parse(opts.limit??25);
      emit({family:'artifact',tool:'search_graph',args:{entityType:'ModuleNode',query:opts.query,limit}});
    });
  archModule.command('show <id>').description('Show exact Module intent and indexed source availability')
    .action((moduleId:string)=>emit({family:'artifact',tool:'get_module',args:{moduleId}}));
  archModule.command('edit <id>').description('Edit Module Intent')
    .option('--body <text>', 'Module purpose')
    .option('--responsibility <text>', 'Add responsibility', (v, prev: string[] = []) => [...prev, v])
    .option('--boundaries <text>', 'Module boundaries')
    .option('--status <status>', 'Module intent status')
    .option('--yes', 'Confirm and apply definition change directly')
    .action((id: string, opts: any) => {
      const { yes, responsibility, status, ...rest } = opts;
      const fields: Record<string, unknown> = { ...rest };
      if (status !== undefined) fields.intentStatus = status;
      if (responsibility) fields.responsibilities = responsibility;
      emit({
        family: 'definition',
        yes: Boolean(yes),
        input: { kind: 'Module', id, create: false, fields }
      });
    });
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
  const ticketCommand=root.commands.find(command=>command.name()==='ticket')!;
  ticketCommand.command('show <id>').description('Show canonical Ticket, dependencies and current verification receipt')
    .action((ticketId:string)=>emit({family:'artifact',tool:'get_ticket',args:{ticketId}}));
  ticketCommand.command('history <id>').description('Read original journal entries by Ticket ID')
    .option('--limit <count>','Page size').option('--after <id>','Journal cursor')
    .action((ticketId:string,opts:{limit?:string;after?:string})=>emit({family:'artifact',tool:'get_ticket_history',args:{ticketId,...opts,limit:Number(opts.limit??100)}}));
  ticketCommand.command('condense <id>').description('Replace the compact history summary; retain original entries')
    .action((ticketId:string)=>emit({family:'artifact',tool:'condense_ticket_history',args:{ticketId}}));
  ticketCommand.command('record <id>').description('Record execution history with references, keeping the work specification concise')
    .requiredOption('--kind <kind>','decision, action, failure, correction or outcome').requiredOption('--message <text>','Meaningful event')
    .option('--reference <id-or-path>','Evidence reference (repeatable)',collect)
    .action((ticketId:string,opts:{kind:string;message:string;reference?:string[]})=>emit({family:'artifact',tool:'record_ticket_event',args:{ticketId,kind:opts.kind,message:opts.message,references:opts.reference??[]}}));
  ticketCommand.command('list').description('Filter canonical work by kind, lane and text')
    .option('--kind <kind>','task or bug').option('--lane <lane>','Kanban lane').option('--query <text>','Find ID/title/body')
    .action((args:Record<string,unknown>)=>emit({family:'artifact',tool:'list_tickets',args}));
  for(const create of [true,false]) {
    const command=ticketCommand.command(create?'new':'edit <id>').description(create?'Create bounded technical work':'Edit existing work in place');
    if(create) command.option('--id <id>','Stable Ticket ID').requiredOption('--title <text>','Work title');
    else command.option('--title <text>','Work title');
    command.option('--body <text>','Grounded work contract').addOption(new Option('--priority <priority>','Integer 0-5; default 2; lower ranks first').argParser(value => PrioritySchema.parse(value.trim() ? Number(value) : NaN)))
      .option('--criterion <text>','Acceptance criterion (repeatable)',collect);
    const dispatch=(ticketId:string|undefined,opts:Record<string,unknown>)=>{
      const {criterion,...fields}=opts;
      return emit({family:'artifact',tool:create?'create_ticket':'update_ticket',args:{...fields,...(ticketId?{ticketId}:{}),...(criterion?{acceptanceCriteria:criterion}:{})}});
    };
    if(create) command.action((opts:Record<string,unknown>)=>dispatch(undefined,opts));
    else command.action((id:string,opts:Record<string,unknown>)=>dispatch(id,opts));
  }
  ticketCommand.command('classify <id> <kind>')
    .description('Preview same-ID task/Bug reclassification; exact local review is required')
    .option('--yes','Confirm this exact local deterministic reclassification')
    .action((id:string,kind:string,opts:{yes?:boolean})=>emit({family:'definition',yes:!!opts.yes,input:{kind:'Ticket',id,create:false,fields:{kind}}}));
  // Descriptions/examples belong to this shared tree; specialist owners still parse their arguments.
  const specialistHelp: Record<string,string> = {
    triage:'triage ["<test command>"]\nRuns the existing test runner and reports original failures; default: bun test.',
    metrics:'metrics [--operation <name>] [--ticket <id>] [--since <duration>] [--tag <key=value>]\nmetrics export <workspace-path.json> [filters]',
    'epic-create':'epic-create "<title>" [--body <text>] [--priority <number>] [--no-decompose] [--yes]\nDefault: inert decomposition proposal. --no-decompose previews a reviewed Epic; --yes confirms that exact local revision.',
    'epic-add':'epic-add "<title>" [--body <text>] [--priority <number>] [--no-decompose] [--yes]\nAlias of epic-create; prefer product epic new for explicit stable identity.',
    create:'create "<title>" [--id <id>] [--lane <lane>] [--priority <0|1|2|3|4|5>]\nCreates a task. Use ticket new for body/acceptance criteria and bug new for defects.',
    new:'new "<title>" [--id <id>] [--lane <lane>] [--priority <0|1|2|3|4|5>]\nAlias of create. Done is owned by independent verification.',
    claim:'claim <ticketId> [agent] [minutes] [--agent <id>] [--minutes <number>]\nChecks prerequisites, report completeness and foreign leases, then activates reviewed Story tests.',
    symbol:'symbol <name> [--exact|-e] [--regex|-r] [--kind|-k <kind>] [--file|-f <path>] [--exported] [-n|--limit <count>]',
    graph:'graph [query] [--type|-t <type>] [--pred|-p <predicate>] [--from|--source <id>] [--to|--target <id>] [--depth|-d <number>] [-n|--limit <count>]',
    patch:'Retired raw patch alias. Use source:change PREVIEW/APPLY with JSON, --ticket, --agent and the exact preview fingerprint.',
    exec:'exec "<instruction or wish>"\nRuns the configured Actor; Product proposals still require host-owned review.',
    eval:'eval "<code>"\nExecutes JavaScript through the existing sandbox tool.',
    kb:'kb sync [--force] | list [service|skill|pattern] | search <query> | show <id>'
  };
  // Retain the established argument owners for specialist grammars, not a second parser here.
  for(const name of ['triage','product-change','metrics','setup','epic-create','epic-add','create','new',
    'claim','symbol','graph','patch','rule','config','exec','eval','model','kb']) {
    const command=root.command(name+' [args...]', {hidden: name === 'patch'}).description(specialistHelp[name]?.split('\n')[0] ?? name+' operations').allowUnknownOption()
      .action((tokens:string[])=>emit({family:'legacy',command:name,tokens}));
    if(specialistHelp[name]) command.addHelpText('after','\n'+specialistHelp[name]);
  }
  root.commands.find(command => command.name() === 'config')!
    .description('Inspect configuration provenance and set/reset validated overrides')
    .addHelpText('after', '\n' + CONFIG_HELP);
  root.commands.find(command => command.name() === 'ticket')!
    .description('Show a canonical Ticket, its relations, dependencies and evidence')
    .addHelpText('after', `
Related work commands:
  tickets [lane]                       List Tickets in a Kanban lane
  ticket new --title <text> [--id <id>] [--body <text>] [--priority 0|1|2|3|4|5]
  claim <id> [agent] [minutes]          Claim through the existing lease owner
  release <id>                         Release the active lease
  move <id> <lane>                      Backlog, Todo, "In Progress", or Blocked
  investigate <id>                      Inspect grounded evidence without implementation
  prepare <id>                          Enrich work before implementation
  resolve <id>                          Implement and independently verify
  links <id>                            Inspect related canonical artifacts
Done requires owner-managed verification; generic move/done cannot certify completion.
Use COMMAND --help for operation options.`);
  root.commands.find(command => command.name() === 'product-change')!
    .description('Preview or explicitly review a current Product change')
    .addHelpText('after', `
  product-change preview <request.json>
  product-change accept|reject|cancel <preview.json>
Preview is inert. Review the exact request and fingerprint before acceptance.
Charter-warning Decisions require a separate interactive developer response;
noninteractive acceptance and --yes cannot supply that response.
Only the local host review can authorize that current fingerprint; an external
Actor's decision or project-write authority cannot approve its own proposal.`);
  root.commands.find(command => command.name() === 'model')!
    .description('Inspect available models and configure task routing')
    .addHelpText('after', `
  model [list]
  model radar [--refresh]
  model set <task> <modelTarget>
Use config get modelRoutes to inspect effective routes and doctor for runtime checks.
A configured provider is not proof that authentication or inference succeeds.`);
  root.commands.find(command => command.name() === 'setup')!
    .description('Inspect or install host integration and executable links')
    .addHelpText('after', '\n  setup [--check] [--global|--mcp|--link]');
  root.commands.find(command => command.name() === 'rule')!
    .description('Inspect effective engineering Rules or preview reviewed updates')
    .addHelpText('after', `
  rule list [--type|--scope|--status|--language|--provenance <value>]
  rule get <layer-id>
  rule export
  rule preview <request.json>
  rule apply <request.json> <fingerprint>
  rule resolve <reference.json> <authorized-repository>`);
  root.version(formatBuildInfo('AIWF'),'-V, --version');
  root.command('version').action(()=>emit({family:'help',tool:'help',args:{text:formatBuildInfo('AIWF')}}));
  // Commander passes the previous option value to argParser, including for booleans.
  const configure=(command:Command)=>{
    command.allowExcessArguments(false);
    if(command.commands.length && command.registeredArguments.length===0) {command.addHelpCommand();command.action(()=>command.help());}
    for(const option of command.options) if(!['tag','allow-dirty-target','authorize-file','criterion','evidence','actor','non-goal','responsibility','outcome','behavioral-rule','reference'].includes(option.name())) {
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
