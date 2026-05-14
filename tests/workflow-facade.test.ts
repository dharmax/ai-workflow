import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { cp, mkdtemp, rm } from "node:fs/promises";
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
