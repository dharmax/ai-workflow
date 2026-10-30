/** Plain CLI/shell adapter for the canonical Rule commandRegistry operations. */
import fs from 'node:fs';
import {reviewRuleChange} from './tools/rules.ts';
import {commandRegistry, type ToolContext} from './tools/index.ts';
export async function runRuleCommand(args: string[], ctx: ToolContext): Promise<string> {
  const [verb = 'list', ...rest] = args;
  if (verb === 'list') {
    const allowed = new Set(['type', 'scope', 'status', 'language', 'provenance']);
    const filter: Record<string, string> = {};
    for (let index = 0; index < rest.length; index += 2) {
      const name = rest[index]?.replace(/^--/, '');
      if (!name || !allowed.has(name) || !rest[index + 1]) throw Error('Invalid Rule list filter.');
      filter[name] = rest[index + 1];
    }
    return JSON.stringify(await commandRegistry.execute('list_rules', filter, ctx), null, 2);
  }
  if (verb === 'get' && rest.length === 1)
    return JSON.stringify(await commandRegistry.execute('get_rule', {ruleId: rest[0]}, ctx), null, 2);
  if (verb === 'export' && !rest.length)
    return JSON.stringify(await commandRegistry.execute('export_rules', {}, ctx), null, 2);
  if ((verb === 'preview' && rest.length === 1) || (verb === 'apply' && rest.length === 2)) {
    const request = JSON.parse(fs.readFileSync(rest[0]!, 'utf8'));
    if(verb==='apply')return JSON.stringify(await reviewRuleChange({...request,fingerprint:rest[1]},ctx),null,2);
    return JSON.stringify(await commandRegistry.execute('preview_rule_change',request,ctx), null, 2);
  }
  if (verb === 'resolve' && rest.length === 2) {
    return JSON.stringify(await commandRegistry.execute('resolve_rule_reference', {
      reference: JSON.parse(fs.readFileSync(rest[0]!, 'utf8')), authorizedRepository: rest[1]
    }, ctx), null, 2);
  }
  throw Error('Usage: rule list [--type|--scope|--status|--language|--provenance value] | get <layer-id> | export | preview <request.json> | apply <request.json> <fingerprint> | resolve <reference.json> <authorized-repository>');
}
