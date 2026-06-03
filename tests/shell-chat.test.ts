import test from "node:test";
import assert from "node:assert/strict";
import { planShellRequestWithAgent } from "aiwf-shell/cli/lib/shell";

test("Agentic planner correctly uses DB definitions, active tickets, and history", async () => {
  let lastPrompt = "";
  let lastSystem = "";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_url, init): Promise<Response> => {
    const payload = JSON.parse(String(init?.body ?? "{}"));
    lastPrompt = payload.prompt;
    lastSystem = payload.system;

    let replyText = "Generic reply.";
    if (payload.system.includes("## Available Actions")) {
      replyText = "Actions are available.";
    }
    if (payload.prompt.includes("You have TKT-001")) {
      replyText += " You mentioned TKT-001.";
    }

    return new Response(JSON.stringify({ response: JSON.stringify({ kind: "reply", reply: replyText }) }));
  };

  const options = {
    plannerContext: {
      toolkitCodelets: [],
      projectCodelets: [],
      summary: {
        activeTickets: []
      }
    },
    planner: { providerId: "ollama", modelId: "mock-model", host: "http://mock-ollama.local" },
    history: [
      { role: "user", content: "what are the next tickets?" },
      { role: "ai", content: "You have TKT-001 in Todo." }
    ]
  };

  try {
    const plan: any = await planShellRequestWithAgent("what is it about?", options as any);

    assert.equal(plan?.kind, "reply");
    assert.match(lastSystem, /## Available Actions \(Your Capabilities\):/);
    assert.match(lastSystem, /## Operating Contract/);
    assert.match(lastSystem, /## Graph Contract/);
    assert.doesNotMatch(lastSystem, /## Project Current Status \(Smart Summary\)/);
    assert.match(lastPrompt, /## Runtime Context/);
    assert.match(lastPrompt, /### Notes \/ Lore \/ Extra: Recent Interaction/);
    assert.match(lastPrompt, /You have TKT-001 in Todo\./);
    assert.match(plan?.reply ?? "", /Actions are available\. You mentioned TKT-001\./);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
