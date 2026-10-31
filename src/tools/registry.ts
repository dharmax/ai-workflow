/**
 * Responsibility: Canonical public command registration and existing internal tool execution.
 * Scope: One opt-in catalog projects existing owners to transports; internal tools remain independent.
 */

import { z, type ZodType } from 'zod';
import { countEngineering } from '../performance-metrics.ts';
import type { WorkflowStore } from '../graph/store.ts';

export interface ToolContext {
  store: WorkflowStore;
  actor?: import('../helpers/actor/engine.ts').WorkflowActor;
  projectRoot: string;
  signal?: AbortSignal;
  executionAuthority?: 'read-only' | 'project-write';
  /** Host-owned source permission, independent of project data writes. */
  codeMutationAllowed?: boolean;
  scratchRoot?: string;
  [key: string]: any;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  category: 'ticket' | 'graph' | 'compiler' | 'git' | 'os' | 'web' | 'test' | 'planning' | 'script' | 'kb' | 'change';
  parameters: ZodType<TParams>;
  execute: (params: TParams, ctx: ToolContext) => Promise<TResult> | TResult;
}

export type CommandChannel = 'cli' | 'shell' | 'mcp' | 'rest';
export interface CommandDefinition {
  topic: string;
  subtopic?: string;
  action: string;
  description: string;
  parameters: z.ZodObject;
  owner: string;
  /** Values bound by registration, never supplied as authority by a client. */
  bind?: Record<string, unknown>;
  positionals?: string[];
  flags?: Record<string, string>;
  cliParse?: Record<string,(value:string)=>unknown>;
  format?: (result:unknown)=>string;
  exposure: CommandChannel[];
  /** Omission inherits the host context; GET always requires explicit read-only. */
  authority?: 'read-only' | 'project-write';
  http: {method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; identity?: string; queryIdentity?: string[]};
  /** Existing protocol names remain transitional views of this command. */
  legacyMcp?: Array<string | {name:string; action?:string; kind?:string}>;
  enabled?: boolean;
  normalize?: (input:Record<string,unknown>)=>Record<string,unknown>;
  review?: (input:Record<string,unknown>,ctx:ToolContext,confirm?: (preview:unknown)=>Promise<boolean>,respond?: (question:string,id:string)=>Promise<string|undefined>)=>Promise<unknown>;
  mcpFamily?: string;
}
export const commandId = (c: Pick<CommandDefinition,'topic'|'subtopic'|'action'>) => [c.topic+(c.subtopic?':'+c.subtopic:''),c.action].join(' ');
export function commandRoute(c:CommandDefinition){
 const base='/api/v1/'+c.topic+(c.subtopic?'/'+c.subtopic:'');
 const item=c.http.identity?'/{'+c.http.identity+'}':'';
 return base+item+(['list','show','create','update','delete'].includes(c.action)?'':'/'+c.action);
}
export const commandFamily = (c: CommandDefinition) => c.mcpFamily??c.topic+(c.subtopic?'.'+c.subtopic:'');

export class CommandRegistry {
  private revision = 0;
  get commandRevision(){return this.revision;}
  private commands = new Map<string, CommandDefinition>();

  registerCommand(command: CommandDefinition): void {
    const id=commandId(command);
    if(!/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)? [a-z][a-z0-9-]*$/.test(id)) throw Error('Invalid canonical command: '+id);
    if(this.commands.has(id)) throw Error('Duplicate command: '+id);
    if(!this.get(command.owner)) throw Error('Missing command owner: '+command.owner);
    const schema=z.toJSONSchema(command.parameters); // Fail closed on unrepresentable contracts.
    if(schema.type!=='object'||schema.additionalProperties!==false)throw Error('Commands require strict object schemas: '+id);
    if(command.http.method==='GET'&&command.authority!=='read-only')throw Error('GET command must be read-only: '+id);
    if(command.http.identity&&!command.parameters.shape[command.http.identity])throw Error('Unknown identity: '+id);
    for(const field of command.positionals??[])if(!command.parameters.shape[field])throw Error('Unknown operand '+field+': '+id);
    if(command.exposure.includes('rest'))for(const existing of this.getCommands('rest')){
      if(existing.http.method!==command.http.method||commandRoute(existing).replace(/\{[^}]+\}/g,'{}')!==commandRoute(command).replace(/\{[^}]+\}/g,'{}'))continue;
      const keys=command.http.queryIdentity;
      const pair=[existing,command];
      if(!keys?.length||JSON.stringify(keys)!==JSON.stringify(existing.http.queryIdentity)||!pair.some(c=>c.action==='list')||!pair.some(c=>c.action==='show'))throw Error('Ambiguous REST route: '+id);
      const show=pair.find(c=>c.action==='show')!;
      if(Object.keys(show.parameters.shape).length!==keys.length||keys.some(k=>!show.parameters.shape[k]||show.parameters.shape[k]!.isOptional()))throw Error('Unproven route discriminator: '+id);
    }
    this.commands.set(id,command);this.revision++;
  }

  removeCommand(id: string): void { if(this.commands.delete(id))this.revision++; }
  getCommands(channel?: CommandChannel): CommandDefinition[] {
    return [...this.commands.values()].filter(c=>c.enabled!==false&&(!channel||c.exposure.includes(channel))).sort((a,b)=>commandId(a).localeCompare(commandId(b)));
  }
  publicTools(compact=false): ToolDefinition[] {
    const groups=new Map<string, CommandDefinition[]>();
    for(const c of this.getCommands('mcp')) { const name=commandFamily(c); groups.set(name,[...(groups.get(name)??[]),c]); }
    const tools:ToolDefinition[]=[];
    for(const [name,commands] of groups){
      const options=commands.map(c=>c.parameters.extend({action:z.literal(c.action)}).strict());
      const parameters=options.length===1?options[0]!:z.discriminatedUnion('action',options as [typeof options[number],typeof options[number],...typeof options]);
      tools.push({name,description:commands.map(c=>c.action+': '+c.description).join('\n'),category:this.get(commands[0]!.owner)!.category,parameters,
        execute:(input,ctx)=>{const {action,...args}=input as Record<string,unknown>;const command=commands.find(c=>c.action===action);if(!command)throw Error('Unsupported action');return this.execute(commandId(command),args,ctx);}});
    }
    if(!compact){
      const aliases=new Map<string,Array<{command:CommandDefinition; binding:Record<string,unknown>}>>();
      for(const command of this.getCommands('mcp'))for(const entry of command.legacyMcp??[]){
        const {name,...hint}=typeof entry==='string'?{name:entry}:entry;
        const binding=Object.keys(hint).length?hint:command.owner===name?command.bind??{}:{};
        aliases.set(name,[...(aliases.get(name)??[]),{command,binding}]);
      }
      for(const [name,entries] of aliases){
        const owner=this.get(name);if(!owner)throw Error('Missing compatibility owner '+name);
        let parameters=owner.parameters;
        if(parameters instanceof z.ZodUnion){
          const options=parameters.options.filter(option=>option instanceof z.ZodObject&&entries.some(({binding})=>Object.entries(binding).every(([field,value])=>{
            const shape=option.shape[field];return shape?.safeParse(value).success;
          })));
          if(!options.length)continue;
          if(options.length===parameters.options.length) { /* Preserve existing finite protocol union shape when all branches remain eligible. */ }
          else parameters=options.length===1?options[0]! as z.ZodType:z.union(options as [z.ZodType,z.ZodType,...z.ZodType[]]);
        }
        if(parameters instanceof z.ZodObject)parameters=parameters.strict();
        const exposed=parameters;
        tools.push({...owner,parameters:exposed,execute:(input,ctx)=>{
          if(!entries.some(e=>this.getCommands('mcp').includes(e.command)))throw Error('Command is not exposed');
          return this.execute(name,exposed.parse(input),ctx);
        }});
      }
    }
    return [...new Map(tools.map(t=>[t.name,t])).values()];
  }

  private tools = new Map<string, ToolDefinition>();

  register<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  async execute(name: string, params: any, ctx: ToolContext): Promise<any> {
    const command=this.commands.get(name);
    if(command){
      if(command.enabled===false||command.exposure.length===0)throw Error('Command is not exposed: '+name);
      const parsed=command.parameters.parse(params);
      if(command.authority==='project-write'&&ctx.executionAuthority!=='project-write')throw Error('Command requires project-write authority: '+name);
      return this.execute(command.owner,{...(command.normalize?command.normalize(parsed):parsed),...command.bind},{...ctx,executionAuthority:command.authority==='read-only'?'read-only':ctx.executionAuthority});
    }
    const tool = this.get(name);
    if (!tool) throw new Error(`Tool '${name}' not found in commandRegistry.`);
    const parsed = tool.parameters.parse(params);
    countEngineering('toolCalls');
    const authority = ctx.executionAuthority ?? 'read-only';
    if (authority === 'read-only' && tool.category === 'script')
      throw Error('Arbitrary script execution requires project-write authority; read-only execution cannot evaluate code.');
    return await ctx.store.withExecutionContext(authority, ctx.signal, () =>
      Promise.resolve(tool.execute(parsed, {...ctx, executionAuthority: authority})));
  }
}

export const commandRegistry = new CommandRegistry();
