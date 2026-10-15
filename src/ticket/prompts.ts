/**
 * Responsibility: Render Ticket workflow instructions through llm-utils.
 * Scope: Bundled templates and typed runtime investigation, implementation and review data.
 */

import { PromptEngine } from "@dharmax/llm-utils"
import type { CriticFinding } from "../artifact-policy.ts"
import type { TicketDossier } from "../ticket-operation-types.ts"
import investigation from "./prompts/investigation.txt" with { type: "text" }
import preparation from "./prompts/preparation.txt" with { type: "text" }
import system from "./prompts/system.txt" with { type: "text" }
import goal from "./prompts/goal.txt" with { type: "text" }
import acceptance from "./prompts/acceptance.txt" with { type: "text" }

const prompts = new PromptEngine()

export function renderInvestigationPrompt(dossier: TicketDossier): string {
    return prompts.render(investigation.trim(), { dossier: JSON.stringify(dossier) })
}

export function renderPreparationPrompt(
    dossier: TicketDossier,
    children: readonly { id: string; title?: string; body: string; acceptanceCriteria?: string[] }[],
    findings: readonly CriticFinding[]
): string {
    return prompts.render(preparation.trim(), {
        ticketId: dossier.ticket.id,
        dossier: JSON.stringify(dossier),
        children: JSON.stringify(children),
        findings: JSON.stringify(findings)
    })
}

export function renderImplementationSystem(ticket: TicketDossier["ticket"]): string {
    return prompts.render(system.trim(), { ticketId: ticket.id, title: ticket.title, criteria: JSON.stringify(ticket.acceptanceCriteria) })
}

export function renderImplementationGoal(
    projectRoot: string,
    workspaceFiles: readonly string[],
    dossier: TicketDossier,
    feedback: readonly string[],
    testCommands: readonly string[][] = []
): string {
    return prompts.render(goal.trim(), {
        projectRoot,
        workspaceFiles: JSON.stringify(workspaceFiles),
        testCommands: JSON.stringify(testCommands),
        dossier: JSON.stringify(dossier),
        feedback: JSON.stringify(feedback)
    })
}

export function renderAcceptancePrompt(serializedContext: string): string {
    return prompts.render(acceptance.trim(), { context: serializedContext })
}
