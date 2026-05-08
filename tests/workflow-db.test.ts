import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { addManualNote, evaluateProjectReadiness, getEpic, getProjectSummary, listEpicUserStories, listEpics, resolveProjectNote, reviewProjectCandidates, searchEpicUserStories, searchEpics, searchProject, syncProject, withWorkflowStore } from "aiwf-common-core/services/sync";
import { buildTicketEntity, inferTicketLane, renderEpicsProjection, renderKanbanProjection } from "aiwf-common-core/services/projections";
import { openWorkflowStore } from "aiwf-common-core/db/sqlite-store";
import { PROTOCOL_VERSION, validateEvaluateReadinessResponse } from "aiwf-common-core/contracts/dual-surface-protocol";
import { withWorkspaceMutation } from "aiwf-common-core/lib/workspace-mutation";
import { writeProjectFile } from "aiwf-common-core/lib/filesystem";
import { resolveProjectStatus } from "aiwf-common-core/services/status";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "workflow-repo");

test("syncProject indexes a realistic fixture repo and imports legacy projections once", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    const result = await syncProject({ projectRoot: targetRoot, writeProjections: true });

    assert.equal(result.indexedFiles >= 8, true);
    assert.equal(result.summary.fileCount >= 8, true);
    assert.equal(result.summary.symbolCount >= 10, true);
    assert.equal(result.summary.noteCount >= 4, true);
    assert.equal(result.importSummary.importedTickets, 2);

    const kanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanban, /# Kanban/);
    assert.match(kanban, /TKT-100/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject skips indexing when the project snapshot is unchanged", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-skip-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    const first = await syncProject({ projectRoot: targetRoot, writeProjections: true });
    const second = await syncProject({ projectRoot: targetRoot, writeProjections: true });

    assert.equal(first.skipped, undefined);
    assert.equal(second.skipped, true);
    assert.equal(second.indexedFiles >= 8, true);
    assert.deepEqual(second.indexedDelta, { files: 0, symbols: 0, claims: 0, notes: 0 });
    assert.equal(second.reason, "project state unchanged");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject repairs malformed epic placeholders even when the file snapshot is unchanged", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-epic-repair-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot, writeProjections: true });

    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity({
        id: "true",
        entityType: "epic",
        title: "true",
        lane: null,
        state: "open",
        confidence: 1,
        provenance: "manual",
        sourceKind: "manual",
        reviewState: "active",
        data: {}
      });
      store.upsertEntity(buildTicketEntity({
        id: "EPIC-SETTINGS-001",
        title: "AI Provider Settings & Configuration Flow",
        lane: "Todo" as any,
        epicId: "true" as any,
        summary: ""
      }));
      store.upsertEntity(buildTicketEntity({
        id: "TKT-SETTINGS-001",
        title: "Add separate tabs for local and paid providers in AI settings",
        lane: "Todo" as any,
        epicId: "EPIC-SETTINGS-001" as any,
        summary: "Keep provider settings grouped by capability."
      }));
    });

    const repaired = await syncProject({ projectRoot: targetRoot, writeProjections: true });
    assert.equal(repaired.integrityRepair.promotedEpics, 1);
    assert.equal(repaired.integrityRepair.removedPlaceholderEpics, 1);

    const epics = await listEpics({ projectRoot: targetRoot });
    assert.equal(epics.some((item) => item.id === "true"), false);
    assert.equal(epics.some((item) => item.id === "EPIC-SETTINGS-001"), true);

    const repairedEpic = await getEpic({ projectRoot: targetRoot, epicId: "EPIC-SETTINGS-001" as any });
    assert.equal(repairedEpic?.title, "AI Provider Settings & Configuration Flow");
    assert.equal(repairedEpic?.linkedTickets.some((ticket) => ticket.id === "TKT-SETTINGS-001"), true);

    const kanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.doesNotMatch(kanban, /\[ \] EPIC-SETTINGS-001 AI Provider Settings & Configuration Flow/);
    assert.match(kanban, /TKT-SETTINGS-001 Add separate tabs for local and paid providers in AI settings/);

    const epicsProjection = await readFile(path.join(targetRoot, "epics.md"), "utf8");
    assert.doesNotMatch(epicsProjection, /## true true/);
    assert.match(epicsProjection, /## EPIC-SETTINGS-001 AI Provider Settings & Configuration Flow/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject repairs repeated done suffixes without re-polluting kanban titles", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-done-title-repair-"));

  try {
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({ name: "done-title-repair", type: "module" }, null, 2), "utf8");

    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity({
        ...buildTicketEntity({
          id: "TKT-101",
          title: "Fix projection pollution ✅ 2026-04-20 ✅ 2026-04-20",
          lane: "Done",
          summary: "Keep Done titles stable across sync runs."
        }),
        lane: "Done",
        state: "archived",
        data: {
          ticketId: "TKT-101",
          summary: "Keep Done titles stable across sync runs.",
          completedAt: "2026-04-20"
        }
      });
    });

    const first = await syncProject({ projectRoot: targetRoot, writeProjections: true });
    assert.equal(first.integrityRepair.sanitizedTicketTitles, 1);

    await withWorkflowStore(targetRoot, async (store) => {
      const repaired = store.getEntity("TKT-101");
      assert.equal(repaired?.title, "Fix projection pollution");
      assert.equal(repaired?.data?.completedAt, "2026-04-20");
    });

    const firstKanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    const firstLine = firstKanban.split(/\r?\n/).find((line) => line.includes("TKT-101")) ?? "";
    assert.match(firstLine, /TKT-101 Fix projection pollution ✅ 2026-04-20$/);
    assert.equal((firstLine.match(/✅/g) ?? []).length, 1);

    const second = await syncProject({ projectRoot: targetRoot, writeProjections: true });
    assert.equal(second.skipped, true);

    const secondKanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    const secondLine = secondKanban.split(/\r?\n/).find((line) => line.includes("TKT-101")) ?? "";
    assert.equal((secondLine.match(/✅/g) ?? []).length, 1);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject archives low-signal opaque synthetic tickets so they do not pollute todo", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-opaque-ticket-repair-"));

  try {
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({ name: "opaque-ticket-repair", type: "module" }, null, 2), "utf8");

    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity(buildTicketEntity({
        id: "2a5f10962269f7154a11336ae784527a4518f7ab",
        title: "Leaderboards Feature",
        lane: "Todo" as any,
        summary: ""
      }));
    });

    const result = await syncProject({ projectRoot: targetRoot, writeProjections: true });
    assert.equal(result.integrityRepair.archivedOpaqueSyntheticTickets, 1);

    await withWorkflowStore(targetRoot, async (store) => {
      const ticket = store.getEntity("2a5f10962269f7154a11336ae784527a4518f7ab");
      assert.equal(ticket?.state, "archived");
      assert.equal(ticket?.lane, "Archived");
      assert.equal(ticket?.data?.archivedReason, "opaque synthetic ticket with no supporting workflow context");
    });

    const kanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.doesNotMatch(kanban, /Leaderboards Feature/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject archives malformed synthetic [object Object] tickets before shell surfaces can retrieve them", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-malformed-ticket-repair-"));

  try {
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({ name: "malformed-ticket-repair", type: "module" }, null, 2), "utf8");

    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity(buildTicketEntity({
        id: "TKT-AUTO-OBJECT-OBJECT-001",
        title: "[object Object]",
        lane: "Todo" as any,
        summary: ""
      }));
    });

    const result = await syncProject({ projectRoot: targetRoot, writeProjections: true });
    assert.equal(result.integrityRepair.archivedOpaqueSyntheticTickets, 1);

    await withWorkflowStore(targetRoot, async (store) => {
      const ticket = store.getEntity("TKT-AUTO-OBJECT-OBJECT-001");
      assert.equal(ticket?.state, "archived");
      assert.equal(ticket?.lane, "Archived");
      assert.equal(ticket?.data?.archivedReason, "malformed synthetic ticket with no supporting workflow context");
    });

    const kanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.doesNotMatch(kanban, /\[object Object\]/);

  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject retires stale auto-assessments and limits kanban assessment noise", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-assessment-hygiene-"));

  try {
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({ name: "assessment-hygiene", type: "module" }, null, 2), "utf8");
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        ollama: { enabled: false },
        google: { enabled: false },
        openai: { enabled: false },
        anthropic: { enabled: false }
      }
    }, null, 2), "utf8");

    await withWorkflowStore(targetRoot, async (store) => {
      for (let index = 0; index < 6; index += 1) {
        const createdAt = `2026-04-25T0${index}:00:00.000Z`;
        store.upsertAssessment({
          id: `ASM-PENDING-${index}`,
          targetType: "project",
          targetId: path.basename(targetRoot),
          status: "pending",
          scope: "health",
          plan: null,
          criticism: null,
          result: null,
          createdAt,
        });
      }
      for (let index = 0; index < 4; index += 1) {
        const createdAt = `2026-04-24T0${index}:00:00.000Z`;
        store.upsertAssessment({
          id: `ASM-FAILED-${index}`,
          targetType: "project",
          targetId: path.basename(targetRoot),
          status: "failed",
          scope: "health",
          plan: {},
          criticism: {},
          result: { error: `historical failure ${index}` },
          createdAt
        });
      }
      store.appendMetric({
        taskClass: "shell-planning",
        capability: "strategy",
        providerId: "ollama",
        modelId: "missing",
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 1,
        success: false,
        errorMessage: "forced failure for auto-assessment trigger",
        createdAt: "2026-04-26T00:00:00.000Z"
      });
    });
    const db = new DatabaseSync(path.join(targetRoot, ".ai-workflow", "state", "workflow.db"));
    db.exec("UPDATE assessments SET updated_at = created_at WHERE id LIKE 'ASM-PENDING-%' OR id LIKE 'ASM-FAILED-%';");
    db.close();

    await syncProject({ projectRoot: targetRoot, writeProjections: true });

    await withWorkflowStore(targetRoot, async (store) => {
      const assessments = store.listAssessments({ targetType: "project", targetId: path.basename(targetRoot) })
        .filter((item) => item.scope === "health");
      const pendingCount = assessments.filter((item) => item.status === "pending").length;
      const staleFailures = assessments.filter((item) => item.result?.stale === true);
      const latest = assessments[0];

      assert.equal(pendingCount, 0);
      assert.equal(staleFailures.length >= 6, true);
      assert.equal(latest.status, "resolved");
    });

    const kanban = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    const assessmentLines = kanban.split(/\r?\n/).filter((line) => line.includes("Assessment: health on project:"));
    assert.equal(assessmentLines.length <= 3, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("resolveProjectStatus materializes surface links and test evidence", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-status-surface-"));

  try {
    await mkdir(path.join(targetRoot, "cli", "lib"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await mkdir(path.join(targetRoot, ".ai-workflow", "generated"), { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({ name: "status-surface-test", type: "module" }, null, 2), "utf8");
    await writeFile(path.join(targetRoot, "cli", "lib", "shell.ts"), "export function shellEntry() { return 'ok'; }\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "shell.test.ts"), "import '../cli/lib/shell.ts';\nexport const covered = true;\n", "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## Todo\n- [ ] TKT-001 Example ticket\n", "utf8");
    await writeFile(path.join(targetRoot, ".ai-workflow", "generated", "dogfood-report.json"), `${JSON.stringify({
      version: 1,
      generatedAt: "2026-04-09T12:00:00.000Z",
      root: targetRoot,
      profile: "full",
      timeoutMs: 45000,
      surfaces: {
        shell: {
          description: "Interactive shell surface",
          fileCount: 1,
          files: ["aiwf-shell/cli/lib/shell.ts"],
          fileHashes: {},
          scenarioCount: 1,
          status: "pass",
          scenarios: [{
            id: "doctor-command",
            description: "shell handles doctor locally",
            command: "node cli/ai-workflow.ts shell doctor --json --no-ai",
            ok: true,
            code: 0,
            timedOut: false,
            durationMs: 25,
            stdout: "{\"kind\":\"reply\"}",
            stderr: ""
          }]
        }
      }
    }, null, 2)}\n`, "utf8");

    await syncProject({ projectRoot: targetRoot, writeProjections: false });
    const report = await resolveProjectStatus({
      projectRoot: targetRoot,
      selector: "shell",
      type: "surface",
      includeRelated: true
    });

    assert.equal(report.ok, true);
    assert.equal(report.id, "surface:shell");
    assert.equal(Array.isArray(report.related), true);
    assert.equal(report.tests.some((item) => /tests\/shell\.test\.ts|dogfood shell/.test(item.title)), true);
    assert.equal(report.tests.some((item) => /dogfood shell doctor-command/.test(item.title)), true);
    assert.equal(report.latestTestResult.status, "pass");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("withWorkspaceMutation picks up manual edits before a later project write", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-mutation-"));

  try {
    await withWorkspaceMutation(targetRoot, "seed project files", async () => {
      await writeProjectFile(targetRoot, "README.md", "# Seed\n");
      await writeProjectFile(targetRoot, "notes.md", "initial note\n");
    });

    await writeFile(path.join(targetRoot, "README.md"), "# Manual edit\n", "utf8");

    await withWorkspaceMutation(targetRoot, "follow-up project write", async () => {
      await writeProjectFile(targetRoot, "more-notes.md", "follow up\n");
    });

    const result = await syncProject({ projectRoot: targetRoot, writeProjections: false });
    assert.equal(result.skipped, true);
    assert.equal(await readFile(path.join(targetRoot, "README.md"), "utf8"), "# Manual edit\n");
    assert.equal(await readFile(path.join(targetRoot, "more-notes.md"), "utf8"), "follow up\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject mirrors codelets into the DB registry", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-codelets-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    const result = await syncProject({ projectRoot: targetRoot, writeProjections: true });

    assert.equal(result.codeletRegistry.codeletsIndexed > 0, true);
    assert.equal(result.summary.codeletCount > 0, true);

    await withWorkflowStore(targetRoot, async (store) => {
      const codelets = store.listEntities({ entityType: "codelet" });
      const doctor = codelets.find((item) => item.data?.codeletId === "doctor");
      const executeTicket = codelets.find((item) => item.data?.codeletId === "execute-ticket");
      const artifactJudge = codelets.find((item) => item.data?.codeletId === "artifact-judge");

      assert.equal(Boolean(doctor), true);
      assert.equal(doctor?.data?.backing?.status, "builtin");
      assert.equal(Boolean(executeTicket), true);
      assert.equal(executeTicket?.data?.backing?.exists, true);
      assert.equal(Boolean(artifactJudge), true);
      assert.equal(artifactJudge?.data?.backing?.exists, true);
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("manual notes, candidate review, and search operate against the DB-first store", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-note-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });

    const note = await addManualNote({
      projectRoot: targetRoot,
      note: {
        noteType: "BUG",
        body: "shared router can corrupt candidate triage under race conditions",
        filePath: "src/core/router.ts",
        line: 3
      }
    });
    assert.equal(note.noteType, "BUG");

    const review = await reviewProjectCandidates({ projectRoot: targetRoot });
    assert.equal(Array.isArray(review.reviewed), true);

    const results = await searchProject({
      projectRoot: targetRoot,
      query: "router"
    });
    assert.equal(results.some((item) => item.title.includes("src/core/router.ts") || item.body.includes("router")), true);
    assert.equal(results.some((item) => /router/i.test(item.title) || /router/i.test(item.body ?? "")), true);

    const exactSymbolResults = await searchProject({
      projectRoot: targetRoot,
      query: "runApp"
    });
    assert.equal(exactSymbolResults[0]?.scope, "symbol");
    assert.equal(exactSymbolResults[0]?.title, "function runApp");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("resolved notes are retired from readiness evidence and candidate review", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-resolved-note-"));

  try {
    await writeFile(path.join(targetRoot, "README.md"), "# Ready Fixture\n", "utf8");
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await writeFile(path.join(targetRoot, "docs", "beta-checklist.md"), "# Beta Checklist\n- smoke\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "smoke.test.ts"), "export const smoke = true;\n", "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## Done\n- [x] REL-001 Ready\n", "utf8");

    await syncProject({ projectRoot: targetRoot });
    const note = await addManualNote({
      projectRoot: targetRoot,
      note: {
        noteType: "RISK",
        body: "readiness still reflects an obsolete shell audit warning"
      }
    });

    const withRisk = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: PROTOCOL_VERSION,
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this ready for beta testing?"
        }
      }
    });
    assert.equal(withRisk.evidence.some((item) => item.kind === "risk_note"), true);

    const resolved = await resolveProjectNote({
      projectRoot: targetRoot,
      noteId: note.id,
      reason: "fresh dogfood and workflow audit superseded the old shell warning"
    });
    assert.equal(resolved?.status, "resolved");

    const afterResolve = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: PROTOCOL_VERSION,
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this ready for beta testing?"
        }
      }
    });
    assert.equal(afterResolve.evidence.some((item) => item.kind === "risk_note"), false);

    await withWorkflowStore(targetRoot, async (store) => {
      const stored = store.getNoteById(note.id);
      const candidate = store.listCandidates().find((item) => item.noteId === note.id);
      assert.equal(stored?.status, "resolved");
      assert.equal(candidate?.status, "archived");
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ticket entities render into the projection view", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-ticket-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });
    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity(buildTicketEntity({
        id: "TKT-222",
        title: "Add deterministic projection coverage",
        lane: "In Progress",
        epicId: "EPC-100",
        summary: "Keep this tied to the DB."
      }));
      store.upsertEntity({
        id: "EPC-100",
        entityType: "epic",
        title: "Fixture Indexing",
        lane: null,
        state: "open",
        confidence: 1,
        provenance: "manual",
        sourceKind: "manual",
        reviewState: "active",
        data: {}
      });

      const projection = renderKanbanProjection(store);
      assert.match(projection, /TKT-222 Add deterministic projection coverage/);
      assert.match(projection, /## In Progress/);
    });

    const summary = await getProjectSummary({ projectRoot: targetRoot });
    assert.equal(summary.activeTickets.some((ticket) => ticket.id === "TKT-222"), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("kanban projection keeps rare lanes hidden until they have cards", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-rare-lanes-"));

  try {
    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity(buildTicketEntity({
        id: "TKT-333",
        title: "Keep the core board compact",
        lane: "In Progress",
        summary: "Only the standard lanes should render when the rare lanes are empty."
      }));

      const compactProjection = renderKanbanProjection(store);
      assert.match(compactProjection, /## In Progress/);
      assert.doesNotMatch(compactProjection, /## AI Candidates/);
      assert.doesNotMatch(compactProjection, /## Risk Watch/);
      assert.doesNotMatch(compactProjection, /## Doubtful Relevancy/);
      assert.doesNotMatch(compactProjection, /## Ideas/);
      assert.doesNotMatch(compactProjection, /## Archived/);

      store.upsertEntity({
        id: "ticket:CAND-333",
        entityType: "candidate-ticket",
        title: "Review rare lane candidate",
        lane: "AI Candidates",
        state: "open",
        confidence: 0.9,
        provenance: "manual",
        sourceKind: "manual",
        reviewState: "active",
        parentId: null,
        data: {
          ticketId: "CAND-333",
          summary: "A candidate lane should surface only when it is populated."
        }
      });

      const expandedProjection = renderKanbanProjection(store);
      assert.match(expandedProjection, /## AI Candidates/);
      assert.match(expandedProjection, /CAND-333 Review rare lane candidate/);
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("buildTicketEntity defaults BUG tickets into the bug lane", () => {
  const bugTicket = buildTicketEntity({
    id: "BUG-SHELL-01",
    title: "Keep shell defects out of the feature backlog"
  });
  assert.equal(bugTicket.lane, "Bugs P2/P3");
  assert.equal(inferTicketLane({ id: "BUG-CLI-01", title: "Example" }), "Bugs P2/P3");
  assert.equal(inferTicketLane({ id: "TKT-001", title: "Normal work" }), "Todo");
  assert.equal(inferTicketLane({ id: "BUG-CLI-02", title: "Urgent issue", lane: "Bugs P1" }), "Bugs P1");
});

test("kanban projection renders done tickets with a completion date", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-done-ticket-"));

  try {
    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity(buildTicketEntity({
        id: "TKT-444",
        title: "Close the loop",
        lane: "Done",
        summary: "Completed work should render with an explicit done date."
      }));
      store.upsertEntity({
        ...(store.getEntity("TKT-444") ?? {}),
        id: "TKT-444",
        entityType: "ticket",
        title: "Close the loop",
        lane: "Done",
        state: "open",
        confidence: 1,
        provenance: "manual",
        sourceKind: "manual",
        reviewState: "active",
        parentId: null,
        data: {
          ticketId: "TKT-444",
          summary: "Completed work should render with an explicit done date.",
          completedAt: "2026-04-04"
        }
      });

      const projection = renderKanbanProjection(store);
      assert.match(projection, /## Done/);
      assert.match(projection, /TKT-444 Close the loop ✅ 2026-04-04/);
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("epic projections stay narrative-first and epic/story queries resolve through the DB", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-epic-queries-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });

    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity({
        id: "EPC-200",
        entityType: "epic",
        title: "Direct edit reconciliation",
        lane: null,
        state: "open",
        confidence: 1,
        provenance: "manual",
        sourceKind: "manual",
        reviewState: "active",
        data: {
          summary: "Keep file projections honest without flattening the narrative.",
          userStories: [
            "As a user, I can edit epics.md or kanban.md directly and have ai-workflow detect drift before it overwrites my change.",
            "As a maintainer, I can reconcile missing or deleted DB entities from a file edit without losing the author’s intent."
          ],
          ticketBatches: [
            "Detect file/DB drift and preview the delta.",
            "Create, update, or delete DB entities from explicit user edits."
          ]
        }
      });
      store.upsertEntity(buildTicketEntity({
        id: "TKT-200",
        title: "Wire direct-edit reconciliation",
        lane: "Todo" as any,
        epicId: "EPC-200",
        summary: "Keep the drift flow tied to the epic.",
        userStory: "As a user, I can edit epics.md or kanban.md directly and have ai-workflow detect drift before it overwrites my change."
      }));
    });

    const epic = await getEpic({ projectRoot: targetRoot, epicId: "EPC-200" });
    assert.equal(epic.title, "Direct edit reconciliation");
    assert.equal(epic.userStories.length, 2);

    const epicList = await listEpics({ projectRoot: targetRoot });
    assert.equal(epicList.some((item) => item.id === "EPC-200"), true);

    const storyList = await listEpicUserStories({ projectRoot: targetRoot, epicId: "EPC-200" });
    assert.equal(storyList.length, 2);
    assert.match(storyList[0].body, /edit epics\.md or kanban\.md directly/i);

    const epicSearch = await searchEpics({ projectRoot: targetRoot, query: "reconciliation" });
    assert.equal(epicSearch[0]?.id, "EPC-200");

    const storySearch = await searchEpicUserStories({ projectRoot: targetRoot, query: "drift", epicId: "EPC-200" });
    assert.equal(storySearch[0]?.epic.id, "EPC-200");

    const projection = await withWorkflowStore(targetRoot, async (store) => renderEpicsProjection(store));
    assert.match(projection, /### Goal/);
    assert.match(projection, /### Status/);
    assert.match(projection, /<!-- status: open -->/);
    assert.match(projection, /#### Story 1/);
    assert.match(projection, /\*\*As a user\*\*, I can edit epics\.md or kanban\.md directly/);
    assert.match(projection, /### Ticket batches/);
    assert.match(projection, /### Kanban tickets/);
    assert.doesNotMatch(projection, /Predicates|DB graph entities and predicates|Feature:/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject tolerates duplicate facts emitted from the same file", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-duplicate-facts-"));

  try {
    await writeFile(
      path.join(targetRoot, "README.md"),
      [
        "# Overview",
        "",
        "## Shared",
        "",
        "Repeated heading to force duplicate has-heading facts.",
        "",
        "## Shared"
      ].join("\n"),
      "utf8"
    );

    const result = await syncProject({ projectRoot: targetRoot });
    assert.equal(result.indexedFiles, 1);
    assert.equal(result.indexedClaims >= 3, true);

    const summary = await getProjectSummary({ projectRoot: targetRoot });
    assert.equal(summary.claimCount >= 3, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("shadow sync does not promote tickets on loose keyword overlap alone", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-shadow-sync-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });

    await withWorkflowStore(targetRoot, async (store) => {
      store.upsertEntity(buildTicketEntity({
        id: "TKT-555",
        title: "Shared router workflow provider migration",
        lane: "Todo" as any,
        summary: "Should stay Todo without explicit evidence."
      }));
    });

    const result = await syncProject({ projectRoot: targetRoot });
    const ticket = result.summary.activeTickets.find((item) => item.id === "TKT-555");
    assert.equal(ticket?.lane, "Todo");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("openWorkflowStore tolerates legacy DBs that already contain guarded columns", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-legacy-schema-"));

  try {
    const dbPath = path.join(targetRoot, "legacy.db");
    const store = await openWorkflowStore({ projectRoot: targetRoot, dbPath });
    store.close();

    const reopened = await openWorkflowStore({ projectRoot: targetRoot, dbPath });
    reopened.close();
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("openWorkflowStore retries transient locked initialization before succeeding", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-open-retry-"));
  const originalExec = DatabaseSync.prototype.exec;
  let injected = false;

  DatabaseSync.prototype.exec = function patchedExec(sql) {
    if (!injected && String(sql).includes("PRAGMA journal_mode = WAL")) {
      injected = true;
      const error = new Error("database is locked");
      error.code = "ERR_SQLITE_ERROR";
      throw error;
    }
    return originalExec.call(this, sql);
  };

  try {
    const store = await openWorkflowStore({ projectRoot: targetRoot, dbPath: path.join(targetRoot, "workflow.db") });
    assert.equal(injected, true);
    store.close();
  } finally {
    DatabaseSync.prototype.exec = originalExec;
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject ignores generated artifact directories that would pollute search", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-generated-ignore-"));

  try {
    await writeFile(path.join(targetRoot, "package.json"), "{\n  \"name\": \"fixture\"\n}\n", "utf8");
    await writeFile(path.join(targetRoot, "README.md"), "# Root\n", "utf8");
    await writeFile(path.join(targetRoot, "e2e_combat.txt"), "combat transcript\n", "utf8");
    await mkdir(path.join(targetRoot, "artifacts"), { recursive: true });
    await writeFile(path.join(targetRoot, "artifacts", "combat-report.json"), "{\"combat\":true}\n", "utf8");

    const result = await syncProject({ projectRoot: targetRoot });
    assert.equal(result.indexedFiles, 2);

    const search = await searchProject({ projectRoot: targetRoot, query: "combat" });
    assert.equal(search.some((item) => item.refId === "artifacts/combat-report.json"), false);
    assert.equal(search.some((item) => item.refId === "e2e_combat.txt"), false);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject respects .ai-workflowignore and skips nested embedded project roots", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-ignore-"));

  try {
    await writeFile(path.join(targetRoot, ".ai-workflowignore"), "tests/fixtures/\nembedded-project/\n", "utf8");
    await writeFile(path.join(targetRoot, "README.md"), "# Root\n", "utf8");
    await mkdir(path.join(targetRoot, "tests", "fixtures", "mini"), { recursive: true });
    await writeFile(path.join(targetRoot, "tests", "fixtures", "mini", "ignored.md"), "# Ignored Fixture\n", "utf8");

    await mkdir(path.join(targetRoot, "embedded-project", "docs"), { recursive: true });
    await writeFile(path.join(targetRoot, "embedded-project", "package.json"), "{\n  \"name\": \"embedded\"\n}\n", "utf8");
    await writeFile(path.join(targetRoot, "embedded-project", "docs", "kanban.md"), "# Board\n", "utf8");
    await writeFile(path.join(targetRoot, "embedded-project", "src.md"), "# Should be ignored\n", "utf8");

    const result = await syncProject({ projectRoot: targetRoot });
    assert.equal(result.indexedFiles, 1);

    const search = await searchProject({ projectRoot: targetRoot, query: "ignored" });
    assert.equal(search.length, 0);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject removes stale indexed files that become ignored on later runs", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-stale-index-"));

  try {
    await writeFile(path.join(targetRoot, "README.md"), "# Root\n", "utf8");
    await syncProject({ projectRoot: targetRoot });

    await mkdir(path.join(targetRoot, "artifacts"), { recursive: true });
    await writeFile(path.join(targetRoot, "artifacts", "combat-report.json"), "{\"combat\":true}\n", "utf8");
    await syncProject({ projectRoot: targetRoot });

    let search = await searchProject({ projectRoot: targetRoot, query: "combat" });
    assert.equal(search.some((item) => item.refId === "artifacts/combat-report.json"), false);

    await writeFile(path.join(targetRoot, "combat-notes.md"), "combat retained\n", "utf8");
    await syncProject({ projectRoot: targetRoot });
    search = await searchProject({ projectRoot: targetRoot, query: "combat" });
    assert.equal(search.some((item) => item.refId === "combat-notes.md"), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("syncProject imports richer docs kanban tickets instead of template root kanban", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-docs-kanban-"));

  try {
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Backlog",
      "",
      "- [ ] TKT-001 Replace this example ticket"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "epics.md"), "# Epics\n", "utf8");
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await writeFile(path.join(targetRoot, "docs", "kanban.md"), [
      "# Board",
      "",
      "## TODO",
      "",
      "- [ ] **ADMIN-METRICS-01**: Replace estimated AI spend with real usage metrics.",
      "  - Outcome: Real metrics replace estimates.",
      "  - Epic: EPIC-CT-00",
      "",
      "## In Progress",
      "",
      "- [ ] **REF-APP-SHELL-01**: Continue app-shell hardening.",
      "",
      "## Done",
      "",
      "- [x] **2026-03-23 DIALOG-RUNTIME-02**: Fixed remaining empty-dialog regressions."
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "docs", "epics.md"), [
      "# Epics",
      "",
      "## 0. Closed-test Consolidation (ACTIVE)",
      "",
      "Goal: Harden the product for external testers."
    ].join("\n"), "utf8");

    const result = await syncProject({ projectRoot: targetRoot });
    const ticketIds = result.summary.activeTickets.map((ticket) => ticket.id);

    assert.equal(ticketIds.includes("ADMIN-METRICS-01"), true);
    assert.equal(ticketIds.includes("REF-APP-SHELL-01"), true);
    assert.equal(ticketIds.includes("DIALOG-RUNTIME-02"), false);
    assert.equal(ticketIds.includes("TKT-001"), false);

    await withWorkflowStore(targetRoot, async (store) => {
      const metrics = store.getEntity("ADMIN-METRICS-01");
      assert.equal(metrics?.lane, "Todo");
      assert.equal(metrics?.parentId, "EPIC-CT-00");
      assert.equal(metrics?.data?.outcome, "Real metrics replace estimates.");

      const done = store.getEntity("DIALOG-RUNTIME-02");
      assert.equal(done?.lane, "Done");
      assert.equal(done?.state, "archived");
      assert.equal(store.getEntity("TKT-001"), null);

      const epic = store.listEntities({ entityType: "epic" }).find((item) => item.title === "Closed-test Consolidation");
      assert.equal(Boolean(epic), true);
    });

    const exactTicketSearch = await searchProject({ projectRoot: targetRoot, query: "REF-APP-SHELL-01" });
    assert.equal(exactTicketSearch[0]?.scope, "entity");
    assert.equal(exactTicketSearch[0]?.refId, "REF-APP-SHELL-01");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("metrics summary reports latest session, trailing week, and last active work hours", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-metrics-summary-"));

  try {
    const store = await openWorkflowStore({ projectRoot: targetRoot, dbPath: path.join(targetRoot, "workflow.db") });
    store.appendMetric({
      taskClass: "review",
      capability: "logic",
      providerId: "google",
      modelId: "gemini-2.0-pro-exp",
      promptTokens: 400,
      completionTokens: 120,
      latencyMs: 12000,
      success: true,
      createdAt: "2026-03-30T10:00:00.000Z"
    });
    store.appendMetric({
      taskClass: "shell-planning",
      capability: "strategy",
      providerId: "ollama",
      modelId: "hermes3:8b",
      promptTokens: 120,
      completionTokens: 40,
      latencyMs: 2200,
      success: true,
      createdAt: "2026-04-09T08:00:00.000Z"
    });
    store.appendMetric({
      taskClass: "summarization",
      capability: "data",
      providerId: "google",
      modelId: "gemini-2.0-flash",
      promptTokens: 180,
      completionTokens: 70,
      latencyMs: 4500,
      success: false,
      errorMessage: "timeout",
      createdAt: "2026-04-09T09:05:00.000Z"
    });
    store.appendMetric({
      taskClass: "review",
      capability: "logic",
      providerId: "ollama",
      modelId: "hermes3:8b",
      promptTokens: 300,
      completionTokens: 90,
      latencyMs: 6800,
      success: true,
      createdAt: "2026-04-09T09:15:00.000Z"
    });

    const summary = store.getMetricsSummary({ now: new Date("2026-04-09T12:00:00.000Z") });
    store.close();

    assert.equal(summary.totalCalls, 4);
    assert.equal(summary.sessionCount, 3);
    assert.equal(summary.windows.latestSession.calls, 2);
    assert.equal(summary.windows.latestSession.localCalls, 1);
    assert.equal(summary.windows.trailingWeek.calls, 3);
    assert.equal(summary.windows.last4WorkHours.calls, 4);
    assert.equal(summary.windows.latestSession.cost.estimatedManualMinutes > summary.windows.latestSession.cost.estimatedToolMinutes, true);
    assert.equal(summary.windows.latestSession.quality.qualityScore >= 0, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("metrics summary scores mixed windows from real traffic instead of mock traffic", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-metrics-mock-split-"));

  try {
    const store = await openWorkflowStore({ projectRoot: targetRoot, dbPath: path.join(targetRoot, "workflow.db") });
    store.appendMetric({
      taskClass: "shell-planning",
      capability: "strategy",
      providerId: "ollama",
      modelId: "mock-model",
      promptTokens: 20,
      completionTokens: 10,
      latencyMs: 1,
      success: true,
      createdAt: "2026-04-09T09:00:00.000Z"
    });
    store.appendMetric({
      taskClass: "shell-planning",
      capability: "strategy",
      providerId: "ollama",
      modelId: "mock-model",
      promptTokens: 20,
      completionTokens: 10,
      latencyMs: 1,
      success: true,
      createdAt: "2026-04-09T09:05:00.000Z"
    });
    store.appendMetric({
      taskClass: "shell-planning",
      capability: "strategy",
      providerId: "ollama",
      modelId: "hermes3:8b",
      promptTokens: 100,
      completionTokens: 30,
      latencyMs: 20003,
      success: false,
      errorMessage: "timeout",
      createdAt: "2026-04-09T09:10:00.000Z"
    });

    const summary = store.getMetricsSummary({ now: new Date("2026-04-09T12:00:00.000Z") });
    store.close();

    assert.equal(summary.windows.latestSession.calls, 3);
    assert.equal(summary.windows.latestSession.realTraffic.calls, 1);
    assert.equal(summary.windows.latestSession.mockTraffic.calls, 2);
    assert.equal(summary.windows.latestSession.quality.basis, "real-traffic");
    assert.equal(summary.windows.latestSession.quality.successRate, 0);
    assert.equal(summary.windows.latestSession.helpVsBaseline.helpScore, 0);
    assert.match(summary.windows.latestSession.alerts.join("\n"), /mock calls/);
    assert.match(summary.windows.latestSession.alerts.join("\n"), /Real traffic is degraded/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("metrics summary surfaces fallback diagnostics and failure hotspots from structured details", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-metrics-details-"));

  try {
    const store = await openWorkflowStore({ projectRoot: targetRoot, dbPath: path.join(targetRoot, "workflow.db") });
    store.appendMetric({
      taskClass: "project-planning",
      capability: "strategy",
      providerId: "openai",
      modelId: "gpt-4o",
      latencyMs: 18250,
      success: true,
      createdAt: "2026-04-09T10:00:00.000Z",
      details: {
        stage: "operator-planning",
        candidateCount: 2,
        attemptCount: 2,
        fallbackUsed: true,
        failedAttempts: 1,
        failedLatencyMs: 3150,
        failedCandidates: [
          {
            providerId: "google",
            modelId: "gemini-2.0-pro-exp",
            latencyMs: 3150,
            timedOut: false,
            error: "Gemini API key is blocked for Generative Language API."
          }
        ]
      }
    });

    const summary = store.getMetricsSummary({ now: new Date("2026-04-09T12:00:00.000Z") });
    store.close();

    assert.equal(summary.windows.latestSession.diagnostics.fallbackRuns, 1);
    assert.equal(summary.windows.latestSession.diagnostics.fallbackRecoveries, 1);
    assert.equal(summary.windows.latestSession.diagnostics.failedAttempts, 1);
    assert.equal(summary.windows.latestSession.diagnostics.wastedLatencyMs, 3150);
    assert.equal(summary.windows.latestSession.diagnostics.byStage[0].stage, "operator-planning");
    assert.match(summary.windows.latestSession.diagnostics.topFailures[0].label, /google:gemini-2.0-pro-exp/i);
    assert.match(summary.windows.latestSession.alerts.join("\n"), /Fallback used in 1 run/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("project summary excludes done tickets and sync suppresses projection/progress note noise", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-summary-"));

  try {
    await writeFile(path.join(targetRoot, "README.md"), "# Root\n", "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Done",
      "- [ ] TODO should not become a note",
      "",
      "## Todo",
      "- [ ] TKT-100 Active item"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "progress.md"), [
      "# Progress",
      "",
      "BUG: work completed:"
    ].join("\n"), "utf8");

    const result = await syncProject({ projectRoot: targetRoot });
    const summary = await getProjectSummary({ projectRoot: targetRoot });

    assert.equal(summary.activeTickets.some((ticket) => ticket.id === "TKT-100"), true);
    assert.equal(summary.activeTickets.some((ticket) => ticket.lane === "Done"), false);
    assert.equal(result.summary.notes.some((note) => note.filePath === "kanban.md"), false);
    assert.equal(result.summary.notes.some((note) => note.filePath === "progress.md"), false);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("evaluateProjectReadiness returns insufficient_evidence when verification proof is missing", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-readiness-gap-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });

    const response = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: PROTOCOL_VERSION,
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this fixture ready for beta testing?"
        }
      }
    });

    validateEvaluateReadinessResponse(response);
    assert.equal(response.status, "insufficient_evidence");
    assert.equal(response.opinion.verdict, "not_ready");
    assert.equal(response.gaps.some((item) => /verification artifact/i.test(item)), true);
    assert.equal(Array.isArray(response.guideline_findings), true);
    assert.equal(response.guideline_findings.length > 0, true);
    assert.equal(response.recommended_next_actions.length >= 1, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("evaluateProjectReadiness returns complete when checklist and verification artifacts exist without blockers", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-readiness-complete-"));

  try {
    await writeFile(path.join(targetRoot, "README.md"), "# Ready Fixture\n", "utf8");
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await writeFile(path.join(targetRoot, "docs", "beta-checklist.md"), [
      "# Beta Checklist",
      "",
      "- Critical flow smoke test",
      "- No open blockers"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "tests", "smoke.test.ts"), [
      "export function smoke() {",
      "  return true;",
      "}"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Done",
      "",
      "- [x] REL-001 Release preparation complete"
    ].join("\n"), "utf8");

    await syncProject({ projectRoot: targetRoot });

    const response = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: PROTOCOL_VERSION,
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this ready for beta testing?"
        }
      }
    });

    validateEvaluateReadinessResponse(response);
    assert.equal(response.status, "complete");
    assert.equal(response.opinion.verdict, "ready");
    assert.equal(response.gaps.length, 0);
    assert.equal(Array.isArray(response.guideline_findings), true);
    assert.equal(response.guideline_findings.length > 0, true);
    assert.equal(response.opinion.confidence >= 0.6, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("evaluateProjectReadiness uses recent run artifacts as explicit verification evidence", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-readiness-run-artifact-"));

  try {
    await writeFile(path.join(targetRoot, "README.md"), "# Ready Fixture\n", "utf8");
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await mkdir(path.join(targetRoot, ".ai-workflow", "state", "run-artifacts"), { recursive: true });
    await writeFile(path.join(targetRoot, "docs", "beta-checklist.md"), "# Beta Checklist\n- smoke\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "smoke.test.ts"), "export const smoke = true;\n", "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## Done\n- [x] REL-001 Ready\n", "utf8");

    const recordedAt = new Date().toISOString();
    await writeFile(path.join(targetRoot, ".ai-workflow", "state", "run-artifacts", "latest.json"), JSON.stringify({
      id: "run-recent",
      recordedAt
    }, null, 2));
    await writeFile(path.join(targetRoot, ".ai-workflow", "state", "run-artifacts", "run-recent.json"), JSON.stringify({
      id: "run-recent",
      recordedAt,
      kind: "execution-dry-run",
      ok: true,
      payload: {
        verificationRun: {
          ok: true
        }
      }
    }, null, 2));

    await syncProject({ projectRoot: targetRoot });

    const response = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: PROTOCOL_VERSION,
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this ready for beta testing?"
        }
      }
    });

    validateEvaluateReadinessResponse(response);
    assert.equal(response.status, "complete");
    assert.equal(response.evidence.some((item) => item.source === "test_results" && /run-recent/.test(item.ref)), true);
    assert.equal(response.meta.freshness.verification_status, "fresh");
    assert.equal(response.opinion.confidence >= 0.7, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("evaluateProjectReadiness returns blocked for invalidated continuation state", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-readiness-continuation-"));

  try {
    await writeFile(path.join(targetRoot, "README.md"), "# Ready Fixture\n", "utf8");
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await writeFile(path.join(targetRoot, "docs", "beta-checklist.md"), "# Beta Checklist\n- smoke\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "smoke.test.ts"), "export const smoke = true;\n", "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## Done\n- [x] REL-001 Ready\n", "utf8");

    await syncProject({ projectRoot: targetRoot });

    const staleCreatedAt = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
    const response = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: PROTOCOL_VERSION,
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this ready for beta testing?"
        },
        continuation_state: {
          token: "eval-readiness:stale-token",
          originating_operation: "evaluate_readiness",
          next_allowed_operations: ["discover_work_context"],
          created_at: staleCreatedAt
        }
      }
    });

    validateEvaluateReadinessResponse(response);
    assert.equal(response.status, "blocked");
    assert.equal(response.opinion.verdict, "unknown");
    assert.equal(response.gaps.some((item) => /continuation state/i.test(item)), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("evaluateProjectReadiness returns structured error responses for protocol mismatches", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "workflow-db-readiness-contract-"));

  try {
    await cp(fixtureRoot, targetRoot, { recursive: true });
    await syncProject({ projectRoot: targetRoot });

    const response = await evaluateProjectReadiness({
      projectRoot: targetRoot,
      request: {
        protocol_version: "2.0",
        operation: "evaluate_readiness",
        goal: {
          type: "beta_readiness",
          target: "project",
          question: "Is this fixture ready for beta testing?"
        }
      }
    });

    validateEvaluateReadinessResponse(response);
    assert.equal(response.status, "error");
    assert.equal(response.opinion.verdict, "unknown");
    assert.equal(response.meta.error_kind, "contract_mismatch");
    assert.equal(response.gaps.some((item) => /unsupported protocol version/i.test(item)), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
