#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(root) {
  const results = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(absolutePath));
      continue;
    }
    results.push(absolutePath);
  }
  return results;
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

async function assertFileList(packageRoot, files) {
  for (const relativePath of files ?? []) {
    const absolutePath = path.resolve(packageRoot, relativePath);
    if (!(await pathExists(absolutePath))) {
      throw new Error(`Missing packaged file path: ${relativePath}`);
    }
  }
}

async function assertExports(packageRoot, exportsField) {
  const entries = Object.entries(exportsField ?? {});
  for (const [, target] of entries) {
    if (typeof target !== "string") {
      continue;
    }
    const relativeTarget = target.replace(/^\.\//, "");
    const absoluteTarget = path.resolve(packageRoot, relativeTarget);
    if (!relativeTarget.includes("*")) {
      if (!(await pathExists(absoluteTarget))) {
        throw new Error(`Missing export target: ${target}`);
      }
      continue;
    }

    const wildcardIndex = relativeTarget.indexOf("*");
    const baseDir = path.resolve(packageRoot, path.dirname(relativeTarget.slice(0, wildcardIndex) + "placeholder"));
    if (!(await pathExists(baseDir))) {
      throw new Error(`Missing export directory for wildcard target: ${target}`);
    }

    const matcher = globToRegExp(relativeTarget);
    const files = await listFilesRecursive(baseDir);
    const hasMatch = files.some((filePath) => matcher.test(path.relative(packageRoot, filePath).split(path.sep).join("/")));
    if (!hasMatch) {
      throw new Error(`Wildcard export does not match any files: ${target}`);
    }
  }
}

async function assertBin(packageRoot, binField) {
  if (!binField) {
    return;
  }
  const binTargets = typeof binField === "string" ? [binField] : Object.values(binField);
  for (const target of binTargets) {
    if (typeof target !== "string") {
      continue;
    }
    const absoluteTarget = path.resolve(packageRoot, target);
    if (!(await pathExists(absoluteTarget))) {
      throw new Error(`Missing bin target: ${target}`);
    }
  }
}

async function main() {
  const packageRoot = path.resolve(process.argv[2] ?? process.cwd());
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

  await assertFileList(packageRoot, packageJson.files);
  await assertExports(packageRoot, packageJson.exports);
  await assertBin(packageRoot, packageJson.bin);

  console.log(JSON.stringify({
    ok: true,
    package: packageJson.name,
    checkedFiles: Array.isArray(packageJson.files) ? packageJson.files.length : 0,
    checkedExports: packageJson.exports ? Object.keys(packageJson.exports).length : 0,
    checkedBins: packageJson.bin ? (typeof packageJson.bin === "string" ? 1 : Object.keys(packageJson.bin).length) : 0
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
