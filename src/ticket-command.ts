import {ParameterFacilitator} from '@dharmax/shell-ui';
import {loadConfig} from './config.ts';
import {exportProjections} from './graph/projections.ts';
import {registry, type ToolContext} from './tools/index.ts';

export const TICKET_COMMANDS = ['claim', 'release', 'move', 'done'] as const;
export type TicketCommand = typeof TICKET_COMMANDS[number];
interface TicketCandidate {id: string; lane: string; claim?: {agentId: string; expiresAt: string} | null}
const lanes = ['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked'];
export async function runTicketCommand(command: TicketCommand, tokens: string[], ctx: ToolContext, facilitator?: ParameterFacilitator): Promise<{output: string; success: boolean}> {
  const positional: string[] = [];
  let agent: string | undefined;
  let minutes: string | undefined;
  const usage = `Usage: ${command} <ticketId>${command === 'claim' ? ' [agent] [minutes]' : command === 'move' ? ' <Backlog|Todo|"In Progress"|Done|Blocked>' : ''}`;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (!token.startsWith('-')) {positional.push(token); continue;}
    if (command !== 'claim' || !['--agent', '-a', '--minutes', '-m'].includes(token)) throw new Error(usage);
    const value = tokens[++index];
    if (!value || value.startsWith('-')) throw new Error(usage);
    if (token === '--agent' || token === '-a') agent = value; else minutes = value;
  }
  if (command !== 'claim' && command !== 'move' && positional.length > 1 || command === 'claim' && positional.length > 3) throw new Error(usage);
  const config = loadConfig(ctx.projectRoot);
  const agentId = agent || (command === 'claim' ? positional[1] : undefined) || config.defaultAgentId;
  const durationMinutes = Number(minutes || (command === 'claim' ? positional[2] : undefined) || config.defaultLeaseMinutes);
  if (command === 'claim' && (!Number.isFinite(durationMinutes) || durationMinutes <= 0)) throw new Error('Lease minutes must be a positive number.');
  let ticketId = positional[0];
  let lane = command === 'move' && positional.length > 1 ? positional.slice(1).join(' ').replace(/^(['"])(.*)\1$/, '$2') : undefined;
  if (!ticketId && facilitator) {
    const candidates: TicketCandidate[] = await registry.execute('list_tickets', {}, ctx);
    const choices = candidates.filter(ticket => {
      const active = ticket.claim && new Date(ticket.claim.expiresAt).getTime() > Date.now();
      if (command === 'release') return Boolean(active);
      if (command === 'claim') return !['Done', 'Blocked'].includes(ticket.lane) && (!active || ticket.claim?.agentId === agentId);
      return command !== 'done' || ticket.lane !== 'Done';
    }).map(ticket => ticket.id);
    if (!choices.length) return {output: `No eligible tickets for ${command}.`, success: true};
    const values = await facilitator.facilitate({ticketId: {type: 'select', description: `Ticket ID to ${command}`, choices}}, {}, {interactive: true});
    if (typeof values.ticketId !== 'string') return {output: 'Cancelled.', success: true};
    ticketId = values.ticketId;
    if (!choices.includes(ticketId)) throw new Error(`Invalid ticket selection: ${ticketId}`);
  }
  if (!ticketId) throw new Error(usage);
  if (command === 'move' && !lane && facilitator) {
    const values = await facilitator.facilitate({lane: {type: 'select', description: 'Target lane', choices: lanes}}, {}, {interactive: true});
    if (typeof values.lane !== 'string') return {output: 'Cancelled.', success: true};
    lane = values.lane;
  }
  if (command === 'move' && !lane) throw new Error(usage);
  let output: string;
  if (command === 'claim') {
    const result: {success: boolean; message?: string} = await registry.execute('claim_ticket', {ticketId, agentId, durationMinutes}, ctx);
    if (!result.success) return {output: `Failed to claim: ${result.message}`, success: false};
    output = `Claimed ticket ${ticketId} for ${durationMinutes}m by '${agentId}'.`;
  } else if (command === 'release') {
    const result: {success: boolean} = await registry.execute('release_ticket', {ticketId}, ctx);
    if (!result.success) return {output: `Ticket '${ticketId}' not found or lease inactive.`, success: false};
    output = `Released ticket ${ticketId}.`;
  } else {
    await registry.execute('update_ticket_state', {ticketId, lane: command === 'done' ? 'Done' : lane}, ctx);
    if (command === 'done') await registry.execute('release_ticket', {ticketId}, ctx);
    output = command === 'done' ? `Marked ticket '${ticketId}' as Done and synced Kanban.` : `Moved ticket '${ticketId}' to '${lane}'.`;
  }
  await exportProjections(ctx.store, ctx.projectRoot);
  return {output, success: true};
}
