import os from "node:os";
import path from "node:path";
import { cp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureDir } from "aiwf-common-core/lib/fs-utils";
import { getShellRoot, getSkillRoot } from "aiwf-common-core/lib/toolkit-root";
import { getProjectConfigPath, readConfig } from "./config-store.ts";
import { getGlobalConfigPath } from "aiwf-common-core/lib/config-store";
import { withWorkspaceMutation } from "aiwf-common-core/lib/workspace-mutation";

const DEFAULT_HOSTS = ["gemini", "codex", "claude"];

export async function installAgents({ toolkitRoot, projectRoot = process.cwd(), hosts = DEFAULT_HOSTS }) {
  return withWorkspaceMutation(projectRoot, "install agents", async () => {
    const results = [];
    const selectedHosts = normalizeHostList(hosts);

    await ensureDir(path.resolve(projectRoot, ".ai-workflow"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "codelets"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "cache"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "generated"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "notes"));
    await ensureDir(path.resolve(projectRoot, ".ai-workflow", "state"));

    results.push({ path: ".ai-workflow", status: "created" });

    await ensureProjectConfig(projectRoot);
    if (selectedHosts.includes("gemini")) {
      await ensureGeminiBridge(projectRoot, toolkitRoot, results);
    }
    if (selectedHosts.includes("codex")) {
      await ensureCodexBridge(toolkitRoot, results);
    }
    if (selectedHosts.includes("claude")) {
      await ensureClaudeBridge(projectRoot, toolkitRoot, results);
    }
    return results;
  });
}

export function normalizeHostList(rawHosts) {
  const values = Array.isArray(rawHosts) ? rawHosts : [rawHosts];
  const expanded = values
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!expanded.length || expanded.includes("all")) {
    return [...DEFAULT_HOSTS];
  }

  const unique = new Set();
  for (const host of expanded) {
    if (!DEFAULT_HOSTS.includes(host)) {
      throw new Error(`Unsupported host "${host}". Expected one of: ${DEFAULT_HOSTS.join(", ")}`);
    }
    unique.add(host);
  }
  return [...unique];
}

async function ensureProjectConfig(projectRoot) {
  const configPath = getProjectConfigPath(projectRoot);
  const globalConfigPath = getGlobalConfigPath();

  if (path.resolve(configPath) === path.resolve(globalConfigPath)) {
    return;
  }

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

async function ensureGeminiBridge(projectRoot, toolkitRoot, results) {
  const shellRoot = getShellRoot(toolkitRoot);
  const geminiDir = path.resolve(projectRoot, ".gemini");
  const geminiSkillRoot = path.resolve(geminiDir, "skills");
  const geminiSkillDir = path.resolve(geminiSkillRoot, "ai-workflow");
  const sourceSkillDir = path.resolve(getSkillRoot(toolkitRoot), "skills", "ai-workflow");
  const geminiGuidePath = path.resolve(geminiDir, "GEMINI.md");
  const templateGuidePath = path.resolve(shellRoot, "templates", "GEMINI.md");

  await ensureDir(geminiDir);
  await ensureDir(geminiSkillRoot);
  await cp(sourceSkillDir, geminiSkillDir, { recursive: true, force: true });
  await writeFile(path.resolve(geminiSkillDir, "toolkit-root.txt"), `${shellRoot}\n`, "utf8");

  try {
    await readFile(geminiGuidePath, "utf8");
  } catch {
    const guide = await readFile(templateGuidePath, "utf8");
    await writeFile(geminiGuidePath, guide, "utf8");
  }

  results.push({ path: ".gemini", status: "installed" });
}

async function ensureCodexBridge(toolkitRoot, results) {
  const shellRoot = getShellRoot(toolkitRoot);
  const codexHome = getCodexHome();
  const codexSkillRoot = path.resolve(codexHome, "skills");
  const codexSkillDir = path.resolve(codexSkillRoot, "ai-workflow");
  const sourceSkillDir = path.resolve(getSkillRoot(toolkitRoot), "skills", "ai-workflow");
  const configPath = path.resolve(codexHome, "config.toml");
  const launchSpec = resolveHostLaunchSpec(shellRoot);

  await ensureDir(codexSkillRoot);
  await cp(sourceSkillDir, codexSkillDir, { recursive: true, force: true });
  await writeFile(path.resolve(codexSkillDir, "toolkit-root.txt"), `${shellRoot}\n`, "utf8");

  const current = await readText(configPath, "");
  const next = upsertCodexHooksFeature(upsertCodexMcpServer(current, "aiwf-mcp", launchSpec));
  if (next !== current) {
    await writeFile(configPath, next, "utf8");
  }

  results.push({ path: path.relative(codexHome, configPath) || "config.toml", status: "installed", root: codexHome });
}

async function ensureClaudeBridge(projectRoot, toolkitRoot, results) {
  const shellRoot = getShellRoot(toolkitRoot);
  const guidePath = path.resolve(projectRoot, "CLAUDE.md");
  const templateGuidePath = path.resolve(shellRoot, "templates", "CLAUDE.md");
  const mcpPath = path.resolve(projectRoot, ".mcp.json");
  const launchSpec = resolveHostLaunchSpec(shellRoot);

  try {
    await readFile(guidePath, "utf8");
  } catch {
    const guide = await readFile(templateGuidePath, "utf8");
    await writeFile(guidePath, guide, "utf8");
  }

  const current = await readJsonFile(mcpPath, { mcpServers: {} });
  current.mcpServers = current.mcpServers && typeof current.mcpServers === "object" ? current.mcpServers : {};
  current.mcpServers["ai-workflow"] = {
    command: launchSpec.command,
    args: launchSpec.args,
    env: {
      ...(launchSpec.env ?? {})
    }
  };
  await writeFile(mcpPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");

  results.push({ path: "CLAUDE.md", status: "installed" });
  results.push({ path: ".mcp.json", status: "installed" });
}

function resolveHostLaunchSpec(shellRoot) {
  const sourceCli = path.resolve(shellRoot, "cli", "ai-workflow.ts");
  const tsxCli = path.resolve(path.dirname(shellRoot), "node_modules", "tsx", "dist", "cli.mjs");
  if (existsSync(sourceCli) && existsSync(tsxCli)) {
    return {
      command: process.execPath,
      args: [tsxCli, sourceCli, "mcp", "serve"],
      env: {
        AI_WORKFLOW_TOOLKIT_ROOT: path.dirname(shellRoot)
      }
    };
  }

  const distCli = path.resolve(shellRoot, "dist", "ai-workflow.mjs");
  if (existsSync(distCli)) {
    return {
      command: distCli,
      args: ["mcp", "serve"]
    };
  }

  throw new Error(`Unable to resolve an ai-workflow MCP launch command from ${shellRoot}`);
}

function getCodexHome() {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function upsertCodexMcpServer(input, serverName, launchSpec) {
  const section = [
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(launchSpec.command)}`,
    `args = ${tomlStringArray(launchSpec.args)}`
  ].join("\n");

  const header = `[mcp_servers.${serverName}]`;
  if (!input.trim()) {
    return `${section}\n`;
  }

  const escapedHeader = escapeRegExp(header);
  const pattern = new RegExp(`(^|\\n)${escapedHeader}\\n(?:.*(?:\\n(?!\\[).*)*)?`, "m");
  if (pattern.test(input)) {
    return input.replace(pattern, `$1${section}`);
  }

  const normalized = input.endsWith("\n") ? input : `${input}\n`;
  return `${normalized}\n${section}\n`;
}

function upsertCodexHooksFeature(input) {
  const header = "[features]";
  const hooksLine = "hooks = true";
  if (!input.trim()) {
    return `${header}\n${hooksLine}\n`;
  }
  const lines = input.split("\n");
  const output = [];
  let featureBody = [];
  let foundFeatures = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() !== header) {
      output.push(line);
      continue;
    }
    if (!foundFeatures) {
      foundFeatures = true;
      for (index += 1; index < lines.length; index += 1) {
        const bodyLine = lines[index];
        if (bodyLine.startsWith("[")) {
          index -= 1;
          break;
        }
        const trimmed = bodyLine.trim();
        if (!trimmed || trimmed.startsWith("codex_hooks") || trimmed.startsWith("hooks")) {
          continue;
        }
        featureBody.push(bodyLine);
      }
    } else {
      for (index += 1; index < lines.length; index += 1) {
        if (lines[index].startsWith("[")) {
          index -= 1;
          break;
        }
      }
    }
  }
  const normalizedOutput = output.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  const featuresSection = [header, hooksLine, ...featureBody].join("\n");
  return foundFeatures
    ? `${normalizedOutput}\n${featuresSection}\n`
    : `${normalizedOutput}\n\n${featuresSection}\n`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlStringArray(values) {
  return `[${values.map((value) => tomlString(value)).join(", ")}]`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readText(filePath, fallback) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}
