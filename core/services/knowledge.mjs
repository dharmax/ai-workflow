import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getGlobalConfigPath, getProjectConfigPath, readConfigSafe } from "../../cli/lib/config-store.mjs";
import { readText } from "../../runtime/scripts/ai-workflow/lib/fs-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_KNOWLEDGE_PATH = path.resolve(__dirname, "../../shared/knowledge.json");
const MODEL_REFERENCE_PATH = path.resolve(__dirname, "../../shared/model-reference.json");
const PROJECT_KNOWLEDGE_CANDIDATES = [
  "knowledge.md",
  path.join("docs", "knowledge.md")
];

export async function loadKnowledge({ root = process.cwd(), projectConfig = {}, globalConfig = {} } = {}) {
  const [builtinText, referenceText, projectKnowledge] = await Promise.all([
    readText(BUILTIN_KNOWLEDGE_PATH, "{}"),
    readText(MODEL_REFERENCE_PATH, "{\"models\":[]}"),
    loadProjectKnowledge(root)
  ]);
  const builtin = JSON.parse(builtinText);
  const reference = JSON.parse(referenceText);

  // Merge hierarchy: Builtin < Global < Project
  return {
    version: projectConfig.knowledge?.version ?? builtin.version,
    modelReference: reference.models,
    tasks: mergeLists(builtin.tasks, globalConfig.knowledge?.tasks, projectConfig.knowledge?.tasks),
    capabilityMapping: {
      ...builtin.capabilityMapping,
      ...(globalConfig.knowledge?.capabilityMapping ?? {}),
      ...(projectConfig.knowledge?.capabilityMapping ?? {})
    },
    facts: mergeLists(
      builtin.facts,
      globalConfig.knowledge?.facts,
      projectConfig.knowledge?.facts,
      projectKnowledge.facts
    ),
    minimumQuality: {
      ...builtin.minimumQuality,
      ...(globalConfig.knowledge?.minimumQuality ?? {}),
      ...(projectConfig.knowledge?.minimumQuality ?? {})
    },
    models: mergeModels(builtin.models, globalConfig.knowledge?.models, projectConfig.knowledge?.models),
    projectKnowledgePath: projectKnowledge.path
  };
}

export async function recordProjectKnowledge({
  root = process.cwd(),
  ticketId,
  title = "",
  lane = "",
  status = "",
  lessons = [],
  changedFiles = [],
  selection = null
} = {}) {
  const resolvedPath = await resolveProjectKnowledgePath(root);
  const heading = "# Project Knowledge";
  const sectionHeading = "## Learned Fixes";
  const current = await readText(resolvedPath, "");
  const lines = [];

  if (!current.trim()) {
    lines.push(heading, "", sectionHeading, "");
  } else {
    lines.push(current.trimEnd());
    if (!/\n## Learned Fixes\b/.test(current)) {
      lines.push("", sectionHeading, "");
    }
  }

  const summaryParts = [
    `[${new Date().toISOString().slice(0, 10)}]`,
    ticketId ? `${ticketId}` : null,
    status ? `[${status}]` : null,
    title ? title.trim() : null
  ].filter(Boolean);
  const summaryLine = `- ${summaryParts.join(" ")}`;
  const existingText = lines.join("\n");
  if (existingText.includes(summaryLine)) {
    return { updated: false, path: resolvedPath };
  }

  lines.push(summaryLine);
  if (lane) {
    lines.push(`  - Lane: ${lane}`);
  }
  if (selection?.reasons?.length) {
    lines.push(`  - Priority: ${selection.priorityScore ?? "n/a"} (${selection.reasons.join(", ")})`);
  }
  for (const lesson of normalizeStringArray(lessons).slice(0, 5)) {
    lines.push(`  - ${lesson}`);
  }
  if (Array.isArray(changedFiles) && changedFiles.length) {
    lines.push(`  - Changed files: ${changedFiles.join(", ")}`);
  }
  lines.push("");

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
  return { updated: true, path: resolvedPath };
}

export async function updateKnowledgeRemote({
  root = process.cwd(),
  sourceUrl = null,
  destinationPath = BUILTIN_KNOWLEDGE_PATH,
  fetchImpl = globalThis.fetch,
  projectConfig = null,
  globalConfig = null
} = {}) {
  if (typeof fetchImpl !== "function") {
    return {
      success: false,
      skipped: false,
      reason: "Fetch is not available in this runtime.",
      destinationPath
    };
  }

  const resolvedUrl = await resolveKnowledgeRemoteUrl({
    root,
    sourceUrl,
    projectConfig,
    globalConfig
  });

  if (!resolvedUrl) {
    return {
      success: false,
      skipped: true,
      reason: "No remote knowledge URL configured.",
      destinationPath,
      hint: "Set AIWF_BUILTIN_KNOWLEDGE_URL or configure knowledge.remoteUrl in project/global config."
    };
  }

  const response = await fetchImpl(resolvedUrl);
  if (!response?.ok) {
    return {
      success: false,
      skipped: false,
      reason: `Fetch failed with status ${response?.status ?? "unknown"}.`,
      status: response?.status ?? null,
      statusText: response?.statusText ?? null,
      sourceUrl: resolvedUrl,
      destinationPath
    };
  }

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return {
      success: false,
      skipped: false,
      reason: `Remote knowledge payload is not valid JSON: ${error.message}`,
      sourceUrl: resolvedUrl,
      destinationPath
    };
  }

  let normalized;
  try {
    normalized = normalizeKnowledgePayload(payload);
  } catch (error) {
    return {
      success: false,
      skipped: false,
      reason: error.message,
      sourceUrl: resolvedUrl,
      destinationPath
    };
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return {
    success: true,
    skipped: false,
    sourceUrl: resolvedUrl,
    destinationPath,
    version: normalized.version,
    taskCount: normalized.tasks.length,
    modelProviderCount: Object.keys(normalized.models ?? {}).length
  };
}

function mergeLists(...lists) {
  const set = new Set();
  for (const list of lists) {
    if (Array.isArray(list)) {
      for (const item of list) set.add(item);
    }
  }
  return [...set];
}

function mergeModels(builtin, global = {}, project = {}) {
  const providers = new Set([...Object.keys(builtin), ...Object.keys(global), ...Object.keys(project)]);
  const result = {};

  for (const id of providers) {
    // For now, we simple-merge the model arrays. 
    // In a more advanced version, we could merge specific model entries by ID.
    result[id] = project[id] ?? global[id] ?? builtin[id] ?? [];
  }

  return result;
}

async function resolveKnowledgeRemoteUrl({ root, sourceUrl, projectConfig, globalConfig }) {
  if (sourceUrl) {
    return String(sourceUrl).trim() || null;
  }

  const [projectResult, globalResult] = await Promise.all([
    projectConfig ? Promise.resolve({ config: projectConfig }) : readConfigSafe(getProjectConfigPath(root)),
    globalConfig ? Promise.resolve({ config: globalConfig }) : readConfigSafe(getGlobalConfigPath())
  ]);

  return (
    process.env.AIWF_BUILTIN_KNOWLEDGE_URL
    ?? projectResult.config?.knowledge?.remoteUrl
    ?? globalResult.config?.knowledge?.remoteUrl
    ?? null
  );
}

function normalizeKnowledgePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Remote knowledge payload must be a JSON object.");
  }

  return {
    ...payload,
    version: String(payload.version ?? "").trim() || "unknown",
    tasks: normalizeStringArray(payload.tasks),
    facts: normalizeStringArray(payload.facts),
    capabilityMapping: normalizeStringMap(payload.capabilityMapping),
    minimumQuality: normalizeStringMap(payload.minimumQuality),
    inferenceHeuristics: isPlainObject(payload.inferenceHeuristics) ? payload.inferenceHeuristics : {},
    models: normalizeModelGroups(payload.models)
  };
}

async function loadProjectKnowledge(root) {
  const knowledgePath = await findExistingProjectKnowledgePath(root);
  if (!knowledgePath) {
    return { path: null, facts: [] };
  }
  const markdown = await readText(knowledgePath, "");
  return {
    path: knowledgePath,
    facts: extractKnowledgeFacts(markdown)
  };
}

async function findExistingProjectKnowledgePath(root) {
  for (const relativePath of PROJECT_KNOWLEDGE_CANDIDATES) {
    const absolutePath = path.resolve(root, relativePath);
    const content = await readText(absolutePath, "");
    if (content) {
      return absolutePath;
    }
  }
  return null;
}

async function resolveProjectKnowledgePath(root) {
  return (await findExistingProjectKnowledgePath(root)) ?? path.resolve(root, "knowledge.md");
}

function extractKnowledgeFacts(markdown) {
  return normalizeStringArray(
    String(markdown ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
      .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
      .filter((line) => line && !/^Lane: /i.test(line) && !/^Priority: /i.test(line))
  );
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))]
    : [];
}

function normalizeStringMap(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = String(key ?? "").trim();
    const normalizedValue = String(entry ?? "").trim();
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return result;
}

function normalizeModelGroups(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const result = {};
  for (const [providerId, models] of Object.entries(value)) {
    if (!Array.isArray(models)) {
      continue;
    }
    result[providerId] = models.filter((model) => isPlainObject(model) && String(model.id ?? "").trim());
  }
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
