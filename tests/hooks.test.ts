import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { planOperatorRequest } from "aiwf-common-core/services/operator-brain";
import { executeJsOrchestrator } from "aiwf-common-core/services/text-compiler-host";

test("BeforePlan hook can modify inputText", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "hook-test-"));
  const originalFetch = globalThis.fetch;
  
  let capturedPrompt: string | null = null;
  globalThis.fetch = (async (url, options: any) => {
    const urlStr = String(url);
    if (urlStr.includes("generativelanguage.googleapis.com") || urlStr.includes("/api/generate") || urlStr.includes("openai.com")) {
      const parsed = JSON.parse(options.body);
      capturedPrompt = parsed.contents?.[0]?.parts?.[0]?.text || parsed.prompt || parsed.messages?.[1]?.content || "";
      
      return {
        ok: true,
        async json() {
          return {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: "reply", assistantReply: "Hook worked" }) }] } }],
            response: JSON.stringify({ kind: "reply", assistantReply: "Hook worked" })
          };
        }
      };
    }
    return { ok: true, async json() { return { models: [{ id: "mock-model" }] }; } };
  }) as any;

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    
    // A hook that appends " [HOOKED]" to the inputText
    const config = {
      hooks: {
        BeforePlan: [
          {
            command: 'node -e "const ctx = JSON.parse(process.env.AI_WORKFLOW_HOOK_CONTEXT); ctx.inputText += \' [HOOKED]\'; console.log(JSON.stringify(ctx))"'
          }
        ]
      }
    };
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify(config));

    await planOperatorRequest("original prompt", { root: targetRoot });

    assert.ok(capturedPrompt, "Should have captured a prompt");
    assert.ok(String(capturedPrompt).includes("original prompt [HOOKED]"), `Prompt should contain [HOOKED], got: ${capturedPrompt}`);

  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("JS Orchestrator shell helper stays callable when services.shell is injected", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "hook-action-test-"));
  const originalFetch = globalThis.fetch;
  
  let capturedShellPrompt: string | null = null;
  const mockShell = {
    execute: async (prompt) => {
      capturedShellPrompt = prompt;
      return { ok: true };
    }
  };

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    
    // A hook that appends " [SHELL-HOOKED]" to the prompt
    const config = {
      hooks: {
        BeforeAction: [
          {
            command: 'node -e "const ctx = JSON.parse(process.env.AI_WORKFLOW_HOOK_CONTEXT); if (ctx.actionType === \'shell\') ctx.prompt += \' [SHELL-HOOKED]\'; console.log(JSON.stringify(ctx))"'
          }
        ]
      }
    };
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify(config));

    // We need a dummy workflow store
    const mockStore = {
      upsertWorkflowRun: () => {},
      upsertWorkflowStep: () => {},
      listWorkflowSteps: () => [],
      getWorkflowState: () => null,
      setWorkflowState: () => {},
      upsertWorkflowIssue: () => {},
      addWorkflowTransition: () => {},
    };

    const result = await executeJsOrchestrator('return await shell("test shell prompt")', {
      workflowStore: mockStore,
      prompt: "test",
      root: targetRoot,
      services: { shell: mockShell }
    });

    assert.ok(capturedShellPrompt, "Should have captured a shell prompt");
    assert.ok(String(capturedShellPrompt).includes("test shell prompt [SHELL-HOOKED]"), `Prompt should contain [SHELL-HOOKED], got: ${capturedShellPrompt}`);
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { ok: true });

  } finally {
    globalThis.fetch = originalFetch;
    await rm(targetRoot, { recursive: true, force: true });
  }
});
