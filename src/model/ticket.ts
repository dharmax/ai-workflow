import { EntityDcr } from '@dharmax/semantika'
import { WorkflowEntity } from './workflow-entity.ts'
import { baseTemplate, passthroughValidator } from './entity-templates.ts'
import type { WorkflowStore } from '../graph/store.ts'
import { applicableAspects, assessAspects, reviewMissingAspects } from '../aspects.ts'
import { ticketCompleteness } from '../artifact-policy.ts'
import type { CompletenessLevel } from '../artifact-policy.ts'
import { PrioritySchema } from './types.ts'
import { TicketKindSchema, TicketDefectSchema, TicketLaneSchema } from './ticket-state.ts'
import type { InvestigationOptions, OperationResult, PreparationOptions, PreparedTicket, ResolutionOptions, ResolvedTicket, TicketDossier } from '../ticket-operation-types.ts'

const {status: _ticketStatus, ...ticketTemplate} = baseTemplate

export class Ticket extends WorkflowEntity {
    declare kind: 'task' | 'bug'
    declare defect?: import("./types.ts").TicketDefect
    declare priority: number
    declare body: string
    declare lane: import("./types.ts").TicketLane
    declare acceptanceCriteria?: string[]
    declare claim?: import("./types.ts").TicketClaim | null
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
