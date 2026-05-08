/**
 * @file context-packer.js
 * @brief Auto-generated header for context-packer.js. Needs detailed responsibility and scope.
 */

import { withWorkflowStore } from "./sync.ts";
import { readProjectFile } from "../lib/filesystem.ts";
import { SEMANTICS } from "../lib/registry.ts";
import { probeLeanCtx } from "./lean-ctx.ts";
import { inferTicketRetrievalContextFromStore } from "./shell-retrieval.ts";
import { HeuristicContextManager, LeanContextCompressor } from "@dharmax/context-manager";

/**
 * Context Packer
 * Builds surgical, minimal context for AI tasks.
 * Delegates gathering and compression to @dharmax/context-manager.
 */
export async function buildSurgicalContext(projectRoot, { symbolNames = [], filePaths = [], ticketId = null } = {}) {
  const budget = SEMANTICS.BUDGET;
  const leanCtx = await probeLeanCtx();

  return withWorkflowStore(projectRoot, async (store) => {
    const context: any = {
      files: [],
      symbols: [],
      guidelines: [],
      ticket: null,
      budgetReached: false,
      tooling: {
        leanCtx
      }
    };

    if (ticketId) {
      context.ticket = store.getEntity(ticketId);
    }

    const retrieval = ticketId
      ? inferTicketRetrievalContextFromStore(store, {
        projectRoot,
        ticket: null,
        entity: context.ticket,
        profile: "execute",
        limit: budget.MAX_FILES
      })
      : null;

    context.retrieval = retrieval;
    const inferredFilePaths = retrieval?.files ?? [];
    const inferredSymbolNames = (retrieval?.symbols ?? []).map((symbol) => symbol.name).filter(Boolean);

    const selectedFiles = [...new Set([...filePaths, ...inferredFilePaths].filter(Boolean))].slice(0, budget.MAX_FILES);
    for (const filePath of selectedFiles) {
      try {
        const file = await readProjectFile(projectRoot, filePath);
        context.files.push({ path: filePath, content: file.content });
      } catch {
        // Skip missing or unreadable inferred files.
      }
    }

    for (const symbol of retrieval?.symbols ?? []) {
      context.symbols.push({
        id: symbol.id,
        name: symbol.name,
        kind: symbol.kind,
        path: symbol.path,
        line: symbol.line,
        snippet: symbol.snippet ?? symbol.signature ?? ""
      });
    }

    for (const symbolName of symbolNames.filter(Boolean)) {
      const matches = store.listSymbols({ name: symbolName }).slice(0, 3);
      for (const symbol of matches) {
        if (context.symbols.some((item) => item.id === symbol.id)) {
          continue;
        }
        let snippet = "";
        try {
          const file = await readProjectFile(projectRoot, symbol.filePath);
          snippet = extractSymbolSnippet(file.content, symbol);
        } catch {
          snippet = "";
        }
        context.symbols.push({
          id: symbol.id,
          name: symbol.name,
          kind: symbol.kind,
          path: symbol.filePath,
          line: symbol.line,
          snippet
        });
      }
    }

    if (selectedFiles.length >= budget.MAX_FILES) {
      context.budgetReached = true;
    }

    return context;
  });
}

function extractSymbolSnippet(content, symbol) {
  const lines = content.split("\n");
  const metadata = symbol.metadata ?? {};
  const startLine = metadata.declarationLine ?? symbol.line ?? 1;
  const start = Math.max(0, startLine - 1);
  const end = Math.min(lines.length, start + 20);
  return lines.slice(start, end).join("\n");
}

export function formatContextForPrompt(context) {
  const parts = [];

  if (context.tooling?.leanCtx && !context.tooling.leanCtx.installed) {
    parts.push("## Tooling\nlean-ctx is missing; offer install/setup before long context-heavy work.");
  }

  if (context.ticket) {
    parts.push(`## Ticket: ${context.ticket.id}\n${context.ticket.title}\n${context.ticket.data?.summary ?? ""}`);
  }

  if (typeof context.retrieval?.confidence === "number" && context.retrieval.confidence < 0.55) {
    parts.push("## Retrieval Warning\nEvidence is weak. Validate the working set before relying on it for broad edits or higher-cost planning.");
  }

  if (context.retrieval?.evidence?.length) {
    parts.push("## Retrieval Evidence");
    for (const item of context.retrieval.evidence.slice(0, 4)) {
      const reasons = Array.isArray(item.reasons) ? item.reasons.map((reason) => reason.title || reason.via).filter(Boolean) : [];
      parts.push(`- ${item.kind}: ${item.target}${reasons.length ? ` (${reasons.join("; ")})` : ""}`);
    }
  }

  if (context.files.length) {
    parts.push("## Files");
    for (const file of context.files) {
      parts.push(`File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``);
    }
  }

  if (context.symbols.length) {
    parts.push("## Relevant Symbols");
    for (const sym of context.symbols) {
      const header = `${sym.kind ?? "symbol"} ${sym.name} (${sym.path}${sym.line ? `:${sym.line}` : ""})`;
      parts.push(`Symbol: ${header}\n\`\`\`\n${sym.snippet ?? sym.signature ?? ""}\n\`\`\``);
    }
  }

  return parts.join("\n\n");
}
