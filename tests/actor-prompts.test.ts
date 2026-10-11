/**
 * Responsibility: Verify rendered actor templates at the native model-call boundary.
 * Scope: Mode preferences, project context, authority and scratch cleanup.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { Asker } from "@dharmax/llm-utils"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { WorkflowActor, type ShellMode } from "../src/actor/engine.ts"
import { WorkflowStore } from "../src/graph/store.ts"
import { initializeTools } from "../src/tools/index.ts"

describe("actor prompt templates at the model boundary", () => {
    let root: string
    let store: WorkflowStore
    let system: string
    let actor: WorkflowActor

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "aiwf-actor-prompt-"))
        store = new WorkflowStore(root, true)
        initializeTools()
        system = ""
        const asker = {
            json: async (_prompt: string, _schema: unknown, options: { system?: string }) => {
                system = options.system ?? ""
                return { ok: true, data: { action: "final_answer", finalAnswer: "Fixture complete." } }
            },
        } as unknown as Asker
        actor = new WorkflowActor({ store, projectRoot: root, asker, toolDiscovery: null })
    })

    afterEach(() => {
        store.close()
        fs.rmSync(root, { recursive: true, force: true })
    })

    const modes: ShellMode[] = ["design", "dev", "triage", "product"]
    it.each(modes)("renders %s guidance and environment through the real Actor", async (mode) => {
        const result = await actor.execute("Answer this fixture.", mode)
        expect(result.failed).not.toBe(true)
        expect(system).toContain("Achieve the user's entire goal and address every requested part.")
        expect(system).toContain(`[${mode.toUpperCase()}] preference:`)
        expect(system).toContain(`Environment observation: the project root is ${root}.`)
        expect(system).not.toContain("Execution authority: read-only")
        expect(system).not.toContain("{{")
    })

    it("renders read-only authority with the actual scratch directory and cleans it up", async () => {
        const result = await actor.execute("Inspect this fixture.", "dev", { executionAuthority: "read-only" })
        expect(result.failed).not.toBe(true)
        expect(system).toContain("Execution authority: read-only project filesystem")
        expect(system).toContain("TMPDIR points there.")
        const scratch = system.match(/writable scratch directory ([^;]+);/)?.[1]
        expect(scratch).toBeDefined()
        expect(fs.existsSync(scratch!)).toBe(false)
    })
})
