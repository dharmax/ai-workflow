/**
 * Responsibility: Parse and synchronize project guidelines and knowledge into tagged blocks.
 * Scope: Handles markdown parsing, metadata extraction, and DB persistence for targeted injection.
 */

import { sha1, stableId } from "../lib/hash.mjs";
import { readProjectFile } from "../lib/filesystem.mjs";

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
 * Parses a markdown string into logical blocks based on headers and tags.
 * Supports <!-- tags: tag1, tag2 --> and <!-- category: architecture -->
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
        body: ""
      };
      continue;
    }

    if (currentBlock) {
      // Look for metadata tags: <!-- tags: tag1, tag2 -->
      const tagMatch = line.match(/<!--\s*tags:\s*(.+?)\s*-->/i);
      if (tagMatch) {
        currentBlock.tags = tagMatch[1].trim();
        continue;
      }

      const catMatch = line.match(/<!--\s*category:\s*(.+?)\s*-->/i);
      if (catMatch) {
        currentBlock.category = catMatch[1].trim();
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
  let blocks = store.listGuidelineBlocks();
  
  if (categories.length) {
    blocks = blocks.filter(b => categories.includes(b.category));
  }

  const lowerInput = inputText.toLowerCase();
  
  // Rank and filter based on simple keyword matching for now
  // In the future, this can use semantic embeddings
  return blocks
    .map(block => {
      let score = 0;
      const tags = block.tags.split(",").map(t => t.trim().toLowerCase());
      
      // Tag match = high priority
      for (const tag of tags) {
        if (tag && lowerInput.includes(tag)) score += 10;
      }

      // Title match = medium priority
      if (lowerInput.includes(block.title.toLowerCase())) score += 5;

      // Body match = low priority
      // (Simplified: check for a few keywords)
      const keywords = lowerInput.split(/\s+/).filter(w => w.length > 4);
      for (const word of keywords) {
        if (block.body.toLowerCase().includes(word)) score += 1;
      }

      return { block, score };
    })
    .filter(res => res.score > 0 || categories.length > 0) // Always return categories if explicitly requested
    .sort((a, b) => b.score - a.score)
    .slice(0, 10) // Limit to top 10
    .map(res => res.block);
}
