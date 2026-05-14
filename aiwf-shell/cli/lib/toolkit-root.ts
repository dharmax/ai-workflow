import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function getCliToolkitRoot() {
  const fromEnv = process.env.AI_WORKFLOW_TOOLKIT_ROOT;
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  for (const candidate of candidateRoots(moduleDir)) {
    if (isToolkitRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve ai-workflow toolkit root. Set AI_WORKFLOW_TOOLKIT_ROOT.");
}

function *candidateRoots(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function isToolkitRoot(candidate: string) {
  return existsSync(path.resolve(candidate, "package.json"))
    && (
      existsSync(path.resolve(candidate, "cli", "ai-workflow.mjs"))
      || existsSync(path.resolve(candidate, "cli", "ai-workflow.ts"))
      || existsSync(path.resolve(candidate, "dist", "ai-workflow.mjs"))
    )
    && (
      existsSync(path.resolve(candidate, "runtime", "scripts", "ai-workflow"))
      || existsSync(path.resolve(candidate, "shared", "codelets"))
    );
}
