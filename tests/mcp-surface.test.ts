import { test } from "bun:test";
import assert from "node:assert/strict";
import { AI_WORKFLOW_MCP_TOOL_NAMES, getAiWorkflowMcpToolNames } from "../aiwf-mcp/server.ts";

test("MCP registered tool inventory exposes the full agent plugin surface", () => {
  const expected = [
    "search_project",
    "plugin_status",
    "list_tickets",
    "create_ticket",
    "update_ticket_lifecycle",
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
