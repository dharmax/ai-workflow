/**
 * Responsibility: Ticket and Lease Management Facility.
 * Scope: Atomic leases, lane transitions, ticket listing, and next-task recommendation.
 */

import { z } from 'zod';
import { ticketState, TicketKindSchema, TicketDefectSchema, assessBug, ticketEligibility } from '../graph/ticket-state.ts';
import { ArtifactTransportOptionsSchema } from '../artifact-policy.ts';
import { registry, type ToolContext } from './registry.ts';
import { Ticket, Artifact } from '../graph/ontology.ts';
import {readVerificationReceipt} from '../ticket-operation-types.ts';
import {loadConfig} from '../config.ts';
import type { TicketLane } from '../graph/types.ts';
import { applyProductMutations } from '../product/mutation.ts';
import { activateStoryTestsForTicket } from '../product/story-tests.ts';
import {exportProjections} from '../graph/projections.ts';

async function requireTicket(ctx: ToolContext, ticketId: string, kind?: Ticket['kind']): Promise<Ticket> {
  const ticket = await ctx.store.getEntity<Ticket>(ticketId, Ticket.dcr);
  if (!ticket) throw new Error(`Ticket '${ticketId}' not found in AIWF project '${ctx.projectRoot}'. Verify the active project with 'aiwf status' and synchronize its projections if needed.`);
  if(kind && ticket.kind!==kind) throw Error(`Ticket '${ticketId}' is ${ticket.kind}, not ${kind}.`);
  return ticket;
}

export function registerTicketTools() {
  registry.register({name:'bug_action',category:'ticket',description:'Start, release, block, reopen or cancel a typed Bug through the existing Ticket owners.',
    parameters:z.object({action:z.enum(['start','release','block','reopen','cancel']),ticketId:z.string(),agentId:z.string().optional(),durationMinutes:z.number().positive().optional()}),
    execute:async({action,ticketId,agentId,durationMinutes},ctx)=>{
      await registry.execute('get_bug',{ticketId},ctx);
      if(action==='start') return registry.execute('claim_ticket',{ticketId,agentId,durationMinutes},ctx);
      if(action==='release') return registry.execute('release_ticket',{ticketId},ctx);
      return registry.execute('update_ticket_state',{ticketId,lane:action==='block'?'Blocked':action==='reopen'?'Todo':'Backlog',...(action==='cancel'?{status:'rejected'}:{})},ctx);
    }});
  registry.register({name:'get_ticket',category:'ticket',description:'Read the canonical Ticket definition and revision.',
    parameters:z.object({ticketId:z.string().min(1)}),
    execute:async({ticketId},ctx)=>{
      const ticket=await requireTicket(ctx,ticketId);
      const receipt=await ctx.store.getEntity<Artifact>('VERIFY-'+ctx.store.localId(ticket.id),Artifact.dcr);
      return {id:ctx.store.localId(ticket.id),title:ticket.title,body:ticket.body,lane:ticket.lane,status:ticket.status,
        verificationState:receipt?'recorded-unchecked':'unverified',verification:readVerificationReceipt(receipt?.body),outgoing:await ctx.store.getOutgoing(ticket.id),incoming:await ctx.store.getIncoming(ticket.id),
        kind:ticket.kind ?? 'task',defect:ticket.defect,priority:ticket.priority,acceptanceCriteria:ticket.acceptanceCriteria,claim:ticket.claim,version:ticket.version};
    }});

  registry.register({
    name: 'resolve_ticket', description: 'Own a Ticket through bounded leased preparation, safe implementation, tests, repair and explicit acceptance verification. OperationResult.status describes this operation outcome; it is not the Ticket Kanban lane.', category: 'ticket',
    parameters: ArtifactTransportOptionsSchema.extend({ ticketId: z.string(), kind: TicketKindSchema.optional(), agentId: z.string().optional(), maxRepairs: z.number().int().min(0).max(3).optional(), allowDirtyTargets: z.array(z.string()).optional(), authorizedFiles: z.record(z.string(), z.array(z.string())).optional(), testCommands: z.array(z.array(z.string()).min(1)).optional() }),
    execute: async ({ ticketId, kind, ...options }, ctx) => {
      const ticket = await requireTicket(ctx, ticketId, kind);
      if (ticket.kind === 'bug' && !assessBug(ticket).ready) return {status:'needs_input',artifactId:ticketId,required:assessBug(ticket).missing.map(field=>({question:`Complete Bug ${field}.`,why:'Missing reproducible defect contract.',target:field}))};
      return ticket.resolve(ctx.store, { ...options, signal: ctx.signal });
    }
  });
  registry.register({
    name: 'prepare_ticket', description: 'Make a Ticket executable through read-only investigation, independent proposal review and leased safe enrichment/decomposition. OperationResult.status describes this operation outcome; it is not the Ticket Kanban lane.', category: 'ticket',
    parameters: ArtifactTransportOptionsSchema.extend({ ticketId: z.string(), kind: TicketKindSchema.optional(), agentId: z.string().optional() }),
    execute: async ({ ticketId, kind, ...options }, ctx) => {
      const ticket = await requireTicket(ctx, ticketId, kind);
      return ticket.prepare(ctx.store, { ...options, signal: ctx.signal });
    }
  });
  registry.register({
    name: 'investigate_ticket', description: 'Return a grounded, semantically read-only Ticket dossier with proposed enrichments and precise disposition. OperationResult.status describes this operation outcome; it is not the Ticket Kanban lane.', category: 'ticket',
    parameters: ArtifactTransportOptionsSchema.extend({ ticketId: z.string(), kind: TicketKindSchema.optional() }),
    execute: async ({ ticketId, kind, ...options }, ctx) => {
      const ticket = await requireTicket(ctx, ticketId, kind);
      return ticket.investigate(ctx.store, { ...options, signal: ctx.signal });
    }
  });
  registry.register({
    name: 'claim_ticket',
    description: 'Atomically lease a ticket to an agent with a time-to-live to prevent concurrent collisions.',
    category: 'ticket',
    parameters: z.object({
      ticketId: z.string().describe('The ID of the ticket to lease (e.g. TKT-001)'),
      agentId: z.string().default('agent-1').describe('Identifier of the leasing agent'),
      durationMinutes: z.number().default(30).describe('Lease duration in minutes')
    }),
    execute: async ({ ticketId, agentId, durationMinutes }, ctx: ToolContext) => {
      const ticket = await requireTicket(ctx, ticketId);
      const eligibility = await ticketEligibility(ctx.store, ticket, agentId);
      if (!eligibility.eligible) return {success:false, message:eligibility.reasons.join(' ')};
      const result = await ctx.store.claimTicket(ticketId, agentId, durationMinutes);
      if (result.success) {
        try {
          await activateStoryTestsForTicket(ctx.store, ticketId, preview =>
            registry.execute('apply_change', {request:preview.request,fingerprint:preview.fingerprint,decision:'accept'}, ctx));
        } catch (error) { await ctx.store.releaseTicket(ticketId); throw error; }
      }
      return result;
    }
  });

  registry.register({
    name: 'release_ticket',
    description: 'Release an active ticket lease.',
    category: 'ticket',
    parameters: z.object({
      ticketId: z.string().describe('The ID of the ticket to release')
    }),
    execute: async ({ ticketId }, ctx: ToolContext) => {
      const success = await ctx.store.releaseTicket(ticketId);
      return { success, ticketId };
    }
  });

  registry.register({
    name: 'create_ticket',
    description: 'Create a new ticket in the AST+ Graph and sync with Kanban.',
    category: 'ticket',
    parameters: z.object({
      id: z.string().optional().describe('Optional custom ticket ID (e.g. TKT-002)'),
      title: z.string().min(1).describe('Brief, descriptive ticket title'),
      kind: TicketKindSchema.default('task'), defect: TicketDefectSchema.optional(),
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).default('Todo'),
      body: z.string().optional().describe('Detailed context, requirements, or acceptance criteria'),
      acceptanceCriteria: z.array(z.string()).optional(),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).default('P2')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `TKT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Ticket', id,
        fields: { title: params.title, body: params.body || '', priority: params.priority, kind:params.kind, defect:params.defect,
          acceptanceCriteria: params.acceptanceCriteria, ...ticketState(params.lane) } }]);
      await exportProjections(ctx.store, ctx.projectRoot);
      return {id,title:params.title,lane:params.lane,kind:params.kind};
    }
  });

  registry.register({
    name: 'update_ticket',
    description: 'Update editable Ticket content and optional Kanban lane through canonical Product mutation.',
    category: 'ticket',
    parameters: z.object({
      ticketId: z.string().describe('Ticket identifier'),
      defect: TicketDefectSchema.optional(),
      title: z.string().min(1).optional(),
      body: z.string().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional()
    }),
    execute: async ({ ticketId, lane, ...changes }, ctx: ToolContext) => {
      const ticket = await requireTicket(ctx, ticketId);
      const fields = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      if (lane === 'In Progress' && ticket.lane !== 'In Progress') {
        const eligibility = await ticketEligibility(ctx.store, ticket, loadConfig(ctx.projectRoot).defaultAgentId);
        if (!eligibility.eligible) throw Error(eligibility.reasons.join(' '));
        await activateStoryTestsForTicket(ctx.store, ticketId, preview =>
          registry.execute('apply_change', { request: preview.request, fingerprint: preview.fingerprint, decision: 'accept' }, ctx));
      }
      if (lane) Object.assign(fields, ticketState(lane));
      await applyProductMutations(ctx.store, [{
        kind: 'product_update',
        entityType: 'Ticket',
        id: ticketId,
        fields
      }]);
      await exportProjections(ctx.store, ctx.projectRoot);
      const updated = await requireTicket(ctx, ticketId);
      return {
        ticketId,
        kind:updated.kind ?? 'task', defect:updated.defect,
        title: updated.title,
        lane: updated.lane,
        status: updated.status,
        priority: updated.priority,
        body: updated.body,
        acceptanceCriteria: updated.acceptanceCriteria ?? []
      };
    }
  });

  registry.register({
    name: 'update_ticket_state',
    description: 'Update the lane and lifecycle status of a ticket.',
    category: 'ticket',
    parameters: z.object({
      ticketId: z.string().describe('Ticket identifier'),
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).describe('Target Kanban lane'),
      status: z.string().optional().describe('Optional lifecycle status')
    }),
    execute: async ({ ticketId, lane, status }, ctx: ToolContext) => {
      const ticket = await ctx.store.getEntity<Ticket>(ticketId, Ticket.dcr);
      if (!ticket) throw new Error(`Ticket ${ticketId} not found.`);
      if (lane === 'In Progress' && ticket.lane !== 'In Progress') {
        const eligibility = await ticketEligibility(ctx.store, ticket, loadConfig(ctx.projectRoot).defaultAgentId);
        if (!eligibility.eligible) throw Error(eligibility.reasons.join(' '));
        await activateStoryTestsForTicket(ctx.store, ticketId, preview =>
          registry.execute('apply_change', { request: preview.request, fingerprint: preview.fingerprint, decision: 'accept' }, ctx));
      }
      await applyProductMutations(ctx.store, [{ kind: 'product_update', entityType: 'Ticket', id: ticketId,
        fields: ticketState(lane, status) }]);
      return {
        ticketId,
        lane,
        status: ticketState(lane, status).status
      };
    }
  });

  registry.register({
    name: 'list_tickets',
    description: 'List tickets and their authored priority, lane and claim. Filter by lane; use the returned candidate data for comparisons rather than the next-task selector.',
    category: 'ticket',
    parameters: z.object({
      kind: TicketKindSchema.optional(), severity: TicketDefectSchema.shape.severity, query: z.string().optional(),
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional().describe('Filter by lane')
    }),
    execute: async ({ lane, kind, severity, query }, ctx: ToolContext) => {
      const tickets = (await ctx.store.listEntities<Ticket>(Ticket.dcr, lane ? {lane} : {})).filter(t =>
        (!kind || (t.kind ?? 'task') === kind) && (!severity || t.defect?.severity === severity) &&
        (!query || [ctx.store.localId(t.id), t.title, t.body].some(value => value?.toLowerCase().includes(query.toLowerCase()))));
      return tickets.map(t => ({
        id: ctx.store.localId(t.id),
        kind:t.kind ?? 'task', defect:t.defect,
        title: t.title,
        lane: t.lane,
        status: t.status,
        priority: t.priority,
        claim: t.claim
      }));
    }
  });

  registry.register({
    name: 'recommend_next_task', category: 'ticket',
    description: 'Algorithmic task selector: prioritizes eligible own leases, then In Progress, then Todo; explicit priority, typed Bug severity and creation/ID break ties. Missing prerequisites, partial Bug reports and foreign active leases are excluded.',
    parameters: z.object({agentId:z.string().optional()}),
    execute: async ({agentId}, ctx) => {
      const candidates: Array<{ticket:Ticket;created:string}> = [];
      const now=Date.now();
      for (const ticket of await ctx.store.listEntities<Ticket>(Ticket.dcr))
        if ((await ticketEligibility(ctx.store,ticket,agentId)).eligible)
          candidates.push({ticket,created:await ticket.getField<string>('_created') ?? ''});
      const group = (ticket:Ticket) => ticket.claim && Date.parse(ticket.claim.expiresAt) > now && ticket.claim.agentId === agentId ? 0 : ticket.lane === 'In Progress' ? 1 : 2;
      const severity = (ticket:Ticket) => ticket.kind === 'bug' && ticket.defect?.severity ? ['critical','high','medium','low'].indexOf(ticket.defect.severity) : 4;
      candidates.sort((a,b) => group(a.ticket)-group(b.ticket) || a.ticket.priority.localeCompare(b.ticket.priority) ||
        severity(a.ticket)-severity(b.ticket) || a.created.localeCompare(b.created) || a.ticket.id.localeCompare(b.ticket.id));
      const ticket=candidates[0]?.ticket;
      return {ticket:ticket ? {id:ctx.store.localId(ticket.id),title:ticket.title,lane:ticket.lane,kind:ticket.kind ?? 'task',priority:ticket.priority,defect:ticket.defect} : null,
        reason:!ticket ? 'No pending tasks are eligible: check lanes, prerequisites, report completeness and active claims.' :
          group(ticket)===0 ? (ticket.lane==='In Progress'?'Active task currently in progress (eligible own lease).':'Eligible work with an active owned lease.') :
          group(ticket)===1 ? 'Unleased task in In Progress lane ready for pickup.' :
          ticket.kind==='bug' && ['P0','P1'].includes(ticket.priority) ? 'High-priority bug fix pending in Todo lane (explicit priority/severity order).' :
          'Next planned task in Todo lane (eligible prerequisites and report).' };
    }
  });

  registry.register({name:'create_bug',category:'ticket',description:'Report a first-class Bug on the canonical Ticket store; partial reports retain unknowns.',
    parameters:z.object({id:z.string().optional(),title:z.string().min(1),body:z.string().optional(),priority:z.enum(['P0','P1','P2','P3']).default('P2'),defect:TicketDefectSchema.optional(),acceptanceCriteria:z.array(z.string()).optional()}),
    execute:async(params,ctx)=>{
      if (assessBug({kind:'bug',defect:params.defect}).ready) {
        const keys=['reproduction','expected','actual','environment'] as const;
        const duplicate=(await ctx.store.listEntities<Ticket>(Ticket.dcr)).find(ticket=>ticket.kind==='bug' && !['Done','Backlog'].includes(ticket.lane) &&
          keys.every(key=>(ticket.defect?.[key]??'').trim()===(params.defect?.[key]??'').trim()));
        if (duplicate) return {status:'needs_input',artifactId:ctx.store.localId(duplicate.id),required:[{question:'Update or relate the existing Bug '+ctx.store.localId(duplicate.id)+'.',why:'The same reproducible defect is already active.',target:'Bug identity'}]};
      }
      return registry.execute('create_ticket',{...params,kind:'bug'},ctx);
    }});
  registry.register({name:'get_bug',category:'ticket',description:'Read an explicitly typed Bug. Tasks are refused.',parameters:z.object({ticketId:z.string()}),
    execute:async(params,ctx)=>{
      const ticket=await requireTicket(ctx,params.ticketId);
      if(ticket.kind!=='bug') throw Error(`Ticket '${params.ticketId}' is a task, not a Bug.`);
      return registry.execute('get_ticket',params,ctx);
    }});
  registry.register({name:'list_bugs',category:'ticket',description:'Filter canonical Bugs by lane, severity or text.',
    parameters:z.object({lane:z.enum(['Backlog','Todo','In Progress','Done','Blocked']).optional(),severity:TicketDefectSchema.shape.severity,query:z.string().optional()}),
    execute:(params,ctx)=>registry.execute('list_tickets',{...params,kind:'bug'},ctx)});
  registry.register({name:'update_bug',category:'ticket',description:'Complete or edit a Bug report in place, preserving unspecified defect fields.',
    parameters:z.object({ticketId:z.string(),title:z.string().min(1).optional(),body:z.string().optional(),priority:z.enum(['P0','P1','P2','P3']).optional(),defect:TicketDefectSchema.optional(),acceptanceCriteria:z.array(z.string()).optional(),lane:z.enum(['Backlog','Todo','In Progress','Blocked']).optional()}),
    execute:async({ticketId,defect,...fields},ctx)=>{
      await registry.execute('get_bug',{ticketId},ctx);
      const ticket=await requireTicket(ctx,ticketId);
      return registry.execute('update_ticket',{ticketId,...fields,...(defect ? {defect:{...ticket.defect,...defect}} : {})},ctx);
    }});
  registry.register({name:'triage_bug',category:'ticket',description:'Inspect missing reproduction fields, canonical prerequisites, related artifacts and current proof without fabricating readiness.',
    parameters:z.object({ticketId:z.string(),agentId:z.string().optional()}),
    execute:async({ticketId,agentId},ctx)=>{
      const bug=await registry.execute('get_bug',{ticketId},ctx);
      const ticket=await requireTicket(ctx,ticketId);
      return {...bug,...assessBug(ticket),...await ticketEligibility(ctx.store,ticket,agentId),
        verificationState:bug.verification?'recorded-unchecked':'unverified'};
    }});
}
