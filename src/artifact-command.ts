import { z } from 'zod';
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
Resolution options: --agent <id> --max-repairs <0..3> --allow-dirty-target <path>
Completeness on an operation is temporary. Persist it only with completeness set.
needs_input/blocked are results to inspect; Done requires explicit acceptance proof.
Use symbol/graph/slice/blast/change/test primitives for explicit drill-down.`;

/** Parse explicit delegation commands only; uncertain natural language remains with the existing Actor. */
export function artifactCommand(tokens: string[]): { tool: string; args: Record<string, unknown> } | null {
  const words = [...tokens]; if (words[0]?.toLowerCase() === 'please') words.shift();
  const verb = words.shift()?.toLowerCase();
  const aliases: Record<string, string> = { resolve: 'resolve_ticket', prepare: 'prepare_ticket', investigate: 'investigate_ticket', resolve_ticket: 'resolve_ticket', prepare_ticket: 'prepare_ticket', investigate_ticket: 'investigate_ticket', process_epic: 'process_epic', process_feature: 'process_feature', process_story: 'process_story' };
  let tool = verb ? aliases[verb] : undefined;
  if (verb === 'process') {
    const kind = words.shift()?.toLowerCase(); if (!['epic', 'feature', 'story'].includes(kind ?? '')) throw new Error('Usage: process epic|feature|story <id>');
    tool = `process_${kind}`;
  }
  if (verb === 'completeness') {
    const action = words.shift(), entityId = words.shift(); if (!entityId) throw new Error('Completeness requires an artifact ID.');
    if (action === 'get' && !words.length) return { tool: 'get_completeness_target', args: { entityId } };
    if (action === 'set' && words.length === 1) return { tool: 'set_completeness_target', args: { entityId, level: words[0] === 'clear' ? null : CompletenessSchema.parse(words[0]) } };
    throw new Error('Usage: completeness get <id> | completeness set <id> <level|clear>');
  }
  if (!tool) return null;
  if (tool.endsWith('_ticket') && words[0]?.toLowerCase() === 'ticket') words.shift();
  const id = words.shift(); if (!id || id.startsWith('--')) throw new Error(`${verb} requires an artifact ID.`);
  const options: Record<string, unknown> = {};
  const flags: Record<string, string> = { '--completeness': 'completeness', '--depth': 'depth', '--max-artifacts': 'maxArtifacts', '--maxArtifacts': 'maxArtifacts', '--critic': 'critic', '--tag': 'tags', '--agent': 'agentId', '--max-repairs': 'maxRepairs', '--allow-dirty-target': 'allowDirtyTargets' };
  while (words.length) {
    const flag = words.shift()!, key = flags[flag], value = words.shift();
    if (!key || !value || value.startsWith('--')) throw new Error(`Invalid or missing operation option '${flag}'.`);
    if (['agentId', 'maxRepairs', 'allowDirtyTargets'].includes(key) && tool !== 'resolve_ticket') throw new Error(`${flag} applies only to resolution.`);
    if (key === 'allowDirtyTargets') options[key] = [...(options[key] as string[] ?? []), value];
    else if (key === 'tags') {
      const split = value.indexOf('=');
      if (split <= 0 || split === value.length - 1) throw new Error('--tag requires key=value.');
      const tagKey = value.slice(0, split);
      if (!/^[A-Za-z0-9_.-]+$/.test(tagKey)) throw new Error(`Invalid metric tag key '${tagKey}'.`);
      options.tags = { ...((options.tags as Record<string, string>) ?? {}), [tagKey]: value.slice(split + 1) };
    }
    else if (key === 'maxArtifacts' || key === 'maxRepairs' || key === 'depth' && value !== 'all') options[key] = Number(value);
    else if (key === 'critic') options[key] = ['auto', 'none'].includes(value) ? value : { id: value };
    else options[key] = value;
  }
  const schema = ArtifactTransportOptionsSchema.extend({ agentId: z.string().optional(), maxRepairs: z.number().int().min(0).max(3).optional(), allowDirtyTargets: z.array(z.string()).optional() }).strict();
  const key = tool.endsWith('_ticket') ? 'ticketId' : tool === 'process_epic' ? 'epicId' : tool === 'process_feature' ? 'featureId' : 'storyId';
  return { tool, args: { [key]: id, ...schema.parse(options) } };
}
