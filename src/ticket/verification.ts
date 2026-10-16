/**
 * Responsibility: Execute Ticket checks and independently assess the current implementation.
 * Scope: TestNode evidence and semantic acceptance from post-edit source.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderAcceptancePrompt } from "./prompts.ts"
import { TestNode, Ticket } from "../graph/ontology.ts"
import { currentTestEvidence, hashFiles, recordTestExecution, verifyingTestsForTargets } from "../graph/test-artifacts.ts"
import { registry } from "../tools/registry.ts"
import { canonical } from "../kb/canonical.ts"
import type { TicketDossier, OperationResult } from "../ticket-operation-types.ts"
import type { WorkflowStore } from "../graph/store.ts"
import {
    AcceptanceVerificationSchema,
    RuleAcceptanceError,
    ruleAcceptanceFailures,
    resolveTicketGovernance,
    type AcceptanceVerification,
    type ResolutionVerificationInput,
    type ResolutionOptions
} from "../ticket-operation-types.ts"
import type { loadConfig } from "../config.ts"
import { createDefaultAsker } from "../model-runtime.ts"
import { buildVerificationContext } from "../verification-context.ts"
import { countEngineering, cognitionMetrics } from "../performance-metrics.ts"

/** Execute graph-required checks and record their TestNodes before semantic acceptance. */
export async function executeTicketChecks(
    store: WorkflowStore,
    dossier: TicketDossier,
    files: string[],
    commands: string[][],
    signal: AbortSignal | undefined,
    artifactId: string
): Promise<
    OperationResult<{
        tests: ResolutionVerificationInput["tests"]
        testNodes: ResolutionVerificationInput["testNodes"]
        evidenceComplete: boolean
    }>
> {
    const id = dossier.ticket.id
    const ctx = { store, projectRoot: store.root, signal, executionAuthority: 'project-write' as const }
    const needs = (question: string, why: string, target: string): OperationResult<never> => ({
        status: "needs_input",
        artifactId,
        required: [{ question, why, target }]
    })
    const graphTests = await verifyingTestsForTargets(
        store,
        dossier.evidence.filter(item => item.mandatory).map(item => item.id),
        files
    )
    // Graph obligations cannot be replaced by a producer's suggested passing test.
    const unsupported = graphTests.tests.find(test => !["bun", "unknown", "playwright", undefined].includes(test.framework))
    if (unsupported)
        return needs(
            `Supply a supported runner for '${unsupported.filePath || unsupported.targetPath}'.`,
            `Test framework '${unsupported.framework}' cannot be run by this resolver.`,
            "TestNode framework"
        )
    const graphCommands = graphTests.tests.map(test =>
        test.framework === "playwright"
            ? ["bunx", "playwright", "test", test.filePath || test.targetPath!]
            : ["bun", "test", test.filePath || test.targetPath!]
    )
    const fallbackCommands: string[][] = []
    for (const file of graphTests.uncoveredFiles) {
        const target = await registry.execute("resolve_test_target", { filePath: file }, ctx)
        if (target.found) for (const testFile of target.testFiles) fallbackCommands.push(["bun", "test", testFile])
    }
    commands = [...new Map([...graphCommands, ...fallbackCommands, ...commands].map(command => [canonical(command), command])).values()]
    if (!commands.length) commands.push(["bun", "test"])
    if (commands.some(command => canonical(command) === canonical(["bun", "test"])))
        commands = commands.filter(command => command[0] !== "bun" || command[1] !== "test" || command.length === 2)
    const currentTests: ResolutionVerificationInput["tests"] = []
    const executedNodes = new Set<string>()
    const indexedTests = await store.listEntities<TestNode>(TestNode.dcr)
    const beforeExecution = await currentTestEvidence(
        store,
        indexedTests.map(test => test.id)
    )
    const sourceHashesBefore = hashFiles(store.root, files)
    const hashesBefore = Object.fromEntries(
        beforeExecution.map(test => [store.formatId(TestNode.dcr, test.id), { ...test.hashes, ...sourceHashesBefore }])
    )
    const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiwf-checks-'))
    const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'"
    try {
        for (const command of commands) {
            const playwright = command[0] === "bunx" && command[1] === "playwright" && command[2] === "test"
            if (!playwright && (command[0] !== "bun" || !["test", "run"].includes(command[1] ?? "") ||
                command[1] === "run" && !["typecheck", "build"].includes(command[2] ?? "")))
                return needs(`Supply a project test/typecheck/build command for '${id}'.`, "Verification commands must be bounded engineering checks.", "Operation testCommands")
            signal?.throwIfAborted()
            const stdoutPath = path.join(scratchRoot, 'stdout'), stderrPath = path.join(scratchRoot, 'stderr')
            fs.rmSync(stdoutPath, {force: true}); fs.rmSync(stderrPath, {force: true})
            const startedAt = Date.now()
            const commandResult = await registry.execute('run_command', {
                command: command.map(quote).join(' ') + ' > ' + quote(stdoutPath) + ' 2> ' + quote(stderrPath), timeoutMs: 60000
            }, {...ctx, executionAuthority: 'read-only', scratchRoot}) as {
                success: boolean; exitCode: number | null; timedOut: boolean; cancelled: boolean; error?: string; stderr: string
            }
            if (commandResult.cancelled) signal?.throwIfAborted()
            if (!fs.existsSync(stdoutPath) || !fs.existsSync(stderrPath))
                return needs('Provide the existing read-only engineering-check environment.', commandResult.error ?? commandResult.stderr, 'Linux bubblewrap')
            const stdout = fs.readFileSync(stdoutPath, 'utf8'), stderr = fs.readFileSync(stderrPath, 'utf8')
            const timedOut = commandResult.timedOut
            const passed = commandResult.success
            countEngineering("testsRun")
            if (!passed) countEngineering("testFailures")
            const fullOutput = stdout + "\n" + stderr + (timedOut ? "\nVerification command timed out." : "")
            const output = fullOutput.slice(-16000)
            if (command[1] === "test" || playwright) {
                const execution = await recordTestExecution(store, store.root, command, {
                    passed,
                    output: fullOutput,
                    exitCode: commandResult.exitCode ?? undefined,
                    durationMs: Date.now() - startedAt,
                    hashesBefore
                })
                for (const test of indexedTests)
                    if (execution.testFiles.includes(test.filePath || test.targetPath || "")) executedNodes.add(test.id)
            }
            currentTests.push({ command, passed, output })
        }
        const testNodes = currentTests.some(test => !test.passed) ? [] : await currentTestEvidence(store, [...executedNodes])
        const evidenceComplete =
            testNodes.length > 0 &&
            testNodes.every(test => test.passed) &&
            graphTests.tests.every(required => testNodes.some(test => test.id === store.localId(required.id)))
        return { status: "complete", artifactId, value: { tests: currentTests, testNodes, evidenceComplete } }
    } finally { fs.rmSync(scratchRoot, {recursive: true, force: true}) }
}

/** Independent acceptance uses current graph-narrowed source, not producer history. */
export async function verifyTicketAcceptance(
    store: WorkflowStore,
    input: ResolutionVerificationInput,
    options: ResolutionOptions,
    cfg: ReturnType<typeof loadConfig>
): Promise<AcceptanceVerification> {
    const ticket = await store.getEntity<Ticket>(input.dossier.ticket.id, Ticket.dcr)
    if (!ticket) throw new Error("Acceptance requires an existing Ticket.")
    const governance = input.dossier.governance ?? await resolveTicketGovernance(store, ticket)
    for (const rule of governance.rules.filter(rule => rule.importance >= 8)) {
        if (rule.test.kind === "codelet")
            throw new Error(`Mandatory Rule '${rule.ruleId}' requires an unsupported codelet checker '${rule.test.codeletName ?? "missing"}'.`)
    }
    const asker = createDefaultAsker(store.root)
    if (!asker) throw new Error("Independent acceptance verifier unavailable.")
    const reviewDossier = {
        ...input.dossier,
        governance: { ...governance, rules: governance.rules.filter(rule => rule.importance >= 5) },
        evidence: input.dossier.evidence
            .filter(evidence => store.localId(evidence.id) !== `VERIFY-${input.dossier.ticket.id}`)
            .map(({ source: _beforeImplementation, ...evidence }) => evidence)
    }
    const verificationContext = await buildVerificationContext(store, store.root, {
        dossier: input.dossier,
        files: input.files,
        testNodes: input.testNodes
    })
    const reviewScope = new Set([...reviewDossier.evidence.filter(item => item.mandatory).map(item => store.localId(item.id)),
        ...verificationContext.files.map(file => file.file)])
    const reviewContext = {
        dossier: reviewDossier,
        files: input.files,
        children: input.children,
        tests: input.tests.map(test => ({ command: test.command, passed: test.passed })),
        testNodes: input.testNodes.map(test => ({
            id: test.id,
            filePath: test.filePath,
            passed: test.passed,
            command: test.command,
            verifies: test.verifies.filter(id => reviewScope.has(store.localId(id))),
            ...(test.passed ? {} : { failureOutput: test.output.slice(-2000) })
        })),
        code: verificationContext.files
    }
    const serializedContext = JSON.stringify(reviewContext)
    if (serializedContext.length > 80_000) {
        throw new Error(
            `Acceptance verification context exceeds 80000 characters after graph narrowing (${serializedContext.length}). Narrow or author verification edges instead of sending incomplete evidence.`
        )
    }
    countEngineering(
        "sourceReads",
        verificationContext.files.reduce((count, file) => count + file.snippets.length, 0)
    )
    countEngineering("reasoningCalls")
    const response = await asker.json(renderAcceptancePrompt(serializedContext), AcceptanceVerificationSchema, {
        model: cfg.modelRoutes?.critic ?? cfg.modelRoutes?.design ?? cfg.model,
        temperature: 0,
        signal: options.signal,
        maxRetries: 1,
        maxTokens: cfg.llmOutputTokens,
        ...cognitionMetrics({ phase: "acceptance_verification" })
    })
    if (!response.ok) throw new Error(`Acceptance verification failed: ${response.failure?.message}`)
    const acceptance = AcceptanceVerificationSchema.parse(response.data)
    const failures = ruleAcceptanceFailures(governance, acceptance, [
        ...verificationContext.files.map(file => file.file),
        ...reviewDossier.evidence.filter(item => item.mandatory && item.kind === 'SymbolNode' &&
            verificationContext.files.some(file => file.file === item.filePath)).map(item => store.localId(item.id)),
        ...input.testNodes.map(test => test.id)
    ])
    if (failures.length) throw new RuleAcceptanceError(failures)
    return acceptance
}
