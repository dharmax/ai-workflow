import path from "node:path";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export function getToolkitRoot() {
  const fromEnv = process.env.AI_WORKFLOW_TOOLKIT_ROOT;
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const toolkitRootFile = path.resolve(scriptDir, "../toolkit-root.txt");
  if (existsSync(toolkitRootFile)) {
    const content = readFileSync(toolkitRootFile, "utf8").trim();
    if (content) {
      return path.resolve(content);
    }
  }

  for (const candidate of candidateRoots(scriptDir)) {
    if (isToolkitRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve ai-workflow toolkit root. Set AI_WORKFLOW_TOOLKIT_ROOT.");
}

function *candidateRoots(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function isToolkitRoot(candidate) {
  return existsSync(path.resolve(candidate, "package.json"))
    && existsSync(path.resolve(candidate, "core", "services", "sync.ts"))
    && (
      existsSync(path.resolve(candidate, "cli", "ai-workflow.ts"))
      || existsSync(path.resolve(candidate, "cli", "ai-workflow.mjs"))
    );
}
