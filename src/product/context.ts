/**
 * Responsibility: Ground Product and Ticket reasoning in authored intent.
 * Scope: Semantic lineage, mandatory evidence and conservative Product reuse candidates.
 */

import {
    WorkflowEntity,
    Epic,
    Goal,
    Concept,
    Flow,
    Feature,
    UserStory,
    Idea,
    Decision,
    Ticket,
    Aspect,
    TestNode,
    Artifact
} from "../graph/ontology.ts"
import { LayaSystemOne } from "@dharmax/llm-utils"
import { applicableAspects, assessAspects } from "../aspects.ts"
import type { CompletenessLevel } from "../artifact-policy.ts"
import type { ProcessOptions, IntentContext } from "./process-types.ts"
import { getCoverage } from "./coverage.ts"
import { getProductImpact } from "./impact.ts"
import { countEngineering, cognitionMetrics } from "../performance-metrics.ts"
import type { WorkflowStore } from "../graph/store.ts"

/** Ground the proposed Product batch in required lineage/evidence and conservatively selected reuse. */
export async function buildIntentContext(
    entity: Epic | Feature | UserStory,
    store: WorkflowStore,
    options: ProcessOptions,
    completeness: CompletenessLevel,
    depth: number,
    maxArtifacts: number
): Promise<{ context: IntentContext; all: Array<Epic | Feature | UserStory | Ticket>; aspects: Aspect[]; candidates: Aspect[] }> {
    const id = store.localId(entity.id)
    const kind = entity instanceof Epic ? "Epic" : entity instanceof Feature ? "Feature" : "UserStory"
    const fields = entity as WorkflowEntity & { body?: string; story?: string; acceptanceCriteria?: string[]; status?: string }
    const all: Array<Epic | Feature | UserStory | Ticket> = []
    for (const ctor of [Epic, Feature, UserStory, Ticket])
        all.push(...((await store.listEntities(ctor.dcr)) as Array<Epic | Feature | UserStory | Ticket>))
    const edges = [...(await store.getOutgoing(entity.id)), ...(await store.getIncoming(entity.id))]
    const linked = new Set(edges.map(edge => (edge.sourceId === entity.id ? edge.targetId : edge.sourceId)))
    const optional = all.filter(item => !linked.has(item.id) && item.id !== entity.id).slice(0, maxArtifacts)
    const aspects = await applicableAspects(entity, store)
    const candidates = (await store.listEntities<Aspect>(Aspect.dcr))
        .filter(a => !aspects.some(existing => existing.id === a.id) && a.status !== "deprecated")
        .slice(0, maxArtifacts)
    const assessment = await (options.systemOne ?? new LayaSystemOne())
        .assess(
            {
                kind,
                title: entity.title,
                completeness,
                candidates: optional.map(item => ({ id: store.localId(item.id), title: item.title })),
                aspects: candidates.map(a => ({ id: store.localId(a.id), title: a.title }))
            },
            Object.fromEntries(
                [...optional, ...candidates].map(item => [
                    store.localId(item.id),
                    {
                        type: "choice" as const,
                        instructions: "Keep material reuse/Aspect candidates; omit only clearly irrelevant candidates.",
                        criteria: { keep: "Relevant or uncertain", omit: "Clearly irrelevant" }
                    }
                ])
            ),
            cognitionMetrics()
        )
        .catch(() => null)
    countEngineering("systemOneCalls")
    countEngineering("optionalCandidates", optional.length + candidates.length)
    const keep = (item: WorkflowEntity) => {
        const answer = assessment?.answers[store.localId(item.id)]
        return !(assessment?.quality === "high" && answer?.choice === "omit" && typeof answer.prob === "number" && answer.prob >= 0.8)
    }
    const linkedEntities = all.filter(item => linked.has(item.id))
    const selectedOptional = optional.filter(keep),
        selectedAspects = candidates.filter(keep)
    const selected = [...linkedEntities, ...selectedOptional]
    countEngineering("optionalSelected", selectedOptional.length + selectedAspects.length)
    const context: IntentContext = {
        id,
        kind,
        title: entity.title!,
        body: entity instanceof UserStory && entity.definitionReview.status === "complete"
            ? [["Actor", entity.actor], ["Intent", entity.intent], ["Initial State", entity.initialState],
                ["Action", entity.action], ["Expected Observable Result", entity.expectedResult],
                ["Exceptions", entity.exceptions], ["Bounds", entity.bounds]]
                .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n")
            : fields.body || fields.story || "",
        acceptanceCriteria: fields.acceptanceCriteria ?? [],
        completeness,
        depth,
        originalRequest: options.originalRequest,
        priority: (entity as WorkflowEntity & {priority?:number}).priority,
        existing: selected.map(item => ({
            id: store.localId(item.id),
            kind: item.typeName(),
            title: item.title,
            priority: (item as WorkflowEntity & {priority?:number|string}).priority,
            ...(item instanceof UserStory ? {actor:item.actor,intent:item.intent,initialState:item.initialState,action:item.action,expectedResult:item.expectedResult,exceptions:item.exceptions,bounds:item.bounds} : {}),
            ...((item as Ticket).acceptanceCriteria?.length
                ? { acceptanceCriteria: (item as Ticket).acceptanceCriteria }
                : { body: (item as Ticket).body }),
            status: (item as Ticket).status,
            lane: (item as Ticket).lane,
            linked: linked.has(item.id)
        })),
        applicableAspects: aspects.map(a => store.localId(a.id)),
        candidateAspects: selectedAspects.map(a => ({ id: store.localId(a.id), title: a.title!, criteria: a.acceptanceCriteria ?? [] })),
        coverage: await getCoverage(store, id),
        impact: await getProductImpact(store, id),
        aspectAssessment: await assessAspects(entity, store, aspects)
    }
    for (const { entity: meaning, provenance } of await collectProductMeaning([entity], store, true)) {
        const meaningId = store.localId(meaning.id)
        if (context.existing.some(item => item.id === meaningId)) continue
        const data = meaning as WorkflowEntity & { body?: string; story?: string; status?: string; decision?: string; context?: string; consequences?: string }
        const body = meaning instanceof Decision
            ? [data.decision, data.context ? `Context: ${data.context}` : "", data.consequences ? `Consequences: ${data.consequences}` : "", data.body]
                  .filter(Boolean)
                  .join("\n\n")
            : data.body || data.story
        context.existing.push({
            id: meaningId,
            kind: meaning.typeName(),
            title: meaning.title,
            body,
            status: data.status,
            provenance
        })
    }
    // Verification and governing evidence is mandatory, never System-1 optional pruning.
    const evidence = new Map<string, Record<string, unknown>>()
    for (const subject of [entity, ...linkedEntities]) {
        for (const edge of await store.getIncoming(subject.id)) {
            if (!["verifies", "governs"].includes(edge.predicateName)) continue
            const record = await store.getEntity<WorkflowEntity>(edge.sourceId)
            if (!(record instanceof TestNode || record instanceof Artifact || record instanceof Decision)) continue
            const data = record as WorkflowEntity & { body?: string; filePath?: string; status?: string; decision?: string; context?: string; consequences?: string }
            const body = record instanceof Decision
                ? [data.decision, data.context ? `Context: ${data.context}` : "", data.consequences ? `Consequences: ${data.consequences}` : "", data.body]
                      .filter(Boolean)
                      .join("\n\n")
                : data.body
            evidence.set(store.localId(record.id), {
                id: store.localId(record.id),
                kind: record.typeName(),
                title: record.title,
                body,
                filePath: data.filePath,
                status: data.status,
                verifies: store.localId(subject.id)
            })
        }
    }
    context.existing.push(...evidence.values())
    const {resolveTicketGovernance} = await import('../ticket-operation-types.ts')
    const {renderRuleReferences} = await import('../rules/references.ts')
    const governance = await resolveTicketGovernance(store, entity)
    for (const rule of governance.rules) {
        const examples = rule.examples.map(example => `[${example.kind}] ${example.description} -> Lesson: ${example.lesson}`).join('\n')
        context.existing.push({id: governance.rules.filter(item => item.ruleId === rule.ruleId).length === 1 ? rule.ruleId : rule.id, kind: 'Rule', title: rule.title ?? rule.ruleId,
            body: [rule.rule, examples, renderRuleReferences(rule.references.filter(reference => reference.snapshot?.approved))].filter(Boolean).join('\n\n'),
            scope: rule.scope.kind, mandatory: rule.importance >= 8, status: rule.status})
    }

    return { context, all, aspects, candidates }
}

type ProductMeaning = { entity: WorkflowEntity; provenance: string }
/** Bounded semantic lineage shared by Product processing and Ticket investigation. */
export async function collectProductMeaning(
    seeds: readonly WorkflowEntity[],
    store: WorkflowStore,
    includeEpicTargets = false
): Promise<ProductMeaning[]> {
    const seedIds = new Set(seeds.map(entity => entity.id))
    const seen = new Set(seedIds)
    const queue = [...seeds]
    const found: ProductMeaning[] = []
    const add = (entity: WorkflowEntity | null, provenance: string) => {
        if (!entity || seen.has(entity.id)) return
        seen.add(entity.id)
        queue.push(entity)
        found.push({ entity, provenance })
    }

    while (queue.length) {
        const item = queue.shift()!

        if (item instanceof Epic && includeEpicTargets && seedIds.has(item.id)) {
            for (const edge of await store.getOutgoing(item.id, "targets")) {
                const target = await store.getEntity<WorkflowEntity>(edge.targetId)
                if (
                    target instanceof Goal ||
                    target instanceof Concept ||
                    target instanceof Flow ||
                    target instanceof Feature ||
                    target instanceof UserStory
                ) {
                    add(target, "Epic targeted Product Intent")
                }
            }
        }

        if (item instanceof UserStory) {
            for (const edge of await store.getIncoming(item.id, "contains")) {
                const parent = await store.getEntity<WorkflowEntity>(edge.sourceId)
                if (parent instanceof Flow) add(parent, "Story containing Flow")
                else if (parent instanceof Feature) add(parent, "Legacy Story containing Feature")
            }
            for (const edge of await store.getIncoming(item.id, "enables")) {
                const feature = await store.getEntity<Feature>(edge.sourceId, Feature.dcr)
                if (feature) add(feature, "Story enabling Feature")
            }
        }

        if (item instanceof Feature && seedIds.has(item.id)) {
            for (const predicate of ["enables", "contains"]) {
                for (const edge of await store.getOutgoing(item.id, predicate)) {
                    const story = await store.getEntity<UserStory>(edge.targetId, UserStory.dcr)
                    if (story) add(story, predicate === "enables" ? "Feature enabled Story" : "Legacy Feature Story")
                }
            }
        }

        if (item instanceof Flow) {
            for (const edge of await store.getOutgoing(item.id, "serves")) {
                const goal = await store.getEntity<Goal>(edge.targetId, Goal.dcr)
                if (goal) add(goal, "Flow served Goal")
            }
            for (const edge of await store.getIncoming(item.id, "inspires")) {
                const idea = await store.getEntity<Idea>(edge.sourceId, Idea.dcr)
                if (idea) add(idea, "Idea inspired Flow")
            }
        }

        if (item instanceof Goal) {
            for (const edge of await store.getIncoming(item.id, "inspires")) {
                const idea = await store.getEntity<Idea>(edge.sourceId, Idea.dcr)
                if (idea) add(idea, "Idea inspired Goal")
            }
        }

        if (item instanceof Concept) {
            for (const edge of await store.getIncoming(item.id, "inspires")) {
                const source = await store.getEntity<WorkflowEntity>(edge.sourceId)
                if (source instanceof Goal || source instanceof Idea)
                    add(source, source instanceof Goal ? "Goal inspired Concept" : "Idea inspired Concept")
            }
        }

        if (
            item instanceof Epic ||
            item instanceof Feature ||
            item instanceof UserStory ||
            item instanceof Flow ||
            item instanceof Goal ||
            item instanceof Concept
        ) {
            for (const edge of await store.getIncoming(item.id, "governs")) {
                const source = await store.getEntity<WorkflowEntity>(edge.sourceId)
                if (source instanceof Concept) add(source, "Scope governing Concept")
                else if (source instanceof Decision) add(source, "Scope governing Decision")
            }
        }
    }

    return found
}
