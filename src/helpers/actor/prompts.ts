/**
 * Responsibility: Render the WorkflowActor's system instructions through llm-utils.
 * Scope: Bundled prompt templates and per-execution environment/authority.
 */

import { PromptEngine } from "@dharmax/llm-utils"
import { BOUNDED_COMPLETION } from "../../client-guidance.ts"
import actorTemplate from "../../actor/prompts/actor.txt" with { type: "text" }
import readOnlyTemplate from "../../actor/prompts/read-only.txt" with { type: "text" }

const prompts = new PromptEngine()
const system = prompts.parse(actorTemplate)

export function renderActorSystem(projectRoot: string, scratchRoot?: string, codeMutationAllowed = false): string {
    const authority = scratchRoot ? prompts.render(readOnlyTemplate.trim(), { scratchRoot }) : ""
    return BOUNDED_COMPLETION + "\n\n" + prompts.render(system.content, { projectRoot, authority: authority + `\nCode mutation is ${codeMutationAllowed ? "allowed through guarded source tools" : "forbidden"} by the host. Task and intelligence never grant permission.` })
}
