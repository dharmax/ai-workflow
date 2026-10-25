/**
 * Responsibility: Investigate the authored Ticket contract and its current evidence.
 * Scope: Fresh code anchors, Product meaning, applicable Aspects and bounded reasoning.
 */

import { renderInvestigationPrompt } from "./prompts.ts"
import {
    Ticket,
    WorkflowEntity,
    Epic,
    Feature,
    UserStory,
    Flow,
    Goal,
    Concept,
    Aspect,
    TestNode,
    FileNode,
    SymbolNode,
    Lesson,
    Decision,
    Artifact
} from "../graph/ontology.ts"
import type { WorkflowStore } from "../graph/store.ts"
import { resolveTicketGovernance, readVerificationReceipt, type InvestigationOptions, type TicketDossier, type OperationResult } from "../ticket-operation-types.ts"
import {
    withArtifactMetrics,
    cognitionMetrics,
    countEngineering,
    visitMetricArtifact,
    recordMetricCompleteness
} from "../performance-metrics.ts"
import { collectProductMeaning } from "../product/context.ts"

export async function investigateTicket(
    ticket: Ticket,
    store: WorkflowStore,
    options: InvestigationOptions = {}
): Promise<OperationResult<TicketDossier>> {
    options.signal?.throwIfAborted()
    const { ensureAstFresh, withAstSnapshot } = await import("../graph/indexer.ts")
    const { LayaSystemOne } = await import("@dharmax/llm-utils")
    const { InvestigationJudgmentSchema } = await import("../ticket-operation-types.ts")
    const { loadConfig } = await import("../config.ts")
    const { getExactSymbolSource } = await import("../change/symbol-source.ts")
    const fs = await import("node:fs")
    const path = await import("node:path")
    return withArtifactMetrics(store.root, "investigate_ticket", store.localId(ticket.id), options, () =>
        withAstSnapshot(async () => {
            await ensureAstFresh(store)
            const id = store.localId(ticket.id)
            const current = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!
            const max = options.maxArtifacts ?? loadConfig(store.root).maxArtifacts
            const { ArtifactTransportOptionsSchema } = await import("../artifact-policy.ts")
            ArtifactTransportOptionsSchema.pick({ completeness: true, depth: true, maxArtifacts: true }).parse(options)
            const dossier: TicketDossier = {
                ticket: {
                    id,
                    title: current.title ?? id,
                    body: current.body, kind:current.kind??'task', defect:current.defect,
                    lane: current.lane,
                    acceptanceCriteria: current.acceptanceCriteria ?? []
                },
                history: await (await import("../graph/journal.ts")).ticketHistoryContext(store,current.id),
                disposition: "ready",
                rationale: "Existing acceptance and mandatory evidence define executable work.",
                evidence: [],
                completeness: await current.getCompletenessContext(store, options.completeness),
                aspects: await current.assessAspects(store),
                proposedEnrichments: { relations: [] },
                provenance: {
                    systemOne: null,
                    reasoningUsed: false,
                    optionalCandidates: 0,
                    optionalSelected: 0,
                    freshnessReconciliations: 1
                }
            }
            const mandatory = new Map<string, WorkflowEntity>()
            recordMetricCompleteness(dossier.completeness)
            const add = (entity: WorkflowEntity, provenance: string, required = true) => {
                if (dossier.evidence.some(e => e.id === store.localId(entity.id))) return
                if (
                    ["Ticket", "Epic", "Feature", "UserStory", "Flow", "Goal", "Concept", "Module", "Idea", "Artifact"].includes(
                        entity.typeName()
                    )
                )
                    visitMetricArtifact(store.localId(entity.id))
                if (entity instanceof Aspect) {
                    required = entity.status === "accepted"
                    provenance = required ? "Governing Aspect" : "Applicable Aspect (candidate)"
                }
                const narrative = entity as WorkflowEntity & { body?: string; story?: string; decision?: string; context?: string; consequences?: string }
                if (entity instanceof Artifact && store.localId(entity.id) === `VERIFY-${id}` && !readVerificationReceipt(narrative.body))
                    provenance = "Historical acceptance receipt (legacy/unassessed)"
                const body = entity instanceof Decision
                    ? [narrative.decision, narrative.context ? `Context: ${narrative.context}` : "", narrative.consequences ? `Consequences: ${narrative.consequences}` : "", narrative.body]
                          .filter(Boolean)
                          .join("\n\n")
                    : entity instanceof Aspect
                    ? [narrative.body, entity.acceptanceCriteria?.length ? `Acceptance Criteria:\n${entity.acceptanceCriteria.map(c => `- ${c}`).join("\n")}` : ""]
                          .filter(Boolean)
                          .join("\n\n")
                    : narrative.body || narrative.story
                dossier.evidence.push({
                    id: store.localId(entity.id),
                    kind: entity.typeName(),
                    title: entity.title ?? store.localId(entity.id),
                    body,
                    mandatory: required,
                    provenance
                })
                if (required) mandatory.set(entity.id, entity)
            }
            add(current, "Ticket contract")
            const neighbors = [...(await store.getIncoming(current.id)), ...(await store.getOutgoing(current.id))]
            for (const edge of neighbors) {
                const otherId = edge.sourceId === current.id ? edge.targetId : edge.sourceId
                const entity = await store.getEntity(otherId)
                if (
                    entity &&
                    ["contains", "implements", "addresses", "targets", "modifies", "governs", "blocks", "depends_on", "verifies"].includes(
                        edge.predicateName
                    )
                )
                    add(entity, `Ticket ${edge.predicateName}`)
            }
            // Expand authored Product Intent so implementation sees the actor journey and reason behind the work.
            const semanticSeeds = [...mandatory.values()].filter(
                entity =>
                    entity instanceof Ticket ||
                    entity instanceof Epic ||
                    entity instanceof Feature ||
                    entity instanceof UserStory ||
                    entity instanceof Flow ||
                    entity instanceof Goal ||
                    entity instanceof Concept
            )
            for (const { entity, provenance } of await collectProductMeaning(semanticSeeds, store)) add(entity, provenance)
            // Scope verification remains mandatory, including legacy project evidence.
            for (const item of [...mandatory.values()]) {
                if (!(item instanceof Epic || item instanceof Feature || item instanceof UserStory || item instanceof Flow)) continue
                for (const edge of await store.getIncoming(item.id, "verifies")) {
                    const test = await store.getEntity<TestNode>(edge.sourceId, TestNode.dcr)
                    if (test) add(test, "Scope verification")
                }
            }
            for (const concern of dossier.aspects.aspects) {
                const aspect = await store.getEntity<Aspect>(concern.id, Aspect.dcr)
                if (aspect) add(aspect, "Applicable Aspect")
                for (const evidenceId of [...concern.tests, ...concern.artifacts, ...concern.decisions]) {
                    const entity = await store.getEntity(evidenceId)
                    if (entity) add(entity, "Aspect evidence")
                }
            }
            const codePaths = new Set<string>()
            for (const entity of mandatory.values()) {
                if (!(entity instanceof FileNode || entity instanceof SymbolNode)) continue
                const filePath = entity instanceof SymbolNode ? entity.filePath! : store.localId(entity.id)
                codePaths.add(filePath)
                const evidence = dossier.evidence.find(e => e.id === store.localId(entity.id))!
                evidence.filePath = filePath
                if (!fs.existsSync(path.resolve(store.root, filePath))) {
                    const details = entity instanceof FileNode ? await entity.fullDto<Record<string, unknown>>() : null
                    if (details && (details.metadata as {plannedCreation?: unknown} | undefined)?.plannedCreation === true) {
                        // Only explicitly planned creation may be missing; an ordinary indexed stub is not creation authority.
                        evidence.body = "Planned file; no source content exists yet."
                        continue
                    }
                    return {
                        status: "needs_input",
                        artifactId: id,
                        required: [
                            {
                                question: `Restore or replace missing code target '${filePath}'.`,
                                why: "The authored code anchor no longer exists on disk.",
                                target: "Ticket code target relation",
                                choices: [filePath]
                            }
                        ]
                    }
                }
                if (entity instanceof SymbolNode) {
                    try {
                        const name = entity.containerName ? `${entity.containerName}.${entity.title}` : entity.title!
                        const source = await getExactSymbolSource(store.root, filePath, name)
                        countEngineering("sourceReads")
                        countEngineering("exactSymbolReads")
                        evidence.source = source.code
                        evidence.exact = true
                        evidence.symbolKind = source.kind
                        evidence.symbolName = entity.title
                        evidence.containerName = entity.containerName
                    } catch (error) {
                        return {
                            status: "needs_input",
                            artifactId: id,
                            required: [
                                {
                                    question: `Confirm stale symbol target '${store.localId(entity.id)}': ${String(error)}`,
                                    why: "Exact language tooling cannot resolve the authored target.",
                                    target: "Ticket code target relation"
                                }
                            ]
                        }
                    }
                }
            }
            // Lessons on linked files are mandatory; optional candidates can never prune them.
            for (const lesson of await store.listEntities<Lesson>(Lesson.dcr)) {
                if (codePaths.has((lesson as Lesson & { filePath?: string }).filePath ?? "")) add(lesson, "Lesson on authored code target")
            }
            // The same effective snapshot reaches producers, acceptance and proof closure.
            dossier.governance = await resolveTicketGovernance(store, current)
            for (const rule of dossier.governance.rules) {
                const examplesBody = rule.examples.length
                    ? ["\nExamples:", ...rule.examples.map(ex => `[${ex.kind}] ${ex.description} -> Lesson: ${ex.lesson}`)].join("\n")
                    : ""
                dossier.evidence.push({
                    id: rule.ruleId,
                    kind: "Rule",
                    title: rule.title ?? rule.ruleId,
                    body: `${rule.rule}${examplesBody}${rule.references.length ? '\n' + (await import('../rules/references.ts')).renderRuleReferences(rule.references) : ''}`,
                    mandatory: rule.importance >= 8,
                    provenance: `Engineering Doctrine (${rule.scope.kind})`
                })
            }
            const blockers = neighbors.filter(e => e.predicateName === "blocks" && e.targetId === current.id)
            if (blockers.length)
                return {
                    status: "blocked",
                    artifactId: id,
                    blockers: blockers.map(e => ({ artifactId: store.localId(e.sourceId), reason: "Explicit graph blocker" }))
                }
            const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
            const duplicate = (await store.listEntities<Ticket>(Ticket.dcr)).find(
                t =>
                    t.id !== current.id &&
                    same(t.title ?? "", current.title ?? "") &&
                    same(t.body, current.body) &&
                    JSON.stringify(t.acceptanceCriteria ?? []) === JSON.stringify(current.acceptanceCriteria ?? [])
            )
            if (duplicate) {
                add(duplicate, "Identical existing work contract")
                dossier.disposition = "rejectable"
                dossier.rationale = `Equivalent work is already represented by '${store.localId(duplicate.id)}'.`
                return { status: "complete", artifactId: id, value: dossier }
            }
            const explicitProduct = [...mandatory.values()].some(e => e instanceof Feature || e instanceof UserStory)
            const productCandidates = explicitProduct
                ? []
                : (await store.listEntities<Feature>(Feature.dcr))
                      .filter(f => {
                          const title = f.title?.trim().toLowerCase()
                          return title && title.length > 2 && `${current.title} ${current.body}`.toLowerCase().includes(title)
                      })
                      .slice(0, Math.max(2, max))
            if (productCandidates.length > 1)
                return {
                    status: "needs_input",
                    artifactId: id,
                    required: [
                        {
                            question: "Which Feature owns this work?",
                            why: "Multiple existing Features match the Ticket intent; ownership cannot be guessed.",
                            target: "Ticket implements Feature",
                            choices: productCandidates.map(f => store.localId(f.id))
                        }
                    ]
                }
            if (productCandidates.length === 1)
                dossier.proposedEnrichments.relations.push({
                    sourceId: id,
                    predicate: "implements",
                    targetId: store.localId(productCandidates[0].id)
                })
            if (options.mandatoryEvidenceOnly) return {status: 'complete', artifactId: id, value: dossier}
            const report = [current.title, current.body, ...Object.values(current.defect ?? {}).flat(),
                ...dossier.evidence.filter(item => ['UserStory', 'TestNode'].includes(item.kind)).map(item => item.body ?? item.title)].join('\n')
            const codeMentions = [...current.body.matchAll(/`([^`]+)`/g)].map(match => match[1]).join(" ")
            const words = new Set(`${current.title} ${codeMentions} ${current.kind === 'bug' ? report : ''}`.match(/[A-Za-z_$][\w$]{2,}/g) ?? [])
            const optional = (await store.listEntities<SymbolNode>(SymbolNode.dcr))
                .filter(
                    s =>
                        s.filePath &&
                        /\.[cm]?[jt]sx?$/.test(s.filePath) &&
                        !s.filePath.startsWith("@") &&
                        ["class", "function", "method"].includes(s.kind ?? "") &&
                        words.has(s.title ?? "") &&
                        !mandatory.has(s.id)
                )
                .slice(0, max)
            dossier.provenance.optionalCandidates = optional.length
            countEngineering("optionalCandidates", optional.length)
            countEngineering("systemOneCalls")
            const assessment = await (options.systemOne ?? new LayaSystemOne())
                .assess(
                    {
                        ticket: {
                            title: current.title,
                            criteria: current.acceptanceCriteria,
                            scopes: [...mandatory.values()].map(e => ({ id: store.localId(e.id), kind: e.typeName() }))
                        },
                        candidates: optional.map(s => ({ id: store.localId(s.id), name: s.title, file: s.filePath }))
                    },
                    {
                        workKind: {
                            type: "choice",
                            instructions: "Classify the work kind.",
                            criteria: {
                                code: "Source implementation/refactor",
                                docs: "Documentation",
                                product: "Intent/work structure",
                                unknown: "Unclear"
                            }
                        },
                        atomicity: {
                            type: "choice",
                            instructions: "Does the acceptance define one coherent executable unit?",
                            criteria: {
                                atomic: "One independently verifiable change",
                                split: "Several independently verifiable changes",
                                unknown: "Unclear"
                            }
                        },
                        scope: {
                            type: "choice",
                            instructions: "Are authored Product/code scopes sufficient?",
                            criteria: {
                                grounded: "Scopes are explicit or valid technical work",
                                ambiguous: "Missing ownership or target decision"
                            }
                        },
                        context: {
                            type: "choice",
                            instructions: "Which optional context family is relevant?",
                            criteria: {
                                code: "Implementation symbols",
                                intent: "Product meaning",
                                none: "Mandatory evidence is sufficient"
                            }
                        },
                        depth: {
                            type: "choice",
                            instructions: "Is semantic reasoning necessary?",
                            criteria: {
                                deterministic: "Existing contract/evidence is sufficient",
                                reasoning: "Unresolved meaning or contradiction"
                            }
                        },
                        ...Object.fromEntries(
                            optional.map(s => [
                                store.localId(s.id),
                                {
                                    type: "choice" as const,
                                    instructions: `Include optional symbol ${s.title}?`,
                                    criteria: { include: "Relevant", omit: "Irrelevant" }
                                }
                            ])
                        )
                    },
                    cognitionMetrics()
                )
                .catch(() => null)
            if (assessment) dossier.provenance.systemOne = { backendId: assessment.backendId, quality: assessment.quality }
            const routes: Record<string, string[]> = {
                workKind: ["code", "docs", "product", "unknown"],
                atomicity: ["atomic", "split", "unknown"],
                scope: ["grounded", "ambiguous"],
                context: ["code", "intent", "none"],
                depth: ["deterministic", "reasoning"]
            }
            const confident =
                assessment?.quality === "high" &&
                Object.entries(routes).every(([key, choices]) => {
                    const answer = assessment.answers[key]
                    return answer?.choice && choices.includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8
                }) &&
                optional.every(s => {
                    const answer = assessment.answers[store.localId(s.id)]
                    return (
                        answer?.choice && ["include", "omit"].includes(answer.choice) && (answer.probabilities?.[answer.choice] ?? 0) >= 0.8
                    )
                })
            // Routing confidence cannot discard concrete Bug clues or stand in for source inspection.
            const selected = optional.filter(s => current.kind === 'bug' || !confident || assessment?.answers[store.localId(s.id)]?.choice !== "omit")
            for (const candidate of selected) add(candidate, "Bounded optional code candidate", false)
            const { registry, initializeTools } = await import('../tools/index.ts')
            const { verifyingTestsForTargets } = await import('../graph/test-artifacts.ts')
            initializeTools()
            const readContext = {store, projectRoot: store.root, signal: options.signal, executionAuthority: 'read-only' as const}
            dossier.findings = []
            dossier.uncertainties = current.kind === 'bug' ? ['Reproduction is reported by the developer; this read-only investigation has not executed it.'] : []
            // Error/stack paths are clues, never mutation authority. Read only indexed local files.
            const reportedFiles = (await store.listEntities<FileNode>(FileNode.dcr))
                .filter(file => report.includes(store.localId(file.id))).slice(0, max)
            for (const file of reportedFiles) add(file, 'File identified in work evidence', false)
            for (const evidence of dossier.evidence.filter(item => ['FileNode', 'SymbolNode'].includes(item.kind))) {
                const entity = await store.getEntity(evidence.id)
                const filePath = entity instanceof SymbolNode ? entity.filePath : entity instanceof FileNode ? store.localId(entity.id) : undefined
                if (!filePath || filePath.startsWith('@')) continue
                evidence.filePath = filePath
                try {
                    if (!evidence.source) {
                        if (entity instanceof SymbolNode) {
                            const name = entity.containerName ? `${entity.containerName}.${entity.title}` : entity.title!
                            const source = await getExactSymbolSource(store.root, filePath, name)
                            evidence.source = source.code
                            evidence.exact = true
                            evidence.symbolName = entity.title
                            evidence.containerName = entity.containerName
                            evidence.symbolKind = source.kind
                            countEngineering('exactSymbolReads')
                        } else {
                            evidence.source = (await registry.execute('read_workspace_file', {filePath}, readContext)).content
                        }
                        countEngineering('sourceReads')
                    }
                    dossier.findings.push(`Inspected ${filePath}${evidence.symbolName ? '#' + evidence.symbolName : ''}; current source is attached as ${evidence.id}.`)
                } catch (error) {
                    dossier.uncertainties.push(`Could not inspect candidate ${filePath}: ${String(error)}`)
                }
            }
            const inspected = dossier.evidence.filter(item => item.filePath && item.source)
            const related = await verifyingTestsForTargets(store, inspected.map(item => item.id), inspected.map(item => item.filePath!))
            for (const test of related.tests.slice(0, max)) add(test, 'Test covering inspected source', false)
            for (const evidence of dossier.evidence.filter(item => item.kind === 'TestNode').slice(0, max)) {
                const test = await store.getEntity<TestNode>(evidence.id, TestNode.dcr)
                if (!test) continue
                evidence.filePath = test.filePath || test.targetPath
                evidence.body = JSON.stringify({command: test.command, lastRun: test.lastRun, passed: test.passed, output: test.output})
                if (!evidence.filePath) continue
                try {
                    evidence.source = (await registry.execute('read_workspace_file', {filePath: evidence.filePath}, readContext)).content
                    countEngineering('sourceReads')
                    dossier.findings.push(`Inspected regression ${evidence.filePath}; stored executions are historical until freshness is checked.`)
                } catch (error) {
                    dossier.uncertainties.push(`Could not inspect test ${evidence.filePath}: ${String(error)}`)
                }
            }
            if (current.kind === 'bug' && !inspected.length) {
                dossier.disposition = 'needs_preparation'
                dossier.rationale = 'Cause unknown: no current source location could be resolved from the Bug reproduction, actual error, indexed symbols or linked scope. Reproduction has not been executed. Supply an implicated local symbol, stack location or diagnostic evidence; do not infer a root cause from routing confidence.'
                dossier.uncertainties.push(dossier.rationale)
                return {status: 'complete', artifactId: id, value: dossier}
            }
            if (inspected.length) dossier.rationale = dossier.findings.join(' ')
            dossier.provenance.optionalSelected = selected.length
            countEngineering("optionalSelected", selected.length)
            const unresolved =
                current.kind === 'bug' ||
                !current.acceptanceCriteria?.length ||
                Boolean(
                    assessment &&
                    (!confident ||
                        assessment.answers.scope?.choice === "ambiguous" ||
                        assessment.answers.depth?.choice === "reasoning" ||
                        assessment.answers.atomicity?.choice === "unknown" ||
                        (assessment.answers.workKind?.choice === "docs" && codePaths.size > 0))
                )
            if (!current.acceptanceCriteria?.length || assessment?.answers.atomicity?.choice === "split")
                dossier.disposition = "needs_preparation"
            if (unresolved) {
                try {
                    const reason =
                        options.reason ??
                        (async (input: TicketDossier) => {
                            const { createDefaultAsker } = await import("../model-runtime.ts")
                            const asker = createDefaultAsker(store.root)
                            if (!asker) throw new Error("Reasoning provider unavailable.")
                            const cfg = loadConfig(store.root)
                            const response = await asker.json(renderInvestigationPrompt(input), InvestigationJudgmentSchema, {
                                model: cfg.modelRoutes?.design ?? cfg.model,
                                temperature: 0,
                                signal: options.signal,
                                maxRetries: 1,
                                maxTokens: cfg.llmOutputTokens,
                                ...cognitionMetrics()
                            })
                            if (!response.ok)
                                throw new Error(
                                    `Investigation provider failed: ${response.failure?.kind ?? "unknown"}: ${response.failure?.message ?? "No validated result."}`
                                )
                            return InvestigationJudgmentSchema.parse(response.data)
                        })
                    countEngineering("reasoningCalls")
                    const judgment = InvestigationJudgmentSchema.parse(await reason(dossier))
                    dossier.provenance.reasoningUsed = true
                    if (judgment.required?.length) return { status: "needs_input", artifactId: id, required: judgment.required }
                    dossier.disposition = judgment.disposition
                    dossier.rationale = judgment.rationale
                    dossier.proposedEnrichments.acceptanceCriteria = judgment.acceptanceCriteria
                    if (!current.acceptanceCriteria?.length && dossier.disposition === "ready") dossier.disposition = "needs_preparation"
                } catch (error) {
                    return {
                        status: "blocked",
                        artifactId: id,
                        blockers: [{ reason: `Bounded investigation reasoning failed: ${String(error)}` }]
                    }
                }
            }
            return { status: "complete", artifactId: id, value: dossier }
        })
    )
}
