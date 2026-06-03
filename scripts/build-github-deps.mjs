#!/usr/bin/env node

import { mkdtemp, access, readFile, cp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const rootBin = path.join(repoRoot, "node_modules", ".bin");
const packageLockPath = path.join(repoRoot, "package-lock.json");

const packages = [
  "@dharmax/context-manager",
  "@dharmax/llm-utils",
  "@dharmax/shell-proc-utils",
  "@dharmax/codebase-parser",
  "@dharmax/block-patcher",
  "@dharmax/text-compiler"
];

async function fileExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${rootBin}${path.delimiter}${process.env.PATH ?? ""}`
      }
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

function getExportTarget(packageJson) {
  if (typeof packageJson.main === "string") return packageJson.main;
  if (typeof packageJson.exports?.["."] === "string") return packageJson.exports["."];
  if (typeof packageJson.exports?.["."]?.import === "string") return packageJson.exports["."].import;
  return null;
}

function getResolvedCommit(packageLock, packageName) {
  const resolved = packageLock?.packages?.[`node_modules/${packageName}`]?.resolved;
  if (typeof resolved !== "string") return null;
  const hashIndex = resolved.lastIndexOf("#");
  return hashIndex >= 0 ? resolved.slice(hashIndex + 1) : null;
}

async function buildFromGitHub(packageName, packageDir, commit) {
  const repoName = packageName.split("/")[1];
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `${repoName}-build-`));
  try {
    await runCommand("git", ["clone", `https://github.com/dharmax/${repoName}.git`, tempRoot], repoRoot);
    if (commit) {
      await runCommand("git", ["checkout", commit], tempRoot);
    }
    await runCommand("npm", ["install", "--ignore-scripts"], tempRoot);
    await runCommand("npm", ["run", "build"], tempRoot);
    await cp(path.join(tempRoot, "dist"), path.join(packageDir, "dist"), { recursive: true, force: true });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const packageLock = await readPackageLock(packageLockPath);

for (const packageName of packages) {
  const packageJsonPath = path.join(repoRoot, "node_modules", ...packageName.split("/"), "package.json");
  if (!(await fileExists(packageJsonPath))) {
    continue;
  }

  const packageDir = path.dirname(packageJsonPath);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const exportTarget = getExportTarget(packageJson);
  if (!exportTarget) {
    continue;
  }

  const compiledEntryPath = path.join(packageDir, exportTarget);
  if (await fileExists(compiledEntryPath)) {
    continue;
  }

  console.log(`Building ${packageName} from GitHub source...`);
  await buildFromGitHub(packageName, packageDir, getResolvedCommit(packageLock, packageName));

  if (!(await fileExists(compiledEntryPath))) {
    throw new Error(`Build for ${packageName} completed without producing ${exportTarget}.`);
  }
}

async function readPackageLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
