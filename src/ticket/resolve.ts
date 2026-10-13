/**
 * Responsibility: Resolve bounded Ticket work and persist independently verified acceptance.
 * Scope: Dependency order, guarded mutations, repair, receipts and lease lifecycle.
 */

import { implementTicket } from "./implementation.ts"
import { executeTicketChecks, verifyTicketAcceptance } from "./verification.ts"
import { Ticket, TestNode, Artifact } from "../graph/ontology.ts"
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
    recordResolutionStage
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
            const { ResolutionProposalSchema, AcceptanceVerificationSchema, readVerificationReceipt, ticketVerificationSignature, resolveTicketGovernance, ruleAcceptanceFailures, RuleAcceptanceError, DOCTRINE_VERIFIER_VERSION } =
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
            const acquired = new Set<string>(),
                ownedFiles = new Set<string>(),
                allFiles = new Set<string>(),
                resolved: string[] = []
            const ownedHashes = new Map<string, string>()
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
            const ctx = { store, projectRoot: store.root, signal: options.signal }
            const statePath = path.join(".ai-workflow", "state")
            const blocked = (reason: string): OperationResult<ResolvedTicket> => ({
                status: "blocked",
                artifactId: rootId,
                blockers: [{ reason }]
            })
            const needs = (question: string, why: string, target: string): OperationResult<ResolvedTicket> => ({
                status: "needs_input",
                artifactId: rootId,
                required: [{ question, why, target }]
            })
            const lease = async (ticket: Ticket) => {
                const fresh = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!,
                    active = fresh.claim && Date.parse(fresh.claim.expiresAt) > Date.now()
                if (active)
                    return fresh.claim!.agentId === agentId
                        ? null
                        : `Ticket '${store.localId(ticket.id)}' is leased by '${fresh.claim!.agentId}'.`
                const claim = await store.claimTicket(store.localId(ticket.id), agentId, cfg.defaultLeaseMinutes, false)
                if (claim.success) {
                    acquired.add(store.localId(ticket.id))
                    return null
                }
                return claim.message ?? "Lease unavailable."
            }
            const guardFiles = (files: string[]) => {
                const status = Bun.spawnSync(["git", "status", "--porcelain=v1", "-z"], { cwd: store.root, stderr: "pipe" })
                if (!status.success) throw new Error("Workspace Git status unavailable; edits require an inspectable repository.")
                const dirty = new Set<string>(),
                    entries = status.stdout.toString().split("\0")
                for (let i = 0; i < entries.length; i++)
                    if (entries[i]) {
                        dirty.add(entries[i].slice(3))
                        if (/[RC]/.test(entries[i].slice(0, 2))) dirty.add(entries[++i])
                    }
                for (const file of files) {
                    const relative = workspacePath(store.root, file)
                    const currentHash = hashFiles(store.root, [relative])[relative]
                    if (ownedHashes.has(relative) && ownedHashes.get(relative) !== currentHash) return relative
                    if (dirty.has(relative) && !ownedFiles.has(relative) && !options.allowDirtyTargets?.includes(relative)) return relative
                }
                return null
            }
            const apply = async (request: import("../change/types.ts").ChangeRequest) => {
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
                if (preview.affectedFiles.some(file => {
                    const relative = workspacePath(store.root, file)
                    return relative === statePath || relative.startsWith(statePath + path.sep)
                }))
                    throw new Error("Implementation cannot mutate canonical workflow/governance state through source changes.")
                const conflict = guardFiles(preview.affectedFiles)
                if (conflict) throw new Error(`Dirty target requires input: ${conflict}`)
                await applyProductMutations(store, [
                    { kind: "product_update", entityType: "Ticket", id: store.localId(executingTicket.id), fields: { lane: "In Progress" } }
                ])
                const result = await engine.applyChange(request, preview.fingerprint)
                anchorMigrations.push(...result.migratedAnchors)
                for (const file of [...result.filesTouched, ...result.filesRenamed.flatMap(rename => [rename.from, rename.to])]) {
                    ownedFiles.add(file)
                    allFiles.add(file)
                    ownedHashes.set(file, hashFiles(store.root, [file])[file])
                }
                countEngineering("codeEdits")
                countEngineering("filesTouched", result.filesTouched.length)
                if (!result.ok || !result.verification.passed)
                    throw new Error(`Change verification failed: ${JSON.stringify(result.verification)}`)
                if (result.filesRenamed.length || result.filesTouched.some(file => ownedHashes.get(file) !== preview.originalHashes[file]))
                    successfulChanges++
                return result
            }
            try {
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
                    const leaseError = await lease(ticket)
                    if (leaseError) return blocked(leaseError)
                    const prepared = await ticket.prepare(store, { ...options, agentId })
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
                            else if (edge.predicateName === "depends_on" && !(target.lane === "Done" && target.status === "verified"))
                                throw new Error(`Unresolved prerequisite '${targetId}' outside the bounded work set.`)
                        }
                    visiting.delete(id)
                    visited.add(id)
                    order.push(id)
                }
                await visit(rootId)
                for (const id of order) {
                    anchorMigrations = []
                    const ticket = work.get(id)!,
                        dossier = dossiers.get(id)!
                    executingTicket = ticket
                    recordMetricCompleteness(dossier.completeness)
                    const scopeFiles = dossier.evidence.filter(item => item.mandatory && item.filePath).map(item => item.filePath!)
                    await ensureAstFresh(store, store.root)
                    const governance = structuredClone(dossier.governance ?? await resolveTicketGovernance(store, ticket))
                    if (governance.fingerprint !== (await resolveTicketGovernance(store, ticket)).fingerprint)
                        return needs("Review changed governance and retry.", "Governance changed after preparation.", "Ticket governance")
                    const signature = await ticketVerificationSignature(store, ticket, options.completeness)
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
                    const receipt = await store.getEntity<Artifact>(`VERIFY-${id}`, Artifact.dcr)
                    const proof = receipt && readVerificationReceipt((receipt as Artifact & { body: string }).body)
                    if (ticket.lane === "Done" && ticket.status === "verified" && proof) {
                        const testNodes = await currentTestEvidence(
                            store,
                            (proof.testNodes ?? []).map(test => test.id)
                        )
                        const expectedFiles = [
                            ...(options.testCommands ?? []).flatMap(command => testPathsFromCommand(command, store.root)),
                            ...scopeFiles,
                            ...graphScope.tests.map(test => test.filePath || test.targetPath!)
                        ]
                        const fullSuite = proof.tests.some(test => canonical(test.command) === canonical(["bun", "test"]))
                        if (fullSuite)
                            expectedFiles.push(
                                ...(await store.listEntities<TestNode>(TestNode.dcr))
                                    .filter(test => test.framework === "bun")
                                    .map(test => test.filePath || test.targetPath!)
                                    .filter(Boolean)
                            )
                        const requestedChecks = (options.testCommands ?? []).every(command =>
                            proof.tests.some(test => test.passed && canonical(test.command) === canonical(command))
                        )
                        const currentProof =
                            requestedChecks &&
                            Boolean(proof.testNodes?.length) &&
                            testNodes.length === proof.testNodes!.length &&
                            testNodes.every(
                                test =>
                                    test.passed &&
                                    canonical(test.hashes) === canonical(proof.testNodes!.find(old => old.id === test.id)?.hashes)
                            )
                        const verifiedContract =
                            dossier.ticket.acceptanceCriteria.every(criterion =>
                                proof.acceptance.criteria.some(check => check.criterion === criterion && check.passed)
                            ) &&
                            dossier.aspects.aspects.every(aspect =>
                                proof.acceptance.aspects.some(check => check.id === aspect.id && check.passed)
                            ) &&
                            !ruleAcceptanceFailures(governance, proof.acceptance, [
                                ...Object.keys(proof.hashes), ...dossier.evidence.filter(item => item.mandatory &&
                                    item.kind === 'SymbolNode' && item.filePath && item.filePath in proof.hashes)
                                    .map(item => store.localId(item.id)), ...testNodes.map(test => test.id)
                            ]).length
                        if (
                            proof.signature === signature &&
                            proof.governanceFingerprint === governance.fingerprint &&
                            currentProof &&
                            verifiedContract &&
                            expectedFiles.every(file => file in proof.hashes) &&
                            canonical(proof.hashes) === canonical(hashFiles(store.root, Object.keys(proof.hashes)))
                        ) {
                            acceptance = AcceptanceVerificationSchema.parse(proof.acceptance)
                            acceptance.aspects = acceptance.aspects.filter(check =>
                                dossier.aspects.aspects.some(aspect => aspect.id === check.id)
                            )
                            for (const file of Object.keys(proof.hashes)) allFiles.add(file)
                            resolved.push(id)
                            reusedProofs++
                            countEngineering("artifactsReused")
                            continue
                        }
                    }
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
                    let feedback: string[] = []
                    const implementationState = { tranches: 0 }
                    for (let attempt = 0; attempt <= maxRepairs; attempt++) {
                        options.signal?.throwIfAborted()
                        if (attempt) {
                            repairs++
                            countEngineering("repairs")
                        }
                        recordResolutionStage("implementation")
                        const current = attempt ? await ticket.investigate(store, options) : null
                        if (current && current.status !== "complete") return current
                        if ((await resolveTicketGovernance(store, ticket)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Pinned governance changed during resolution.", "Ticket governance")
                        const implementationDossier = current?.status === "complete" ? current.value : dossier
                        let proposedTests = [...(options.testCommands ?? [])]
                        if (!children.length && (ticket.lane !== "Done" || attempt > 0)) {
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
                            const proposal = ResolutionProposalSchema.parse(await implementation(implementationDossier, feedback))
                            if (proposal.required?.length) return { status: "needs_input", artifactId: id, required: proposal.required }
                            let changeBlocked = false
                            for (const request of proposal.changes) {
                                try {
                                    await apply(request)
                                } catch (error) {
                                    if (String(error).includes("Dirty target requires input:")) throw error
                                    feedback = [String(error)]
                                    changeBlocked = true
                                    break
                                }
                            }
                            if (changeBlocked) continue
                            if (!options.testCommands?.length && proposal.testCommands.length) proposedTests = proposal.testCommands
                        }
                        if ((await resolveTicketGovernance(store, ticket)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Governance changed during implementation; self-weakening cannot proceed.", "Ticket governance")
                        recordResolutionStage("verification")
                        await ensureAstFresh(store, store.root)
                        const checked = await executeTicketChecks(
                            store,
                            dossier,
                            [...scopeFiles, ...allFiles],
                            proposedTests,
                            options.signal,
                            rootId
                        )
                        if (checked.status !== "complete") return checked
                        const { tests: currentTests, testNodes, evidenceComplete } = checked.value
                        if (currentTests.some(test => !test.passed)) {
                            feedback = currentTests.filter(test => !test.passed).map(test => test.output)
                            continue
                        }
                        if (!evidenceComplete) {
                            feedback = ["No current passing TestNode execution proves this verification scope."]
                            continue
                        }
                        const verificationHashes = hashFiles(store.root, [
                            ...allFiles,
                            ...scopeFiles,
                            ...testNodes.flatMap(test => Object.keys(test.hashes))
                        ])
                        recordResolutionStage("acceptance")
                        let rejectedRules: string[] | undefined
                        try {
                            acceptance = AcceptanceVerificationSchema.parse(
                                await verify({ dossier: implementationDossier, files: [...allFiles], tests: currentTests, testNodes, children })
                            )
                        } catch (error) {
                            if (!(error instanceof RuleAcceptanceError)) throw error
                            rejectedRules = error.failures
                        }
                        if ((await resolveTicketGovernance(store, ticket)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Governance changed during independent acceptance.", "Ticket governance")
                        if (rejectedRules) {
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
                                .map(item => store.localId(item.id)), ...testNodes.map(test => test.id)
                        ])
                        if (missing.length || ruleFailures.length) {
                            feedback = [...missing.map(item => `Unverified required acceptance/Aspect: ${item}`), ...ruleFailures]
                            continue
                        }
                        const currentTicket = (await store.getEntity<Ticket>(ticket.id, Ticket.dcr))!
                        if ((await ticketVerificationSignature(store, currentTicket, options.completeness, anchorMigrations)) !== signature)
                            return needs(
                                "Review the changed Ticket contract or authored scope and retry resolution.",
                                "The acceptance contract changed during implementation or independent verification.",
                                "Ticket verification contract"
                            )
                        const leaseError = await lease(ticket)
                        if (leaseError) return blocked(leaseError)
                        if ((await resolveTicketGovernance(store, currentTicket)).fingerprint !== governance.fingerprint)
                            return needs("Review changed governance and retry.", "Governance changed before proof closure.", "Ticket governance")
                        const verifiedSignature = await ticketVerificationSignature(store, currentTicket, options.completeness)
                        const proof = await store.upsertEntity<Artifact>(Artifact.dcr, {
                            id: `VERIFY-${id}`,
                            title: `Verified acceptance for ${id}`,
                            body: JSON.stringify({
                                governanceVersion: DOCTRINE_VERIFIER_VERSION,
                                governanceFingerprint: governance.fingerprint,
                                signature: verifiedSignature,
                                hashes: verificationHashes,
                                acceptance,
                                testNodes,
                                tests: currentTests.map(test => ({ command: test.command, passed: test.passed })),
                                children,
                                verifiedAt: new Date().toISOString()
                            }),
                            status: "verified"
                        })
                        await store.relate(proof, "verifies", ticket)
                        await applyProductMutations(store, [
                            { kind: "product_update", entityType: "Ticket", id, fields: { lane: "Done", status: "verified" } }
                        ])
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
                return blocked(`Ticket resolution failed: ${message}`)
            } finally {
                for (const id of acquired) await store.releaseTicket(id)
                const { exportProjections } = await import("../graph/projections.ts")
                await exportProjections(store)
            }
        }
    )
}
