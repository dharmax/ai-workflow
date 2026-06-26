import { test } from "bun:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { AI_WORKFLOW_MCP_TOOL_NAMES, getAiWorkflowMcpToolNames } from "../aiwf-mcp/server.ts";
import { createWorkflowCoreFacade } from "aiwf-common-core/services/workflow-facade";

test("MCP registered tool inventory exposes the full agent plugin surface", () => {
  const expected = [
    "search_project",
    "plugin_status",
    "capability_catalog",
    "list_tickets",
    "create_ticket",
    "update_ticket_lifecycle",
    "analyze_code",
    "review_code",
    "debug_issue",
    "plan_code_change",
    "refactor_code",
    "execute_ticket",
    "sweep_bugs",
    "find_dependencies",
    "search_artifacts",
    "judge_artifacts",
    "list_codelets",
    "get_codelet",
    "search_codelets",
    "run_codelet",
    "forge_project_codelet",
    "upsert_project_codelet",
    "remove_project_codelet"
  ];

  const names = getAiWorkflowMcpToolNames();
  for (const name of expected) {
    assert.equal(names.includes(name), true, `${name} should be exposed`);
  }
  assert.deepEqual(names, [...AI_WORKFLOW_MCP_TOOL_NAMES]);
});

test("MCP stdio tools/list exposes the full registered inventory", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const serverPath = path.join(repoRoot, "aiwf-mcp", "server.ts");
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "ai-workflow-test", version: "0.1.0" }
      }
    },
    {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }
  ];
  const result = await runMcp(serverPath, messages);
  assert.equal(result.code, 0, result.stderr);
  const responses = result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const toolsResponse = responses.find((message) => message.id === 2);
  assert.ok(toolsResponse?.result?.tools, result.stdout);
  const toolNames = toolsResponse.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, [...AI_WORKFLOW_MCP_TOOL_NAMES].sort());
});

test("expanded MCP facade capabilities are discoverable and mutation-gated", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "aiwf-mcp-expanded-"));
  try {
    await mkdir(path.join(projectRoot, "src"), { recursive: true });
    await writeFile(
      path.join(projectRoot, "src", "app.ts"),
      "export function greet(name: string) { return `hello ${name}`; }\n",
      "utf8"
    );
    await mkdir(path.join(projectRoot, ".ai-workflow"), { recursive: true });
    const facade = createWorkflowCoreFacade({ projectRoot });
    await facade.sync({ writeProjections: false });

    const catalog = await facade.capabilityCatalog();
    assert.equal(catalog.surfaces.mcp.coding.includes("analyze_code"), true);
    assert.equal(catalog.surfaces.mcp.mutationGated.includes("execute_ticket"), true);

    const analysis = await facade.planCodeCapability({
      capability: "analyze_code",
      text: "review greet implementation",
      query: "greet"
    });
    assert.equal(analysis.ok, true);
    assert.equal(analysis.dryRun, true);
    assert.equal(analysis.mutation.allowed, false);

    const dependencies = await facade.findDependencies({ query: "greet", limit: 5 });
    assert.equal(typeof dependencies.query, "string");
    assert.equal(Array.isArray(dependencies.searchResults), true);

    const artifacts = await facade.searchArtifacts({ query: "greet", limit: 5 });
    assert.equal(artifacts.ok, true);
    assert.equal(Array.isArray(artifacts.testRunArtifacts), true);

    const refused = await facade.executeTicket({ ticketId: "BUG-NOPE-001" });
    assert.equal(refused.ok, false);
    assert.equal(refused.dryRun, true);
    assert.match(refused.refusalReason, /allowMutation/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

async function runMcp(serverPath: string, messages: any[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("bun", [serverPath], {
      cwd: path.dirname(path.dirname(serverPath)),
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`MCP tools/list timed out\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.split(/\r?\n/).some((line) => line.includes('"id":2'))) {
        child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 0, stdout, stderr });
    });
    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
  });
}
