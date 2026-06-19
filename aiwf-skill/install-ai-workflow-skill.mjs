#!/usr/bin/env bun
import path from "node:path";
import os from "node:os";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const destIndex = argv.indexOf("--dest");
const projectIndex = argv.indexOf("--project");
const homeDir = process.env.AI_WORKFLOW_HOME || path.join(os.homedir(), ".ai-workflow");
const projectRoot = projectIndex >= 0 && argv[projectIndex + 1]
  ? path.resolve(argv[projectIndex + 1])
  : null;
const destRoot = destIndex >= 0 && argv[destIndex + 1]
  ? path.resolve(argv[destIndex + 1])
  : projectRoot
    ? path.resolve(projectRoot, ".gemini", "skills")
  : path.resolve(homeDir, "skills");

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = path.resolve(packageRoot, "..");
const shellRoot = path.resolve(workspaceRoot, "aiwf-shell");
const sourceDir = path.resolve(packageRoot, "skills", "ai-workflow");
const destDir = path.resolve(destRoot, "ai-workflow");

await mkdir(destRoot, { recursive: true });
if (force) {
  await rm(destDir, { recursive: true, force: true });
}
await cp(sourceDir, destDir, { recursive: true, errorOnExist: !force, force });
await chmod(path.resolve(destDir, "scripts", "ai_workflow.sh"), 0o755);
await writeFile(path.resolve(destDir, "toolkit-root.txt"), `${shellRoot}\n`, "utf8");

if (projectRoot) {
  const geminiDir = path.resolve(projectRoot, ".gemini");
  await mkdir(geminiDir, { recursive: true });
  const templatePath = path.resolve(shellRoot, "templates", "GEMINI.md");
  const geminiPath = path.resolve(geminiDir, "GEMINI.md");
  try {
    await writeFile(geminiPath, await (await import("node:fs/promises")).readFile(templatePath, "utf8"), { flag: force ? "w" : "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

process.stdout.write(`${destDir}\n`);
