/**
 * Responsibility: Render the WorkflowActor's system instructions through llm-utils.
 * Scope: Bundled prompt templates, mode preferences and per-execution environment/authority.
 */

import { PromptEngine } from "@dharmax/llm-utils"
import { BOUNDED_COMPLETION } from "../../client-guidance.ts"
import { z } from "zod"
import type { ShellMode } from "./engine.ts"
import actorTemplate from "../../actor/prompts/actor.txt" with { type: "text" }
import readOnlyTemplate from "../../actor/prompts/read-only.txt" with { type: "text" }

const prompts = new PromptEngine()
const system = prompts.parse(actorTemplate)
const modes = z.record(z.enum(["design", "dev", "triage", "product"]), z.string()).parse(system.manifest.modes)

export function renderActorSystem(mode: ShellMode, projectRoot: string, scratchRoot?: string): string {
    const authority = scratchRoot ? prompts.render(readOnlyTemplate.trim(), { scratchRoot }) : ""
    return BOUNDED_COMPLETION + "\n\n" + prompts.render(system.content, { modeInstructions: modes[mode], projectRoot, authority })
}
