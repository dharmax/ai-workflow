/**
 * Responsibility: Verify WorkflowActor execution boundaries.
 * Scope: Workload inference, authority, cancellation, discovery and model overrides.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { LLMSession, ToolAbortError, z, type Asker } from "@dharmax/llm-utils"
import { WorkflowActor } from "../src/helpers/actor/engine.ts"
import { saveConfig } from "../src/services/config-service.ts"
import { WorkflowStore } from "../src/graph/store.ts"
import { initializeTools, commandRegistry, type ToolDefinition } from "../src/tools/index.ts"
describe("WorkflowActor execution boundaries", () => {
    let root: string
    let store: WorkflowStore
    const originalTools = new Map<string, ToolDefinition>()
    const overrideTool = (tool: ToolDefinition) => {
        if (!originalTools.has(tool.name)) originalTools.set(tool.name, commandRegistry.get(tool.name)!)
        commandRegistry.register(tool)
    }
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "aiwf-engine-boundaries-"))
        store = new WorkflowStore(root, true)
        initializeTools()
        originalTools.clear()
    })
    afterEach(() => {
        for (const tool of originalTools.values()) commandRegistry.register(tool)
        store.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    const probeOriginals = new Map<string, ToolDefinition>()
    if (process.env.AIWF_OVERRIDE_CLEANUP_PROBE === "1") {
        it("override cleanup probe: intentional failure", () => {
            for (const name of ["run_command", "resolve_ticket"]) {
                const tool = commandRegistry.get(name)!
                probeOriginals.set(name, tool)
                overrideTool({ ...tool, execute: () => { throw new ToolAbortError("Leaked override") } })
                expect(() => commandRegistry.get(name)!.execute({}, { store, projectRoot: root, executionAuthority: 'project-write' })).toThrow("Leaked override")
                overrideTool({ ...tool, execute: () => { throw new ToolAbortError("Repeated override") } })
            }
            expect("intentional cleanup probe").toBe("failure")
        })
        it("override cleanup probe: subsequent test uses production tool", async () => {
            for (const [name, original] of probeOriginals) expect(commandRegistry.get(name)).toBe(original)
            expect(probeOriginals.size).toBe(2)
            const result = await commandRegistry.execute("run_command", { command: "printf restored-production-tool" }, { store, projectRoot: root, executionAuthority: 'project-write' })
            expect(result.success).toBe(true)
            expect(result.stdout).toBe("restored-production-tool")
            console.log("override-cleanup-confirmed")
        })
    }
    it("restores temporary tool overrides even after a failed test", async () => {
        const child = Bun.spawn(["bun", "test", import.meta.path, "--test-name-pattern", "override cleanup probe"], {
            cwd: root, env: { ...process.env, AIWF_OVERRIDE_CLEANUP_PROBE: "1" }, stdout: "pipe", stderr: "pipe"
        })
        const [stdout, stderr, exit] = await Promise.all([
            new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
        ])
        expect(exit).toBe(1)
        expect(stdout).toContain("override-cleanup-confirmed")
        expect(stderr).toContain("1 pass")
        expect(stderr).toContain("1 fail")
        expect(stderr).not.toContain("error: Leaked override")
    }, 30000)
    const answer = (text = "done") => ({ ok: true, data: { thought: "", action: "final_answer", finalAnswer: text } })
    const call = (name: string, parameters = {}) => ({ ok: true, data: { thought: "", action: "tool_call", toolCalls: [{ name, parameters }] } })
    // Exercise the ordinary escalation branch without making provider calls.
    const routedActor = (asker: Asker) => {
        const actor = new WorkflowActor({ store, projectRoot: root, toolDiscovery: null })
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
        return actor
    }
    it("infers each workload through native System-1 without retaining task state", async () => {
        const tasks = ["code", "creative"];
        const routed: string[] = [];
        const asker = {json: async (_prompt: string, _schema: unknown, options: {task?:string}) => {
            routed.push(options.task!); return answer();
        }} as unknown as Asker;
        const actor = new WorkflowActor({store, projectRoot:root, asker, toolDiscovery:null,
            systemOne: {assess:async()=>({answers:{task:{choice:tasks.shift()}},backendId:"fixture",quality:"high",latencyMs:0})}});
        await actor.execute("Implement the correction");
        await actor.execute("Clarify the product goal");
        expect(routed).toEqual(["code", "creative"]);
        expect(actor).not.toHaveProperty("mode");
    })
    it.each(["automatic", "normal", "high", "critical"] as const)("keeps %s intelligence separate from source permission and project writes", async intelligence => {
        let options: Record<string, unknown> = {};
        const asker = {json: async (_prompt:string,_schema:unknown,input:Record<string,unknown>) => {options=input;return answer()}} as unknown as Asker;
        const actor = new WorkflowActor({store,projectRoot:root,asker,toolDiscovery:null,
            systemOne:{assess:async()=>({answers:{task:{choice:"code",codeMutationAllowed:true}},backendId:"fixture",quality:"high",latencyMs:0})}});
        await actor.execute("Implement the requested change",{intelligence,executionAuthority:"project-write",codeMutationAllowed:false});
        expect(options.task).toBe("code");
        expect(options).not.toHaveProperty("codeMutationAllowed");
        expect(JSON.stringify(options.routingContext)).toContain(intelligence === "automatic" ? '"requirements":[]' : intelligence);
        const ctx={store,projectRoot:root,executionAuthority:"project-write" as const,codeMutationAllowed:false};
        await commandRegistry.execute("create_ticket",{id:"NON-CODE",title:"Record legitimate work"},ctx);
        expect(await store.getEntity("NON-CODE")).not.toBeNull();
        await expect(commandRegistry.execute("apply_change",{request:{action:"create_file",filePath:"forbidden.ts",content:"export const x=1"},fingerprint:"fixture",ticketId:"NON-CODE",agentId:"fixture"},ctx)).rejects.toThrow("Code mutation is forbidden");
        const {CausalChangeEngine}=await import("../src/change/engine.ts");
        const engine=new CausalChangeEngine(ctx);
        const request={action:"create_file" as const,filePath:"forbidden.ts",content:"export const x=1"};
        const preview=await engine.previewChange(request);
        expect(preview.blocked).toBe(false);
        await expect(engine.applyChange(request,preview.fingerprint)).rejects.toThrow("Code mutation is forbidden");
        expect(fs.existsSync(path.join(root,"forbidden.ts"))).toBe(false);
    })
    it("passes source constraints into resolution without forbidding non-code work", async () => {
        const {Ticket}=await import("../src/model/ontology.ts");
        await store.upsertEntity(Ticket.dcr,{id:"NON-CODE",title:"Inspect the recorded work",lane:"Todo"});
        const original=Ticket.prototype.resolve;
        let calls=0;
        try {
            Ticket.prototype.resolve=async function (_store,options) {
                calls++;expect(options?.codeMutationAllowed).toBe(false);
                return {status:"needs_input",artifactId:"NON-CODE",required:[{question:"Review recorded work",why:"Fixture",target:"acceptance"}]};
            };
            const result=await commandRegistry.execute("resolve_ticket",{ticketId:"NON-CODE"},{store,projectRoot:root,executionAuthority:"project-write",codeMutationAllowed:false});
            expect(result.status).toBe("needs_input");expect(calls).toBe(1);
        } finally {Ticket.prototype.resolve=original;}
    })
    it("inherits host authority in public agent dispatch without allowing model permission arguments", async () => {
        const seen: unknown[]=[];
        const actor={execute:async (_wish:string,options:unknown)=>{seen.push(options);return {stepsCount:0,answer:"observed",events:[]}}} as unknown as WorkflowActor;
        for(const executionAuthority of ["read-only","project-write"] as const)
            await commandRegistry.execute("agent exec",{wish:"Inspect the project",intelligence:"critical"},{store,projectRoot:root,actor,executionAuthority,codeMutationAllowed:false});
        expect(seen).toEqual([expect.objectContaining({executionAuthority:"read-only",codeMutationAllowed:false,intelligence:"critical"}),expect.objectContaining({executionAuthority:"project-write",codeMutationAllowed:false,intelligence:"critical"})]);
        for(const extra of [{mode:"dev"},{codeMutationAllowed:true}])
            await expect(commandRegistry.execute("agent exec",{wish:"Inspect",...extra},{store,projectRoot:root,actor})).rejects.toThrow();
    })
    it("dispatches canonical ticket show without a provider and retains cancellation", async () => {
        const {Ticket} = await import("../src/model/ontology.ts")
        const ticket = await store.upsertEntity(Ticket.dcr, {id: "T1", title: "Canonical dispatch", lane: "Todo"})
        const actor = new WorkflowActor({store, projectRoot: root, offline: true})
        const result = await actor.execute("ticket show T1")
        expect(result.failed).not.toBe(true)
        expect(result.stepsCount).toBe(1)
        const shown = JSON.parse(result.answer)
        expect(shown.id).toBe("T1")
        expect(shown.version).toBe(ticket.version)
        const controller = new AbortController()
        controller.abort()
        const cancelled = await actor.execute("ticket show T1", {signal: controller.signal})
        expect(cancelled.haltReason).toBe("aborted")
    })
    it("denies cancelled explicit delegation before invoking a mutating capability", async () => {
        let calls = 0
        const tool = commandRegistry.get("resolve_ticket")!
        overrideTool({ ...tool, execute: () => {
                calls++
                return { status: "complete" }
            } })
        const controller = new AbortController()
        controller.abort()
        const actor = new WorkflowActor({ store, projectRoot: root, offline: true })
        const result = await actor.execute("resolve T", { signal: controller.signal })
        expect(result.failed).toBe(true)
        expect(result.haltReason).toBe("aborted")
        expect(calls).toBe(0)
    })
    it("denies read-only explicit delegation before invoking a mutating capability", async () => {
        let calls = 0
        const tool = commandRegistry.get("resolve_ticket")!
        overrideTool({ ...tool, execute: () => {
                calls++
                return { status: "complete" }
            } })
        const result = await new WorkflowActor({ store, projectRoot: root, offline: true })
            .execute("resolve T", { executionAuthority: "read-only" })
        expect(result.failed).toBe(true)
        expect(result.answer).toContain("Read-only authority")
        expect(calls).toBe(0)
    })
    it("returns explicit delegation errors as execution failures", async () => {
        const tool = commandRegistry.get("resolve_ticket")!
        overrideTool({ ...tool, execute: () => {
                throw "delegation failed"
            } })
        const result = await new WorkflowActor({ store, projectRoot: root, offline: true }).execute("resolve T",{executionAuthority:"project-write"})
        expect(result.failed).toBe(true)
        expect(result.answer).toContain("delegation failed")
    })
    it("preserves an explicit tool abort returned by artifact delegation", async () => {
        const tool = commandRegistry.get("resolve_ticket")!
        overrideTool({ ...tool, execute: () => {
                throw new ToolAbortError("User refused execution")
            } })
        const result = await new WorkflowActor({ store, projectRoot: root, offline: true }).execute("resolve T",{executionAuthority:"project-write"})
        expect(result.failed).toBe(true)
        expect(result.haltReason).toBe("aborted")
        expect(result.answer).toContain("User refused execution")
    })
    it("preserves injected governed discovery tools and applies schema transforms exactly once", async () => {
        let calls = 0
        let value = ""
        const tool = {
            name: "read_workspace_file", description: "Use a host capability", category: "os" as const,
            parameters: z.object({ value: z.string().transform(input => input + "!") }),
            execute: (params: {
                value: string
            }) => {
                value = params.value
                return ["observed"]
            }
        }
        const asker = { json: async () => ++calls === 1 ? call("discover_tools", { request: "host capability" })
                : calls === 2 ? call(tool.name, { value: "input" }) : answer() } as unknown as Asker
        const result = await new WorkflowActor({
            store, projectRoot: root, asker,
            toolDiscovery: { discover: async () => ({ query: {}, tools: [tool] }) }
        }).execute("Use the custom host capability",{executionAuthority:"project-write"})
        expect(result.failed).toBeUndefined()
        expect(value).toBe("input!")
        expect(result.events[1]!.toolResult).toEqual(["observed"])
    })
    it("denies discovered mutating capabilities under read-only authority", async () => {
        let calls = 0
        let invoked = false
        const tool = { name: "claim_ticket", description: "Mutate state", category: "os" as const,
            parameters: z.object({}), execute: () => {
                invoked = true
                return {}
            } }
        const asker = { json: async () => ++calls === 1 ? call("discover_tools", { request: "mutation" })
                : calls === 2 ? call(tool.name) : answer() } as unknown as Asker
        const result = await new WorkflowActor({
            store, projectRoot: root, asker,
            toolDiscovery: { discover: async () => ({ query: {}, tools: [tool] }) }
        }).execute("Inspect state", { executionAuthority: "read-only" })
        expect(invoked).toBe(false)
        expect(result.events[1]!.toolResults![0]!.error).toContain("Read-only authority")
    })
    it("does not retry a tool abort through cognitive escalation", async () => {
        const command = commandRegistry.get("run_command")!
        overrideTool({ ...command, execute: () => {
                throw new ToolAbortError("User refused execution")
            } })
        let calls = 0
        const asker = { json: async () => {
                calls++
                return call("run_command", { command: "echo refused" })
            } } as unknown as Asker
        const result = await routedActor(asker).execute("Perform the task")
        expect(result.haltReason).toBe("aborted")
        expect(result.escalated).toBe(false)
        expect(calls).toBe(1)
    })
    it("does not retry an explicitly forced model after failure", async () => {
        let calls = 0
        const asker = { json: async () => {
                calls++
                return { ok: false, failure: { message: "Provider unavailable" } }
            } } as unknown as Asker
        const result = await routedActor(asker).execute("Perform the task", { forceModel: "ollama/chosen" })
        expect(result.failed).toBe(true)
        expect(result.escalated).toBe(false)
        expect(result.targetModel).toBe("ollama/chosen")
        expect(calls).toBe(1)
    })
    it("keeps local-only policy authoritative when forceCloud is requested", async () => {
        saveConfig(root, { escalation: { policy: "local_only", blastRadiusThreshold: 3, testRetryThreshold: 2 } })
        let options: {
            preferLocal?: boolean
            allowedProviders?: string[]
        } | undefined
        const asker = { json: async (_prompt: string, _schema: unknown, supplied: typeof options) => {
                options = supplied
                return answer()
            } } as unknown as Asker
        const result = await routedActor(asker).execute("Perform the task", { intelligence: "critical" })
        expect(result.escalated).toBe(false)
        expect(options?.preferLocal).toBe(true)
        expect(options?.allowedProviders).toEqual(["ollama"])
    })
})
