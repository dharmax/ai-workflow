import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { openWorkflowStore } from "../db/sqlite-store.ts";
import { collectProjectFileSnapshot } from "./filesystem.ts";

const execFileAsync = promisify(execFile);

const HONESTY_IGNORE_PATHS = new Set([
  ".ai-workflow/state/workflow.db",
  ".obsidian/workspace.json",
  ".obsidian/workspace-mobile.json"
]);

export async function inspectWorkspaceHonesty(root = process.cwd(), { graceMs = 2000, fileLimit = 25 } = {}) {
  const normalizedRoot = path.resolve(String(root ?? process.cwd()));
  const snapshot = filterHonestySnapshot(await collectProjectFileSnapshot(normalizedRoot));
  const gitRepo = await isGitRepo(normalizedRoot);
  const store = await openWorkflowStore({ projectRoot: normalizedRoot });

  try {
    const latestMutation = store.getLatestWorkspaceMutation(normalizedRoot);
    if (!latestMutation) {
      return {
        status: "unknown",
        root: normalizedRoot,
        checkedAt: new Date().toISOString(),
        trackedFileCount: snapshot.length,
        suspiciousCount: 0,
        suspiciousFiles: [],
        latestMutation: null,
        summary: "no ai-workflow mutation baseline recorded yet"
      };
    }

    const baselineMs = Date.parse(latestMutation.completedAt ?? latestMutation.startedAt ?? 0);
    const recordedSnapshot = Array.isArray(latestMutation.details?.snapshot)
      ? filterHonestySnapshot(latestMutation.details.snapshot)
      : [];
    if (!gitRepo) {
      return {
        status: "pass",
        root: normalizedRoot,
        checkedAt: new Date().toISOString(),
        trackedFileCount: snapshot.length,
        suspiciousCount: 0,
        suspiciousFiles: [],
        latestMutation: {
          id: latestMutation.id,
          operation: latestMutation.operation,
          status: latestMutation.status,
          completedAt: latestMutation.completedAt,
          changedFiles: latestMutation.changedFiles
        },
        summary: "non-git workspace; mutation baseline recorded but freshness enforcement is advisory"
      };
    }
    const suspiciousFiles = recordedSnapshot.length
      ? diffSnapshot(snapshot, recordedSnapshot)
      : (Number.isFinite(baselineMs)
          ? snapshot.filter((file) => file.mtimeMs > baselineMs + graceMs)
          : []);

    return {
      status: suspiciousFiles.length ? "fail" : "pass",
      root: normalizedRoot,
      checkedAt: new Date().toISOString(),
      trackedFileCount: snapshot.length,
      suspiciousCount: suspiciousFiles.length,
      suspiciousFiles: suspiciousFiles.slice(0, fileLimit),
      latestMutation: {
        id: latestMutation.id,
        operation: latestMutation.operation,
        status: latestMutation.status,
        completedAt: latestMutation.completedAt,
        changedFiles: latestMutation.changedFiles
      },
      summary: suspiciousFiles.length
        ? `found ${suspiciousFiles.length} tracked file(s) newer than the latest ai-workflow mutation record`
        : "tracked files align with the latest ai-workflow mutation record"
    };
  } finally {
    store.close();
  }
}

function diffSnapshot(currentSnapshot, recordedSnapshot) {
  const recorded = new Map(recordedSnapshot.map((file) => [file.relativePath, file]));
  return currentSnapshot.filter((file) => {
    const previous = recorded.get(file.relativePath);
    if (!previous) {
      return true;
    }
    return previous.mtimeMs !== file.mtimeMs || previous.sizeBytes !== file.sizeBytes;
  });
}

function filterHonestySnapshot(snapshot) {
  return (snapshot ?? []).filter((file) => !HONESTY_IGNORE_PATHS.has(file.relativePath));
}

async function isGitRepo(root) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      maxBuffer: 1024 * 1024
    });
    return String(stdout ?? "").trim() === "true";
  } catch {
    return false;
  }
}
