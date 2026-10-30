/**
 * Responsibility: Commander and Shell discovery from the canonical command snapshot.
 * Scope: Typed transport normalization only; existing registry/domain owners execute commands.
 */
import {Command,Option} from 'commander';
import {z} from 'zod';
import {commandRegistry,commandId,type CommandDefinition,type CommandChannel} from './tools/registry.ts';
import {parsePublicJson,readPublicJson} from './public-json.ts';
import {initializeTools} from './tools/index.ts';
export function commandDiscovery(channel:CommandChannel='shell'){
 initializeTools();
 const subcommands:Record<string,string[]>={};
 for(const c of commandRegistry.getCommands(channel)){
  const family=c.topic+(c.subtopic?':'+c.subtopic:'');
  subcommands[family]=[...new Set([...(subcommands[family]??[]),c.action])];
 }
 return {builtins:Object.keys(subcommands),subcommands};
}
export function projectCommands(root:Command,emit:(id:string,args:Record<string,unknown>,definition:CommandDefinition,format?:CommandDefinition['format'])=>void|Promise<void>,channel:'cli'|'shell'='cli'){
 initializeTools();
 for(const c of commandRegistry.getCommands(channel)){
  let parent=root;
  for(const name of [c.topic,...(c.subtopic?[c.subtopic]:[])]){
   parent=parent.commands.find(child=>child.name()===name)??parent.command(name);
  }
  // Replace migrated actions and their aliases; legacy handlers cannot compete with the canonical registration.
  for(let i=parent.commands.length-1;i>=0;i--)if(parent.commands[i]!.name()===c.action||parent.commands[i]!.aliases().includes(c.action))(parent.commands as Command[]).splice(i,1);
  const positions=c.positionals??[];
  const command=parent.command(c.action+positions.map(field=>c.parameters.shape[field]!.isOptional()?' ['+field+']':' <'+field+'>').join('')).description(c.description).option('--json','Machine-readable domain result');
  const json=z.toJSONSchema(c.parameters) as {properties:Record<string,{type?:string;description?:string}>};
  const fields=Object.keys(c.parameters.shape).filter(field=>!positions.includes(field));
  const flagFields=new Map<string,string>();
  for(const field of fields){
   const flag=c.flags?.[field]??field.replace(/[A-Z]/g,l=>'-'+l.toLowerCase());
   flagFields.set(flag.replace(/-([a-z])/g,(_,l:string)=>l.toUpperCase()),field);
   const property=json.properties[field]!;
   const option=new Option('--'+flag+(property.type==='boolean'?'':' <value>'),property.description??field);
   if(property.type==='number'||property.type==='integer')option.argParser(parsePublicJson);
   else if(property.type==='object'||property.type==='array')option.argParser(parsePublicJson);
   command.addOption(option);
  }
  if(fields.length)command.option('--data-json <json>','Strict typed action fields').option('--data-file <file>','Bounded JSON file or - for stdin');
  command.action(async(...args:unknown[])=>{
   const opts=args[positions.length] as Record<string,unknown>;
   const {json:_json,dataJson,dataFile,...named}=opts;
   if(dataJson!==undefined&&dataFile!==undefined)throw new SyntaxError('Use either --data-json or --data-file.');
   if((dataJson!==undefined||dataFile!==undefined)&&Object.keys(named).length)throw new SyntaxError('JSON request and named fields cannot be mixed.');
   const data=dataJson!==undefined?parsePublicJson(String(dataJson)):dataFile!==undefined?await readPublicJson(String(dataFile)):Object.fromEntries(Object.entries(named).map(([key,value])=>[flagFields.get(key)??key,value]));
   if(!data||typeof data!=='object'||Array.isArray(data))throw new SyntaxError('Expected action fields as a JSON object.');
   for(const field of positions)if(field in data)throw new SyntaxError('Duplicate identity field: '+field);
   const input=c.parameters.parse({...data,...Object.fromEntries(positions.map((field,i)=>{const value=c.cliParse?.[field]?c.cliParse[field]!(String(args[i])):args[i];return [field,c.parameters.shape[field]!.safeParse(value).success?value:parsePublicJson(String(value))];}))});
   await emit(commandId(c),input,c,opts.json?undefined:c.format);
  });
 }
}
