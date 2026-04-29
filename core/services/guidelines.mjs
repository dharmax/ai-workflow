/**
 * Responsibility: Parse and synchronize project guidelines and knowledge into tagged blocks.
 * Scope: Handles markdown parsing, metadata extraction, enrichment (LLM), and DB persistence.
 */

import { sha1, stableId } from "../lib/hash.mjs";
import { readProjectFile, writeProjectFile, loadPromptTemplate, renderTemplate } from "../lib/filesystem.mjs";
import { generateCompletion } from "./providers.mjs";
import { routeTask } from "./router.mjs";
import { HeuristicContextManager } from "@dharmax/context-manager";

/**
 * Synchronizes guidelines and knowledge from files into the database.
 */
export async function syncGuidelineBlocks(store, { projectRoot }) {
  const files = [
    { path: "project-guidelines.md", category: "coding" },
    { path: "execution-protocol.md", category: "process" },
    { path: "knowledge.md", category: "lore" }
  ];

  for (const fileSpec of files) {
    const file = await readProjectFile(projectRoot, fileSpec.path).catch(() => null);
    if (!file || !file.content) {
        store.pruneGuidelineBlocks(fileSpec.path, []);
        continue;
    }

    const blocks = parseMarkdownBlocks(file.content, fileSpec.path, fileSpec.category);
    const keepIds = new Set();

    for (const block of blocks) {
      store.upsertGuidelineBlock(block);
      keepIds.add(block.id);
    }

    store.pruneGuidelineBlocks(fileSpec.path, keepIds);
  }
}

/**
 * Enriches guideline files with LLM-generated categories and tags.
 */
export async function enrichGuidelineBlocks(store, { projectRoot, options = {} }) {
  const files = [
    "project-guidelines.md",
    "execution-protocol.md",
    "knowledge.md"
  ];

  for (const filePath of files) {
    const file = await readProjectFile(projectRoot, filePath).catch(() => null);
    if (!file || !file.content) continue;

    console.log(`[guidelines] Enriching ${filePath}...`);
    const blocks = parseMarkdownBlocks(file.content, filePath, "general");
    let updatedContent = file.content;

    for (const block of blocks) {
      // Skip if already has tags and category (and category is not the default generic one)
      if (block.hasExplicitMetadata && block.category !== "general" && !options.force) {
        continue;
      }

      console.log(`  - Suggesting metadata for: ${block.title}`);
      const metadata = await suggestBlockMetadata(block, { projectRoot });
      if (metadata) {
        updatedContent = injectBlockMetadata(updatedContent, block.title, metadata);
      }
    }

    if (updatedContent !== file.content) {
      await writeProjectFile(projectRoot, filePath, updatedContent);
      console.log(`[guidelines] Updated ${filePath} with enriched metadata.`);
    }
  }
}

async function suggestBlockMetadata(block, { projectRoot }) {
  const { content: system } = await loadPromptTemplate("guideline-enricher.system");
  const { content: userTemplate } = await loadPromptTemplate("guideline-enricher.prompt");
  
  if (!system || !userTemplate) {
    throw new Error("Missing guideline-enricher prompt templates.");
  }

  const prompt = renderTemplate(userTemplate, {
    title: block.title,
    body: block.body
  });

  const route = await routeTask({ root: projectRoot, taskClass: "classification" });
  let candidate = route.recommended ?? route.candidates?.[0];

  if (process.env.AI_WORKFLOW_PLANNER_MODEL) {
    const [p, m] = process.env.AI_WORKFLOW_PLANNER_MODEL.split(":");
    const envProvider = route.providers[p];
    candidate = { providerId: p, modelId: m, host: envProvider?.host, apiKey: envProvider?.apiKey, baseUrl: envProvider?.baseUrl };
  }

  if (!candidate) return null;

  try {
    const completion = await generateCompletion({
      providerId: candidate.providerId,
      modelId: candidate.modelId,
      system,
      prompt,
      config: { host: candidate.host, apiKey: candidate.apiKey, baseUrl: candidate.baseUrl, format: "json" }
    });

    const text = completion.response.trim();
    let result = null;
    try {
      result = JSON.parse(text);
    } catch (e) {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        try { result = JSON.parse(match[1]); } catch (e2) {}
      }
      if (!result) {
        const first = text.indexOf("{");
        const last = text.lastIndexOf("}");
        if (first !== -1 && last > first) {
          try { result = JSON.parse(text.slice(first, last + 1)); } catch (e3) {}
        }
      }
    }
    
    if (result && typeof result === "object") {
        return {
            category: String(result.category || "general"),
            tags: String(result.tags || "")
        };
    }
    return null;
  } catch (error) {
    console.error(`[guidelines] Enrichment failed for ${block.title}: ${error.message}`);
    return null;
  }
}

function injectBlockMetadata(content, title, metadata) {
  if (!metadata || !metadata.category || !metadata.tags) {
    return content;
  }
  const lines = content.split(/\r?\n/);
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    const headerMatch = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch && headerMatch[2].trim() === title) {
      // Check if metadata already exists in subsequent lines
      let found = false;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j].includes("<!-- category:") || lines[j].includes("<!-- tags:")) {
              found = true;
              break;
          }
      }
      if (!found) {
        result.push(`<!-- category: ${metadata.category} -->`);
        result.push(`<!-- tags: ${metadata.tags} -->`);
      }
    }
  }

  return result.join("\n");
}

/**
 * Parses a markdown string into logical blocks based on headers and tags.
 */
function parseMarkdownBlocks(content, sourceFile, defaultCategory) {
  const blocks = [];
  const lines = content.split(/\r?\n/);
  
  let currentBlock = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (currentBlock) {
        currentBlock.body = currentBlock.body.trim();
        currentBlock.checksum = sha1(currentBlock.body);
        blocks.push(currentBlock);
      }
      
      const title = headerMatch[2].trim();
      currentBlock = {
        id: stableId("block", sourceFile, title),
        sourceFile,
        category: defaultCategory,
        tags: "",
        title,
        body: "",
        hasExplicitMetadata: false
      };
      continue;
    }

    if (currentBlock) {
      const tagMatch = line.match(/<!--\s*tags:\s*(.+?)\s*-->/i);
      if (tagMatch) {
        currentBlock.tags = tagMatch[1].trim();
        currentBlock.hasExplicitMetadata = true;
        continue;
      }

      const catMatch = line.match(/<!--\s*category:\s*(.+?)\s*-->/i);
      if (catMatch) {
        currentBlock.category = catMatch[1].trim();
        currentBlock.hasExplicitMetadata = true;
        continue;
      }

      currentBlock.body += line + "\n";
    }
  }

  if (currentBlock) {
    currentBlock.body = currentBlock.body.trim();
    currentBlock.checksum = sha1(currentBlock.body);
    blocks.push(currentBlock);
  }

  return blocks;
}

/**
 * Retrieves relevant blocks based on input text and context.
 */
export async function getRelevantGuidelineBlocks(store, { inputText, categories = [] }) {
  const originalBlocks = store.listGuidelineBlocks();
  const blocksById = new Map(originalBlocks.map((block) => [block.id, block]));
  const manager = new HeuristicContextManager({
    async query() {
      return originalBlocks.map((block) => ({
        id: block.id,
        category: block.category,
        tags: String(block.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        title: block.title,
        body: block.body
      }));
    }
  }, {
    defaultMaxItems: 15
  });

  const result = await manager.resolve({
    query: inputText,
    categories,
    maxItems: 15,
    output: {
      mode: "items",
      format: "markdown"
    }
  });

  return (result.items ?? [])
    .map((item) => blocksById.get(item.id))
    .filter(Boolean);
}
