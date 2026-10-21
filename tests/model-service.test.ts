/**
 * Responsibility: Verify configuration-backed model selection.
 * Scope: Default, local and cloud models, semantic routes and runtime refresh.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { saveConfig } from "../src/config.ts"
import { WorkflowStore } from "../src/graph/store.ts"
import { WorkflowActor } from "../src/actor/engine.ts"
import { ModelService, createDefaultAsker } from "../src/model-runtime.ts"

describe("configured model service", () => {
    let root: string
    let store: WorkflowStore
    const originalKey = process.env.OPENROUTER_API_KEY

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "aiwf-model-service-"))
        store = new WorkflowStore(root, true)
        saveConfig(root, { gateway: "ollama", model: "ollama/fixture-default", modelRoutes: {} })
    })

    afterEach(() => {
        if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY
        else process.env.OPENROUTER_API_KEY = originalKey
        store.close()
        fs.rmSync(root, { recursive: true, force: true })
    })

    it("uses the configured default for local discovery and ordinary default Askers", () => {
        const models = new ModelService(root)
        const expected = { providerId: "ollama", modelId: "fixture-default" }
        expect(models.defaultModel).toEqual(expected)
        expect(models.localModel).toEqual(expected)
        expect(models.cloudModel).toBeUndefined()
        expect(createDefaultAsker(root)?.getRouter().resolve()).toEqual(expected)
    })

    it("respects separate configured local and cloud routes", () => {
        process.env.OPENROUTER_API_KEY = "fixture-key"
        saveConfig(root, {
            gateway: "openrouter",
            model: "openrouter/vendor/fixture-default",
            modelRoutes: {
                local: "ollama/fixture-discovery",
                reasoning: "openrouter/vendor/fixture-reasoning",
            },
        })
        const models = new ModelService(root)
        expect(models.localModel).toEqual({ providerId: "ollama", modelId: "fixture-discovery" })
        expect(models.cloudModel).toEqual({ providerId: "openrouter", modelId: "vendor/fixture-reasoning" })
        expect(models.resolveModel("reasoning", true)).toEqual({ providerId: "ollama", modelId: "fixture-discovery" })
    })

    it("keeps semantic task routes authoritative over mode aliases", () => {
        saveConfig(root, {
            modelRoutes: { dev: "ollama/fixture-legacy", code: "ollama/fixture-code" },
        })
        const models = new ModelService(root)
        const asker = models.createAsker({ dev: "code" }, true)
        expect(asker.getRouter().resolve("code")).toEqual({ providerId: "ollama", modelId: "fixture-code" })
    })

    it("reloads configured defaults on the same Actor without cached model names", () => {
        const actor = new WorkflowActor({ store, projectRoot: root, toolDiscovery: null })
        expect(actor.resolveRoute("dev")?.target).toBe("ollama/fixture-default")
        saveConfig(root, { model: "ollama/fixture-updated" })
        actor.reloadConfig()
        expect(actor.resolveRoute("dev")?.target).toBe("ollama/fixture-updated")
        expect(new ModelService(root).localModel?.modelId).toBe("fixture-updated")
    })
    it("never fabricates a local default but accepts an explicit local task route", () => {
        {
        saveConfig(root, { model: "openrouter/vendor/configured-cloud" })
        const models = new ModelService(root)
        expect(models.localModel).toBeUndefined()
        expect(models.resolveModel("local", true)).toBeUndefined()
        }
        {
        saveConfig(root, {
            model: "openrouter/vendor/configured-cloud",
            modelRoutes: { code: "ollama/configured-code" },
        })
        const models = new ModelService(root)
        expect(models.localModel).toBeUndefined()
        expect(models.resolveModel("code", true)).toEqual({
            providerId: "ollama", modelId: "configured-code",
        })
        }
    })


})
