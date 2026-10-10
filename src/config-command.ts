import {ParameterFacilitator, type ViewRequest} from '@dharmax/shell-ui';
import {CONFIG_SETTINGS, inspectConfig, parseConfigSetting, resetConfigOverride, setConfigOverride, type ConfigScope} from './config.ts';

export interface ConfigCommandResult {
  rows: ReturnType<typeof inspectConfig>;
  mutated: boolean;
  scope: ConfigScope;
}
/** Both adapters supply tokens; only the interactive shell may fill missing human input. */
export async function runConfigCommand(projectRoot: string, tokens: string[], facilitator?: ParameterFacilitator): Promise<ConfigCommandResult | null> {
  const scope: ConfigScope = tokens.includes('--global') ? 'global' : 'project';
  if (tokens.some(token => token.startsWith('--') && token !== '--global')) throw new Error('Usage: config [get|set|reset] [key] [value] [--global]');
  const positional = tokens.filter(token => token !== '--global');
  const action = positional.shift() || 'get';
  if (!['get', 'set', 'reset'].includes(action)) throw new Error('Usage: config [get|set|reset] [key] [value] [--global]');
  let key = positional.shift();
  let value = positional.length ? positional.join(' ') : undefined;
  if (action !== 'set' && value !== undefined) throw new Error(`Usage: config ${action} [key] [--global]`);
  if (action !== 'get' && !key && facilitator) {
    const fields = await facilitator.facilitate({key: {type: 'select', description: 'Setting to change', choices: Object.keys(CONFIG_SETTINGS)}}, {}, {interactive: true});
    if (typeof fields.key !== 'string') return null;
    key = fields.key;
  }
  if (action !== 'get' && !key) throw new Error(`Missing setting. Usage: config ${action} <key>${action === 'set' ? ' <value>' : ''} [--global]`);
  if (key && !Object.hasOwn(CONFIG_SETTINGS, key)) throw new Error(`Unknown or sensitive setting: ${key}`);
  if (action === 'set' && value === undefined && facilitator) {
    const fields = await facilitator.facilitate({value: {type: 'string', description: `Value for ${key}`}}, {}, {interactive: true});
    if (typeof fields.value !== 'string') return null;
    value = fields.value;
  }
  if (action === 'set') {
    if (value === undefined) throw new Error('Missing value. Usage: config set <key> <value> [--global]');
    parseConfigSetting(key!, value);
    setConfigOverride(projectRoot, key!, value, scope);
  } else if (action === 'reset') resetConfigOverride(projectRoot, key!, scope);
  return {rows: inspectConfig(projectRoot, key), mutated: action !== 'get', scope};
}
export function formatConfigResult(result: ConfigCommandResult): string {
  const prefix = result.mutated ? `Updated ${result.scope} override.\n` : '';
  return prefix + result.rows.map(row => `${row.key} = ${typeof row.value === 'string' ? row.value : JSON.stringify(row.value)} (${row.source})`).join('\n');
}
export function configView(result: ConfigCommandResult): ViewRequest {
  return {id: 'configuration', title: 'Effective configuration', mode: 'readonly', fields: Object.fromEntries(result.rows.map(row => [row.key, {type: 'text', mode: 'readonly', label: `${row.key} · ${row.source}`, value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value)}]))};
}
