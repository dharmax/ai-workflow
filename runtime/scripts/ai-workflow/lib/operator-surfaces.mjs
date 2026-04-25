import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { listRepoFiles } from "./audit-utils.mjs";

export const OPERATOR_SURFACES = {
  shell: {
    description: "Interactive and non-interactive shell routing, planner selection, and mutation control.",
    exact: ["cli/lib/shell.mjs"],
    prefixes: ["tests/shell.test.mjs", "tests/shell-chat.test.mjs", "tests/shell-retrieval.test.mjs", "docs/MANUAL.md"]
  },
  provider: {
    description: "Provider discovery, routing, setup, and local model hardware behavior.",
    exact: ["core/services/providers.mjs", "core/services/router.mjs", "cli/lib/doctor.mjs", "cli/lib/ollama-hw.mjs", "cli/lib/provider-connect.mjs", "cli/lib/provider-setup.mjs"],
    prefixes: ["tests/providers.test.mjs"]
  },
  workflow: {
    description: "Top-level workflow command dispatch, ask/host resolution, and project workflow scripts.",
    exact: ["cli/lib/main.mjs", "core/services/sync.mjs", "core/services/orchestrator.mjs", "core/services/js-orchestrator.mjs", "core/services/projections.mjs"],
    prefixes: ["tests/orchestrator.test.mjs", "tests/sync.test.mjs", "scripts/ai-workflow/"]
  },
  init: {
    description: "Project bootstrap, template install, audit baseline, and dogfooding/report scaffolding.",
    prefixes: ["templates/", "scripts/init-project.mjs", "docs/MANUAL.md", "AGENTS.md", "execution-protocol.md", "project-guidelines.md", "enforcement.md", "knowledge.md"]
  },
  "smart-programming": {
    description: "Harness for generating and verifying complex features autonomously.",
    prefixes: ["core/services/dogfood-harness.mjs", "cli/lib/main.mjs"]
  }
};

export function listOperatorSurfaceIds() {
  return ["shell", "provider", "workflow", "init"];
}

export async function computeSurfaceDigest(surfaceId) {
  const definition = OPERATOR_SURFACES[surfaceId];
  if (!definition) {
    throw new Error(`Unknown operator surface: ${surfaceId}`);
  }

  const files = await listRepoFiles();
  const surfaceFiles = files.filter((f) => matchesSurfaceFile(f, definition));
  const hashes = [];

  for (const filePath of surfaceFiles) {
    try {
      const content = await readFile(filePath, "utf8");
      hashes.push(createHash("sha1").update(content).digest("hex"));
    } catch {
      // ignore
    }
  }

  return createHash("sha1").update(hashes.sort().join(",")).digest("hex");
}

export async function collectOperatorSurfaceState(root, requestedSurfaceIds = listOperatorSurfaceIds()) {
  const repoFiles = await listRepoFiles(root);
  const surfaces = {};

  for (const surfaceId of requestedSurfaceIds) {
    const definition = OPERATOR_SURFACES[surfaceId];
    if (!definition) {
      continue;
    }

    const files = repoFiles.filter((relativePath) => matchesSurfaceFile(relativePath, definition));
    const fileHashes = {};

    for (const relativePath of files) {
      const absolutePath = path.resolve(root, relativePath);
      try {
        const buffer = await readFile(absolutePath);
        fileHashes[relativePath] = createHash("sha256").update(buffer).digest("hex");
      } catch {
        // ignore
      }
    }

    surfaces[surfaceId] = {
      description: definition.description,
      fileCount: files.length,
      files,
      fileHashes
    };
  }

  return surfaces;
}

export function compareSurfaceHashes(expected, actual) {
  const expectedHashes = expected?.fileHashes ?? {};
  const actualHashes = actual?.fileHashes ?? {};
  const expectedFiles = Object.keys(expectedHashes).sort();
  const actualFiles = Object.keys(actualHashes).sort();

  if (expectedFiles.join("|") !== actualFiles.join("|")) {
    return false;
  }

  return expectedFiles.every((relativePath) => expectedHashes[relativePath] === actualHashes[relativePath]);
}

function matchesSurfaceFile(relativePath, definition) {
  if ((definition.exact ?? []).includes(relativePath)) {
    return true;
  }

  return (definition.prefixes ?? []).some((prefix) => relativePath.startsWith(prefix));
}
