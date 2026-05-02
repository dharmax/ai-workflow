import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadKnowledge, recordProjectKnowledge, updateKnowledgeRemote } from "../core/services/knowledge.ts";

test("updateKnowledgeRemote writes a normalized builtin knowledge payload from a configured source", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-remote-"));
  const destinationPath = path.join(targetRoot, "knowledge.json");

  try {
    const result = await updateKnowledgeRemote({
      sourceUrl: "https://example.com/knowledge.json",
      destinationPath,
      fetchImpl: async (url) => {
        assert.equal(url, "https://example.com/knowledge.json");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            version: "2026.04.04",
            tasks: ["summarization", "summarization", "routing"],
            capabilityMapping: { summarization: "data", routing: "strategy" },
            minimumQuality: { summarization: "low", routing: "medium" },
            inferenceHeuristics: { strategy: { base: 3 } },
            models: {
              ollama: [
                { id: "mistral-nemo:12b", strength: "strategy" },
                null
              ]
            }
          })
        };
      }
    });

    assert.equal(result.success, true);
    assert.equal(result.destinationPath, destinationPath);
    assert.equal(result.version, "2026.04.04");
    assert.equal(result.taskCount, 2);
    assert.equal(result.modelProviderCount, 1);

    const written = JSON.parse(await readFile(destinationPath, "utf8"));
    assert.equal(written.version, "2026.04.04");
    assert.deepEqual(written.tasks, ["summarization", "routing"]);
    assert.deepEqual(written.capabilityMapping, { summarization: "data", routing: "strategy" });
    assert.deepEqual(written.minimumQuality, { summarization: "low", routing: "medium" });
    assert.deepEqual(written.models.ollama, [{ id: "mistral-nemo:12b", strength: "strategy" }]);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("updateKnowledgeRemote skips cleanly when no remote source is configured", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-remote-skip-"));
  const destinationPath = path.join(targetRoot, "knowledge.json");
  const previousUrl = process.env.AIWF_BUILTIN_KNOWLEDGE_URL;

  try {
    delete process.env.AIWF_BUILTIN_KNOWLEDGE_URL;
    const result = await updateKnowledgeRemote({
      destinationPath,
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
      projectConfig: {},
      globalConfig: {},
      sourceUrl: null
    });

    assert.equal(result.success, false);
    assert.equal(result.skipped, true);
    assert.match(result.reason, /No remote knowledge URL configured/i);
    assert.match(result.hint, /knowledge\.remoteUrl/i);
  } finally {
    if (previousUrl === undefined) {
      delete process.env.AIWF_BUILTIN_KNOWLEDGE_URL;
    } else {
      process.env.AIWF_BUILTIN_KNOWLEDGE_URL = previousUrl;
    }
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("loadKnowledge merges project knowledge facts from markdown", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-facts-"));

  try {
    await writeFile(path.join(targetRoot, "knowledge.md"), [
      "# Project Knowledge",
      "",
      "## Learned Fixes",
      "",
      "- Verification baseline was already red before changes.",
      "- Changed files: cli/lib/shell.ts",
      "  - Lane: Blocked"
    ].join("\n"), "utf8");

    const knowledge = await loadKnowledge({ root: targetRoot, projectConfig: {}, globalConfig: {} });
    assert.equal(Array.isArray(knowledge.facts), true);
    assert.equal(knowledge.facts.includes("Verification baseline was already red before changes."), true);
    assert.equal(knowledge.facts.includes("Changed files: cli/lib/shell.ts"), true);
    assert.equal(knowledge.facts.some((fact) => /^Lane: /i.test(fact)), false);
    assert.equal(knowledge.projectKnowledgePath, path.join(targetRoot, "knowledge.md"));
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("loadKnowledge tolerates null model maps in global and project config", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-null-models-"));

  try {
    const knowledge = await loadKnowledge({
      root: targetRoot,
      globalConfig: { knowledge: { models: null } },
      projectConfig: { knowledge: { models: null } }
    });

    assert.equal(typeof knowledge.models, "object");
    assert.equal(Array.isArray(knowledge.modelReference), true);
    assert.equal(Array.isArray(Object.values(knowledge.models).at(0)), true);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});

test("recordProjectKnowledge appends durable learned fixes without duplicating the same summary", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "knowledge-record-"));

  try {
    const first = await recordProjectKnowledge({
      root: targetRoot,
      ticketId: "BUG-999",
      title: "Fix shell regression",
      lane: "Done",
      status: "verified",
      lessons: ["Verified fix against 1 command.", "Changed files: cli/lib/shell.ts"],
      changedFiles: ["cli/lib/shell.ts"],
      selection: { priorityScore: 30, reasons: ["bug-ticket", "operator-surface"] }
    });
    const second = await recordProjectKnowledge({
      root: targetRoot,
      ticketId: "BUG-999",
      title: "Fix shell regression",
      lane: "Done",
      status: "verified",
      lessons: ["Verified fix against 1 command."],
      changedFiles: ["cli/lib/shell.ts"],
      selection: { priorityScore: 30, reasons: ["bug-ticket", "operator-surface"] }
    });

    assert.equal(first.updated, true);
    assert.equal(second.updated, false);

    const written = await readFile(path.join(targetRoot, "knowledge.md"), "utf8");
    assert.match(written, /## Learned Fixes/);
    assert.match(written, /BUG-999 \[verified\] Fix shell regression/);
    assert.match(written, /Priority: 30 \(bug-ticket, operator-surface\)/);
    assert.match(written, /Changed files: cli\/lib\/shell\.js/);
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
