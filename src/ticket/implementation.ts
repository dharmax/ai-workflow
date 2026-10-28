/**
 * Responsibility: Implement Ticket source changes using the existing model mechanisms.
 * Scope: Synthesis or bounded Actor execution with host-guarded mutation access.
 */

import { renderImplementationSystem, renderImplementationGoal } from "./prompts.ts"
import { LLMActor, ToolExecutionError, type TokenBudget } from "@dharmax/llm-utils"
import { FileNode, type Ticket } from "../graph/ontology.ts"
import type { WorkflowStore } from "../graph/store.ts"
import { ResolutionProposalSchema, type ResolutionProposal, type ResolutionOptions, type TicketDossier } from "../ticket-operation-types.ts"
import type { ChangeRequest, ChangeApplyResult } from "../change/types.ts"
import { CodeChangeRequestSchema } from "../tools/change.ts"
import { registry } from "../tools/registry.ts"
import { createDefaultAsker } from "../model-runtime.ts"
import type { loadConfig } from "../config.ts"
import { buildSynthesisContext, findSynthesisTarget, HostSourceSynthesizer } from "../synthesis/index.ts"
import { canonical } from "../kb/canonical.ts"
import { cognitionMetrics, countEngineering, traceResolution } from "../performance-metrics.ts"

interface ImplementationContext {
    store: WorkflowStore
    ticket: Ticket
    options: ResolutionOptions
    cfg: ReturnType<typeof loadConfig>
    applyChange: (request: ChangeRequest) => Promise<ChangeApplyResult>
    refreshSource: () => Promise<unknown>
    mutationEpoch: () => number
    ownedFiles: ReadonlySet<string>
    tokenBudget: TokenBudget
    state: { tranches: number }
    testCommands: string[][]
    repair: boolean
}

/** Actor implementation receives guarded mutation access, never lease or receipt authority. */
export async function implementTicket(
    input: TicketDossier,
    findings: readonly string[],
    context: ImplementationContext
): Promise<ResolutionProposal> {
    const { store, ticket, options, cfg, applyChange, ownedFiles, tokenBudget, testCommands, repair } = context
    const ctx = { store, projectRoot: store.root, signal: options.signal, executionAuthority: 'read-only' as const }
    const asker = createDefaultAsker(store.root)
    if (!asker) throw new Error("Implementation provider unavailable.")
    const synthesisTarget = findSynthesisTarget(input)
    const mechanism = options.systemOne
        ? await options.systemOne.assess(
              {
                  criterionCount: input.ticket.acceptanceCriteria.length,
                  exactTargets: synthesisTarget ? 1 : 0,
                  repair: findings.length > 0,
                  failure: findings.join("\n").slice(0, 1000)
              },
              {
                  mechanism: {
                      type: "choice",
                      instructions: "Choose the least interactive implementation mechanism.",
                      criteria: {
                          synthesis: "Exact targets are sufficient for a pure change proposal",
                          interactive: "Bounded navigation/tool interaction is needed",
                          unknown: "Unclear"
                      }
                  },
                  modelTier: {
                      type: "choice",
                      instructions: "Suggest a configured reasoning tier; this is only a hint.",
                      criteria: {
                          configured: "Normal implementation route is sufficient",
                          stronger: "Use the configured stronger design route if available",
                          unknown: "Unclear"
                      }
                  },
                  ...(findings.length
                      ? {
                            failureKind: {
                                type: "choice" as const,
                                instructions: "Classify observed verification failure.",
                                criteria: {
                                    code: "Implementation defect",
                                    test: "Assertion mismatch",
                                    tool: "Tool or stale target failure",
                                    environment: "Missing capability or provider",
                                    unknown: "Unclear"
                                }
                            }
                        }
                      : {})
              },
              cognitionMetrics()
          )
        : null
    if (options.systemOne) countEngineering("systemOneCalls")
    const model =
        mechanism?.quality === "high" && mechanism.answers.modelTier?.choice === "stronger"
            ? (cfg.modelRoutes?.design ?? cfg.modelRoutes?.dev ?? cfg.model)
            : (cfg.modelRoutes?.dev ?? cfg.model)
    if (synthesisTarget && !(mechanism?.quality === "high" && mechanism.answers.mechanism?.choice === "interactive")) {
        countEngineering("reasoningCalls")
        const synthesisCtx = buildSynthesisContext({ dossier: input, target: synthesisTarget })
        const synthesizer = new HostSourceSynthesizer(asker)
        traceResolution('implementation synthesis model call: ' + model)
        const candidate = await synthesizer.synthesize(synthesisCtx, {
            model,
            signal: options.signal,
            feedback: findings.map(f => ({ stage: "project_compatibility" as const, message: f })),
            ...cognitionMetrics({ phase: repair ? "repair" : "synthesis" })
        })
        const target = {
            type: "symbol" as const,
            filePath: synthesisTarget.filePath,
            symbolName: synthesisTarget.symbolName,
            containerName: synthesisTarget.containerName
        }
        return { changes: [{ action: "replace_symbol" as const, target, replacement: candidate.source }], testCommands }
    }
    const names = [
        "find_symbol",
        "get_symbol_source",
        "get_file_outline",
        "search_graph",
        "get_exact_references",
        "search_workspace_text",
        "read_workspace_file",
        "safe_change"
    ]
    let currentDossier = input
    while (context.state.tranches < 3) {
        const tranche = context.state.tranches++,
            changesBefore = context.mutationEpoch()
        const observations = new Set<string>(),
            controller = new AbortController()
        const trancheSignal = AbortSignal.any(options.signal ? [options.signal, controller.signal] : [controller.signal])
        let duplicateAttempts = 0
        const workspaceFiles = (await store.listEntities<FileNode>(FileNode.dcr))
            .map(file => store.localId(file.id))
            .filter(file => !file.startsWith("@") && !file.startsWith("node_modules/"))
            .sort((a, b) => Number(/\.[cm]?[jt]sx?$/.test(b)) - Number(/\.[cm]?[jt]sx?$/.test(a)) || a.localeCompare(b))
            .slice(0, 64)
        const actor = new LLMActor(asker, { maxSteps: 16, system: renderImplementationSystem(currentDossier.ticket) })
        for (const name of names) {
            const tool =
                name === "safe_change"
                    ? {
                          name,
                          description:
                              "Safely apply one direct code ChangeRequest. AIWF handles preview/fingerprint/apply, lease, dirty-target and verification checks.",
                          parameters: CodeChangeRequestSchema
                      }
                    : registry.get(name)
            if (!tool) continue
            actor.registerTool({
                name,
                description: tool.description,
                parameters: tool.parameters,
                execute: async params => {
                    if (controller.signal.aborted) throw new Error("Stalled navigation: implementation tranche terminated.")
                    // Bound repeated effect-free tool calls, including failed or no-op changes.
                    const key = canonical([name, params, context.mutationEpoch()])
                    if (observations.has(key)) {
                        if (++duplicateAttempts >= 2) controller.abort()
                        throw new ToolExecutionError(
                            "Stalled navigation: this identical observation already ran in the current workspace mutation epoch. Replan using existing evidence, a different observation, or a concrete change; two consecutive duplicate attempts terminate this tranche.",
                            undefined,
                            "stalled"
                        )
                    }
                    observations.add(key)
                    duplicateAttempts = 0
                    if (name === "safe_change") {
                        countEngineering("toolCalls")
                        const epochBefore = context.mutationEpoch()
                        const result = await applyChange(params as ChangeRequest)
                        if (context.mutationEpoch() > epochBefore) duplicateAttempts = 0
                        return result
                    }
                    if (name === "get_symbol_source") {
                        countEngineering("sourceReads")
                        countEngineering("exactSymbolReads")
                    }
                    if (name === "read_workspace_file") countEngineering("sourceReads")
                    // Refresh derived source state under host authority; navigation itself remains read-only.
                    await context.refreshSource()
                    const result = await registry.execute(name, params, ctx)
                    if (name === "find_symbol" && Array.isArray(result) && result.length === 0)
                        throw new ToolExecutionError(
                            "No TypeScript/JavaScript symbol matched. Package dependencies, JSON, configuration and Markdown contents are not indexed symbols: use read_workspace_file for an existing file, or search_workspace_text for literal contracts. For code, use get_file_outline to discover actual declarations. Do not repeat the same unmatched lookup.",
                            undefined,
                            "not_found"
                        )
                    if (name === "get_symbol_source") {
                        const source = result as { ambiguous?: boolean; code?: string | null; symbolName?: string; filePath?: string }
                        if (source.ambiguous) return result
                        if (source.code === null)
                            throw new ToolExecutionError(
                                `Symbol '${source.symbolName}' was not found in '${source.filePath}'. Use get_file_outline for actual declaration names or read_workspace_file for existing file contents.`,
                                undefined,
                                "not_found"
                            )
                    }
                    return result
                }
            })
        }
        // Large source bodies are available through surgical tools, not retransmitted in the original goal.
        const actorDossier = {
            ...currentDossier,
            evidence: currentDossier.evidence.map(item => ({
                ...item,
                ...(item.source && item.source.length > 2048
                    ? { source: undefined, sourceOmitted: "Read current source with the registered navigation tools." }
                    : {})
            }))
        }
        traceResolution('implementation Actor model call: ' + model + ', tranche ' + (tranche+1))
        const output = await actor.run(renderImplementationGoal(store.root, workspaceFiles, actorDossier, findings, testCommands), {
            ...cognitionMetrics({ phase: repair ? "repair" : "implementation_actor" }),
            signal: trancheSignal,
            schema: ResolutionProposalSchema,
            askOptions: { model, maxTokens: cfg.llmOutputTokens, tokenBudget }
        })
        traceResolution('implementation Actor returned: ' + output.haltReason + ', steps ' + output.totalSteps)
        if (options.signal?.aborted) options.signal.throwIfAborted()
        const recentObservations = output.steps.slice(-3).map(step => ({
            step: step.step,
            calls: step.toolCalls.slice(0, 4).map(call => ({
                tool: call.toolName,
                parameters: Object.fromEntries(
                    ["filePath", "symbolName", "name", "entityType"].flatMap(key =>
                        typeof call.parameters[key] === "string" ? [[key, call.parameters[key].slice(0, 200)]] : []
                    )
                )
            })),
            outcomes: step.toolResults.slice(0, 4).map(result => ({
                tool: result.toolName,
                outcome: result.isError ? "error" : "success",
                ...(result.isError ? { error: result.error?.slice(0, 500) } : {})
            }))
        }))
        const observationReport = `mutation epoch ${context.mutationEpoch()}; recent observations: ${JSON.stringify(recentObservations)}`
        if (controller.signal.aborted) {
            const changes = output.steps.flatMap(step => step.toolResults).filter(result => result.toolName === "safe_change")
            const lastCalls = output.steps.at(-1)?.toolCalls ?? []
            if (output.haltReason === "aborted" && output.steps.every(step => step.action === "tool_call") &&
                context.mutationEpoch() > changesBefore && changes.every(result => !result.isError) &&
                lastCalls.length > 0 && lastCalls.every(call => call.toolName !== "safe_change")) {
                traceResolution("Applied source handed to resolver checks after stalled navigation")
                return {changes: [], testCommands}
            }
            throw new Error(
                `Stalled navigation: implementation tranche ${tranche + 1}/3 terminated after two consecutive duplicate observations without workspace mutation (${output.totalSteps} steps); ${observationReport}`
            )
        }
        if (output.ok) return ResolutionProposalSchema.parse(output.output)
        const successfulEdits = context.mutationEpoch() - changesBefore
        if (output.haltReason !== "max_steps_exceeded" || !successfulEdits || tranche === 2) {
            throw new Error(
                `Implementation Actor halted: ${output.haltReason}: ${output.error}; tranche ${tranche + 1}/3, successful edits ${successfulEdits}; ${observationReport}`
            )
        }
        const refreshed = await ticket.investigate(store, options)
        if (refreshed.status !== "complete")
            throw new Error(`Implementation continuation investigation failed: ${JSON.stringify(refreshed)}`)
        currentDossier = refreshed.value
        for (const evidence of currentDossier.evidence) {
            if (evidence.filePath && ownedFiles.has(evidence.filePath) && !evidence.exact) {
                const file = await registry.execute("read_workspace_file", { filePath: evidence.filePath }, ctx)
                evidence.source = file.content
            }
        }
    }
    throw new Error("Implementation Actor tranche limit reached.")
}
