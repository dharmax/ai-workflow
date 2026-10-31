import type { OutputOptions } from './ui/result-view.ts';
/**
 * Responsibility: Commander and Shell discovery from the canonical command snapshot.
 * Scope: Typed transport normalization only; existing registry/domain owners execute commands.
 */
import { Command, Option } from 'commander';
import { z } from 'zod';
import { commandRegistry, commandId, type CommandDefinition, type CommandChannel } from './tools/registry.ts';
import { parsePublicJson, readPublicJson } from './public-json.ts';
import { initializeTools } from './tools/index.ts';
export function commandDiscovery(channel: CommandChannel = 'shell') {
  initializeTools();
  const subcommands: Record<string, string[]> = {};
  for (const c of commandRegistry.getCommands(channel)) {
    const family = c.topic + (c.subtopic ? ':' + c.subtopic : '');
    subcommands[family] = [...new Set([...(subcommands[family] ?? []), c.action])];
  }
  return { builtins: Object.keys(subcommands), subcommands };
}
export function projectCommands(
  root: Command,
  emit: (
    id: string,
    args: Record<string, unknown>,
    definition: CommandDefinition,
    format?: CommandDefinition['format'],
    output?: OutputOptions,
  ) => void | Promise<void>,
  channel: 'cli' | 'shell' = 'cli',
) {
  initializeTools();
  for (const c of commandRegistry.getCommands(channel)) {
    let parent = root;
    for (const name of [c.topic, ...(c.subtopic ? [c.subtopic] : [])]) {
      parent = parent.commands.find((child) => child.name() === name) ?? parent.command(name);
    }
    // Replace migrated actions and their aliases; legacy handlers cannot compete with the canonical registration.
    for (let i = parent.commands.length - 1; i >= 0; i--)
      if (parent.commands[i]!.name() === c.action || parent.commands[i]!.aliases().includes(c.action))
        (parent.commands as Command[]).splice(i, 1);
    const positions = c.positionals ?? [];
    const command = parent
      .command(
        c.action +
          positions
            .map((field) => (c.parameters.shape[field]!.isOptional() ? ' [' + field + ']' : ' <' + field + '>'))
            .join(''),
      )
      .description(c.description)
      .option('--full-json', 'Complete canonical JSON, without human projection')
      .option('--json', 'Alias for --full-json')
      .option('-q, --brief', 'Essential human information only')
      .option(
        '-v, --verbose',
        'Additional human detail; repeat as -vv',
        (_value, previous) => Number(previous ?? 0) + 1,
      )
      .option('--sections <names>', 'Select applicable information sections, comma-separated');
    const json = z.toJSONSchema(c.parameters) as {
      properties: Record<string, { type?: string; description?: string }>;
    };
    const fields = Object.keys(c.parameters.shape).filter((field) => !positions.includes(field));
    const flagFields = new Map<string, string>();
    for (const field of fields) {
      const flag = c.flags?.[field] ?? field.replace(/[A-Z]/g, (l) => '-' + l.toLowerCase());
      flagFields.set(
        flag.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase()),
        field,
      );
      const property = json.properties[field]!;
      const option = new Option(
        '--' + flag + (property.type === 'boolean' ? '' : ' <value>'),
        property.description ?? field,
      );
      if (property.type === 'number' || property.type === 'integer') option.argParser(parsePublicJson);
      else if (property.type === 'object' || property.type === 'array') option.argParser(parsePublicJson);
      command.addOption(option);
    }
    if (fields.length)
      command
        .option('--data-json <json>', 'Strict typed action fields')
        .option('--data-file <file>', 'Bounded JSON file or - for stdin');
    command.action(async (...args: unknown[]) => {
      const opts = args[positions.length] as Record<string, unknown>;
      const { json: _json, fullJson, brief, verbose, sections, dataJson, dataFile, ...named } = opts;
      const output = outputOptions(opts);
      if (dataJson !== undefined && dataFile !== undefined)
        throw new SyntaxError('Use either --data-json or --data-file.');
      if ((dataJson !== undefined || dataFile !== undefined) && Object.keys(named).length)
        throw new SyntaxError('JSON request and named fields cannot be mixed.');
      const data =
        dataJson !== undefined
          ? parsePublicJson(String(dataJson))
          : dataFile !== undefined
            ? await readPublicJson(String(dataFile))
            : Object.fromEntries(Object.entries(named).map(([key, value]) => [flagFields.get(key) ?? key, value]));
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new SyntaxError('Expected action fields as a JSON object.');
      for (const field of positions) if (field in data) throw new SyntaxError('Duplicate identity field: ' + field);
      const input = c.parameters.parse({
        ...data,
        ...Object.fromEntries(
          positions.map((field, i) => {
            const value = c.cliParse?.[field] ? c.cliParse[field]!(String(args[i])) : args[i];
            return [
              field,
              c.parameters.shape[field]!.safeParse(value).success ? value : parsePublicJson(String(value)),
            ];
          }),
        ),
      });
      await emit(commandId(c), input, c, output?.fullJson ? undefined : c.format, output);
    });
  }
}

/** Transport options never enter domain arguments or machine APIs. */
export function outputOptions(flags: Record<string, unknown>): OutputOptions | undefined {
  const verbose = Number(flags.verbose ?? 0),
    brief = flags.brief === true,
    json = flags.fullJson === true || flags.json === true;
  const sections =
    typeof flags.sections === 'string' ? flags.sections.split(',').map((section) => section.trim()) : undefined;
  if (verbose > 2) throw Error('Use -v or -vv for additional human detail.');
  if (brief && verbose) throw Error('Choose --brief or --verbose.');
  if (flags.fullJson && flags.json) throw Error('Use --full-json or its --json alias, not both.');
  if (sections?.some((section) => !section)) throw Error('--sections requires comma-separated section names.');
  if (json && (brief || verbose || sections))
    throw Error('--full-json cannot be combined with human detail or section options.');
  if (!brief && !verbose && !json && !sections) return undefined;
  return {
    verbosity: brief ? 0 : verbose === 2 ? 3 : verbose === 1 ? 2 : 1,
    ...(sections ? { sections } : {}),
    ...(json ? { fullJson: true } : {}),
  };
}
export function extractOutputOptions(tokens: string[], root?:Command) {
  let command=root;
  const remaining: string[] = [],
    flags: Record<string, unknown> = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === '--') {
      remaining.push(...tokens.slice(i));
      break;
    }
    const key = token.split('=')[0]!.toLowerCase();
    if(token.includes('=')&&['--full-json','--json','--brief','-q','--verbose','-v','-vv'].includes(key))throw Error(key+' does not take a value.');
    if (key === '--full-json' || key === '--json' || key === '--brief' || key === '-q') {
      const name = key === '--full-json' ? 'fullJson' : key === '--json' ? 'json' : 'brief';
      if (flags[name]) throw Error('Duplicate output option: ' + key);
      flags[name] = true;
    } else if (key === '--verbose' || /^-v{1,2}$/.test(key))
      flags.verbose = Number(flags.verbose ?? 0) + (key === '-vv' ? 2 : 1);
    else if (key === '--sections') {
      if (flags.sections !== undefined) throw Error('Duplicate --sections option.');
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : tokens[++i];
      if (!value || value.startsWith('-')) throw Error('--sections requires comma-separated section names.');
      flags.sections = value;
    } else {
      remaining.push(token);
      const option=command?.options.find(option=>option.long?.toLowerCase()===key||option.short===key);
      if(option?.required&&!token.includes('=')&&tokens[i+1]!==undefined){
        const value=tokens[++i]!;
        if(['--json','--full-json','--brief','-q','--verbose','-v','-vv','--sections'].includes(value))remaining[remaining.length-1]+='='+value;else remaining.push(value);
        continue;
      }
      if(!token.startsWith('-'))for(const part of token.split(':')){
        const child=command?.commands.find(child=>[child.name(),...child.aliases()].includes(part.toLowerCase()));
        if(child)command=child;else break;
      }
    }
  }
  return { tokens: remaining, options: outputOptions(flags) };
}
