/**
 * Responsibility: Own the Ticket domain entity and its contracts.
 * Scope: Work specification, defect assessment, lifecycle invariants and operation entry points.
 */
import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity, type BaseEntityData } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'
import { ticketCompleteness } from '../artifact-policy.ts'
import type { CompletenessLevel } from '../artifact-policy.ts'
import { PrioritySchema } from './types.ts'
import { z } from 'zod'
import type { InvestigationOptions, OperationResult, PreparationOptions, PreparedTicket, ResolutionOptions, ResolvedTicket, TicketDossier } from '../ticket-operation-types.ts'

const {status: _ticketStatus, ...ticketTemplate} = baseTemplate


export const TicketKindSchema = z.enum(['task', 'bug']);
export const TicketDefectSchema = z.object({
  reproduction: z.string().optional(), expected: z.string().optional(), actual: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(), impact: z.string().optional(),
  environment: z.string().optional(), evidence: z.array(z.string().min(1)).optional()
}).strict();

export const TicketLaneSchema = z.enum(['Backlog', 'Todo', 'In Progress', 'Blocked', 'Done', 'Cancelled']);

export type TicketDefect = z.infer<typeof TicketDefectSchema>;

export interface TicketClaim {
  leaseId: string;
  agentId: string;
  claimedAt: string;
  expiresAt: string;
}
export interface TicketData extends Omit<BaseEntityData, 'status'> {
  kind?: 'task' | 'bug';
  defect?: TicketDefect;
  acceptanceCriteria?: string[];
  lane: TicketLane;
  priority?: number;
  claim?: TicketClaim;
  estimateTokens?: number;
}
export type TicketLane = z.infer<typeof TicketLaneSchema>;

export class Ticket extends WorkflowEntity {
    declare kind: 'task' | 'bug'
    declare defect?: TicketDefect
    declare priority: number
    declare body: string
    declare lane: TicketLane
    declare acceptanceCriteria?: string[]
    declare claim?: TicketClaim | null
    /** Assess report completeness for persisted Tickets and prospective Bug reports. */
    static assessBug(ticket: Pick<Ticket, 'kind' | 'defect'>) {
        const missing = ticket.kind === 'bug' ? ['reproduction', 'expected', 'actual'].filter(key =>
            !ticket.defect?.[key as 'reproduction' | 'expected' | 'actual']?.trim()) : [];
        return {ready: missing.length === 0, missing};
    }

    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    getCompletenessContext(store: WorkflowStore, override?: CompletenessLevel) {
        return ticketCompleteness(this, store, override)
    }
    async investigate(store: WorkflowStore, options: InvestigationOptions = {}): Promise<OperationResult<TicketDossier>> {
        const { investigateTicket } = await import("../services/investigation-service.ts")
        return investigateTicket(this, store, options)
    }

    async prepare(store: WorkflowStore, options: PreparationOptions = {}): Promise<OperationResult<PreparedTicket>> {
        const { prepareTicket } = await import("../ticket/prepare.ts")
        return prepareTicket(this, store, options)
    }

    async resolve(store: WorkflowStore, options: ResolutionOptions = {}): Promise<OperationResult<ResolvedTicket>> {
        const { resolveTicket } = await import("../ticket/resolve.ts")
        return resolveTicket(this, store, options)
    }

    static template = {
        ...ticketTemplate,
        acceptanceCriteria: passthroughValidator,
        lane: { validate: (v: unknown) => ({ value: TicketLaneSchema.parse(v ?? "Backlog") }) },
        priority: { validate: (v: unknown) => ({ value: PrioritySchema.default(2).parse(v) }) },
        claim: passthroughValidator,
        estimateTokens: passthroughValidator,
        kind: {validate: (v: unknown) => ({value: TicketKindSchema.parse(v ?? 'task')})},
        defect: {validate: (v: unknown) => ({value: v == null ? undefined : TicketDefectSchema.parse(v)})}
    }
    static readonly dcr = new EntityDcr(Ticket, Ticket.template, "Ticket")
}

/** Generic transitions may preserve historical Done, but only the completion owner can enter it. */
export function assertTicketAuthoring(fields: {lane?: unknown; status?: unknown}, previous?: {lane?: unknown}): void {
  if ('status' in fields) throw Error('Ticket.status was removed; use lane.');
  if (fields.lane !== undefined) TicketLaneSchema.parse(fields.lane);
  if (fields.lane === 'Done' && previous?.lane !== 'Done')
    throw Error('Done is owned by independent Ticket completion. Use resolve_ticket; generic authoring cannot complete work.');
  if (previous?.lane === 'Cancelled' && fields.lane !== undefined && !['Cancelled','Backlog','Todo'].includes(String(fields.lane)))
    throw Error('Reopen cancelled work to Backlog or Todo before execution.');
}

export function ticketState(lane: TicketLane): {lane: TicketLane} {
  return {lane: TicketLaneSchema.parse(lane)};
}
