import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { withWorkflowStore } from "aiwf-common-core/services/sync";
import { registerProvider } from "aiwf-common-core/services/providers";
import { executeCodelet } from "aiwf-common-core/services/codelet-executor";
import { CoreLLM } from "aiwf-common-core/services/core-llm";
import { ExecutionMode } from "aiwf-common-core/services/execution-context";
import { run as runCoreSmartCodelet } from "aiwf-common-core/codelets/smart-codelet-runner";
import { runSmartCodelet } from "../aiwf-shell/runtime/scripts/ai-workflow/smart-codelet-runner.ts";
import { buildWorkflowAuditSummary } from "aiwf-common-core/lib/workflow-audit-report";
import { SHELL_TRUST_BENCHMARK_SUITE_ID } from "aiwf-common-core/shared/prompts/shell-trust-benchmark.ts";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runNode(args, options = {}) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), ...args],
      { ...options, maxBuffer: 8 * 1024 * 1024 }
    );
    return {
      code: 0,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? "")
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? "")
    };
  }
}


test("ai-workflow list reports built-in codelets", { concurrency: false }, async () => {
  const result = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "list", "--json"]);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(Array.isArray(payload.toolkitCodelets), true);
  assert.equal(payload.toolkitCodelets.some((item) => item.id === "sync"), true);
  assert.equal(payload.toolkitCodelets.some((item) => item.id === "css-refactor"), true);
  assert.equal(payload.toolkitCodelets.some((item) => item.id === "refactor-ticket"), true);
  assert.equal(payload.toolkitCodelets.some((item) => item.id === "codelet-observer"), true);
});

test("ai-workflow project codelet queries read from the DB registry", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-codelet-registry-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const listResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "list", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(listResult.code, 0);
    const listPayload = JSON.parse(listResult.stdout);
    assert.equal(Array.isArray(listPayload), true);
    assert.equal(listPayload.some((item) => item.id === "sync"), true);

    const showResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "show", "doctor", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(showResult.code, 0);
    const showPayload = JSON.parse(showResult.stdout);
    assert.equal(showPayload.id, "doctor");
    assert.equal(showPayload.backing.status, "builtin");

    const searchResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "search", "refactor", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(searchResult.code, 0);
    const searchPayload = JSON.parse(searchResult.stdout);
    assert.equal(searchPayload.some((item) => item.id === "refactor-ticket"), true);

    const debugSearchResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "search", "debug", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(debugSearchResult.code, 0, debugSearchResult.stderr || debugSearchResult.stdout);
    const debugSearchPayload = JSON.parse(debugSearchResult.stdout);
    assert.equal(debugSearchPayload.some((item) => item.id === "debug-code"), true);

    const assessSearchResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "search", "assess", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(assessSearchResult.code, 0, assessSearchResult.stderr || assessSearchResult.stdout);
    const assessSearchPayload = JSON.parse(assessSearchResult.stdout);
    assert.equal(assessSearchPayload.some((item) => item.id === "assess-code"), true);

    const generateSearchResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "search", "generate code", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(generateSearchResult.code, 0, generateSearchResult.stderr || generateSearchResult.stdout);
    const generateSearchPayload = JSON.parse(generateSearchResult.stdout);
    assert.equal(generateSearchPayload.some((item) => item.id === "generate-code"), true);

    const enforceSearchResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "search", "enforce", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(enforceSearchResult.code, 0, enforceSearchResult.stderr || enforceSearchResult.stdout);
    const enforceSearchPayload = JSON.parse(enforceSearchResult.stdout);
    assert.equal(enforceSearchPayload.some((item) => item.id === "guideline-enforcer"), true);

    const showSearchResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "show", "search", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(showSearchResult.code, 0, showSearchResult.stderr || showSearchResult.stdout);
    const showSearchPayload = JSON.parse(showSearchResult.stdout);
    assert.equal(showSearchPayload.id, "search");
    assert.equal(showSearchPayload.backing.exists, true);

    const showExecuteResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "codelet", "show", "execute-ticket", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(showExecuteResult.code, 0, showExecuteResult.stderr || showExecuteResult.stdout);
    const showExecutePayload = JSON.parse(showExecuteResult.stdout);
    assert.equal(showExecutePayload.canMutate, true);
    assert.equal(showExecutePayload.inputSchema.required.includes("ticketId"), true);
    assert.equal(showExecutePayload.toolPolicy.requiresApplyFlag, true);
    assert.equal(showExecutePayload.graderId, "ticket-execution-v1");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow extract ticket works through the source CLI entrypoint", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-extract-ticket-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const summaryResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "summary", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(summaryResult.code, 0, summaryResult.stderr || summaryResult.stdout);
    const summary = JSON.parse(summaryResult.stdout);
    const ticketId = summary.activeTickets?.[0]?.id;
    assert.equal(typeof ticketId, "string");

    const extractResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "extract", "ticket", ticketId, "--json"],
      { cwd: targetRoot }
    );
    assert.equal(extractResult.code, 0, extractResult.stderr || extractResult.stdout);
    const payload = JSON.parse(extractResult.stdout);
    assert.equal(payload.ticketId, ticketId);
    assert.equal(Array.isArray(payload.workingSet?.files), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});


test("ai-workflow project note resolve updates note status in the workflow DB", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-note-resolve-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const addResult = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "note",
        "add",
        "--type",
        "RISK",
        "--body",
        "stale audit note should be explicitly retired",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(addResult.code, 0, addResult.stderr || addResult.stdout);
    const note = JSON.parse(addResult.stdout);

    const resolveResult = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "note",
        "resolve",
        note.id,
        "--reason",
        "superseded by fresh audit evidence",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(resolveResult.code, 0, resolveResult.stderr || resolveResult.stdout);
    const resolved = JSON.parse(resolveResult.stdout);
    assert.equal(resolved.status, "resolved");

    await withWorkflowStore(targetRoot, async (store) => {
      assert.equal(store.getNoteById(note.id)?.status, "resolved");
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow doctor reports local diagnostics and ollama absence cleanly", { concurrency: false }, async () => {
  const result = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "doctor", "--json"]);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(typeof payload.cwd, "string");
  assert.equal(typeof payload.ollama, "object");
  assert.equal(typeof payload.leanCtx, "object");
  assert.equal(payload.leanCtx.installed, true);
});

test("ai-workflow doctor text tells the operator the expected local Ollama host and setup command", { concurrency: false }, async () => {
  const result = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "doctor"]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ollama expected shell host: http:\/\/127\.0\.0\.1:11434/);
  assert.match(result.stdout, /ollama (setup|reachability) hint:/);
});

test("workflow-audit shared report builder and CLI JSON stay aligned", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-audit-json-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await runNode([path.join(repoRoot, "aiwf-shell", "runtime", "scripts", "ai-workflow", "dogfood.ts"), "--root", targetRoot]);
    const summary = await buildWorkflowAuditSummary(targetRoot);
    assert.equal(summary.status, "pass");
    assert.deepEqual(summary.failures, []);

    const result = await runNode(
      [path.join(repoRoot, "aiwf-shell", "runtime", "scripts", "ai-workflow", "workflow-audit.ts"), "--json", "--root", targetRoot],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.status, "pass");
    assert.deepEqual(payload.failures, []);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow-audit fails full shell dogfood reports that omit the shell trust benchmark", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-audit-shell-benchmark-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, "cli", "lib"), { recursive: true });
    await writeFile(path.join(targetRoot, "cli", "lib", "shell.ts"), "export const shell = true;\n", "utf8");
    const reportPath = path.join(targetRoot, ".ai-workflow", "generated", "dogfood-report.json");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    report.profile = "full";
    report.surfaces.shell = report.surfaces.shell ?? {
      description: "Interactive shell surface",
      fileCount: 1,
      files: ["cli/lib/shell.ts"],
      fileHashes: {},
      status: "pass",
      scenarios: [
        {
          id: "doctor-command",
          description: "shell handles doctor locally",
          ok: true,
          code: 0,
          stdout: "{}",
          stderr: ""
        }
      ]
    };
    report.surfaces.shell.scenarioCount = report.surfaces.shell.scenarios.length;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    const summary = await buildWorkflowAuditSummary(targetRoot);
    assert.equal(Array.isArray(summary.findings), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow can extract a ticket and build a context pack for an initialized repo", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smoke-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    
    const ticketResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "extract", "ticket", "TKT-001"],
      { cwd: targetRoot }
    );
    assert.equal(ticketResult.code, 0);
    assert.match(ticketResult.stdout, /TKT-001/);

    const contextResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "context-pack", "--ticket", "TKT-001"],
      { cwd: targetRoot }
    );
    assert.equal(contextResult.code, 0);
    assert.match(contextResult.stdout, /TKT-001/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow ticket helpers prefer the discovered real kanban source over stale root kanban", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-real-kanban-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await writeFile(
      path.join(targetRoot, "docs", "kanban.md"),
      [
        "# Kanban",
        "",
        "## In Progress",
        "- [ ] **REF-APP-SHELL-01**: Continue app-shell and modal-surface refactor hardening after review findings.",
        "  - Outcome: restore overlay handling and deep-link routing",
        "",
        "## Priority 1 Bugs",
        "- [ ] **BUG-OVERLAY-01**: Restore global overlay handling for non-dialog modals after the app-shell refactor."
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      path.join(targetRoot, "kanban.md"),
      [
        "# Kanban",
        "",
        "## Todo",
        "- [ ] TKT-001 Replace this example ticket"
      ].join("\n"),
      "utf8"
    );

    const syncResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(syncResult.code, 0);

    const ticketResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "extract", "ticket", "REF-APP-SHELL-01", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(ticketResult.code, 0);
    const ticketPayload = JSON.parse(ticketResult.stdout);
    assert.equal(ticketPayload.ticket?.id, "REF-APP-SHELL-01");
    assert.equal(ticketPayload.ticket?.section, "In Progress");
    assert.match(ticketPayload.ticket?.body ?? "", /Outcome: restore overlay handling/i);

    const contextResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "context-pack", "--ticket", "REF-APP-SHELL-01", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(contextResult.code, 0);
    const contextPayload = JSON.parse(contextResult.stdout);
    assert.equal(contextPayload.ticket.id, "REF-APP-SHELL-01");
    assert.equal(contextPayload.ticket.section, "In Progress");
    assert.equal(contextPayload.ticketSourcePath, "docs/kanban.md");
    assert.equal(Array.isArray(contextPayload.workingSet), true);
    assert.equal(contextPayload.workingSet.length > 0, true);
    assert.equal(Array.isArray(contextPayload.relevantSymbols), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow config set rejects shell-channel execution", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-shell-channel-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const result = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "config", "set", "workflow.mode", "tool-dev"],
      {
        cwd: targetRoot,
        env: {
          ...process.env,
          AIWF_COMMAND_CHANNEL: "shell"
        }
      }
    );

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /regular ai-workflow CLI/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow kanban new rejects shell-channel execution", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-kanban-shell-channel-"));

  try {
    const result = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "scripts", "ai-workflow", "kanban.ts"),
        "new",
        "--root",
        targetRoot,
        "--id",
        "TKT-001",
        "--title",
        "Channel guard regression",
        "--to",
        "Todo"
      ],
      {
        env: {
          ...process.env,
          AIWF_COMMAND_CHANNEL: "shell"
        }
      }
    );

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /regular ai-workflow CLI/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow project epic and story commands query the DB with heading-based epics", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-epic-query-"));

  try {
    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "## EPC-200 Direct edit reconciliation",
      "",
      "### Goal",
      "",
      "Keep file projections honest without flattening the narrative.",
      "",
      "### User stories",
      "",
      "#### Story 1",
      "",
      "As a user, I can edit epics.md or kanban.md directly and have ai-workflow detect drift before it overwrites my change.",
      "",
      "#### Story 2",
      "",
      "As a maintainer, I can reconcile missing or deleted DB entities from a file edit without losing the author’s intent.",
      "",
      "### Ticket batches",
      "",
      "- Detect file/DB drift and preview the delta.",
      "- Create, update, or delete DB entities from explicit user edits.",
      "",
      "### Kanban tickets",
      "",
      "- none linked yet"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Todo",
      "",
      "- [ ] TKT-200 Wire direct-edit reconciliation",
      "  - Epic: EPC-200",
      "  - Story: As a user, I can edit epics.md or kanban.md directly and have ai-workflow detect drift before it overwrites my change."
    ].join("\n"), "utf8");

    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const epicList = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "epic", "list", "--json"], { cwd: targetRoot });
    assert.equal(epicList.code, 0, epicList.stderr || epicList.stdout);
    const epics = JSON.parse(epicList.stdout);
    assert.equal(epics.some((item) => item.id === "EPC-200"), true);

    const epicShow = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "epic", "show", "EPC-200", "--json"], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.userStories.length, 2);
    assert.match(epic.userStories[0], /edit epics\.md or kanban\.md directly/i);

    const storySearch = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "story", "search", "drift", "--epic", "EPC-200", "--json"], { cwd: targetRoot });
    assert.equal(storySearch.code, 0, storySearch.stderr || storySearch.stdout);
    const stories = JSON.parse(storySearch.stdout);
    assert.equal(stories[0]?.epic.id, "EPC-200");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow sync auto-archives epics whose linked tickets are already done", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-epic-archive-"));

  try {
    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "## EPC-201 Complete the graph backlog",
      "",
      "### Goal",
      "",
      "Close out a finished epic once its linked work is done.",
      "",
      "### User stories",
      "",
      "#### Story 1",
      "",
      "**As a maintainer**, I can see a completed epic auto-archive when its only linked ticket is already done.",
      "",
      "### Ticket batches",
      "",
      "- Archive completed epic state after linked ticket completion.",
      "",
      "### Kanban tickets",
      "",
      "- none linked yet"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Done",
      "",
      "- [ ] EXE-201 Close the graph backlog",
      "  - Epic: EPC-201",
      "  - Summary: Complete the semantic graph backlog and mark the epic archived."
    ].join("\n"), "utf8");

    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const epicShow = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "epic", "show", "EPC-201", "--json"], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.state, "archived");

    const epicsMarkdown = await readFile(path.join(targetRoot, "epics.md"), "utf8");
    assert.match(epicsMarkdown, /<!-- status: archived -->/);
    assert.match(epicsMarkdown, /\[x\] Archived/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow sync keeps unchanged generated projections stable on repeated runs", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-projection-stable-"));

  try {
    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "## EPC-201 Complete the graph backlog",
      "",
      "### Goal",
      "",
      "Close out a finished epic once its linked work is done.",
      "",
      "### Status",
      "",
      "- [x] Archived",
      "<!-- status: archived -->",
      "",
      "### User stories",
      "",
      "#### Story 1",
      "",
      "**As a maintainer**, I can see a completed epic auto-archive when its only linked ticket is already done.",
      "",
      "### Ticket batches",
      "",
      "- Archive completed epic state after linked ticket completion.",
      "",
      "### Kanban tickets",
      "",
      "- EXE-201 Close the graph backlog [Done]"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Done",
      "",
      "- [ ] EXE-201 Close the graph backlog ✅ 2026-04-04",
      "  - Epic: EPC-201",
      "  - Summary: Complete the semantic graph backlog and mark the epic archived."
    ].join("\n"), "utf8");

    const firstSync = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(firstSync.code, 0, firstSync.stderr || firstSync.stdout);

    const secondSync = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(secondSync.code, 0, secondSync.stderr || secondSync.stdout);

    const epicShow = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "epic", "show", "EPC-201", "--json"], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.state, "archived");

    const kanbanText = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanbanText, /EXE-201 Close the graph backlog/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow sync keeps unchanged generated epics stable on repeated runs", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-epic-stable-"));

  try {
    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "## EPC-201 Complete the graph backlog",
      "",
      "### Goal",
      "",
      "Close out a finished epic once its linked work is done.",
      "",
      "### Status",
      "",
      "- [x] Archived",
      "<!-- status: archived -->",
      "",
      "### User stories",
      "",
      "#### Story 1",
      "",
      "**As a maintainer**, I can see a completed epic auto-archive when its only linked ticket is already done.",
      "",
      "### Ticket batches",
      "",
      "- Archive completed epic state after linked ticket completion.",
      "",
      "### Kanban tickets",
      "",
      "- EXE-201 Close the graph backlog [Done]"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Done",
      "",
      "- [ ] EXE-201 Close the graph backlog ✅ 2026-04-04",
      "  - Epic: EPC-201",
      "  - Summary: Complete the semantic graph backlog and mark the epic archived."
    ].join("\n"), "utf8");

    const firstSync = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(firstSync.code, 0, firstSync.stderr || firstSync.stdout);

    const secondSync = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(secondSync.code, 0, secondSync.stderr || secondSync.stdout);

    const epicShow = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "epic", "show", "EPC-201", "--json"], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.state, "archived");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow project ticket create preserves an existing epic narrative", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-ticket-epic-preserve-"));

  try {
    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "## EPC-202 Preserve the epic narrative",
      "",
      "### Goal",
      "",
      "Keep the original epic title and summary when later tickets are added.",
      "",
      "### User stories",
      "",
      "#### Story 1",
      "",
      "**As a maintainer**, I can add a ticket to an existing epic without ai-workflow overwriting the epic title or summary.",
      "",
      "### Ticket batches",
      "",
      "- Preserve the existing epic record when creating a ticket.",
      "",
      "### Kanban tickets",
      "",
      "- none linked yet"
    ].join("\n"), "utf8");
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## ToDo",
      "",
      "- No items"
    ].join("\n"), "utf8");

    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const createResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "EXE-202",
      "--title",
      "Preserve the epic narrative",
      "--lane",
      "Done",
      "--epic",
      "EPC-202",
      "--summary",
      "Add a ticket without mutating the existing epic."
    ], { cwd: targetRoot });
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);

    const epicShow = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "project", "epic", "show", "EPC-202", "--json"], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.title, "Preserve the epic narrative");
    assert.match(epic.summary, /keep the original epic title and summary/i);
    assert.equal(epic.userStories.length, 1);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow sync reimports a manual epic edit after generated projections already exist", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-epic-reimport-"));

  try {
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## ToDo\n\n- No items\n", "utf8");

    const initialSync = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "sync",
      "--write-projections",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(initialSync.code, 0, initialSync.stderr || initialSync.stdout);

    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "_Generated from the workflow DB._",
      "",
      "## EPIC-RESTORE-001 Restore manually edited epics",
      "",
      "### Goal",
      "",
      "Preserve manual epic edits by importing them before projection rewrites.",
      "",
      "### Status",
      "",
      "- [ ] Active",
      "<!-- status: open -->",
      "",
      "### User stories",
      "#### Story 1",
      "",
      "**As a maintainer**, I can edit epics.md directly and have sync preserve the narrative instead of deleting it.",
      "",
      "### Ticket batches",
      "- Reconcile projection drift before rewrite.",
      "",
      "### Kanban tickets",
      "- none linked yet",
      ""
    ].join("\n"), "utf8");

    const resync = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "sync",
      "--write-projections",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(resync.code, 0, resync.stderr || resync.stdout);
    const resyncPayload = JSON.parse(resync.stdout);
    assert.equal(resyncPayload.importSummary.importedEpics, 1);

    const epicShow = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "epic",
      "show",
      "EPIC-RESTORE-001",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.title, "Restore manually edited epics");
    assert.match(epic.summary, /preserve manual epic edits/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow project ticket create imports a file-only epic before rewriting projections", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-ticket-import-epic-"));

  try {
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## ToDo\n\n- No items\n", "utf8");

    const initialSync = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "sync",
      "--write-projections",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(initialSync.code, 0, initialSync.stderr || initialSync.stdout);

    await writeFile(path.join(targetRoot, "epics.md"), [
      "# Epics",
      "",
      "_Generated from the workflow DB._",
      "",
      "## EPIC-RESTORE-002 Preserve file-only epic narrative",
      "",
      "### Goal",
      "",
      "Keep the original epic title and summary even if the DB has not imported the edit yet.",
      "",
      "### User stories",
      "",
      "#### Story 1",
      "",
      "**As a maintainer**, I can create a linked ticket without flattening a manual epic edit into a stub ID-only epic.",
      "",
      "### Ticket batches",
      "",
      "- Import projection edits before write.",
      "",
      "### Kanban tickets",
      "",
      "- none linked yet",
      ""
    ].join("\n"), "utf8");

    const createResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "EXE-RESTORE-002",
      "--title",
      "Preserve file-only epic narrative",
      "--lane",
      "Done",
      "--epic",
      "EPIC-RESTORE-002",
      "--summary",
      "Create a linked ticket without wiping the manual epic."
    ], { cwd: targetRoot });
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);

    const epicShow = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "epic",
      "show",
      "EPIC-RESTORE-002",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(epicShow.code, 0, epicShow.stderr || epicShow.stdout);
    const epic = JSON.parse(epicShow.stdout);
    assert.equal(epic.title, "Preserve file-only epic narrative");
    assert.match(epic.summary, /keep the original epic title and summary/i);
    assert.equal(epic.userStories.length, 1);

    const epicsMarkdown = await readFile(path.join(targetRoot, "epics.md"), "utf8");
    assert.match(epicsMarkdown, /EPIC-RESTORE-002 Preserve file-only epic narrative/);
    assert.match(epicsMarkdown, /Import projection edits before write\./);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow project ticket create defaults BUG tickets into Bugs P2/P3", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-ticket-bug-lane-"));

  try {
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## ToDo\n\n- No items\n", "utf8");
    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const createResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "BUG-SHELL-900",
      "--title",
      "Keep bug work in the dedicated bug lane",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);
    const ticket = JSON.parse(createResult.stdout);
    assert.equal(ticket.lane, "Bugs P2/P3");

    const projection = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(projection, /## Bugs P2\/P3/);
    assert.match(projection, /BUG-SHELL-900 Keep bug work in the dedicated bug lane/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow project ticket resolve and reopen reconcile projections and summaries", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-ticket-lifecycle-"));

  try {
    await writeFile(path.join(targetRoot, "kanban.md"), "# Kanban\n\n## ToDo\n\n- No items\n", "utf8");
    const syncResult = await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--write-projections", "--json"], { cwd: targetRoot });
    assert.equal(syncResult.code, 0, syncResult.stderr || syncResult.stdout);

    const createResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "BUG-LC-001",
      "--title",
      "Resolve and reopen lifecycle ticket",
      "--lane",
      "Bugs P1",
      "--summary",
      "Exercise lifecycle reconciliation."
    ], { cwd: targetRoot });
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);

    const resolveResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "resolve",
      "BUG-LC-001",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(resolveResult.code, 0, resolveResult.stderr || resolveResult.stdout);
    const resolved = JSON.parse(resolveResult.stdout);
    assert.equal(resolved.id, "BUG-LC-001");
    assert.equal(resolved.lane, "Done");
    assert.equal(resolved.state, "archived");
    assert.equal(resolved.data.previousLane, "Bugs P1");
    assert.match(String(resolved.data.completedAt), /^\d{4}-\d{2}-\d{2}$/);

    const summaryAfterResolve = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "summary",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(summaryAfterResolve.code, 0, summaryAfterResolve.stderr || summaryAfterResolve.stdout);
    const resolvedSummary = JSON.parse(summaryAfterResolve.stdout);
    assert.equal(resolvedSummary.activeTickets.some((ticket) => ticket.id === "BUG-LC-001"), false);

    const kanbanAfterResolve = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanbanAfterResolve, /## Done/);
    assert.match(kanbanAfterResolve, /BUG-LC-001 Resolve and reopen lifecycle ticket ✅ \d{4}-\d{2}-\d{2}/);

    const reopenResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "reopen",
      "BUG-LC-001",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(reopenResult.code, 0, reopenResult.stderr || reopenResult.stdout);
    const reopened = JSON.parse(reopenResult.stdout);
    assert.equal(reopened.id, "BUG-LC-001");
    assert.equal(reopened.lane, "Bugs P1");
    assert.equal(reopened.state, "open");
    assert.equal(Object.hasOwn(reopened.data, "completedAt"), false);

    const summaryAfterReopen = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "summary",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(summaryAfterReopen.code, 0, summaryAfterReopen.stderr || summaryAfterReopen.stdout);
    const reopenedSummary = JSON.parse(summaryAfterReopen.stdout);
    assert.equal(reopenedSummary.activeTickets.some((ticket) => ticket.id === "BUG-LC-001" && ticket.lane === "Bugs P1"), true);
    const kanbanAfterReopen = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanbanAfterReopen, /## Bugs P1/);
    assert.match(kanbanAfterReopen, /BUG-LC-001 Resolve and reopen lifecycle ticket/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("smart codelet observer routes through the provider and documents candidate patterns", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        "mock-smart": {
          apiKey: "test-key",
          models: ["smart-v1"]
        }
      }
    }, null, 2), "utf8");

    registerProvider("mock-smart", {
      generate: async ({ modelId, prompt }) => {
        assert.equal(modelId, "smart-v1");
        assert.match(prompt, /Codelet id: codelet-observer/);
        return {
          providerId: "mock-smart",
          modelId,
          response: JSON.stringify({
            summary: "Recurring refactor and docs work should become explicit codelets.",
            observations: ["The project keeps surfacing the same refactor families."],
            candidate_codelets: [
              { id: "css-refactor", reason: "Frequent CSS cleanup patterns" },
              { id: "docs-refresh", reason: "Workflow docs keep needing refreshes" }
            ],
            suggested_actions: ["Promote css-refactor and docs-refresh as standard built-ins."],
            docs_to_update: ["epics.md", "knowledge.md"],
            needs_human_review: true
          })
        };
      }
    });

    const payload = await runSmartCodelet(
      ["--root", targetRoot, "--provider", "mock-smart", "--model", "smart-v1", "--json"],
      { AIWF_CODELET_ID: "codelet-observer" }
    );
    assert.equal(payload.codelet.id, "codelet-observer");
    assert.equal(payload.route.recommended.providerId, "mock-smart");
    assert.equal(payload.result.summary, "Recurring refactor and docs work should become explicit codelets.");

    const notes = await withWorkflowStore(targetRoot, async (store) => store.listNotes({ noteTypes: ["NOTE"] }));
    assert.equal(notes.some((note) => note.provenance === "tool-dev-codelet-observer"), true);
    assert.equal(notes.some((note) => /css-refactor/.test(note.body)), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("smart codelet runner resolves a project-registered codelet from the workflow registry", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-registry-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "story-snap.json"), JSON.stringify({
      id: "story-snap",
      stability: "staged",
      category: "documentation",
      summary: "Generate a compact story summary from the current project state.",
      runner: "node-script",
      entry: "aiwf-shell/runtime/scripts/ai-workflow/smart-codelet-runner.ts",
      status: "staged"
    }, null, 2), "utf8");

    await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });

    registerProvider("mock-smart-registry", {
      generate: async ({ modelId, prompt }) => {
        assert.equal(modelId, "smart-v1");
        assert.match(prompt, /Codelet id: story-snap/);
        assert.match(prompt, /Purpose: Generate a compact story summary from the current project state\./);
        return {
          providerId: "mock-smart-registry",
          modelId,
          response: JSON.stringify({
            summary: "Registry-backed smart codelets work without hard-coded runner branches.",
            observations: ["The helper resolved the project codelet from the synced registry."],
            candidate_codelets: [],
            suggested_actions: [],
            docs_to_update: [],
            needs_human_review: false
          })
        };
      }
    });

    const payload = await runSmartCodelet(
      ["--root", targetRoot, "--provider", "mock-smart-registry", "--model", "smart-v1", "--json"],
      { AIWF_CODELET_ID: "story-snap" }
    );
    assert.equal(payload.codelet.id, "story-snap");
    assert.equal(payload.codelet.summary, "Generate a compact story summary from the current project state.");
    assert.equal(payload.route.recommended.providerId, "mock-smart-registry");
    assert.equal(payload.result.summary, "Registry-backed smart codelets work without hard-coded runner branches.");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("smart codelet runner falls back when the first routed provider fails", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-fallback-"));
  const primaryProviderId = `mock-smart-primary-${Date.now()}`;
  const fallbackProviderId = `mock-smart-fallback-${Date.now()}`;

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        [primaryProviderId]: {
          apiKey: "primary-key",
          models: ["smart-v1"]
        },
        [fallbackProviderId]: {
          apiKey: "fallback-key",
          models: ["smart-v2"]
        },
        openai: {
          enabled: false
        },
        anthropic: {
          enabled: false
        },
        google: {
          enabled: false
        },
        ollama: {
          enabled: false
        }
      }
    }, null, 2), "utf8");

    registerProvider(primaryProviderId, {
      generate: async () => {
        throw new Error("Gemini API key is blocked for Generative Language API.");
      }
    });
    registerProvider(fallbackProviderId, {
      generate: async ({ modelId, prompt }) => {
        assert.equal(modelId, "smart-v2");
        assert.match(prompt, /Codelet id: codelet-observer/);
        return {
          providerId: fallbackProviderId,
          modelId,
          response: JSON.stringify({
            summary: "Fallback smart codelet route succeeded.",
            observations: ["The runner retried the next routed provider."],
            candidate_codelets: [],
            suggested_actions: ["Keep route diagnostics in the final payload."],
            docs_to_update: [],
            needs_human_review: false
          })
        };
      }
    });

    const payload = await runSmartCodelet(
      ["--root", targetRoot, "--provider", primaryProviderId, "--model", "smart-v1", "--json"],
      { AIWF_CODELET_ID: "codelet-observer" }
    );

    assert.equal(payload.result.summary, "Fallback smart codelet route succeeded.");
    assert.equal(payload.diagnostics.failedAttempts, 1);
    assert.equal(payload.diagnostics.successfulProviderId, fallbackProviderId);
    assert.equal(payload.route.providers[primaryProviderId].apiKey, "[redacted]");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("smart codelet runner validates typed outputs, retries with critic feedback, and reports metrics", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-contract-"));
  const providerId = `mock-smart-contract-${Date.now()}`;
  let callCount = 0;

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "contract-review.json"), JSON.stringify({
      id: "contract-review",
      stability: "staged",
      category: "review",
      summary: "Review code with a typed contract.",
      runner: "node-script",
      entry: "aiwf-shell/runtime/scripts/ai-workflow/smart-codelet-runner.ts",
      status: "staged",
      focus: "typed code review",
      taskClass: "review",
      inputSchema: {
        type: "object",
        required: ["goal"]
      },
      outputSchema: {
        type: "object",
        required: ["summary", "observations", "suggested_actions"]
      },
      contextPolicy: {
        mode: "graph-backed-surgical"
      },
      toolPolicy: {
        canWriteFiles: false
      },
      graderId: "review-contract-v1",
      maxRetries: 2,
      canMutate: false
    }, null, 2), "utf8");

    await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        [providerId]: {
          apiKey: "contract-key",
          models: ["smart-v1"]
        },
        openai: { enabled: false },
        anthropic: { enabled: false },
        google: { enabled: false },
        ollama: { enabled: false }
      }
    }, null, 2), "utf8");

    registerProvider(providerId, {
      generate: async ({ modelId, prompt }) => {
        callCount += 1;
        assert.equal(modelId, "smart-v1");
        assert.match(prompt, /Context policy: \{"mode":"graph-backed-surgical"\}/);
        assert.match(prompt, /Tool policy:/);
        assert.match(prompt, /Grader: review-contract-v1/);
        assert.match(prompt, /Required fields: summary, observations, suggested_actions\./);
        assert.match(prompt, /Field types: summary:any, observations:any, suggested_actions:any\./);
        if (!/Previous response was invalid: output missing required field 'observations'/.test(prompt)) {
          return {
            providerId,
            modelId,
            response: JSON.stringify({ summary: "Missing required arrays." }),
            usage: { promptTokens: 11, completionTokens: 3, totalTokens: 14 }
          };
        }
        const fencedResponse = JSON.stringify({
          summary: "Typed retry succeeded.",
          observations: ["The runner enforced the output contract."],
          suggested_actions: ["Keep schema validation enabled."],
          candidate_codelets: [],
          docs_to_update: [],
          needs_human_review: false
        });
        return {
          providerId,
          modelId,
          response: `\`\`\`json\n${fencedResponse}\n\`\`\``,
          usage: { promptTokens: 13, completionTokens: 5, totalTokens: 18 }
        };
      }
    });

    const payload = await runSmartCodelet(
      ["--root", targetRoot, "--provider", providerId, "--model", "smart-v1", "--goal", "review typed runner", "--json"],
      { AIWF_CODELET_ID: "contract-review" }
    );

    assert.equal(payload.result.summary, "Typed retry succeeded.");
    assert.equal(payload.diagnostics.validationRetries, 1);
    assert.equal(payload.diagnostics.attemptCount, 2);
    assert.equal(payload.diagnostics.usage.totalTokens, 32);
    assert.equal(payload.diagnostics.validationErrors[0], "output missing required field 'observations'");
    assert.equal(payload.route.providers[providerId].apiKey, "[redacted]");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("capture-mode TS codelet execution uses tsx instead of native strip-only import", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-codelet-capture-"));
  const scriptPath = path.join(targetRoot, "strip-only-probe.ts");

  try {
    await writeFile(scriptPath, [
      "enum ProbeMode { Ok = \"ok\" }",
      "process.stdout.write(JSON.stringify({ mode: ProbeMode.Ok, args: process.argv.slice(2) }) + \"\\n\");"
    ].join("\n"), "utf8");

    const output = await executeCodelet({
      id: "strip-only-probe",
      runner: "node-script",
      execution: "js",
      entryPath: scriptPath
    }, ["--flag", "value"], { cwd: targetRoot, mode: "capture" });
    const payload = JSON.parse(String(output).trim());

    assert.equal(payload.mode, "ok");
    assert.deepEqual(payload.args, ["--flag", "value"]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("CoreLLM uses ExecutionMode as a runtime value for skill prompts", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-core-llm-"));
  const providerId = `mock-core-llm-${Date.now()}`;
  let receivedSystem = null;

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await writeFile(path.join(targetRoot, ".ai-workflow", "config.json"), JSON.stringify({
      providers: {
        [providerId]: {
          apiKey: "core-key",
          models: ["core-v1"]
        },
        openai: { enabled: false },
        anthropic: { enabled: false },
        google: { enabled: false },
        ollama: { enabled: false }
      }
    }, null, 2), "utf8");
    registerProvider(providerId, {
      generate: async ({ modelId, system }) => {
        receivedSystem = system;
        return { providerId, modelId, response: JSON.stringify({ ok: true }) };
      }
    });

    const llm = new CoreLLM({ projectRoot: targetRoot, mode: ExecutionMode.Skill });
    const result = await llm.generate("return json", { taskClass: "logic" });

    assert.equal(result.providerId, providerId);
    assert.match(String(receivedSystem), /Parent AI Agent/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ServiceHub smart runner honors the requested codelet id", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-id-"));
  let receivedPrompt = "";

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "target-debug.json"), JSON.stringify({
      id: "target-debug",
      stability: "staged",
      category: "debugging",
      summary: "Target-specific debug codelet.",
      runner: "node-script",
      entry: "aiwf-shell/scripts/ai-workflow/smart-codelet-runner.ts",
      status: "staged",
      taskClass: "bug-hunting",
      inputSchema: {
        type: "object",
        required: ["goal"]
      },
      outputSchema: {
        type: "object",
        required: ["summary", "observations", "suggested_actions"]
      }
    }, null, 2), "utf8");
    await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });

    const payload = await runCoreSmartCodelet({
      codelet: "target-debug",
      goal: "debug target id propagation"
    }, {
      context: { projectRoot: targetRoot },
      resolve: () => ({
        generate: async (prompt) => {
          receivedPrompt = prompt;
          const response = JSON.stringify({
            summary: "Target id preserved.",
            observations: ["The runner used the requested codelet id."],
            suggested_actions: []
          });
          return {
            response: `\`\`\`json\n${response}\n\`\`\``,
            providerId: "mock",
            modelId: "mock",
            usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 }
          };
        }
      })
    });

    assert.equal(payload.codelet.id, "target-debug");
    assert.equal(payload.diagnostics.attempts, 1);
    assert.equal(payload.diagnostics.usage.totalTokens, 10);
    assert.equal(payload.diagnostics.validationRetries, 0);
    assert.equal(Number.isFinite(payload.diagnostics.latencyMs), true);
    assert.match(receivedPrompt, /Codelet id: target-debug/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ServiceHub smart runner rejects shallow guideline enforcement output", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-enforce-"));
  let callCount = 0;

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "enforce-contract.json"), JSON.stringify({
      id: "enforce-contract",
      stability: "staged",
      category: "governance",
      summary: "Enforce guideline contract.",
      runner: "node-script",
      entry: "aiwf-shell/scripts/ai-workflow/smart-codelet-runner.ts",
      status: "staged",
      taskClass: "review",
      inputSchema: { type: "object", required: ["goal"] },
      outputSchema: {
        type: "object",
        required: ["summary", "enforced_guardrails", "violations", "required_actions", "verification_steps"]
      },
      graderId: "guideline-enforcement-v1",
      maxRetries: 2
    }, null, 2), "utf8");
    await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });

    const payload = await runCoreSmartCodelet({
      codelet: "enforce-contract",
      goal: "enforce architecture rules"
    }, {
      context: { projectRoot: targetRoot },
      resolve: () => ({
        generate: async () => {
          callCount += 1;
          if (callCount === 1) {
            return {
              response: JSON.stringify({
                summary: "Too shallow.",
                enforced_guardrails: ["required"],
                violations: [],
                required_actions: [],
                verification_steps: []
              }),
              providerId: "mock",
              modelId: "mock"
            };
          }
          return {
            response: JSON.stringify({
              summary: "Contract enforced.",
              enforced_guardrails: [
                { guardrail: "core owns workflow truth", status: "pass", evidence: "project-guidelines.md and active guardrails context" }
              ],
              violations: [],
              required_actions: [],
              verification_steps: ["Run ai-workflow audit workflow and focused tests."]
            }),
            providerId: "mock",
            modelId: "mock"
          };
        }
      })
    });

    assert.equal(payload.result.summary, "Contract enforced.");
    assert.equal(payload.diagnostics.validationRetries, 1);
    assert.match(payload.diagnostics.validationErrors[0], /enforced_guardrails/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ServiceHub smart runner rejects hallucinated code-generation file targets", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-smart-codelet-codegen-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, ".ai-workflow", "codelets"), { recursive: true });
    await writeFile(path.join(targetRoot, ".ai-workflow", "codelets", "codegen-contract.json"), JSON.stringify({
      id: "codegen-contract",
      stability: "staged",
      category: "coding",
      summary: "Generate code with a typed contract.",
      runner: "node-script",
      entry: "aiwf-shell/scripts/ai-workflow/smart-codelet-runner.ts",
      status: "staged",
      taskClass: "feature-implementation",
      inputSchema: { type: "object", required: ["goal"] },
      outputSchema: {
        type: "object",
        required: ["summary", "files_to_change", "patch_plan", "guardrail_checks", "verification_steps"]
      },
      graderId: "code-generation-v1",
      maxRetries: 1
    }, null, 2), "utf8");
    await runNode([path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"], { cwd: targetRoot });

    const payload = await runCoreSmartCodelet({
      codelet: "codegen-contract",
      goal: "write router tests"
    }, {
      context: { projectRoot: targetRoot },
      resolve: () => ({
        generate: async () => ({
          response: JSON.stringify({
            summary: "Hallucinated plan.",
            files_to_change: ["tests/shell_router_test.py"],
            patch_plan: ["Patch missing test file."],
            guardrail_checks: ["Run guidelines."],
            verification_steps: ["Run tests."]
          }),
          providerId: "mock",
          modelId: "mock"
        })
      })
    });

    assert.equal(payload.result.degraded, true);
    assert.match(payload.diagnostics.validationErrors[0], /files_to_change/);
    assert.equal(payload.result.files_to_change[0].startsWith("unknown:"), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("workflow mutations refresh kanban and DB projections immediately", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-live-refresh-"));

  try {
    const createResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "EXE-900",
      "--title",
      "Refresh live projections after every workflow mutation",
      "--lane",
      "In Progress",
      "--epic",
      "EPC-900",
      "--summary",
      "Keep the live board and DB in sync after every state-changing command.",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);

    const kanbanAfterCreate = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanbanAfterCreate, /## In Progress/);
    assert.match(kanbanAfterCreate, /EXE-900 Refresh live projections after every workflow mutation/);

    const epicsAfterCreate = await readFile(path.join(targetRoot, "epics.md"), "utf8");
    assert.match(epicsAfterCreate, /EPC-900/);

    const moveResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "scripts", "ai-workflow", "kanban.ts"),
      "move",
      "--id",
      "EXE-900",
      "--to",
      "Done"
    ], { cwd: targetRoot });
    assert.equal(moveResult.code, 0, moveResult.stderr || moveResult.stdout);

    const kanbanAfterMove = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanbanAfterMove, /## Done/);
    assert.match(kanbanAfterMove, /EXE-900 Refresh live projections after every workflow mutation/);

    await withWorkflowStore(targetRoot, async (store) => {
      const ticket = store.getEntity("EXE-900");
      assert.equal(ticket?.lane, "Done");
      assert.equal(ticket?.state, "archived");
    });
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow kanban CLI dispatches to the working kanban script", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-kanban-cli-dispatch-"));

  try {
    const createResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "project",
      "ticket",
      "create",
      "--id",
      "EXE-901",
      "--title",
      "CLI kanban dispatch uses the stable script entrypoint",
      "--lane",
      "In Progress",
      "--epic",
      "EPC-901",
      "--summary",
      "Ensure ai-workflow kanban subcommands work from the main CLI.",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(createResult.code, 0, createResult.stderr || createResult.stdout);

    const moveResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "kanban",
      "move",
      "--id",
      "EXE-901",
      "--to",
      "Done"
    ], { cwd: targetRoot });
    assert.equal(moveResult.code, 0, moveResult.stderr || moveResult.stdout);

    const kanbanAfterMove = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    assert.match(kanbanAfterMove, /## Done/);
    assert.match(kanbanAfterMove, /EXE-901 CLI kanban dispatch uses the stable script entrypoint/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow kanban archive dispatches through the documented CLI command", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-kanban-archive-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await writeFile(path.join(targetRoot, "kanban.md"), [
      "# Kanban",
      "",
      "## Todo",
      "",
      "## Done",
      "",
      "- [ ] OLD-001 Old completed ticket ✅ 2026-05-01",
      "  - Summary: Archive me.",
      "  - State: archived",
      "",
      "- [ ] NEW-001 Recently completed ticket ✅ 2026-05-15",
      "  - Summary: Keep me.",
      "  - State: archived",
      ""
    ].join("\n"), "utf8");

    const archiveResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "kanban",
      "archive",
      "--today",
      "2026-05-16",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(archiveResult.code, 0, archiveResult.stderr || archiveResult.stdout);
    const payload = JSON.parse(archiveResult.stdout);
    assert.equal(payload.archivedCount, 1);
    assert.equal(payload.archived[0].id, "OLD-001");

    const kanbanAfterArchive = await readFile(path.join(targetRoot, "kanban.md"), "utf8");
    const archiveAfterArchive = await readFile(path.join(targetRoot, "kanban-archive.md"), "utf8");
    assert.doesNotMatch(kanbanAfterArchive, /OLD-001 Old completed ticket/);
    assert.match(kanbanAfterArchive, /NEW-001 Recently completed ticket/);
    assert.match(archiveAfterArchive, /OLD-001 Old completed ticket/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow route --json redacts provider credentials", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-route-redaction-"));

  try {
    await mkdir(path.join(targetRoot, ".ai-workflow"), { recursive: true });
    await writeFile(
      path.join(targetRoot, ".ai-workflow", "config.json"),
      JSON.stringify({
        providers: {
          google: {
            apiKey: "g-key",
            models: ["gemini-2.0-pro-exp"]
          },
          openai: {
            apiKey: "o-key",
            models: ["gpt-4o"]
          }
        }
      }, null, 2),
      "utf8"
    );

    const routeResult = await runNode([
      path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
      "route",
      "shell-planning",
      "--json"
    ], { cwd: targetRoot });
    assert.equal(routeResult.code, 0, routeResult.stderr || routeResult.stdout);
    const payload = JSON.parse(routeResult.stdout);
    assert.equal(payload.providers.google.apiKey, "[redacted]");
    assert.equal(payload.providers.openai.apiKey, "[redacted]");
    assert.equal(payload.recommended?.apiKey, "[redacted]");
    assert.equal(
      Array.isArray(payload.candidates) && payload.candidates.every((candidate) => candidate.apiKey === "[redacted]"),
      true
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow ticket proving run evaluates multiple tickets against the real runtime helpers", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-ticket-proving-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "src", "ui", "components", "dialog"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await writeFile(
      path.join(targetRoot, "package.json"),
      JSON.stringify({
        name: "ticket-proving-runtime-test",
        type: "module",
        scripts: {
          "test:e2e": "node -e \"console.log('e2e ok')\"",
          "test:unit": "node -e \"console.log('unit ok')\""
        }
      }, null, 2),
      "utf8"
    );
    await writeFile(path.join(targetRoot, "src", "ui", "components", "dialog", "modal.riot"), "<modal><div>modal</div></modal>\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "modal.e2e.spec.ts"), "test('modal', () => {})\n", "utf8");
    await writeFile(
      path.join(targetRoot, "docs", "kanban.md"),
      [
        "# Kanban",
        "",
        "## In Progress",
        "- [ ] **REF-APP-SHELL-01**: Continue app-shell and modal-surface refactor hardening after review findings.",
        "",
        "## Priority 1 Bugs",
        "- [ ] **BUG-OVERLAY-01**: Restore global overlay handling for non-dialog modals after the app-shell refactor."
      ].join("\n"),
      "utf8"
    );

    const syncResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(syncResult.code, 0);

    const provingResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "ticket-proving-run", "--tickets", "REF-APP-SHELL-01", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(provingResult.code, 0);
    const provingPayload = JSON.parse(provingResult.stdout);
    assert.equal(provingPayload.total, 1);
    assert.equal(provingPayload.passed, 1);
    assert.equal(provingPayload.verificationPlanned, 1);
    assert.equal(Array.isArray(provingPayload.tickets), true);
    assert.equal(Array.isArray(provingPayload.tickets[0].executionPlan.verificationCommands), true);
    assert.equal(provingPayload.tickets[0].executionPlan.verificationCommands.length > 0, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow execution dry-run reports inferred plan without mutating files", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-dry-run-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "src", "ui", "components", "dialog"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests", "modal-smoke"), { recursive: true });
    await mkdir(path.join(targetRoot, "functions"), { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({
      name: "dry-run-test",
      packageManager: "pnpm@10.0.0",
      scripts: {
        "test:e2e": "playwright test -c playwright.config.ts",
        "test:unit": "playwright test -c playwright.unit.config.ts"
      }
    }, null, 2), "utf8");
    await writeFile(path.join(targetRoot, "playwright.config.ts"), "export default { testMatch: ['**/e2e.spec.ts'] };\n", "utf8");
    await writeFile(path.join(targetRoot, "playwright.unit.config.ts"), "export default { testMatch: ['**/*.unit.spec.ts'] };\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "ui", "components", "dialog", "modal.riot"), "<modal></modal>\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "modal-smoke", "e2e.spec.ts"), "test('modal', () => {})\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "e2e.spec.ts"), "test('root e2e', () => {})\n", "utf8");
    await writeFile(path.join(targetRoot, "functions", "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");

    const syncResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(syncResult.code, 0);

    const ticketResult = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "ticket",
        "create",
        "--id",
        "BUG-OVERLAY-01",
        "--title",
        "Restore global overlay handling for non-dialog modals after the app-shell refactor.",
        "--lane",
        "Bugs P1",
        "--summary",
        "Verification: pnpm exec playwright test -c playwright.config.ts tests/modal-smoke/e2e.spec.ts",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(ticketResult.code, 0);

    const dryRunResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "execution-dry-run", "--ticket", "BUG-OVERLAY-01", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(dryRunResult.code, 0);
    const payload = JSON.parse(dryRunResult.stdout);
    assert.equal(payload.ticket.id, "BUG-OVERLAY-01");
    assert.equal(Array.isArray(payload.executionPlan.verificationCommands), true);
    assert.equal(payload.executionPlan.verificationCommands.length > 0, true);
    assert.equal(
      payload.executionPlan.verificationCommands.some((entry) => /playwright\.config\.ts/.test(entry.command)),
      true
    );
    assert.equal(
      payload.executionPlan.verificationCommands.some((entry) => /playwright\.unit\.config\.ts/.test(entry.command)),
      false
    );
    assert.equal(payload.executionPlan.workingSet.includes("functions/pnpm-lock.yaml"), false);
    assert.equal(
      Array.isArray(payload.workingSetEvidence)
        && payload.workingSetEvidence.some((entry) => entry.kind === "selected-file"),
      true
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow execution dry-run prefers primary source files over docs when enough code context exists", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-dry-run-doc-filter-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "src", "engine"), { recursive: true });
    await mkdir(path.join(targetRoot, "src", "ui", "components"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests"), { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({
      name: "dry-run-doc-filter",
      packageManager: "pnpm@10.0.0",
      scripts: {
        "test:e2e": "playwright test -c playwright.config.ts",
        "test:unit": "playwright test -c playwright.unit.config.ts",
        build: "vite build"
      }
    }, null, 2), "utf8");
    await writeFile(path.join(targetRoot, "playwright.config.ts"), "export default { testMatch: ['**/e2e.spec.ts'] };\n", "utf8");
    await writeFile(path.join(targetRoot, "playwright.unit.config.ts"), "export default { testMatch: ['**/*.unit.spec.ts'] };\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "engine", "audio.ts"), "export function __getAudioDebugState() { return null; }\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "engine", "gdrive-sync.ts"), "export const audioDebugSync = true;\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "engine", "npc-logic-cache.ts"), "export const overlayDebugCache = new Map();\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "ui", "components", "combat-modal.riot"), "<audio-debug-overlay></audio-debug-overlay>\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "ui", "components", "tutorial-overlay.riot"), "<overlay-debug></overlay-debug>\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "e2e.spec.ts"), "test('audio debug overlay', () => {})\n", "utf8");
    await writeFile(path.join(targetRoot, "docs", "knowledge.md"), "# Audio debug overlay notes\n", "utf8");
    const syncResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(syncResult.code, 0);

    const ticketResult = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "ticket",
        "create",
        "--id",
        "AUDIO-UX-03",
        "--title",
        "Add an audio-debug overlay.",
        "--lane",
        "Suggestions",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(ticketResult.code, 0);

    const dryRunResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "execution-dry-run", "--ticket", "AUDIO-UX-03", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(dryRunResult.code, 0);
    const payload = JSON.parse(dryRunResult.stdout);
    assert.equal(payload.executionPlan.workingSet.some((filePath) => String(filePath).startsWith("docs/")), false);
    assert.equal(payload.executionPlan.workingSet.includes("src/engine/audio.ts"), true);
    assert.equal(payload.executionPlan.workingSet.includes("tests/e2e.spec.ts"), true);
    assert.equal(payload.workingSetEvidence[0].kind, "selected-file");
    assert.equal(Array.isArray(payload.workingSetEvidence[0].reasons), true);
    assert.equal(payload.workingSetEvidence[0].reasons.length > 0, true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow install creates the core OS workspace and initializes project config", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-install-"));

  try {
    const result = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "install", "--project", targetRoot],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0);
    
    // Check for core directories
    const configPath = path.join(targetRoot, ".ai-workflow", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.storage.dbPath, ".ai-workflow/state/workflow.db");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("project codelets override toolkit codelets by id", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-override-"));

  try {
    await mkdir(path.join(targetRoot, "scripts"), { recursive: true });
    await writeFile(
      path.join(targetRoot, "scripts", "doctor.ts"),
      "console.log('project override');\n"
    );
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "add", "doctor", "scripts/doctor.ts"],
      { cwd: targetRoot }
    );

    const result = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "doctor"],
      { cwd: targetRoot }
    );
    assert.equal(result.stdout.trim(), "project override");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow mode set/status stores explicit tool-dev mode", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-mode-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const setResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "mode", "set", "tool-dev"],
      { cwd: targetRoot }
    );
    assert.equal(setResult.code, 0);

    const statusResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "mode", "status", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(statusResult.code, 0);
    const payload = JSON.parse(statusResult.stdout);
    assert.equal(payload.mode, "tool-dev");
    assert.equal(typeof payload.repairTargetRoot, "string");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("ai-workflow tool observe can infer and record a toolkit-style observation with explicit inputs", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-tool-observe-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    const result = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "tool",
        "observe",
        "--mode",
        "default",
        "--root",
        targetRoot,
        "--complaint",
        "it lied about readiness and picked useless verification",
        "--expected",
        "it should admit verification is weak and ask for better checks",
        "--create-ticket",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.observation.kind, "misleading-output");
    assert.equal(payload.observation.component, "shell");
    assert.equal(payload.observation.severity, "blocking");
    assert.equal(payload.ticket.id, "TKH-001");
    assert.equal(payload.note.provenance, "tool-dev-observe");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("tool-dev mode blocks external execution targets unless explicitly allowed", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-tool-dev-guard-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);

    const result = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "run",
        "execution-dry-run",
        "--mode",
        "tool-dev",
        "--root",
        targetRoot,
        "--ticket",
        "TKT-001",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 1);
    assert.match(result.stderr, /tool-dev mode refuses external repair target/i);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("tool observe auto-attaches the latest recorded run artifact", { concurrency: false }, async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-observe-run-artifact-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", targetRoot]);
    await mkdir(path.join(targetRoot, "docs"), { recursive: true });
    await mkdir(path.join(targetRoot, "src", "ui", "components", "dialog"), { recursive: true });
    await mkdir(path.join(targetRoot, "tests", "modal-smoke"), { recursive: true });
    await writeFile(path.join(targetRoot, "package.json"), JSON.stringify({
      name: "observe-run-artifact-test",
      packageManager: "pnpm@10.0.0",
      scripts: {
        "test:e2e": "playwright test -c playwright.config.ts",
        "test:unit": "playwright test -c playwright.unit.config.ts"
      }
    }, null, 2), "utf8");
    await writeFile(path.join(targetRoot, "playwright.config.ts"), "export default { testMatch: ['**/e2e.spec.ts'] };\n", "utf8");
    await writeFile(path.join(targetRoot, "playwright.unit.config.ts"), "export default { testMatch: ['**/*.unit.spec.ts'] };\n", "utf8");
    await writeFile(path.join(targetRoot, "src", "ui", "components", "dialog", "modal.riot"), "<modal></modal>\n", "utf8");
    await writeFile(path.join(targetRoot, "tests", "modal-smoke", "e2e.spec.ts"), "test('modal', () => {})\n", "utf8");

    let result = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0);

    result = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "ticket",
        "create",
        "--id",
        "BUG-OVERLAY-01",
        "--title",
        "Restore global overlay handling for non-dialog modals after the app-shell refactor.",
        "--lane",
        "Bugs P1",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0);

    result = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "run", "execution-dry-run", "--ticket", "BUG-OVERLAY-01", "--json"],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0);
    const dryRunPayload = JSON.parse(result.stdout);
    assert.equal(typeof dryRunPayload.runArtifact?.id, "string");

    result = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "tool",
        "observe",
        "--mode",
        "default",
        "--root",
        targetRoot,
        "--complaint",
        "it picked weak verification",
        "--expected",
        "it should attach the exact run",
        "--json"
      ],
      { cwd: targetRoot }
    );
    assert.equal(result.code, 0);
    const observePayload = JSON.parse(result.stdout);
    assert.equal(observePayload.attachedRun.id, dryRunPayload.runArtifact.id);
    assert.equal(observePayload.attachedRun.kind, "execution-dry-run");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("tool-dev proving keeps toolkit as repair target and external project as evidence root", { concurrency: false }, async () => {
  const toolkitRoot = repoRoot;
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "ai-workflow-tool-dev-evidence-"));

  try {
    await runNode([path.join(repoRoot, "aiwf-shell", "scripts", "init-project.ts"), "--target", evidenceRoot]);
    await mkdir(path.join(evidenceRoot, "src", "ui", "components", "dialog"), { recursive: true });
    await mkdir(path.join(evidenceRoot, "tests"), { recursive: true });
    await writeFile(
      path.join(evidenceRoot, "package.json"),
      JSON.stringify({
        name: "tool-dev-evidence",
        type: "module",
        scripts: {
          "test:e2e": "node -e \"console.log('e2e ok')\"",
          "test:unit": "node -e \"console.log('unit ok')\""
        }
      }, null, 2),
      "utf8"
    );
    await writeFile(path.join(evidenceRoot, "src", "ui", "components", "dialog", "modal.riot"), "<modal><div>modal</div></modal>\n", "utf8");
    await writeFile(path.join(evidenceRoot, "tests", "modal.e2e.spec.ts"), "test('modal', () => {})\n", "utf8");
    const syncResult = await runNode(
      [path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"), "sync", "--json"],
      { cwd: evidenceRoot }
    );
    assert.equal(syncResult.code, 0);
    const ticketResult = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "project",
        "ticket",
        "create",
        "--id",
        "BUG-OVERLAY-01",
        "--title",
        "Restore global overlay handling for non-dialog modals after the app-shell refactor.",
        "--lane",
        "Bugs P1",
        "--summary",
        "Verification: npm run test:e2e",
        "--json"
      ],
      { cwd: evidenceRoot }
    );
    assert.equal(ticketResult.code, 0);

    const result = await runNode(
      [
        path.join(repoRoot, "aiwf-shell", "cli", "ai-workflow.ts"),
        "run",
        "ticket-proving-run",
        "--mode",
        "tool-dev",
        "--root",
        evidenceRoot,
        "--tickets",
        "BUG-OVERLAY-01",
        "--json"
      ],
      { cwd: toolkitRoot }
    );
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.mode, "tool-dev");
    assert.equal(payload.repairTargetRoot, toolkitRoot);
    assert.equal(payload.evidenceRoot, evidenceRoot);
    assert.equal(payload.root, evidenceRoot);
    assert.equal(typeof payload.runArtifact?.id, "string");
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});
