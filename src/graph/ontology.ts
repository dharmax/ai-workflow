/**
 * Responsibility: Define Semantika Entity and Predicate descriptors for the AST+ Semantic Graph.
 * Scope: Complete ontological graph model connecting code, architecture, roadmap, and artifacts.
 */

import { AbstractEntity, EntityDcr, PredicateDcr, RawOntology } from "@dharmax/semantika"

import { CompletenessSchema, scopeTarget, ticketCompleteness, type CompletenessLevel } from "../artifact-policy.ts"
import type { WorkflowStore } from "./store.ts"

import { applicableAspects, assessAspects, reviewMissingAspects } from "../aspects.ts"

import type { ProcessOptions, ProcessedIntent } from "../product/process-types.ts"
import type {
    InvestigationOptions,
    OperationResult,
    PreparationOptions,
    PreparedTicket,
    ResolutionOptions,
    ResolvedTicket,
    TicketDossier
} from "../ticket-operation-types.ts"

const completenessValidator = { validate: (v: unknown) => ({ value: v == null ? undefined : CompletenessSchema.parse(v) }) }
const passthroughValidator = { validate: (v: unknown) => ({ value: v }) }

const baseTemplate = {
    id: passthroughValidator,
    _id: passthroughValidator,
    title: passthroughValidator,
    status: { validate: (v: unknown) => ({ value: v ?? "implemented" }) },
    body: { validate: (v: unknown) => ({ value: v ?? "" }) },
    metadata: { validate: (v: unknown) => ({ value: v ?? {} }) },
    createdAt: passthroughValidator,
    updatedAt: passthroughValidator
}

// -----------------------------------------------------------------------------
// Durable Domain Entities (aiwf-durable)
// -----------------------------------------------------------------------------

export abstract class WorkflowEntity extends AbstractEntity {
    declare title?: string
    declare body?: string
    static readonly dcr: EntityDcr

    override typeName(): string {
        return (this.constructor as typeof WorkflowEntity).dcr?.name || this.constructor.name
    }

    override get descriptor(): EntityDcr {
        return (this.constructor as typeof WorkflowEntity).dcr || super.descriptor
    }

    /** Shared concrete reconciliation for the three Product Intent entities; no workflow state is persisted. */
    static async processIntent(
        root: Epic | Feature | UserStory,
        store: WorkflowStore,
        options: ProcessOptions
    ): Promise<OperationResult<ProcessedIntent>> {
        const { processIntent } = await import("../product/process.ts")
        return processIntent(store, root, options)
    }
}

export class Idea extends WorkflowEntity {
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    static template = {
        ...baseTemplate,
        feasibility: passthroughValidator,
        impact: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Idea, Idea.template, "Idea")
}

export class Goal extends WorkflowEntity {
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) }
    }
    static readonly dcr = new EntityDcr(Goal, Goal.template, "Goal")
}

export class Concept extends WorkflowEntity {
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) }
    }
    static readonly dcr = new EntityDcr(Concept, Concept.template, "Concept")
}

export class Flow extends WorkflowEntity {
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        actor: passthroughValidator,
        context: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Flow, Flow.template, "Flow")
}

export class Epic extends WorkflowEntity {
    process(store: WorkflowStore, options: ProcessOptions = {}) {
        return WorkflowEntity.processIntent(this, store, options)
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
    declare completenessTarget?: CompletenessLevel | null
    getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) {
        return scopeTarget(this, store, options)
    }
    async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
        return store.upsertEntity(Epic.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        priority: { validate: (v: unknown) => ({ value: v ?? 1 }) }
    }
    static readonly dcr = new EntityDcr(Epic, Epic.template, "Epic")
}

export class Feature extends WorkflowEntity {
    declare priority?: number
    process(store: WorkflowStore, options: ProcessOptions = {}) {
        return WorkflowEntity.processIntent(this, store, options)
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
    declare completenessTarget?: CompletenessLevel | null
    getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) {
        return scopeTarget(this, store, options)
    }
    async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
        return store.upsertEntity(Feature.dcr, { id: this.id, completenessTarget: level == null ? null : CompletenessSchema.parse(level) })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        priority: passthroughValidator,
        acceptanceCriteria: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Feature, Feature.template, "Feature")
}

export class UserStory extends WorkflowEntity {
    declare actor?: string
    declare intent?: string
    declare initialState?: string
    declare action?: string
    declare expectedResult?: string
    declare exceptions?: string
    declare bounds?: string
    declare story?: string
    declare context?: string
    declare acceptanceCriteria?: string[]
    declare sla?: string

    /** Read-time migration: retain historical acceptance and never guess missing scenario content. */
    get definitionReview() {
        const missingFields = (["actor", "intent", "initialState", "action", "expectedResult"] as const)
            .filter(field => typeof this[field] !== "string" || !this[field]?.trim())
        return { status: missingFields.length ? "needs_review" as const : "complete" as const, missingFields }
    }
    process(store: WorkflowStore, options: ProcessOptions = {}) {
        return WorkflowEntity.processIntent(this, store, options)
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
    declare completenessTarget?: CompletenessLevel | null
    getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) {
        return scopeTarget(this, store, options)
    }
    async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
        return store.upsertEntity(UserStory.dcr, {
            id: this.id,
            completenessTarget: level == null ? null : CompletenessSchema.parse(level)
        })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        actor: passthroughValidator,
        intent: passthroughValidator,
        initialState: passthroughValidator,
        action: passthroughValidator,
        expectedResult: passthroughValidator,
        exceptions: passthroughValidator,
        bounds: passthroughValidator,
        story: passthroughValidator,
        context: passthroughValidator,
        acceptanceCriteria: passthroughValidator,
        sla: passthroughValidator
    }
    static readonly dcr = new EntityDcr(UserStory, UserStory.template, "UserStory")
}

export class Aspect extends WorkflowEntity {
    declare title: string
    declare body: string
    declare status: "draft" | "proposed" | "accepted" | "deprecated"
    declare acceptanceCriteria?: string[]
    static template = {
        ...baseTemplate,
        status: { validate: (v: unknown) => ({ value: v ?? "draft" }) },
        acceptanceCriteria: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Aspect, Aspect.template, "Aspect")
    static async create(
        store: WorkflowStore,
        data: {
            id: string
            title: string
            body?: string
            status?: "draft" | "proposed" | "accepted" | "deprecated"
            acceptanceCriteria?: string[]
        }
    ) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        const { id, ...fields } = data
        await applyProductMutations(store, [{ kind: "product_create", entityType: "Aspect", id, fields }])
        return (await store.getEntity<Aspect>(id, Aspect.dcr))!
    }
    async revise(
        store: WorkflowStore,
        fields: { title?: string; body?: string; status?: "draft" | "proposed" | "accepted" | "deprecated"; acceptanceCriteria?: string[] }
    ) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        await applyProductMutations(store, [{ kind: "product_update", entityType: "Aspect", id: store.localId(this.id), fields }])
        return (await store.getEntity<Aspect>(this.id, Aspect.dcr))!
    }
    async view(store: WorkflowStore) {
        const scopes = (await store.getOutgoing(this.id, "applies_to")).map(e => store.localId(e.targetId)).sort()
        return {
            id: store.localId(this.id),
            version: this.version,
            title: this.title,
            body: this.body,
            status: this.status,
            acceptanceCriteria: this.acceptanceCriteria ?? [],
            scopes,
            assessment: (await assessAspects(this, store, [this])).aspects[0]
        }
    }
    async applyTo(scope: WorkflowEntity, store: WorkflowStore) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        await applyProductMutations(store, [
            { kind: "product_link", sourceId: store.localId(this.id), predicate: "applies_to", targetId: store.localId(scope.id) }
        ])
    }
    async removeFrom(scope: WorkflowEntity, store: WorkflowStore) {
        const { applyProductMutations } = await import("../product/mutation.ts")
        await applyProductMutations(store, [
            { kind: "product_unlink", sourceId: store.localId(this.id), predicate: "applies_to", targetId: store.localId(scope.id) }
        ])
    }
    assess(scope: WorkflowEntity, store: WorkflowStore) {
        return assessAspects(scope, store, [this])
    }
}

export class Ticket extends WorkflowEntity {
    declare body: string
    declare lane: import("./types.ts").TicketLane
    declare status: import("./types.ts").TicketStatus
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
        const { investigateTicket } = await import("../ticket/investigate.ts")
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
        ...baseTemplate,
        acceptanceCriteria: passthroughValidator,
        lane: { validate: (v: unknown) => ({ value: v ?? "Backlog" }) },
        priority: { validate: (v: unknown) => ({ value: v ?? "P2" }) },
        claim: passthroughValidator,
        estimateTokens: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Ticket, Ticket.template, "Ticket")
}

export class ModuleNode extends WorkflowEntity {
    applicableAspects(store: WorkflowStore) {
        return applicableAspects(this, store)
    }
    assessAspects(store: WorkflowStore) {
        return assessAspects(this, store)
    }
    reviewMissingAspects(store: WorkflowStore, options: Parameters<typeof reviewMissingAspects>[2]) {
        return reviewMissingAspects(this, store, options)
    }
    declare completenessTarget?: CompletenessLevel | null
    getCompletenessTarget(store: WorkflowStore, options?: Parameters<typeof scopeTarget>[2]) {
        return scopeTarget(this, store, options)
    }
    async setCompletenessTarget(store: WorkflowStore, level: CompletenessLevel | null) {
        return store.upsertEntity(ModuleNode.dcr, {
            id: this.id,
            completenessTarget: level == null ? null : CompletenessSchema.parse(level)
        })
    }
    static template = {
        ...baseTemplate,
        completenessTarget: completenessValidator,
        path: passthroughValidator
    }
    static readonly dcr = new EntityDcr(ModuleNode, ModuleNode.template, "ModuleNode")
}

export class FileNode extends WorkflowEntity {
    declare language?: string
    static template = {
        ...baseTemplate,
        path: passthroughValidator,
        language: passthroughValidator,
        fileKind: passthroughValidator,
        size: passthroughValidator,
        hash: passthroughValidator,
        mtime: passthroughValidator
    }
    static readonly dcr = new EntityDcr(FileNode, FileNode.template, "FileNode")
}

export class SymbolNode extends WorkflowEntity {
    declare title?: string
    declare body?: string
    status?: string
    filePath?: string
    kind?: string
    exported?: boolean
    line?: number
    column?: number
    signature?: string
    containerName?: string

    static template = {
        ...baseTemplate,
        filePath: passthroughValidator,
        kind: passthroughValidator,
        exported: { validate: (v: unknown) => ({ value: Boolean(v) }) },
        line: { validate: (v: unknown) => ({ value: Number(v) || 1 }) },
        column: { validate: (v: unknown) => ({ value: Number(v) || 0 }) },
        signature: passthroughValidator,
        containerName: passthroughValidator
    }
    static readonly dcr = new EntityDcr(SymbolNode, SymbolNode.template, "SymbolNode")
}

export class TestNode extends WorkflowEntity {
    declare filePath?: string
    declare targetPath?: string
    declare framework?: string
    declare lastRun?: string
    declare passed?: boolean
    declare failure?: string
    declare exitCode?: number
    declare durationMs?: number
    declare command?: string[]
    declare output?: string
    declare executionHashes?: Record<string, string>

    static template = {
        ...baseTemplate,
        filePath: passthroughValidator,
        targetPath: passthroughValidator,
        framework: passthroughValidator,
        lastRun: passthroughValidator,
        passed: passthroughValidator,
        failure: passthroughValidator,
        exitCode: passthroughValidator,
        durationMs: passthroughValidator,
        command: passthroughValidator,
        output: passthroughValidator,
        executionHashes: passthroughValidator
    }
    static readonly dcr = new EntityDcr(TestNode, TestNode.template, "TestNode")
}

export class Decision extends WorkflowEntity {
    declare decision?: string
    declare context?: string
    declare consequences?: string
    static template = {
        ...baseTemplate,
        decision: passthroughValidator,
        context: passthroughValidator,
        consequences: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Decision, Decision.template, "Decision")
}

export class Lesson extends WorkflowEntity {
    static template = {
        ...baseTemplate,
        ticketId: passthroughValidator,
        filePath: passthroughValidator,
        noteType: { validate: (v: unknown) => ({ value: v ?? "LESSON" }) },
        preventionPattern: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Lesson, Lesson.template, "Lesson")
}

export class Artifact extends WorkflowEntity {
    static template = {
        ...baseTemplate,
        action: passthroughValidator,
        output: passthroughValidator,
        patchPath: passthroughValidator,
        reportUrl: passthroughValidator
    }
    static readonly dcr = new EntityDcr(Artifact, Artifact.template, "Artifact")
}

export class Rule extends WorkflowEntity {
    declare ruleId: string
    declare type: string
    declare scope: any
    declare importance: number
    declare rule: string
    declare status: "active" | "draft" | "disabled"
    declare disableReason?: string
    declare languages?: string[]
    declare examples?: any[]
    declare references?: any[]
    declare test?: any
    declare revision: number
    declare provenance: string

    static template = {
        ...baseTemplate,
        ruleId: passthroughValidator,
        type: { validate: (v: unknown) => ({ value: v ?? "universal" }) },
        scope: { validate: (v: unknown) => ({ value: v ?? { kind: "universal" } }) },
        importance: { validate: (v: unknown) => ({ value: typeof v === "number" ? v : 5 }) },
        rule: passthroughValidator,
        status: { validate: (v: unknown) => ({ value: v ?? "active" }) },
        disableReason: passthroughValidator,
        languages: passthroughValidator,
        examples: { validate: (v: unknown) => ({ value: Array.isArray(v) ? v : [] }) },
        references: { validate: (v: unknown) => ({ value: Array.isArray(v) ? v : [] }) },
        test: { validate: (v: unknown) => ({ value: v ?? { kind: "llm" } }) },
        revision: { validate: (v: unknown) => ({ value: typeof v === "number" ? v : 1 }) },
        provenance: { validate: (v: unknown) => ({ value: v ?? "bundled-default" }) }
    }
    static readonly dcr = new EntityDcr(Rule, Rule.template, "Rule")
}

// -----------------------------------------------------------------------------
// Ephemeral In-Memory Entities (aiwf-ephemeral)
// -----------------------------------------------------------------------------

export class CallSite extends WorkflowEntity {
    static template = {
        ...baseTemplate,
        callerFile: passthroughValidator,
        calleeName: passthroughValidator,
        line: passthroughValidator,
        column: passthroughValidator
    }
    static readonly dcr = new EntityDcr(CallSite, CallSite.template, "CallSite")
}

export class TraceNode extends WorkflowEntity {
    static template = {
        ...baseTemplate,
        traceId: passthroughValidator,
        step: passthroughValidator,
        input: passthroughValidator,
        output: passthroughValidator,
        durationMs: passthroughValidator
    }
    static readonly dcr = new EntityDcr(TraceNode, TraceNode.template, "TraceNode")
}

// Aliases for compatibility
export {
    Artifact as ArtifactEntity,
    Decision as DecisionEntity,
    Epic as EpicEntity,
    Feature as FeatureEntity,
    FileNode as FileEntity,
    Idea as IdeaEntity,
    Lesson as LessonEntity,
    ModuleNode as ModuleEntity,
    SymbolNode as SymbolEntity,
    TestNode as TestEntity,
    Ticket as TicketEntity,
    UserStory as UserStoryEntity
}

export const durableEntityDescriptors = [
    Aspect.dcr,
    Idea.dcr,
    Goal.dcr,
    Concept.dcr,
    Flow.dcr,
    Epic.dcr,
    Feature.dcr,
    UserStory.dcr,
    Ticket.dcr,
    ModuleNode.dcr,
    FileNode.dcr,
    SymbolNode.dcr,
    TestNode.dcr,
    Decision.dcr,
    Lesson.dcr,
    Artifact.dcr,
    Rule.dcr
]

export const ephemeralEntityDescriptors = [CallSite.dcr, TraceNode.dcr]

export const entityDescriptors = [...durableEntityDescriptors, ...ephemeralEntityDescriptors]

for (const dcr of entityDescriptors) {
    dcr.collectionName = dcr.name
}

// Predicate payload schema
export const predicatePayloadTemplate = {
    confidence: passthroughValidator,
    state: passthroughValidator,
    weight: passthroughValidator,
    note: passthroughValidator,
    sourceRange: passthroughValidator,
    timestamp: passthroughValidator
}

export const semanticPredicates = {
    applies_to: new PredicateDcr("applies_to", [], { target: ["title"] }, predicatePayloadTemplate),
    contains: new PredicateDcr("contains", [], { target: ["title"] }, predicatePayloadTemplate),
    calls: new PredicateDcr("calls", [], { target: ["title"] }, predicatePayloadTemplate),
    inherits: new PredicateDcr("inherits", [], { target: ["title"] }, predicatePayloadTemplate),
    depends_on: new PredicateDcr("depends_on", [], { target: ["title"] }, predicatePayloadTemplate),
    imports: new PredicateDcr("imports", [], { target: ["title"] }, predicatePayloadTemplate),
    implements: new PredicateDcr("implements", [], { target: ["title"] }, predicatePayloadTemplate),
    enables: new PredicateDcr("enables", [], { target: ["title"] }, predicatePayloadTemplate),
    serves: new PredicateDcr("serves", [], { target: ["title"] }, predicatePayloadTemplate),
    addresses: new PredicateDcr("addresses", [], { target: ["title"] }, predicatePayloadTemplate),
    modifies: new PredicateDcr("modifies", [], { target: ["title"] }, predicatePayloadTemplate),
    targets: new PredicateDcr("targets", [], { target: ["title"] }, predicatePayloadTemplate),
    verifies: new PredicateDcr("verifies", [], { target: ["title"] }, predicatePayloadTemplate),
    fuzzy_relates: new PredicateDcr("fuzzy_relates", [], { target: ["title"] }, predicatePayloadTemplate),
    potentially_affects: new PredicateDcr("potentially_affects", [], { target: ["title"] }, predicatePayloadTemplate),
    governs: new PredicateDcr("governs", [], { target: ["title"] }, predicatePayloadTemplate),
    blocks: new PredicateDcr("blocks", [], { target: ["title"] }, predicatePayloadTemplate),
    inspires: new PredicateDcr("inspires", [], { target: ["title"] }, predicatePayloadTemplate),
    generates: new PredicateDcr("generates", [], { target: ["title"] }, predicatePayloadTemplate),
    trace_links: new PredicateDcr("trace_links", [], { target: ["title"] }, predicatePayloadTemplate)
}

export const predicateDescriptors = Object.values(semanticPredicates)

export const durableOntology = new RawOntology(durableEntityDescriptors, predicateDescriptors)
export const ephemeralOntology = new RawOntology(ephemeralEntityDescriptors, predicateDescriptors)
export const graphOntology = new RawOntology(entityDescriptors, predicateDescriptors)
