import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { listRepoFiles } from "./audit-utils.ts";

export const OPERATOR_SURFACES = {
  shell: {
    description: "Interactive and non-interactive shell routing, planner selection, and mutation control.",
    exact: ["aiwf-shell/cli/lib/shell.ts"],
    prefixes: ["tests/shell.test.ts", "tests/shell-chat.test.ts", "tests/shell-retrieval.test.ts", "docs/MANUAL.md"]
  },
  provider: {
    description: "Provider discovery, routing, setup, and local model hardware behavior.",
    exact: [
      "aiwf-common-core/core/services/providers.ts",
      "aiwf-common-core/core/services/router.ts",
      "aiwf-shell/cli/lib/doctor.ts",
      "aiwf-shell/cli/lib/ollama-hw.ts",
      "aiwf-shell/cli/lib/provider-connect.ts",
      "aiwf-shell/cli/lib/provider-setup.ts"
    ],
    prefixes: ["tests/providers.test.ts"]
  },
  workflow: {
    description: "Top-level workflow command dispatch, ask/host resolution, and project workflow scripts.",
    exact: [
      "aiwf-shell/cli/lib/main.ts",
      "aiwf-common-core/core/services/sync.ts",
      "aiwf-common-core/core/services/orchestrator.ts",
      "aiwf-common-core/core/services/text-compiler-host.ts",
      "aiwf-common-core/core/services/projections.ts"
    ],
    prefixes: ["tests/orchestrator.test.ts", "tests/sync.test.ts", "aiwf-shell/scripts/ai-workflow/", "scripts/ai-workflow/"]
  },
  init: {
    description: "Project bootstrap, template install, audit baseline, and dogfooding/report scaffolding.",
    prefixes: [
      "aiwf-shell/templates/",
      "aiwf-shell/scripts/init-project.ts",
      "docs/MANUAL.md",
      "AGENTS.md",
      "execution-protocol.md",
      "project-guidelines.md",
      "enforcement.md",
      "knowledge.md"
    ]
  },
  "smart-programming": {
    description: "Harness for generating and verifying complex features autonomously.",
    prefixes: ["aiwf-common-core/core/services/dogfood-harness.ts", "aiwf-shell/cli/lib/main.ts"]
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
