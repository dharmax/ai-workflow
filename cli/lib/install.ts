/**
 * @file install.js
 * @brief Auto-generated header for install.js. Needs detailed responsibility and scope.
 */

import path from "node:path";
import { cp, readFile, writeFile } from "node:fs/promises";
import { ensureDir } from "../../core/lib/fs-utils.ts";
import { getProjectConfigPath, readConfig } from "./config-store.ts";
import { withWorkspaceMutation } from "../../core/lib/workspace-mutation.ts";

export async function installAgents({ toolkitRoot, projectRoot = process.cwd() }) {
  return withWorkspaceMutation(projectRoot, "install agents", async () => {
    const results = [];

    await ensureDir(path.resolve(projectRoot, ".ai-workflow"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "codelets"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "cache"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "generated"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "notes"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "state"));

    results.push({ path: ".ai-workflow", status: "created" });

    await ensureProjectConfig(projectRoot, toolkitRoot);
    await ensureGeminiBridge(projectRoot, toolkitRoot);
    return results;
  });
}

async function ensureProjectConfig(projectRoot) {
  const configPath = getProjectConfigPath(projectRoot);
  const existing = await readConfig(configPath);
  const nextConfig = {
    ...existing,
    storage: {
      dbPath: ".ai-workflow/state/workflow.db",
      ...(existing.storage ?? {})
    },
    lifecycle: {
      candidateReviewIntervalHours: 36,
      ...(existing.lifecycle ?? {})
    },
    hooks: {
      BeforePlan: [],
      AfterPlan: [],
      BeforeAction: [],
      AfterAction: [],
      ...(existing.hooks ?? {})
    },
    providers: existing.providers ?? {},
    routing: existing.routing ?? {}
  };
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
}

async function ensureGeminiBridge(projectRoot, toolkitRoot) {
  const geminiDir = path.resolve(projectRoot, ".gemini");
  const geminiSkillRoot = path.resolve(geminiDir, "skills");
  const geminiSkillDir = path.resolve(geminiSkillRoot, "ai-workflow");
  const sourceSkillDir = path.resolve(toolkitRoot, "skills", "ai-workflow");
  const geminiGuidePath = path.resolve(geminiDir, "GEMINI.md");
  const templateGuidePath = path.resolve(toolkitRoot, "templates", "GEMINI.md");

  await ensureDir(geminiDir);
  await ensureDir(geminiSkillRoot);
  await cp(sourceSkillDir, geminiSkillDir, { recursive: true, force: true });
  await writeFile(path.resolve(geminiSkillDir, "toolkit-root.txt"), `${toolkitRoot}\n`, "utf8");

  try {
    await readFile(geminiGuidePath, "utf8");
  } catch {
    const guide = await readFile(templateGuidePath, "utf8");
    await writeFile(geminiGuidePath, guide, "utf8");
  }
}
