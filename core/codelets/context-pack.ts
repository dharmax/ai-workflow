/**
 * Responsibility: Bundle project context for agent consumption.
 * Scope: Gathers guidance, guardrails, and working set evidence.
 */

import path from "node:path";
import { compileActiveGuardrails } from "../lib/active-guardrails.ts";
import { isWorkflowStatePath, normalizePath, readText } from "../lib/fs-utils.ts";
import { compactGuidanceItems, deriveKeywords, inferValidationPlan, summarizeGuidance } from "../lib/guidance-utils.ts";
import { getChanges, isGitRepo } from "../lib/git-utils.ts";
import { getToolkitRoot } from "../lib/toolkit-root.ts";
import { inferTicketWorkingSet, loadTicketContext } from "../lib/workflow-store-utils.ts";


export interface ContextPackOptions {
  root?: string;
  ticket?: string;
  kanban?: string;
  files?: string[];
  changed?: boolean;
}

export async function run(options: ContextPackOptions, hub: any) {
  const root = path.resolve(String(options.root ?? hub.context.projectRoot));
  const toolkitRoot = getToolkitRoot();
  const files = [...(options.files ?? [])];
  let ticket = null;
  let ticketEntity = null;
  let ticketSourcePath = null;

  if (options.ticket) {
    const resolved = await loadTicketContext({ root, ticketId: options.ticket, kanbanPath: options.kanban ?? null });
    ticket = resolved.ticket;
    ticketEntity = resolved.entity;
    ticketSourcePath = resolved.sourcePath;
  }

  if (options.changed) {
    if (await isGitRepo(root)) {
      const changed = await getChanges(root);
      for (const change of changed) {
        files.push(change.path);
      }
    }
  }

  const uniqueFiles = [...new Set(files.filter(Boolean).map(normalizePath).filter((filePath) => !isWorkflowStatePath(filePath)))];
  const inferredWorkingSet = uniqueFiles.length
    ? { files: [], symbols: [], evidence: [] }
    : await inferTicketWorkingSet({ root, ticket, entity: ticketEntity });
  const workingSetFiles = [...new Set([...uniqueFiles, ...inferredWorkingSet.files].filter(Boolean).map(normalizePath))];
  const ticketText = ticket ? `${ticket.heading}
${ticket.body}` : "";
  const keywords = deriveKeywords({ ticketText, files: workingSetFiles });
  
  const [agents, contributing, executionProtocol, enforcement, guidelines, manual, knowledge] = await Promise.all([
    readText(path.resolve(root, "AGENTS.md")),
    readText(path.resolve(root, "CONTRIBUTING.md")),
    readText(path.resolve(root, "execution-protocol.md")),
    readText(path.resolve(root, "enforcement.md")),
    readText(path.resolve(root, "project-guidelines.md")),
    readText(path.resolve(root, "docs", "MANUAL.md"), await readText(path.resolve(toolkitRoot, "docs", "MANUAL.md"))),
    readText(path.resolve(root, "knowledge.md"))
  ]);

  const guidanceSlices = compactGuidanceItems([
    ...summarizeGuidance(agents, keywords, { alwaysIncludeTop: true, limit: 3, fallbackLimit: 2 }),
    ...summarizeGuidance(contributing, keywords, { limit: 2, fallbackLimit: 2 }),
    ...summarizeGuidance(executionProtocol, keywords, { limit: 3, fallbackLimit: 2 }),
    ...summarizeGuidance(enforcement, keywords, { limit: 2, fallbackLimit: 1 }),
    ...summarizeGuidance(guidelines, keywords, { limit: 3, fallbackLimit: 2 }),
    ...summarizeGuidance(manual, keywords, { limit: 4, fallbackLimit: 2 }),
    ...summarizeGuidance(knowledge, keywords, { limit: 2, fallbackLimit: 1 })
  ], { limit: 10 });

  const activeGuardrails = compileActiveGuardrails({
    agents, contributing, executionProtocol, enforcement, projectGuidelines: guidelines, manual, knowledge
  }, { keywords, limit: 6 });

  return {
    root,
    ticket: ticket ? { id: ticket.id, title: ticket.title, section: ticket.section } : null,
    workingSet: workingSetFiles,
    relevantSymbols: inferredWorkingSet.symbols,
    guidanceSlices,
    activeGuardrails,
    sessionHygiene: recommendSessionHygiene({ fileCount: workingSetFiles.length, guidanceCount: guidanceSlices.length, ticket })
  };
}

function recommendSessionHygiene({ fileCount, guidanceCount, ticket }: any) {
  if (fileCount >= 16 || (ticket && fileCount >= 12)) return { recommendation: "/new" };
  if (fileCount >= 10 || guidanceCount >= 8) return { recommendation: "/compact" };
  return { recommendation: "stay" };
}
