/**
 * Responsibility: Prepare executable Ticket work through reviewed graph mutations.
 * Scope: Atomic enrichment, child reuse, real dependencies and leased application.
 */

import { renderPreparationPrompt } from "./prompts.ts"
import { Ticket } from "../graph/ontology.ts"
import type { WorkflowStore } from "../graph/store.ts"
import type { PreparationOptions, PreparedTicket, OperationResult, TicketDossier } from "../ticket-operation-types.ts"
import { withArtifactMetrics, cognitionMetrics, countEngineering, recordMetricCompleteness, traceResolution } from "../performance-metrics.ts"

export async function prepareTicket(
    ticket: Ticket,
    store: WorkflowStore,
    options: PreparationOptions = {}
): Promise<OperationResult<PreparedTicket>> {
    options.signal?.throwIfAborted()
    return withArtifactMetrics(store.root, "prepare_ticket", store.localId(ticket.id), options, async () => {
        traceResolution('prepare: investigate Ticket start')
        const investigation = await ticket.investigate(store, options)
        traceResolution('prepare: investigation ' + investigation.status)
        if (investigation.status !== "complete") return investigation
        const dossier = investigation.value,
            id = dossier.ticket.id
        recordMetricCompleteness(dossier.completeness)
        const { TicketPreparationProposalSchema } = await import("../ticket-operation-types.ts")
        const { resolveArtifactCritic, ArtifactBudget } = await import("../artifact-policy.ts")
        const { AiArtifactCritic, CriticResultSchema } = await import("../artifact-critic.ts")
        const { loadConfig } = await import("../services/config-service.ts")
        const { CausalChangeEngine } = await import("../change/engine.ts")
        const cfg = loadConfig(store.root),
            agentId = options.agentId ?? cfg.defaultAgentId
        const children: Ticket[] = []
        for (const edge of await store.getOutgoing(ticket.id, "contains")) {
            const child = await store.getEntity<Ticket>(edge.targetId, Ticket.dcr)
            if (child) children.push(child)
        }
        const existing = children.map(child => store.localId(child.id))
        const result = (rationale: string): OperationResult<PreparedTicket> => ({
            status: "complete",
            artifactId: id,
            value: { dossier, children: existing, created: [], reused: existing, applied: false, criticRounds: 0, rationale }
        })
        if (dossier.disposition === "rejectable") return result(dossier.rationale)
        if (dossier.ticket.kind === 'bug' && dossier.disposition === 'needs_preparation' &&
            !dossier.evidence.some(item => item.filePath && item.source))
            return {status: 'needs_input', artifactId: id, required: [{
                question: 'Supply an implicated source symbol, stack location or diagnostic evidence.',
                why: dossier.rationale, target: 'Bug engineering evidence'
            }]}
        const enrichments = dossier.proposedEnrichments
        if (dossier.disposition === "ready" && !enrichments.acceptanceCriteria && !enrichments.relations.length)
            return result("Existing atomic contract is executable; no decomposition or enrichment needed.")
        try {
            const critic = await resolveArtifactCritic(
                options.critic,
                async criticId => new AiArtifactCritic(criticId, store.root, options.signal)
            )
            const propose =
                options.propose ??
                (async (input: TicketDossier, findings: readonly import("../artifact-policy.ts").CriticFinding[]) => {
                    const { createDefaultAsker } = await import("../services/model-service.ts")
                    const asker = createDefaultAsker(store.root)
                    if (!asker) throw new Error("Preparation reasoning provider unavailable.")
                    countEngineering("reasoningCalls")
                    const proposal = await asker.json(
                        renderPreparationPrompt(
                            input,
                            children.map(child => ({
                                id: store.localId(child.id),
                                title: child.title,
                                body: child.body,
                                acceptanceCriteria: child.acceptanceCriteria
                            })),
                            findings
                        ),
                        TicketPreparationProposalSchema,
                        {
                            model: cfg.modelRoutes?.design ?? cfg.model,
                            temperature: 0,
                            signal: options.signal,
                            maxRetries: 1,
                            maxTokens: cfg.llmOutputTokens,
                            ...cognitionMetrics()
                        }
                    )
                    if (!proposal.ok)
                        throw new Error(
                            `Preparation provider failed: ${proposal.failure?.kind ?? "unknown"}: ${proposal.failure?.message ?? "No validated result."}`
                        )
                    return TicketPreparationProposalSchema.parse(proposal.data)
                })
            let findings: import("../artifact-policy.ts").CriticFinding[] = []
            for (let attempt = 0; attempt < 3; attempt++) {
                traceResolution('prepare: proposal reasoning start (attempt ' + (attempt+1) + ')')
                const proposal = TicketPreparationProposalSchema.parse(await propose(dossier, findings))
                traceResolution('prepare: proposal reasoning finished')
                const budget = new ArtifactBudget(options, 1, cfg.maxArtifacts)
                budget.visit(id, 0)
                for (const child of proposal.children)
                    if (!budget.visit(child.id, 1))
                        return {
                            status: "needs_input",
                            artifactId: id,
                            required: [
                                {
                                    question: `Allow expansion for child '${child.id}'?`,
                                    why: "The proposed coherent batch exceeds depth/maxArtifacts.",
                                    target: "Operation depth/maxArtifacts"
                                }
                            ]
                        }
                const mutations: import("../product/mutation.ts").ProductMutation[] = []
                const criteria = proposal.acceptanceCriteria ?? enrichments.acceptanceCriteria
                if (!(criteria ?? dossier.ticket.acceptanceCriteria).length)
                    throw new Error("Preparation requires an explicit parent acceptance contract.")
                if (criteria && JSON.stringify(criteria) !== JSON.stringify(dossier.ticket.acceptanceCriteria))
                    mutations.push({ kind: "product_update", entityType: "Ticket", id, fields: { acceptanceCriteria: criteria } })
                for (const relation of enrichments.relations) mutations.push({ kind: "product_link", ...relation })
                const allTickets = await store.listEntities<Ticket>(Ticket.dcr),
                    identities = new Map<string, string>(),
                    contracts = new Set<string>(),
                    created: string[] = [],
                    reused: string[] = []
                for (const child of proposal.children) {
                    if (identities.has(child.id)) throw new Error(`Duplicate child ID '${child.id}'.`)
                    const contract = JSON.stringify([child.title.trim().toLowerCase(), child.body.trim(), child.acceptanceCriteria])
                    if (contracts.has(contract)) throw new Error("Duplicate child acceptance contract.")
                    contracts.add(contract)
                    const match = allTickets.find(
                        candidate =>
                            candidate.id !== ticket.id &&
                            JSON.stringify([
                                (candidate.title ?? "").trim().toLowerCase(),
                                candidate.body.trim(),
                                candidate.acceptanceCriteria ?? []
                            ]) === contract
                    )
                    const childId = match ? store.localId(match.id) : child.id
                    if (!match && (await store.getEntity(childId))) throw new Error(`Child ID '${childId}' already names different work.`)
                    identities.set(child.id, childId)
                    if (match) reused.push(childId)
                    else {
                        created.push(childId)
                        mutations.push({
                            kind: "product_create",
                            entityType: "Ticket",
                            id: childId,
                            fields: { title: child.title, body: child.body, acceptanceCriteria: child.acceptanceCriteria, lane: "Backlog" }
                        })
                    }
                    mutations.push({ kind: "product_link", sourceId: id, predicate: "contains", targetId: childId })
                    for (const relation of child.relations) mutations.push({ kind: "product_link", sourceId: childId, ...relation })
                }
                for (const child of proposal.children)
                    for (const prerequisite of child.dependsOn)
                        mutations.push({
                            kind: "product_link",
                            sourceId: identities.get(child.id)!,
                            predicate: "depends_on",
                            targetId: identities.get(prerequisite) ?? prerequisite
                        })
                // Reconcile the complete proposal before reusing existing children. Criteria alone
                // say nothing about omitted work. Existing links are idempotent, not new preparation.
                for (let index = mutations.length - 1; index >= 0; index--) {
                    const mutation = mutations[index]
                    if (mutation.kind === 'product_link' && (await store.getOutgoing(mutation.sourceId, mutation.predicate))
                        .some(edge => store.localId(edge.targetId) === mutation.targetId)) mutations.splice(index, 1)
                }
                if (!mutations.length) {
                    if (dossier.disposition !== 'ready' && !proposal.children.length)
                        throw new Error('Preparation did not resolve the investigation gaps or supply executable work.')
                    countEngineering('artifactsReused', existing.length)
                    return result(proposal.rationale)
                }
                if (critic) {
                    // Serialize detached data; a Critic never receives live entities or producer history.
                    const input = JSON.parse(
                        JSON.stringify({
                            artifactId: id,
                            intent: dossier.ticket.body,
                            neighborhood: dossier.evidence,
                            proposal: mutations,
                            applicableAspects: dossier.aspects.aspects.map(aspect => aspect.id),
                            candidateAspects: [],
                            completeness: dossier.completeness.criticStrength,
                            depth: options.depth === "all" ? 1 : (options.depth ?? 1),
                            acceptanceCriteria: dossier.ticket.acceptanceCriteria,
                            evidence: dossier.evidence.filter(item => ["TestNode", "Artifact"].includes(item.kind)).map(item => item.id)
                        })
                    )
                    countEngineering("criticRounds")
                    traceResolution('prepare: independent critic start')
                    const review = CriticResultSchema.parse(await critic.review(input))
                    traceResolution('prepare: independent critic ' + review.verdict)
                    if (review.verdict === "needs_input")
                        return {
                            status: "needs_input",
                            artifactId: id,
                            required: review.required.map(required => ({
                                ...required,
                                why: "Independent Critic requires a semantic decision.",
                                target: "Ticket preparation contract"
                            }))
                        }
                    if (review.verdict === "reject")
                        return {
                            status: "blocked",
                            artifactId: id,
                            blockers: review.findings.map(finding => ({ reason: finding.message, artifactId: finding.artifactId }))
                        }
                    if (review.verdict === "revise") {
                        countEngineering("criticRevisions")
                        findings = review.findings
                        continue
                    }
                }
                const engine = new CausalChangeEngine({ store, projectRoot: store.root })
                const request = { action: "product_change" as const, mutations }
                const validated = await engine.previewChange(request)
                if (validated.blocked)
                    return {
                        status: "blocked",
                        artifactId: id,
                        blockers: [{ reason: `Preparation validation failed: ${validated.blockReason}` }]
                    }
                const current = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!
                if (
                    current.body !== dossier.ticket.body ||
                    current.title !== dossier.ticket.title ||
                    JSON.stringify(current.acceptanceCriteria ?? []) !== JSON.stringify(dossier.ticket.acceptanceCriteria)
                )
                    return {
                        status: "needs_input",
                        artifactId: id,
                        required: [
                            {
                                question: "Review the changed Ticket contract and retry preparation.",
                                why: "The contract changed during proposal review.",
                                target: "Ticket body/acceptanceCriteria"
                            }
                        ]
                    }
                const held = current.claim && new Date(current.claim.expiresAt).getTime() > Date.now()
                if (held && current.claim!.agentId !== agentId)
                    return { status: "blocked", artifactId: id, blockers: [{ reason: `Ticket is leased by '${current.claim!.agentId}'.` }] }
                if (held && !options.owner)
                    return {status: 'blocked', artifactId: id, blockers: [{reason: 'Preparation requires the exact enclosing execution lease; an agent name does not establish ownership.'}]}
                let acquired: import("../graph/types.ts").TicketClaim | undefined
                try {
                    if (options.owner) {
                        const {canonical} = await import('../kb/canonical.ts')
                        if (!held || canonical(current.claim) !== canonical(options.owner))
                            throw Error('Enclosing execution lease changed or expired during preparation.')
                    } else {
                        const lease = await store.claimTicket(id, agentId, cfg.defaultLeaseMinutes, false)
                        if (!lease.success)
                            return {
                                status: "blocked",
                                artifactId: id,
                                blockers: [{ reason: lease.message ?? "Ticket lease unavailable." }]
                            }
                        acquired = lease.claim!
                    }
                    // Claim changed the durable fingerprint, so preview again under the lease.
                    const preview = await engine.previewChange(request)
                    if (preview.blocked) throw new Error(`Preparation changed before apply: ${preview.blockReason}`)
                    const applied = await engine.applyChange(request, preview.fingerprint)
                    if (!applied.ok || !applied.verification.passed)
                        throw new Error(`Preparation apply verification failed: ${JSON.stringify(applied.verification)}`)
                    countEngineering("artifactsCreated", created.length)
                    countEngineering("artifactsReused", reused.length)
                    if (held) {
                        const { exportProjections } = await import("../graph/projections.ts")
                        await exportProjections(store)
                    }
                    return {
                        status: "complete",
                        artifactId: id,
                        value: {
                            dossier,
                            children: [...new Set([...existing, ...identities.values()])],
                            created,
                            reused,
                            applied: true,
                            criticRounds: critic ? attempt + 1 : 0,
                            rationale: proposal.rationale
                        }
                    }
                } finally {
                    if (acquired) {
                        await store.releaseTicket(id, acquired)
                        if (!options.signal?.aborted) {
                            const { exportProjections } = await import("../graph/projections.ts")
                            await exportProjections(store)
                        }
                    }
                }
            }
            return {
                status: "blocked",
                artifactId: id,
                blockers: findings.map(finding => ({ reason: `Critic revision limit: ${finding.message}`, artifactId: finding.artifactId }))
            }
        } catch (error) {
            return { status: "blocked", artifactId: id, blockers: [{ reason: `Ticket preparation failed: ${String(error)}` }] }
        }
    })
}
