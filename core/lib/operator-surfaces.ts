import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { listRepoFiles } from "./audit-utils.ts";

export const OPERATOR_SURFACES = {
  shell: {
    description: "Interactive and non-interactive shell routing, planner selection, and mutation control.",
    exact: ["cli/lib/shell.ts"],
    prefixes: ["tests/shell.test.ts", "tests/shell-chat.test.ts", "tests/shell-retrieval.test.ts", "docs/MANUAL.md"]
  },
  provider: {
    description: "Provider discovery, routing, setup, and local model hardware behavior.",
    exact: ["core/services/providers.ts", "core/services/router.ts", "cli/lib/doctor.ts", "cli/lib/ollama-hw.ts", "cli/lib/provider-connect.ts", "cli/lib/provider-setup.ts"],
    prefixes: ["tests/providers.test.ts"]
  },
  workflow: {
    description: "Top-level workflow command dispatch, ask/host resolution, and project workflow scripts.",
    exact: ["cli/lib/main.ts", "core/services/sync.ts", "core/services/orchestrator.ts", "core/services/text-compiler-host.ts", "core/services/projections.ts"],
    prefixes: ["tests/orchestrator.test.ts", "tests/sync.test.ts", "scripts/ai-workflow/"]
  },
  init: {
    description: "Project bootstrap, template install, audit baseline, and dogfooding/report scaffolding.",
    prefixes: ["templates/", "scripts/init-project.ts", "docs/MANUAL.md", "AGENTS.md", "execution-protocol.md", "project-guidelines.md", "enforcement.md", "knowledge.md"]
  },
  "smart-programming": {
    description: "Harness for generating and verifying complex features autonomously.",
    prefixes: ["core/services/dogfood-harness.ts", "cli/lib/main.ts"]
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
