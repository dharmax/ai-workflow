import { test } from "bun:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createWorkflowCoreFacade } from "aiwf-common-core/services/workflow-facade";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "workflow-repo");

test("workflow facade syncs richer graph entities and exports a semantika-shaped graph projection", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-facade-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    const facade = createWorkflowCoreFacade({ projectRoot: targetRoot });

    const sync = await facade.sync({ writeProjections: true });
    assert.equal(sync.summary.entityCount > 0, true);
    assert.equal(sync.summary.predicateCount > 0, true);

    const graph = await facade.exportKnowledgeGraph();
    assert.equal(graph.stats.entityTypeCounts.capability >= 8, true);
    assert.equal(graph.stats.entityTypeCounts.integration >= 4, true);
    assert.equal(graph.stats.entityTypeCounts.projection >= 2, true);
    assert.equal(graph.stats.entityTypeCounts.plan >= 1, true);
    assert.equal(graph.stats.entityTypeCounts.problem >= 1, true);
    assert.equal(graph.semantika.recommendedAsCanonicalStore, false);
    assert.equal(graph.semantika.export.concepts.length > 0, true);
    assert.equal(graph.semantika.export.relations.length > 0, true);

    const summary = await facade.getSummary();
    const ticketId = summary.activeTickets[0]?.id;
    assert.equal(typeof ticketId, "string");

    const extracted = await facade.extractTicket(ticketId);
    assert.equal(extracted.ticketId, ticketId);
    assert.equal(Array.isArray(extracted.workingSet.files), true);

    const projectionState = await facade.readTextualProjectionState();
    assert.equal(typeof projectionState.lastProjectionDigest?.kanban, "string");
    assert.equal(projectionState.projections.some((item) => item.filePath === "kanban.md" && item.present), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow facade exposes ticket lifecycle and codelet mutation gates for MCP", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-facade-agent-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await mkdir(path.join(targetRoot, "tools"), { recursive: true });
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await writeFile(path.join(targetRoot, "tools", "readonly-codelet.ts"), [
      "export function run(argv) {",
      "  return { ok: true, argv };",
      "}"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "tools", "mutating-codelet.ts"), [
      "export function run(argv) {",
      "  return { ok: true, applied: argv.apply === true };",
      "}"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "readonly-demo.json"), JSON.stringify({
      id: "readonly-demo",
      summary: "Read-only demo codelet.",
      runner: "node-script",
      execution: "js",
      entry: "tools/readonly-codelet.ts"
    }), "utf8");
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "mutating-demo.json"), JSON.stringify({
      id: "mutating-demo",
      summary: "Mutating demo codelet.",
      runner: "node-script",
      execution: "js",
      entry: "tools/mutating-codelet.ts",
      canMutate: true
    }), "utf8");

    const facade = createWorkflowCoreFacade({ projectRoot: targetRoot });
    await facade.sync({ writeProjections: true });

    const dryRun = await facade.createTicket({
      id: "TKT-MCP-DRY-001",
      title: "Dry-run ticket",
      apply: false
    });
    assert.equal(dryRun.dryRun, true);
    assert.equal((await facade.listTickets({ includeArchived: true })).some((ticket: any) => ticket.id === "TKT-MCP-DRY-001"), false);

    const created = await facade.createTicket({
      id: "TKT-MCP-LIFE-001",
      title: "Lifecycle ticket",
      lane: "Todo",
      apply: true
    });
    assert.equal(created.ticket.id, "TKT-MCP-LIFE-001");

    const started = await facade.updateTicketLifecycle({
      ticketId: "TKT-MCP-LIFE-001",
      action: "move",
      lane: "In Progress",
      apply: true
    });
    assert.equal(started.ticket.lane, "In Progress");

    const reopened = await facade.updateTicketLifecycle({
      ticketId: "TKT-MCP-LIFE-001",
      action: "reopen",
      lane: "Todo",
      apply: true
    });
    assert.equal(reopened.ticket.lane, "Todo");

    const resolved = await facade.updateTicketLifecycle({
      ticketId: "TKT-MCP-LIFE-001",
      action: "resolve",
      apply: true
    });
    assert.equal(resolved.ticket.lane, "Done");

    const readOnlyRun = await facade.runCodelet({ codeletId: "readonly-demo", args: { answer: 42 } });
    assert.equal(readOnlyRun.ok, true);
    assert.equal(readOnlyRun.result.ok, true);

    const refused = await facade.runCodelet({ codeletId: "mutating-demo", args: {} });
    assert.equal(refused.ok, false);
    assert.match(refused.refusalReason, /Mutating codelet/);
    assert.deepEqual(refused.requiredFlags, [{ path: "args.apply", value: true }]);

    const allowed = await facade.runCodelet({
      codeletId: "mutating-demo",
      args: { apply: true },
      allowMutation: true
    });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.result.applied, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
