/**
 * Responsibility: Verify Actor routing and retry regressions found during review.
 * Scope: Configured local models, SOTA locality and discovery across escalation.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { LLMSession, type Asker } from "@dharmax/llm-utils"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { WorkflowActor } from "../src/actor/engine.ts"
import { saveConfig } from "../src/config.ts"
import { WorkflowStore } from "../src/graph/store.ts"
import { ModelService } from "../src/model-runtime.ts"
import { initializeTools } from "../src/tools/index.ts"

describe("Actor review regressions", () => {
    let root: string
    let store: WorkflowStore

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "aiwf-actor-review-"))
        store = new WorkflowStore(root, true)
        initializeTools()
        saveConfig(root, { gateway: "ollama", model: "ollama/configured-local", modelRoutes: {} })
    })

    afterEach(() => {
        store.close()
        fs.rmSync(root, { recursive: true, force: true })
    })

    it("does not invent a local model for a configured cloud default", () => {
        saveConfig(root, { model: "openrouter/vendor/configured-cloud" })
        const models = new ModelService(root)
        expect(models.localModel).toBeUndefined()
        expect(models.resolveModel("local", true)).toBeUndefined()
    })

    it("resolves an explicitly configured local task without a discovery route", () => {
        saveConfig(root, {
            model: "openrouter/vendor/configured-cloud",
            modelRoutes: { code: "ollama/configured-code" },
        })
        const models = new ModelService(root)
        expect(models.localModel).toBeUndefined()
        expect(models.resolveModel("code", true)).toEqual({
            providerId: "ollama", modelId: "configured-code",
        })
    })

    it("honors SOTA locality even when no cloud provider is configured", async () => {
        saveConfig(root, { escalation: { policy: "sota", blastRadiusThreshold: 3, testRetryThreshold: 2 } })
        let preferLocal: boolean | undefined
        const asker = {
            json: async (_prompt: string, _schema: unknown, options: { preferLocal?: boolean }) => {
                preferLocal = options.preferLocal
                return { ok: true, data: { action: "final_answer", finalAnswer: "done" } }
            },
        } as unknown as Asker
        await new WorkflowActor({ store, projectRoot: root, asker, toolDiscovery: null }).execute("Answer")
        expect(preferLocal).toBe(false)
    })

    it("gives the escalated attempt its own bounded discovery budget", async () => {
        let calls = 0
        let discoveries = 0
        const asker = {
            json: async () => {
                calls++
                if (calls === 3) return { ok: false, failure: { message: "Initial route failed" } }
                if (calls === 5) return { ok: true, data: { action: "final_answer", finalAnswer: "done" } }
                return {
                    ok: true,
                    data: {
                        action: "tool_call",
                        toolCalls: [{ name: "discover_tools", parameters: { request: "evidence " + calls } }],
                    },
                }
            },
        } as unknown as Asker
        const actor = new WorkflowActor({
            store, projectRoot: root,
            toolDiscovery: { discover: async () => {
                discoveries++
                return { query: {}, tools: [] }
            } },
        })
        const runtime = actor as unknown as {
            _asker: Asker
            session: LLMSession
            _configuredProviders: string[]
            localProviders: string[]
        }
        runtime._asker = asker
        runtime.session = new LLMSession(asker)
        runtime._configuredProviders = ["ollama", "openrouter"]
        runtime.localProviders = ["ollama"]
        const result = await actor.execute("Find the evidence")
        expect(result.escalated).toBe(true)
        expect(discoveries).toBe(3)
        expect(result.failed).not.toBe(true)
    })
})
