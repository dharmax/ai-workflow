/**
 * Responsibility: Render Product proposal instructions through llm-utils.
 * Scope: Bundled template and typed runtime Product context.
 */

import { PromptEngine } from "@dharmax/llm-utils"
import type { IntentContext } from "./process-types.ts"
import processTemplate from "./prompts/process.txt" with { type: "text" }

const prompts = new PromptEngine()

export function renderIntentProposal(context: IntentContext, findings: readonly { message: string }[]): string {
    return prompts.render(processTemplate.trim(), {
        kind: context.kind,
        context: JSON.stringify(context),
        findings: JSON.stringify(findings)
    })
}
