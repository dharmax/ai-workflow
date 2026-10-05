/**
 * Responsibility: Ticket and Lease Management Facility.
 * Scope: Atomic leases, lane transitions, ticket listing, and next-task recommendation.
 */

import { z } from 'zod';
import { ticketState } from '../graph/ticket-state.ts';
import { ArtifactTransportOptionsSchema } from '../artifact-policy.ts';
import { registry, type ToolContext } from './registry.ts';
import { Ticket } from '../graph/ontology.ts';
import type { TicketLane } from '../graph/types.ts';
import { applyProductMutations } from '../product/mutation.ts';

async function requireTicket(ctx: ToolContext, ticketId: string): Promise<Ticket> {
  const ticket = await ctx.store.getEntity<Ticket>(ticketId, Ticket.dcr);
  if (!ticket) throw new Error(`Ticket '${ticketId}' not found in AIWF project '${ctx.projectRoot}'. Verify the active project with 'aiwf status' and synchronize its projections if needed.`);
  return ticket;
}

export function registerTicketTools() {
  registry.register({
    name: 'resolve_ticket', description: 'Own a Ticket through bounded leased preparation, safe implementation, tests, repair and explicit acceptance verification.', category: 'ticket',
    parameters: ArtifactTransportOptionsSchema.extend({ ticketId: z.string(), agentId: z.string().optional(), maxRepairs: z.number().int().min(0).max(3).optional(), allowDirtyTargets: z.array(z.string()).optional(), testCommands: z.array(z.array(z.string()).min(1)).optional() }),
    execute: async ({ ticketId, ...options }, ctx) => {
      const ticket = await requireTicket(ctx, ticketId);
      return ticket.resolve(ctx.store, options);
    }
  });
  registry.register({
    name: 'prepare_ticket', description: 'Make a Ticket executable through read-only investigation, independent proposal review and leased safe enrichment/decomposition.', category: 'ticket',
    parameters: ArtifactTransportOptionsSchema.extend({ ticketId: z.string(), agentId: z.string().optional() }),
    execute: async ({ ticketId, ...options }, ctx) => {
      const ticket = await requireTicket(ctx, ticketId);
      return ticket.prepare(ctx.store, options);
    }
  });
  registry.register({
    name: 'investigate_ticket', description: 'Return a grounded, semantically read-only Ticket dossier with proposed enrichments and precise disposition.', category: 'ticket',
    parameters: ArtifactTransportOptionsSchema.extend({ ticketId: z.string() }),
    execute: async ({ ticketId, ...options }, ctx) => {
      const ticket = await requireTicket(ctx, ticketId);
      return ticket.investigate(ctx.store, options);
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
      return await ctx.store.claimTicket(ticketId, agentId, durationMinutes);
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
      title: z.string().describe('Brief, descriptive ticket title'),
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).default('Todo'),
      body: z.string().optional().describe('Detailed context, requirements, or acceptance criteria'),
      acceptanceCriteria: z.array(z.string()).optional(),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).default('P2')
    }),
    execute: async (params, ctx: ToolContext) => {
      const id = params.id || `TKT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await applyProductMutations(ctx.store, [{ kind: 'product_create', entityType: 'Ticket', id,
        fields: { title: params.title, body: params.body || '', priority: params.priority,
          acceptanceCriteria: params.acceptanceCriteria, ...ticketState(params.lane) } }]);
      return {
        id,
        title: params.title,
        lane: params.lane
      };
    }
  });

  registry.register({
    name: 'update_ticket',
    description: 'Update editable Ticket content and optional Kanban lane through canonical Product mutation.',
    category: 'ticket',
    parameters: z.object({
      ticketId: z.string().describe('Ticket identifier'),
      title: z.string().min(1).optional(),
      body: z.string().optional(),
      acceptanceCriteria: z.array(z.string()).optional(),
      priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional()
    }),
    execute: async ({ ticketId, lane, ...changes }, ctx: ToolContext) => {
      const ticket = await requireTicket(ctx, ticketId) as any;
      const fields = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      if (lane) Object.assign(fields, ticketState(lane));
      await applyProductMutations(ctx.store, [{
        kind: 'product_update',
        entityType: 'Ticket',
        id: ticketId,
        fields
      }]);
      const updated = await requireTicket(ctx, ticketId) as any;
      return {
        ticketId,
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
      if (!await ctx.store.getEntity(ticketId, Ticket.dcr)) throw new Error(`Ticket ${ticketId} not found.`);
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
    description: 'List tickets filtered by lane or status.',
    category: 'ticket',
    parameters: z.object({
      lane: z.enum(['Backlog', 'Todo', 'In Progress', 'Done', 'Blocked']).optional().describe('Filter by lane')
    }),
    execute: async ({ lane }, ctx: ToolContext) => {
      const query = lane ? { lane } : {};
      const tickets = await ctx.store.listEntities<Ticket>(Ticket.dcr, query);
      return tickets.map(t => ({
        id: ctx.store.localId(t.id),
        title: (t as any).title,
        lane: (t as any).lane,
        status: (t as any).status,
        claim: (t as any).claim
      }));
    }
  });

  registry.register({
    name: 'recommend_next_task',
    description: 'Algorithmic task selector: prioritizes active agent lease -> high-priority bugs -> unblocked Todo tasks.',
    category: 'ticket',
    parameters: z.object({
      agentId: z.string().optional().describe('Optional agent ID to prioritize tickets claimed by this agent')
    }),
    execute: async ({ agentId }, ctx: ToolContext) => {
      const tickets = await ctx.store.listEntities<Ticket>(Ticket.dcr);
      const now = new Date();

      const isClaimActive = (claim: any) => {
        if (!claim || !claim.expiresAt) return false;
        return new Date(claim.expiresAt) > now;
      };

      const isClaimedByOther = (t: Ticket) => {
        const claim = (t as any).claim;
        if (!isClaimActive(claim)) return false;
        if (agentId && claim.agentId === agentId) return false;
        return true;
      };

      // 1. Task currently in progress and claimed by this agent (or any active claim if no agent specified)
      const inProgress = tickets.filter(t => {
        if ((t as any).lane !== 'In Progress') return false;
        const claim = (t as any).claim;
        if (!isClaimActive(claim)) return false;
        return agentId ? claim.agentId === agentId : true;
      });

      if (inProgress.length > 0) {
        return {
          ticket: {
            id: ctx.store.localId(inProgress[0].id),
            title: (inProgress[0] as any).title,
            lane: (inProgress[0] as any).lane
          },
          reason: `Active task currently in progress${(inProgress[0] as any).claim?.agentId ? ` (leased by ${(inProgress[0] as any).claim.agentId})` : ''}.`
        };
      }

      // 2. High-priority bugs in Todo (not actively claimed by another agent)
      const bugs = tickets.filter(t => {
        if ((t as any).lane !== 'Todo' || isClaimedByOther(t)) return false;
        const title = ((t as any).title || '').toLowerCase();
        const id = t.id.toLowerCase();
        return id.includes('bug') || title.includes('bug') || title.includes('fix');
      });

      if (bugs.length > 0) {
        return {
          ticket: {
            id: ctx.store.localId(bugs[0].id),
            title: (bugs[0] as any).title,
            lane: (bugs[0] as any).lane
          },
          reason: 'High-priority bug fix pending in Todo lane.'
        };
      }

      // 3. Unleased task in In Progress lane (e.g. starter task or expired lease pickup)
      const unleasedInProgress = tickets.filter(t => (t as any).lane === 'In Progress' && !isClaimedByOther(t));
      if (unleasedInProgress.length > 0) {
        return {
          ticket: {
            id: ctx.store.localId(unleasedInProgress[0].id),
            title: (unleasedInProgress[0] as any).title,
            lane: (unleasedInProgress[0] as any).lane
          },
          reason: 'Unleased task in In Progress lane ready for pickup.'
        };
      }

      // 4. Next available Todo task
      const todos = tickets.filter(t => (t as any).lane === 'Todo' && !isClaimedByOther(t));
      if (todos.length > 0) {
        return {
          ticket: {
            id: ctx.store.localId(todos[0].id),
            title: (todos[0] as any).title,
            lane: (todos[0] as any).lane
          },
          reason: 'Next planned task in Todo lane.'
        };
      }

      return {
        ticket: null,
        reason: 'All tasks are completed or currently leased by other agents.'
      };
    }
  });
}
