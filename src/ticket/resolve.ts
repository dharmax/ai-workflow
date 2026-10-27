/**
 * Responsibility: Resolve bounded Ticket work and persist independently verified acceptance.
 * Scope: Dependency order, guarded mutations, repair, receipts and lease lifecycle.
 */

import {recordTicketEvent} from '../graph/journal.ts'
import {assertChangeScope, buildSourceScope} from './source-scope.ts'
import {assertTechnicalReviews} from '../graph/technical-proof.ts'
import { implementTicket } from "./implementation.ts"
import {assessBug} from "../graph/ticket-state.ts"
import {requireStoryTests, activateStoryTestsForTicket, runStoryTest, storyTestStatus} from "../product/story-tests.ts"
import { executeTicketChecks, verifyTicketAcceptance, currentTicketReceipt } from "./verification.ts"
import { Ticket, TestNode, Artifact, UserStory } from "../graph/ontology.ts"
import type {TicketClaim} from "../graph/types.ts"
import type { WorkflowStore } from "../graph/store.ts"
import type {
    ResolutionOptions,
    ResolvedTicket,
    OperationResult,
    TicketDossier,
    ResolutionVerificationInput
} from "../ticket-operation-types.ts"
import { canonical } from "../kb/canonical.ts"
import path from "node:path"
import { createActorTokenBudgetPolicy } from "../actor-budget-policy.ts"
import {
    withArtifactMetrics,
    countEngineering,
    visitMetricArtifact,
    recordMetricCompleteness,
    recordResolutionStage,
    traceResolution
} from "../performance-metrics.ts"

export async function resolveTicket(
    rootTicket: Ticket,
    store: WorkflowStore,
    options: ResolutionOptions = {}
): Promise<OperationResult<ResolvedTicket>> {
    options.signal?.throwIfAborted()
    return withArtifactMetrics(
        store.root,
        "resolve_ticket",
        store.localId(rootTicket.id),
        { ...options, depth: options.depth ?? "all" },
        async () => {
            recordResolutionStage("preparation")
            const { ResolutionProposalSchema, AcceptanceVerificationSchema, readVerificationReceipt, VerificationReceiptSchema, ticketVerificationSignature, resolveTicketGovernance, ruleAcceptanceFailures, RuleAcceptanceError, DOCTRINE_VERIFIER_VERSION } =
                await import("../ticket-operation-types.ts")
            const { ArtifactBudget } = await import("../artifact-policy.ts")
            const { CausalChangeEngine } = await import("../change/engine.ts")
            const { workspacePath } = await import("../change/workspace-path.ts")
            const { loadConfig } = await import("../config.ts")
            const { applyProductMutations } = await import("../product/mutation.ts")
            const { initializeTools } = await import("../tools/index.ts")
            const { z } = await import("zod")
            const { ToolExecutionError } = await import("@dharmax/llm-utils")
            const { ensureAstFresh } = await import("../graph/indexer.ts")
            const { verifyingTestsForTargets, currentTestEvidence, hashFiles, testPathsFromCommand } =
                await import("../graph/test-artifacts.ts")
            initializeTools()
            const cfg = loadConfig(store.root),
                agentId = options.agentId ?? cfg.defaultAgentId,
                rootId = store.localId(rootTicket.id)
            const acquired = new Map<string, TicketClaim>(),
                ownedFiles = new Set<string>(),
                allFiles = new Set<string>(),
                resolved: string[] = []
            let executingTicket: Ticket = rootTicket,
                successfulChanges = 0,
                reusedProofs = 0
            let anchorMigrations: import("../change/types.ts").ChangeApplyResult["migratedAnchors"] = []
            const maxRepairs = z
                .number()
                .int()
                .min(0)
                .max(3)
                .parse(options.maxRepairs ?? 2)
            const maxActorTokens = z
                .number()
                .int()
                .positive()
                .parse(options.maxActorTokens ?? cfg.actorTokenBudget)
            const actorTokenBudget = {
                remainingTokens: maxActorTokens,
                requestExtension: createActorTokenBudgetPolicy(maxActorTokens, options.maxActorTokens !== undefined)
            }
            const budget = new ArtifactBudget(options, "all", cfg.maxArtifacts),
                work = new Map<string, Ticket>(),
                dossiers = new Map<string, TicketDossier>()
            let repairs = 0,
                acceptance: import("../ticket-operation-types.ts").AcceptanceVerification = { criteria: [], aspects: [], rules: [] }
            const immutable = <T>(value: T): T => {
                if (value && typeof value === 'object') {
                    for (const child of Object.values(value)) immutable(child)
                    Object.freeze(value)
                }
                return value
            }
            let admission: string | undefined
            let scope: import('../ticket-operation-types.ts').GovernedChangeScope
            let effectEpoch = 0
            const ctx = { store, projectRoot: store.root, signal: options.signal,
                get governedAdmission() { return admission },
                get ticketLease() {
                    const ticketId = store.localId(executingTicket.id), claim = acquired.get(ticketId)
                    return claim ? {ticketId, claim} : undefined
                } }
            const blocked = (reason: string): OperationResult<ResolvedTicket> =>
                ({status: 'blocked', artifactId: rootId, blockers: [{reason}]})
            const needs = (question: string, why: string, target: string): OperationResult<ResolvedTicket> =>
                ({status: 'needs_input', artifactId: rootId, required: [{question, why, target}]})
            const lease = async (ticket: Ticket) => {
                const id = store.localId(ticket.id)
                const claim = await store.claimTicket(id, agentId, cfg.defaultLeaseMinutes, false, acquired.get(id))
                if (!claim.success) return claim.message ?? 'Lease unavailable.'
                acquired.set(id, claim.claim!)
                return null
            }
            const apply = async (request: import("../change/types.ts").ChangeRequest) => {
                await store.renewGovernance(admission!, cfg.defaultLeaseMinutes)
                const leaseError = await lease(executingTicket)
                if (leaseError) throw new Error(leaseError)
                if (request.action === "product_change")
                    throw new Error("Implementation cannot mutate Product/Ticket semantics through code tools.")
                const engine = new CausalChangeEngine(ctx),
                    preview = await engine.previewChange(request)
                if (preview.blocked)
                    throw new ToolExecutionError(
                        `Change preview blocked: ${preview.blockReason ?? preview.summary}. For replace_text, replace an existing anchor that occurs exactly once in the current file; read current source before retrying.`,
                        undefined,
                        "safety_preview"
                    )
                await store.governanceAssertion(admission!)
                await assertChangeScope(store, executingTicket, scope, preview, request, ownedFiles, options.allowDirtyTargets, effectEpoch, anchorMigrations)
                await applyProductMutations(store, [
                    { kind: "product_update", entityType: "Ticket", id: store.localId(executingTicket.id), fields: { lane: "In Progress" } }
                ])
                const result = await engine.applyChange(request, preview.fingerprint)
                const observed = [...new Set([...result.filesTouched, ...result.filesRenamed.flatMap(rename => [rename.from, rename.to])])].sort()
                if (observed.some(file => !preview.affectedFiles.includes(file)))
                    throw Error('Observed effects exceed the authorized preview; independent acceptance cannot proceed.')
                if (!result.effects || canonical(result.effects.after) !== canonical(hashFiles(store.root, Object.keys(result.effects.after))))
                    throw Error('Observed filesystem state differs from attributable guarded effects.')
                const after = result.effects.after
                scope = immutable({...scope, revision: scope.revision + 1, effects: Object.freeze([...scope.effects,
                    Object.freeze({fingerprint: preview.fingerprint, edits: result.effects.edits,
                        before: Object.freeze({...result.effects.before}),
                        after: Object.freeze(after), renames: Object.freeze(result.filesRenamed.map(rename => Object.freeze({...rename})))})])})
                await store.saveGovernedScope(scope.ticketId, acquired.get(scope.ticketId)!, admission!, scope)
                anchorMigrations.push(...result.migratedAnchors)
                for (const file of [...result.filesTouched, ...result.filesRenamed.flatMap(rename => [rename.from, rename.to])]) {
                    ownedFiles.add(file)
                    allFiles.add(file)
                }
                await recordTicketEvent(store,{ticketId:store.localId(executingTicket.id),kind:result.ok&&result.verification.passed?'action':'failure',
                    message:`Guarded ${request.action}: ${result.ok&&result.verification.passed?'applied':'verification failed'}.`,references:observed})
                countEngineering("codeEdits")
                countEngineering("filesTouched", result.filesTouched.length)
                if (!result.ok || !result.verification.passed)
                    throw new Error(`Change verification failed: ${JSON.stringify(result.verification)}`)
                if (result.filesRenamed.length || result.filesTouched.some(file => result.effects!.after[file] !== preview.originalHashes[file]))
                    successfulChanges++
                return result
            }
            const run = async (): Promise<OperationResult<ResolvedTicket>> => {
            try {
                traceResolution('initial AST refresh start')
                await ensureAstFresh(store, store.root)
                traceResolution('initial AST refresh finished')
                admission = await store.admitGovernance('governed', cfg.defaultLeaseMinutes)
                // Prepare a bounded closure first, then execute a single dependency order.
                const queue: Array<{ ticket: Ticket; depth: number }> = [{ ticket: rootTicket, depth: 0 }]
                while (queue.length) {
                    options.signal?.throwIfAborted()
                    const { ticket, depth } = queue.shift()!,
                        id = store.localId(ticket.id)
                    if (work.has(id)) continue
                    if (!budget.visit(id, depth))
                        return needs(
                            `Increase depth/maxArtifacts to include '${id}'.`,
                            "The work closure exceeds the explicit operation budget.",
                            "Operation depth/maxArtifacts"
                        )
                    if (ticket.lane === 'Cancelled')
                        return needs(`Reopen cancelled Ticket '${id}' before resolving it.`,
                            'Cancellation is not successful completion and cannot silently resume execution.', 'Ticket lane')
                    if (ticket.kind === 'bug' && !assessBug(ticket).ready)
                        return needs(`Complete Bug report '${id}': ${assessBug(ticket).missing.join(', ')}.`,
                            'A partial defect report is not an executable implementation contract.', 'Bug reproduction')
                    for (const edge of await store.getOutgoing(ticket.id, 'addresses')) {
                        const story = await store.getEntity<UserStory>(edge.targetId, UserStory.dcr)
                        if (!story) continue
                        const effective = await story.getEffectiveState(store)
                        if (['draft', 'proposed', 'deprecated', 'needs-review'].includes(effective.state))
                            return needs(`Review Story '${store.localId(story.id)}': ${effective.reasons.join('; ')}`,
                                'Addressed Story intent and its reviewed test must be executable before resolving work.', 'Story definition/test review')
                    }
                    const leaseError = await lease(ticket)
                    if (leaseError) return blocked(leaseError)
                    traceResolution('Ticket.prepare start: ' + id)
                    const prepared = await ticket.prepare(store, { ...options, agentId, owner: acquired.get(id) })
                    traceResolution('Ticket.prepare returned: ' + prepared.status)
                    if (prepared.status !== "complete") return prepared
                    if (prepared.value.dossier.disposition === "rejectable")
                        return needs(
                            `Review rejection evidence for '${id}': ${prepared.value.dossier.rationale}`,
                            "Rejection is grounded but requires explicit disposition approval.",
                            "Ticket lifecycle"
                        )
                    const fresh = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!
                    const grounded = prepared.value.applied
                        ? await fresh.investigate(store, options)
                        : { status: "complete" as const, value: prepared.value.dossier }
                    if (grounded.status !== "complete") return grounded
                    work.set(id, fresh)
                    dossiers.set(id, grounded.value)
                    visitMetricArtifact(id)
                    for (const child of prepared.value.children)
                        queue.push({ ticket: (await store.getEntity<Ticket>(child, Ticket.dcr))!, depth: depth + 1 })
                }
                const order: string[] = [],
                    visiting = new Set<string>(),
                    visited = new Set<string>()
                const visit = async (id: string): Promise<void> => {
                    if (visiting.has(id)) throw new Error(`Work containment/dependency cycle at '${id}'.`)
                    if (visited.has(id)) return
                    visiting.add(id)
                    for (const edge of await store.getOutgoing(work.get(id)!.id))
                        if (["contains", "depends_on"].includes(edge.predicateName)) {
                            const target = await store.getEntity<Ticket>(edge.targetId, Ticket.dcr)
                            if (!target) continue
                            const targetId = store.localId(target.id)
                            if (work.has(targetId)) await visit(targetId)
                            else if (edge.predicateName === "depends_on" && !(target.lane === "Done"))
                                throw new Error(`Unresolved prerequisite '${targetId}' outside the bounded work set.`)
                        }
                    visiting.delete(id)
                    visited.add(id)
                    order.push(id)
                }
                await visit(rootId)
                for (const id of order) {
                    anchorMigrations = []
                    const ticket = work.get(id)!
                    let dossier = dossiers.get(id)!
                    executingTicket = ticket
                    recordMetricCompleteness(dossier.completeness)
                    const stories: string[] = []
                    for (const edge of await store.getOutgoing(ticket.id, 'addresses')) {
                        const story = await store.getEntity<UserStory>(edge.targetId, UserStory.dcr)
                        if (story) stories.push(store.localId(story.id))
                    }
                    let green = stories.length > 0
                    const baselineFindings: string[] = []
                    for (const storyId of stories) {
                        const coverage = await storyTestStatus(store, storyId)
                        if (coverage.tests.some(test => test.state === 'skipped' || test.state === 'not-run')) {
                            const activated = await activateStoryTestsForTicket(store, id, preview =>
                                new CausalChangeEngine(ctx).applyChange(preview.request, preview.fingerprint))
                            for (const testId of activated.tests) {
                                const test = await store.getEntity<TestNode>(testId, TestNode.dcr)
                                if (test?.filePath) ownedFiles.add(test.filePath)
                            }
                        }
                        if (ticket.lane !== 'Done') await applyProductMutations(store, [
                            {kind: 'product_update', entityType: 'Ticket', id, fields: {lane: 'In Progress'}}
                        ])
                        const current = await storyTestStatus(store, storyId)
                        if (current.tests.length !== 1) throw Error(`Story '${storyId}' needs one reviewed runnable test; selection is uncovered or ambiguous.`)
                        let state = current.tests[0].state
                        if (state !== 'expected-red' && state !== 'green') {
                            // A historical Done receipt cannot keep stale Story evidence current.
                            if (ticket.lane === 'Done') await applyProductMutations(store, [
                                {kind: 'product_update', entityType: 'Ticket', id, fields: {lane: 'In Progress'}}
                            ])
                            const {registry} = await import('../tools/index.ts')
                            const baseline = await runStoryTest(store, storyId,
                                command => registry.execute('triage_test_failures', {testCommand: command},
                                    {store, projectRoot: store.root, signal: options.signal, executionAuthority: 'project-write'}),
                                preview => new CausalChangeEngine(ctx).applyChange(preview.request, preview.fingerprint))
                            if (baseline.status !== 'expected-red' && baseline.status !== 'green') return blocked(`Story '${storyId}' baseline: ${baseline.reason}`)
                            state = baseline.status
                        }
                        green &&= state === 'green'
                        const observed = await store.getEntity<TestNode>(current.tests[0].id, TestNode.dcr)
                        baselineFindings.push(`Story '${storyId}' baseline: ${state}.\n${observed?.output?.slice(-2000) ?? ''}`)
                    }
                    if (stories.length) {
                        // Preparation preceded activation and the observed baseline. Its source
                        // snapshots must not describe skipped tests to the implementation Actor.
                        const refreshed = await ticket.investigate(store, {...options, mandatoryEvidenceOnly: true})
                        if (refreshed.status !== 'complete') return refreshed
                        dossier = refreshed.value
                    }
                    await requireStoryTests(store, ticket)
                    const scopeFiles = dossier.evidence.filter(item => item.mandatory && item.filePath).map(item => item.filePath!)
                    await ensureAstFresh(store, store.root)
                    const receipt = await store.getEntity<Artifact>(`VERIFY-${id}`, Artifact.dcr)
                    const proof = receipt && readVerificationReceipt((receipt as Artifact & {body: string}).body)
                    const cached = VerificationReceiptSchema.shape.scope.safeParse((ticket as Ticket & {metadata?: Record<string, unknown>}).metadata?.governedScope)
                    const pending = cached.success && cached.data.ticketId === id ? cached.data : undefined
                    scope = immutable(await buildSourceScope(store, ticket, dossier, {
                        pending, previous: pending ?? proof?.scope, authorizedFiles: options.authorizedFiles?.[id]
                    }))
                    const governance = scope.governance
                    effectEpoch = scope.effects.length
                    for (const effect of scope.effects) for (const [file, hash] of Object.entries(effect.after))
                        if (hashFiles(store.root, [file])[file] === hash) ownedFiles.add(file)
                    dossier.governance = scope.governance
                    dossier.aspects = scope.governance.aspects
                    dossier.scope = scope
                    const signature = await ticketVerificationSignature(store, ticket, options.completeness, [], scope.governance)
                    const graphScope = await verifyingTestsForTargets(
                        store,
                        dossier.evidence.filter(item => item.mandatory).map(item => item.id),
                        scopeFiles
                    )
                    for (const test of graphScope.tests)
                        if (!dossier.evidence.some(item => item.id === store.localId(test.id)))
                            dossier.evidence.push({
                                id: store.localId(test.id),
                                kind: "TestNode",
                                title: test.title || store.localId(test.id),
                                filePath: test.filePath || test.targetPath,
                                mandatory: true,
                                provenance: "Graph verifies code target"
                            })
                    const currentReceipt = await currentTicketReceipt(store, ticket, {
                        completeness: options.completeness, testCommands: options.testCommands,
                        expectedFiles: [...scope.files, ...(options.testCommands ?? []).flatMap(command => testPathsFromCommand(command, store.root))],
                        requiredTestIds: graphScope.tests.map(test => store.localId(test.id))
                    })
                    if (currentReceipt) {
                        acceptance = AcceptanceVerificationSchema.parse(currentReceipt.acceptance)
                        acceptance.aspects = acceptance.aspects.filter(check => dossier.aspects.aspects.some(aspect => aspect.id === check.id))
                        for (const file of Object.keys(currentReceipt.hashes)) allFiles.add(file)
                        resolved.push(id)
                        reusedProofs++
                        countEngineering("artifactsReused")
                        continue
                    }
                    await store.renewGovernance(admission!, cfg.defaultLeaseMinutes)
                    await store.saveGovernedScope(id, acquired.get(id)!, admission!, scope)
                    if (ticket.lane === "Done")
                        await applyProductMutations(store, [
                            { kind: "product_update", entityType: "Ticket", id, fields: { lane: "In Progress" } }
                        ])
                    if (!dossier.ticket.acceptanceCriteria.length)
                        return needs(
                            `Author executable acceptance criteria for '${id}'.`,
                            "Completion cannot be verified without a contract.",
                            "Ticket acceptanceCriteria"
                        )
                    const children = (await store.getOutgoing(ticket.id, "contains"))
                        .filter(edge => work.has(store.localId(edge.targetId)))
                        .map(edge => store.localId(edge.targetId))
                    const verify =
                        options.verify ?? ((input: ResolutionVerificationInput) => verifyTicketAcceptance(store, input, options, cfg))
                    let feedback: string[] = baselineFindings
                    const implementationState = { tranches: 0 }
                    for (let attempt = 0; attempt <= (options.verifyOnly ? 0 : maxRepairs); attempt++) {
                        options.signal?.throwIfAborted()
                        if (attempt) {
                            repairs++
                            countEngineering("repairs")
                            await recordTicketEvent(store,{ticketId:id,kind:'correction',message:`Repair attempt ${attempt}; addressing prior failed checks.`,references:[]})
                        }
                        recordResolutionStage("implementation")
                        const current = attempt ? await ticket.investigate(store, options) : null
                        if (current && current.status !== "complete") return current
                        if ((await resolveTicketGovernance(store, ticket, scope.files, scope.governance)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Pinned governance changed during resolution.", "Ticket governance")
                        const implementationDossier = {...(current?.status === 'complete' ? current.value : dossier),
                            scope, governance: scope.governance, aspects: scope.governance.aspects}
                        let proposedTests = [...(options.testCommands ?? [])]
                        if (!children.length && (ticket.lane !== "Done" || attempt > 0)) {
                            await requireStoryTests(store,ticket)
                            if (!options.verifyOnly && (!green || attempt > 0)) {
                                const implementation =
                                    options.implement ??
                                    ((input: TicketDossier, findings: readonly string[]) =>
                                        implementTicket(input, findings, {
                                            store,
                                            ticket,
                                            options,
                                            cfg,
                                            applyChange: apply,
                                            mutationEpoch: () => successfulChanges,
                                            ownedFiles,
                                            tokenBudget: actorTokenBudget,
                                            state: implementationState,
                                            testCommands: proposedTests,
                                            repair: attempt > 0
                                        }))
                                traceResolution('implementation model start')
                                const proposal = ResolutionProposalSchema.parse(await implementation(implementationDossier, feedback))
                                traceResolution('implementation model returned ' + proposal.changes.length + ' proposed changes')
                                if (proposal.required?.length) return { status: "needs_input", artifactId: id, required: proposal.required }
                                let previewFailed = false
                                for (const request of proposal.changes) {
                                    try {
                                        await apply(request)
                                    } catch (error) {
                                        if (!(error instanceof ToolExecutionError) || error.category !== 'safety_preview') throw error
                                        feedback = [String(error)]
                                        previewFailed = true
                                        break
                                    }
                                }
                                if (previewFailed && scope.effects.length === effectEpoch) continue
                                if (!options.testCommands?.length && proposal.testCommands.length) proposedTests = proposal.testCommands
                            }
                        }
                        const attributableState = Object.assign({...scope.baselines}, ...scope.effects.slice(effectEpoch).map(effect => effect.after))
                        if (canonical(attributableState) !== canonical(hashFiles(store.root, Object.keys(attributableState))))
                            throw Error('Unexpected source modification outside guarded effects; preserve user work and retry with fresh baselines.')
                        if ((await resolveTicketGovernance(store, ticket, scope.files, scope.governance)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Governance changed during implementation; self-weakening cannot proceed.", "Ticket governance")
                        recordResolutionStage("verification")
                        await ensureAstFresh(store, store.root)
                        let check = () => executeTicketChecks(store, dossier, [...scope.files], proposedTests, options.signal, rootId)
                        // Each existing Story owner observes the same check execution. Nest callbacks
                        // so all tests execute once and each classification captures its own prior run.
                        for (const storyId of stories) {
                            const execute = check
                            check = async () => {
                                let result: Awaited<ReturnType<typeof executeTicketChecks>> | undefined
                                const observation = await runStoryTest(store, storyId, async () => { result = await execute() },
                                    preview => new CausalChangeEngine(ctx).applyChange(preview.request, preview.fingerprint))
                                if (observation.status === 'blocked') {
                                    traceResolution('Story ' + storyId + ' checks blocked: ' + observation.reason +
                                        '\nLast test output:\n' + ('output' in observation && typeof observation.output === 'string' ? observation.output : '(no recorded output)').slice(-2400))
                                    return {status: 'blocked' as const, artifactId: rootId, blockers: [{reason: `Story '${storyId}' checks: ${observation.reason}`}]}
                                }
                                return result!
                            }
                        }
                        traceResolution('verification test execution start')
                        const checked = await check()
                        traceResolution('verification test execution returned: ' + checked.status)
                        if (checked.status === 'complete' && stories.length)
                            checked.value.testNodes = await currentTestEvidence(store, checked.value.testNodes.map(test => test.id))
                        if (checked.status !== "complete") return checked
                        const { tests: currentTests, testNodes, evidenceComplete } = checked.value
                        await recordTicketEvent(store,{ticketId:id,kind:currentTests.some(test=>!test.passed)?'failure':'outcome',
                            message:`Verification checks: ${currentTests.filter(test=>test.passed).length} passing, ${currentTests.filter(test=>!test.passed).length} failing; evidence ${evidenceComplete?'complete':'incomplete'}.`,
                            references:testNodes.map(test=>test.id)})
                        if (currentTests.some(test => !test.passed)) {
                            feedback = currentTests.filter(test => !test.passed).map(test => test.output)
                            traceResolution('verification failed, repair ' + (attempt + 1) + '/' + (maxRepairs + 1) +
                                ': ' + currentTests.filter(test => !test.passed).map(test =>
                                    test.command.join(' ') + '\n' + test.output.slice(-2500)).join('\n'))
                            continue
                        }
                        if (!evidenceComplete) {
                            feedback = ["No current passing TestNode execution proves this verification scope."]
                            traceResolution('verification evidence incomplete; repair ' + (attempt + 1) + '/' + (maxRepairs + 1))
                            continue
                        }
                        const verificationHashes = hashFiles(store.root, [
                            ...scope.files,
                            ...testNodes.flatMap(test => Object.keys(test.hashes))
                        ])
                        recordResolutionStage("acceptance")
                        let rejectedRules: string[] | undefined
                        try {
                            acceptance = AcceptanceVerificationSchema.parse(
                                await verify({ dossier: {...implementationDossier, scope}, files: [...scope.files], tests: currentTests, testNodes, children })
                            )
                        } catch (error) {
                            if (!(error instanceof RuleAcceptanceError)) throw error
                            rejectedRules = error.failures
                        }
                        if ((await resolveTicketGovernance(store, ticket, scope.files, scope.governance)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Governance changed during independent acceptance.", "Ticket governance")
                        if (rejectedRules) {
                            await recordTicketEvent(store,{ticketId:id,kind:'failure',message:'Independent Rule review rejected: '+rejectedRules.join('; ').slice(0,11000),references:[]})
                            feedback = rejectedRules
                            continue
                        }
                        if (canonical(verificationHashes) !== canonical(hashFiles(store.root, Object.keys(verificationHashes)))) {
                            feedback = ["Source or test changed during independent acceptance verification."]
                            continue
                        }
                        acceptance.criteria = acceptance.criteria.filter(check =>
                            dossier.ticket.acceptanceCriteria.includes(check.criterion)
                        )
                        acceptance.aspects = acceptance.aspects.filter(check =>
                            dossier.aspects.aspects.some(aspect => aspect.id === check.id)
                        )
                        const missing = [
                            ...dossier.ticket.acceptanceCriteria.filter(
                                criterion => !acceptance.criteria.some(check => check.criterion === criterion && check.passed)
                            ),
                            ...dossier.aspects.aspects
                                .map(aspect => aspect.id)
                                .filter(aspect => !acceptance.aspects.some(check => check.id === aspect && check.passed))
                        ]
                        const ruleFailures = ruleAcceptanceFailures(governance, acceptance, [
                            ...Object.keys(verificationHashes), ...dossier.evidence.filter(item => item.mandatory &&
                                item.kind === 'SymbolNode' && item.filePath && item.filePath in verificationHashes)
                                .map(item => store.localId(item.id)), ...testNodes.map(test => test.id), ...(acceptance.scopeReviews?.flatMap(review => review.sourceIds) ?? [])
                        ])
                        if (missing.length || ruleFailures.length) {
                            feedback = [...missing.map(item => `Unverified required acceptance/Aspect: ${item}`), ...ruleFailures]
                            continue
                        }
                        for (const childId of children) {
                            const child = await store.getEntity<Ticket>(childId, Ticket.dcr)
                            const record = await store.getEntity<Artifact>(`VERIFY-${childId}`, Artifact.dcr)
                            const childProof = record && readVerificationReceipt(record.body)
                            const evidence = childProof ? await currentTestEvidence(store, childProof.testNodes.map(test => test.id)) : []
                            if (!child || child.lane !== 'Done' || !childProof ||
                                childProof.signature !== await ticketVerificationSignature(store, child, options.completeness, [],
                                  await resolveTicketGovernance(store, child, childProof.scope.files, childProof.scope.governance)) ||
                                canonical(childProof.hashes) !== canonical(hashFiles(store.root, Object.keys(childProof.hashes))) ||
                                evidence.length !== childProof.testNodes.length || evidence.some(test => !test.passed))
                                throw Error(`Child '${childId}' no longer has current independently accepted proof.`)
                        }
                        const leaseError = await lease(ticket)
                        if (leaseError) return blocked(leaseError)
                        const currentTicket = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!
                        if ((await ticketVerificationSignature(store, currentTicket, options.completeness, anchorMigrations, scope.governance)) !== signature)
                            return needs(
                                "Review the changed Ticket contract or authored scope and retry resolution.",
                                "The acceptance contract changed during implementation or independent verification.",
                                "Ticket verification contract"
                            )
                        if ((await resolveTicketGovernance(store, currentTicket, scope.files, scope.governance)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Governance changed before proof closure.", "Ticket governance")
                        const verifiedSignature = await ticketVerificationSignature(store, currentTicket, options.completeness, [], scope.governance)
                        if (canonical(verificationHashes) !== canonical(hashFiles(store.root, Object.keys(verificationHashes))))
                            throw Error('Source or test changed before coherent completion.')
                        await assertTechnicalReviews(store, id, acceptance)
                        await store.completeTicket(currentTicket, acquired.get(id)!, admission!, JSON.stringify({
                                scope,
                                governanceVersion: DOCTRINE_VERIFIER_VERSION,
                                governanceFingerprint: governance.fingerprint,
                                signature: verifiedSignature,
                                hashes: verificationHashes,
                                acceptance,
                                testNodes,
                                tests: currentTests.map(test => ({ command: test.command, passed: test.passed })),
                                children,
                                verifiedAt: new Date().toISOString()
                            }))
                        resolved.push(id)
                        break
                    }
                    if (!resolved.includes(id)) return blocked(`Bounded repair exhausted for '${id}': ${feedback.join("\n")}`)
                }
                recordResolutionStage(
                    "acceptance",
                    successfulChanges > 0 ? "implemented" : reusedProofs === resolved.length ? "proof_reused" : "verified_no_change"
                )
                return {
                    status: "complete",
                    artifactId: rootId,
                    value: { verification: true, resolved, files: [...allFiles], repairs, acceptance }
                }
            } catch (error) {
                const message = String(error)
                if (message.includes("Dirty target requires input:"))
                    return needs(message, "The Actor selected a target with existing uncommitted work.", "Operation allowDirtyTargets")
                if (message.includes("Scope expansion requires input:"))
                    return needs(message, 'The preview includes effects outside this Ticket authorization.', 'Operation authorizedFiles')
                const causes: string[] = []
                let cause: unknown = error instanceof Error ? error.cause : undefined
                for (let depth = 0; cause !== undefined && depth < 4; depth++) {
                    causes.push(String(cause))
                    cause = cause instanceof Error ? cause.cause : undefined
                }
                return blocked(`Ticket resolution failed: ${[message, ...causes].join(' <- ')}`)
            }
            }
            let outcome: OperationResult<ResolvedTicket> | undefined
            try {
                outcome = await run()
                return outcome
            } finally {
                const stopped = outcome?.status !== 'complete'
                const reason = outcome ? JSON.stringify(outcome) : 'Resolution interrupted before an outcome.'
                // Every acquired reservation belongs to this operation. Partial child completion
                // remains Done; all unfinished owned work records the same final stop outcome.
                const cleanup = await Promise.allSettled([
                    ...(admission ? [store.releaseGovernance(admission)] : []),
                    ...[...acquired].map(([id, owner]) => store.releaseTicket(id, owner, stopped ? 'Blocked' : 'Todo', stopped ? reason : undefined))
                ])
                const failed = cleanup.find(result => result.status === 'rejected')
                if (failed?.status === 'rejected') throw failed.reason
                if (!options.signal?.aborted && !store.isReadOnlyExecution()) {
                    const { exportProjections } = await import('../graph/projections.ts')
                    await exportProjections(store)
                }
            }
        }
    )
}
