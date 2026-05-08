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
  return isWorkspaceRoot(candidate) || isShellRoot(candidate) || isLegacyRoot(candidate);
}

function isWorkspaceRoot(candidate) {
  return existsSync(path.resolve(candidate, "package.json"))
    && existsSync(path.resolve(candidate, "aiwf-common-core", "core", "services", "sync.ts"))
    && existsSync(path.resolve(candidate, "aiwf-shell", "cli", "ai-workflow.ts"));
}

function isShellRoot(candidate) {
  return existsSync(path.resolve(candidate, "package.json"))
    && existsSync(path.resolve(candidate, "cli", "ai-workflow.ts"))
    && existsSync(path.resolve(candidate, "runtime", "scripts", "ai-workflow"));
}

function isLegacyRoot(candidate) {
  return existsSync(path.resolve(candidate, "package.json"))
    && existsSync(path.resolve(candidate, "core", "services", "sync.ts"))
    && (
      existsSync(path.resolve(candidate, "cli", "ai-workflow.ts"))
      || existsSync(path.resolve(candidate, "cli", "ai-workflow.mjs"))
    );
}

export function getWorkspaceRoot(toolkitRoot = getToolkitRoot()) {
  if (isWorkspaceRoot(toolkitRoot)) {
    return toolkitRoot;
  }
  const parent = path.dirname(toolkitRoot);
  return isWorkspaceRoot(parent) ? parent : toolkitRoot;
}

export function getShellRoot(toolkitRoot = getToolkitRoot()) {
  if (isShellRoot(toolkitRoot)) {
    return toolkitRoot;
  }
  const workspaceRoot = getWorkspaceRoot(toolkitRoot);
  const candidate = path.resolve(workspaceRoot, "aiwf-shell");
  return isShellRoot(candidate) ? candidate : workspaceRoot;
}

export function getCommonCoreRoot(toolkitRoot = getToolkitRoot()) {
  const hasCommonCore = (candidate) => existsSync(path.resolve(candidate, "core", "services", "sync.ts"));
  if (hasCommonCore(toolkitRoot)) {
    return toolkitRoot;
  }
  const workspaceRoot = getWorkspaceRoot(toolkitRoot);
  const candidate = path.resolve(workspaceRoot, "aiwf-common-core");
  return hasCommonCore(candidate) ? candidate : workspaceRoot;
}

export function getSkillRoot(toolkitRoot = getToolkitRoot()) {
  const hasSkill = (candidate) => existsSync(path.resolve(candidate, "skills", "ai-workflow"));
  if (hasSkill(toolkitRoot)) {
    return toolkitRoot;
  }
  const workspaceRoot = getWorkspaceRoot(toolkitRoot);
  const candidate = path.resolve(workspaceRoot, "aiwf-skill");
  return hasSkill(candidate) ? candidate : workspaceRoot;
}
