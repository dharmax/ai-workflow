/**
 * Responsibility: Reconcile accepted Product Intent through reviewed graph mutations.
 * Scope: Bounded, inert proposals with source revisions, stable identity reuse and advisory critique.
 */

import { renderIntentProposal } from "./prompts.ts"
import { type CompletenessLevel, scopeTarget } from "../artifact-policy.ts"
import { applicableAspects, assessAspects } from "../aspects.ts"
import { Epic, Feature, UserStory, WorkflowEntity, Ticket } from "../graph/ontology.ts"
import type { WorkflowStore } from "../graph/store.ts"
import { withArtifactMetrics, visitMetricArtifact, cognitionMetrics, countEngineering } from "../performance-metrics.ts"
import { buildIntentContext } from "./context.ts"
import type { ProcessOptions, IntentContext, ProcessedIntent } from "./process-types.ts"
import type { OperationResult } from "../ticket-operation-types.ts"

export function processIntent(
    store: WorkflowStore,
    root: Epic | Feature | UserStory,
    options: ProcessOptions
): Promise<OperationResult<ProcessedIntent>> {
    const rootId = store.localId(root.id)
    return withArtifactMetrics(
        store.root,
        `process_${root instanceof UserStory ? "story" : root instanceof Feature ? "feature" : "epic"}`,
        rootId,
        options,
        async () => {
            const { IntentProposalSchema } = await import("../product/process-types.ts")
            const { ArtifactBudget, resolveArtifactCritic } = await import("../artifact-policy.ts")
            const { AiArtifactCritic, CriticResultSchema } = await import("../artifact-critic.ts")
            const { loadConfig } = await import("../config.ts")
            const { getCoverage } = await import("../product/coverage.ts")
            const { getProductImpact } = await import("../product/impact.ts")
            const { CausalChangeEngine } = await import("../change/engine.ts")
            const { createDefaultAsker } = await import("../model-runtime.ts")
            const cfg = loadConfig(store.root),
                budget = new ArtifactBudget(options, 1, cfg.maxArtifacts)
            const proposals: import('../change/types.ts').ChangePreview[] = []
            const reused = new Set<string>(),
                processed: string[] = [],
                knownGaps: string[] = []
            const queue: Array<{ entity: Epic | Feature | UserStory; depth: number; inherited?: CompletenessLevel }> = [
                { entity: root, depth: 0 }
            ]
            const seen = new Set<string>(),
                rootTarget = (await scopeTarget(root, store, { override: options.completeness })).effective
            const critic = await resolveArtifactCritic(options.critic, async id => new AiArtifactCritic(id, store.root))
            const reviewInputs: import("../artifact-policy.ts").CriticInput[] = []
            try {
                while (queue.length) {
                    const { entity, depth, inherited } = queue.shift()!,
                        id = store.localId(entity.id)
                    if (seen.has(id)) continue
                    if (!budget.visit(id, depth)) continue
                    seen.add(id)
                    visitMetricArtifact(id)
                    const completeness = (
                        await scopeTarget(entity, store, {
                            override: depth === 0 ? options.completeness : undefined,
                            inherited,
                            descendant: depth > 0
                        })
                    ).effective
                    const kind = entity instanceof Epic ? "Epic" : entity instanceof Feature ? "Feature" : "UserStory"
                    const fields = entity as WorkflowEntity & {
                        body?: string
                        story?: string
                        acceptanceCriteria?: string[]
                        status?: string
                    }
                    if (!entity.title?.trim() || !(entity instanceof UserStory && entity.definitionReview.status === "complete" || fields.body?.trim() || fields.story?.trim() || fields.acceptanceCriteria?.length))
                        return {
                            status: "needs_input",
                            artifactId: rootId,
                            required: [
                                {
                                    question: `Author observable scope or acceptance for '${id}'.`,
                                    why: "A title alone cannot determine useful work.",
                                    target: `${kind} intent`
                                }
                            ]
                        }
                    const { context, all, aspects, candidates } = await buildIntentContext(
                        entity,
                        store,
                        options,
                        completeness,
                        depth,
                        cfg.maxArtifacts
                    )
                    const basis: import('./mutation.ts').ProductRevision[] = []
                    const sources = new Map([entity, ...all, ...aspects, ...candidates].map(source => [store.localId(source.id), source]))
                    for (const sourceId of new Set([id, ...context.existing.map(item => String(item.id)), ...aspects.map(a => store.localId(a.id)), ...candidates.map(a => store.localId(a.id))])) {
                        const source = sources.get(sourceId) ?? await store.getEntity(sourceId)
                        if (source) basis.push({id: sourceId, entityType: source.typeName(), version: source.version})
                    }
                    const propose =
                        (options.proposal ? async () => options.proposal! : options.propose) ??
                        (async (input: IntentContext, findings: readonly { message: string }[]) => {
                            const asker = createDefaultAsker(store.root)
                            if (!asker) throw new Error("Product reasoning provider unavailable.")
                            countEngineering("reasoningCalls")
                            const response = await asker.json(renderIntentProposal(input, findings), IntentProposalSchema, {
                                model: cfg.modelRoutes?.design ?? cfg.model,
                                temperature: 0,
                                maxRetries: 1,
                                maxTokens: cfg.llmOutputTokens,
                                ...cognitionMetrics()
                            })
                            if (!response.ok) throw new Error(`Product proposal failed: ${response.failure?.message}`)
                            return IntentProposalSchema.parse(response.data)
                        })
                    const allowedKinds = new Set(
                        kind === "Epic" ? ["Feature", "UserStory", "Ticket"] : kind === "UserStory" ? ["Feature", "Ticket"] : ["Epic", "UserStory", "Ticket"]
                    )
                    let reviewed = false,
                        findings: Array<{ message: string }> = []
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const beforeProposal = new Set(budget.visited)
                        const proposal = IntentProposalSchema.parse(await propose(context, findings))
                        if (proposal.required.length) return { status: "needs_input", artifactId: rootId, required: proposal.required }
                        const mutations: import("../product/mutation.ts").ProductMutation[] = [],
                            childIds: string[] = [],
                            batchReused: string[] = []
                        const batchIds = new Set<string>()
                        for (const item of proposal.items) {
                            if (!allowedKinds.has(item.kind)) throw new Error(`Invalid next layer: ${kind} → ${item.kind}.`)
                            if (entity instanceof Feature && ["Epic","UserStory"].includes(item.kind) && fields.status !== "accepted")
                                throw new Error("Accept the Feature before deriving delivery Stories and Epic.")
                            if (batchIds.has(item.id)) throw new Error(`Duplicate proposed identity '${item.id}'.`)
                            batchIds.add(item.id)
                            const sameId = await store.getEntity<WorkflowEntity>(item.id)
                            const matches = all.filter(
                                existing =>
                                    existing.typeName() === item.kind &&
                                    existing.title?.trim().toLowerCase() === item.title.trim().toLowerCase()
                            )
                            if (
                                (!sameId && matches.length > 0) ||
                                (sameId && sameId.typeName() !== item.kind)
                            )
                                return {
                                    status: "needs_input",
                                    artifactId: rootId,
                                    required: [
                                        {
                                            question: `Choose the existing identity for '${item.title}'.`,
                                            why: "The proposed identity collides with different or ambiguous intent.",
                                            target: item.id
                                        }
                                    ]
                                }
                            if (item.kind === "UserStory" && !sameId && ["actor","intent","initialState","action","expectedResult"].some(key => !String(item[key as keyof typeof item] ?? "").trim()))
                                return {status:"needs_input",artifactId:rootId,required:[{question:`Complete the public scenario for '${item.id}'.`,why:"A title or unknown interface cannot define a Story test.",target:item.id}]}
                            const childId = sameId ? store.localId(sameId.id) : item.id
                            if (!budget.visit(childId, depth + 1)) {
                                knownGaps.push(`Expansion budget stopped '${childId}'.`)
                                continue
                            }
                            childIds.push(childId)
                            if (sameId) batchReused.push(childId)
                            if (!sameId || item.revise) {
                                mutations.push({
                                    kind: sameId ? "product_update" : "product_create",
                                    entityType: item.kind,
                                    id: childId,
                                    fields:
                                        item.kind === "UserStory"
                                            ? {
                                                  title: item.title,
                                                  actor: item.actor,
                                                  story: item.story,
                                                  intent: item.intent,
                                                  initialState: item.initialState,
                                                  action: item.action,
                                                  expectedResult: item.expectedResult,
                                                  exceptions: item.exceptions,
                                                  bounds: item.bounds,
                                                  acceptanceCriteria: item.acceptanceCriteria,
                                                  status: sameId instanceof UserStory ? (sameId as UserStory & {status:string}).status : "proposed"
                                              }
                                            : {
                                                  title: item.title,
                                                  body: item.body,
                                                  ...(item.kind !== "Epic" ? { acceptanceCriteria: item.acceptanceCriteria } : {}),
                                                  ...(item.priority !== undefined ? {priority:item.priority} : {}),
                                                  ...(sameId ? {} : item.kind === "Ticket" ? { lane: "Backlog" as const } : { status: item.kind === "Epic" ? "draft" : "proposed" })
                                              }
                                })
                            }
                            const link =
                                kind === "Epic"
                                    ? { sourceId: id, predicate: item.kind === "Ticket" ? "contains" : "targets", targetId: childId }
                                    : kind === "Feature"
                                      ? item.kind === "Epic" ? {sourceId:childId,predicate:"targets",targetId:id}
                                        : item.kind === "UserStory" ? {sourceId:id,predicate:"enables",targetId:childId}
                                        : { sourceId: childId, predicate: "implements", targetId: id }
                                      : item.kind === "Feature"
                                        ? { sourceId: childId, predicate: "enables", targetId: id }
                                        : { sourceId: childId, predicate: "addresses", targetId: id }
                            if (
                                !(await store.getOutgoing(link.sourceId, link.predicate)).some(
                                    edge => store.localId(edge.targetId) === link.targetId
                                )
                            )
                                mutations.push({ kind: "product_link", ...link })
                        }
                        for (const item of proposal.items.filter(item => childIds.includes(item.id))) {
                            if (item.kind !== "Ticket") continue
                            for (const storyId of item.storyIds ?? []) {
                                const proposed = proposal.items.find(candidate => candidate.id === storyId && candidate.kind === "UserStory")
                                if (!proposed && !(await store.getEntity(storyId, UserStory.dcr)))
                                    throw new Error(`Unknown Story '${storyId}'.`)
                                mutations.push({kind:"product_link",sourceId:item.id,predicate:"addresses",targetId:storyId})
                            }
                            for (const scopeId of item.scopeIds ?? []) {
                                const scope = await store.getEntity(scopeId)
                                if (!scope || (options.requireWorkScope ? !["ModuleNode","FileNode","SymbolNode"].includes(scope.typeName()) : !["Feature","ModuleNode","FileNode","SymbolNode"].includes(scope.typeName())))
                                    throw new Error(`Unknown or unsupported work scope '${scopeId}'.`)
                                basis.push({id:scopeId,entityType:scope.typeName(),version:scope.version})
                                mutations.push({kind:"product_link",sourceId:item.id,predicate:scope instanceof Feature ? "implements" : "targets",targetId:scopeId})
                            }
                            const epics = proposal.items.filter(candidate => candidate.kind === "Epic" && childIds.includes(candidate.id))
                            if (epics.length > 1) throw new Error("Choose one delivery Epic for the proposed Tickets.")
                            if (epics[0]) mutations.push({kind:"product_link",sourceId:epics[0].id,predicate:"contains",targetId:item.id})
                        }
                        for (const aspectId of proposal.aspectIds) {
                            if (aspects.some(a => store.localId(a.id) === aspectId)) continue
                            if (!candidates.some(a => store.localId(a.id) === aspectId))
                                throw new Error(`Unreviewed/unknown candidate Aspect '${aspectId}'.`)
                            mutations.push({ kind: "product_link", sourceId: aspectId, predicate: "applies_to", targetId: id })
                        }
                        const reviewInput = {
                            artifactId: id,
                            intent: context.body,
                            neighborhood: [...context.existing, ...context.candidateAspects],
                            proposal: mutations,
                            applicableAspects: context.applicableAspects,
                            candidateAspects: context.candidateAspects.map(a => a.id),
                            completeness,
                            depth,
                            acceptanceCriteria: context.acceptanceCriteria,
                            evidence: [JSON.stringify(context.coverage), JSON.stringify(context.aspectAssessment)]
                        }
                        if (critic) {
                            countEngineering("criticRounds")
                            const review = CriticResultSchema.parse(await critic.review(reviewInput))
                            if (review.verdict === "needs_input")
                                return {
                                    status: "needs_input",
                                    artifactId: rootId,
                                    required: review.required.map(item => ({
                                        ...item,
                                        why: "Independent Product Critic needs a semantic decision.",
                                        target: id
                                    }))
                                }
                            if (review.verdict === "reject")
                                return {
                                    status: "blocked",
                                    artifactId: rootId,
                                    blockers: review.findings.map(item => ({ reason: item.message }))
                                }
                            if (review.verdict === "revise") {
                                for (const candidate of budget.visited) if (!beforeProposal.has(candidate)) budget.visited.delete(candidate)
                                countEngineering("criticRevisions")
                                findings = review.findings
                                continue
                            }
                        }
                        if (mutations.length) {
                            const engine = new CausalChangeEngine({ store, projectRoot: store.root }),
                                request = { action: "product_change" as const, mutations, basis, originalRequest: options.originalRequest ?? context.body }
                            const preview = await engine.previewChange(request)
                            if (preview.blocked) throw new Error(preview.blockReason)
                            proposals.push(preview)
                        }
                        batchReused.forEach(child => reused.add(child))
                        countEngineering("artifactsReused", batchReused.length)
                        knownGaps.push(...proposal.gaps)
                        reviewInputs.push(reviewInput)
                        processed.push(id)
                        reviewed = true
                        const outgoing = await store.getOutgoing(entity.id),
                            incoming = await store.getIncoming(entity.id)
                        const descendants = [
                            ...childIds,
                            ...outgoing
                                .filter(e => kind === "Epic" && ["targets", "contains"].includes(e.predicateName))
                                .map(e => store.localId(e.targetId)),
                            ...incoming
                                .filter(e =>
                                    kind === "Feature"
                                        ? e.predicateName === "implements"
                                        : kind === "UserStory"
                                          ? ["addresses", "enables"].includes(e.predicateName)
                                          : false
                                )
                                .map(e => store.localId(e.sourceId))
                        ]
                        for (const childId of new Set(descendants)) {
                            const child = await store.getEntity(childId)
                            if (!child) { budget.remaining.add(childId); continue }
                            if (!(child instanceof Feature || child instanceof UserStory || child instanceof Ticket)) continue
                            if (!budget.visit(childId, depth + 1)) continue
                            if (child instanceof Ticket) {
                                if (child.lane !== "Done" || child.status !== "verified") budget.remaining.add(childId)
                            } else if (budget.depth === "all" || depth + 1 < budget.depth)
                                queue.push({ entity: child, depth: depth + 1, inherited: completeness })
                            else {
                                budget.stoppedAtDepth = true
                                budget.remaining.add(childId)
                            }
                        }
                        break
                    }
                    if (!reviewed)
                        return {
                            status: "blocked",
                            artifactId: rootId,
                            blockers: findings.map(item => ({ reason: `Product Critic revision exhausted: ${item.message}` }))
                        }
                }
                if (critic && ["advanced", "production"].includes(rootTarget) && (budget.depth === "all" || budget.depth > 1)) {
                    countEngineering("criticRounds")
                    const final = CriticResultSchema.parse(
                        await critic.review({
                            artifactId: rootId,
                            intent: (root as WorkflowEntity & { body?: string }).body ?? root.title!,
                            neighborhood: reviewInputs.map(input => ({ ...input })),
                            proposal: [],
                            applicableAspects: (await applicableAspects(root, store)).map(a => store.localId(a.id)),
                            candidateAspects: [],
                            completeness: rootTarget,
                            depth: 0,
                            acceptanceCriteria: (root as WorkflowEntity & { acceptanceCriteria?: string[] }).acceptanceCriteria ?? [],
                            evidence: [JSON.stringify(await getCoverage(store, rootId)), JSON.stringify(await assessAspects(root, store))]
                        })
                    )
                    if (final.verdict !== "accept")
                        return final.verdict === "needs_input"
                            ? {
                                  status: "needs_input",
                                  artifactId: rootId,
                                  required: final.required.map(item => ({
                                      ...item,
                                      why: "Final cross-layer review requires input.",
                                      target: rootId
                                  }))
                              }
                            : {
                                  status: "blocked",
                                  artifactId: rootId,
                                  blockers: final.findings.map(item => ({ reason: `Final cross-layer review: ${item.message}` }))
                              }
                }
                return {
                    status: "complete",
                    artifactId: rootId,
                    value: {
                        proposals,
                        created: [],
                        reused: [...reused],
                        processed,
                        remaining: [...budget.remaining],
                        stoppedAtDepth: budget.stoppedAtDepth,
                        stoppedAtMaxArtifacts: budget.stoppedAtMaxArtifacts,
                        artifactComplete: !proposals.length && !knownGaps.length && !budget.remaining.size,
                        knownGaps,
                        coverage: await getCoverage(store, rootId),
                        impact: await getProductImpact(store, rootId),
                        aspectAssessment: await assessAspects(root, store)
                    }
                }
            } catch (error) {
                return { status: "blocked", artifactId: rootId, blockers: [{ reason: `Product processing failed: ${String(error)}` }] }
            }
        }
    )
}
