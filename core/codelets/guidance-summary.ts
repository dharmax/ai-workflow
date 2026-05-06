/**
 * Responsibility: Extract relevant project guidance.
 */
import path from "node:path";
import { compileActiveGuardrails } from "../lib/active-guardrails.ts";
import { isWorkflowStatePath, normalizePath, readText } from "../lib/fs-utils.ts";
import { compactGuidanceItems, deriveKeywords, inferValidationPlan, summarizeGuidance } from "../lib/guidance-utils.ts";
import { getChanges, isGitRepo } from "../lib/git-utils.ts";
import { getToolkitRoot } from "../lib/toolkit-root.ts";
import { loadTicketContext } from "../lib/workflow-store-utils.ts";
import type { ServiceHub } from "../services/service-hub.ts";

export async function run(options: any, hub: any) {
  const root = path.resolve(String(options.root ?? hub.context.projectRoot));
  const toolkitRoot = getToolkitRoot();
  const fileInputs = options.files ? (Array.isArray(options.files) ? options.files : String(options.files).split(",")) : [];
  const files = [...fileInputs];
  let ticket = null;

  if (options.ticket) {
    const resolved = await loadTicketContext({ root, ticketId: options.ticket, kanbanPath: options.kanban ?? null });
    ticket = resolved.ticket;
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
  const ticketText = ticket ? `${ticket.heading}\n${ticket.body}` : "";
  const keywords = deriveKeywords({ ticketText, files: uniqueFiles });

  const [agents, contributing, executionProtocol, enforcement, guidelines, manual, knowledge] = await Promise.all([
    readText(path.resolve(root, "AGENTS.md")),
    readText(path.resolve(root, "CONTRIBUTING.md")),
    readText(path.resolve(root, "execution-protocol.md")),
    readText(path.resolve(root, "enforcement.md")),
    readText(path.resolve(root, "project-guidelines.md")),
    readText(path.resolve(root, "docs", "MANUAL.md"), await readText(path.resolve(toolkitRoot, "docs", "MANUAL.md"))),
    readText(path.resolve(root, "knowledge.md"))
  ]);

  const activeGuardrails = compileActiveGuardrails({
    agents, contributing, executionProtocol, enforcement, projectGuidelines: guidelines, manual, knowledge
  }, { keywords, limit: 8 });

  return {
    activeGuardrails,
    validationPlan: inferValidationPlan({ ticket, files: uniqueFiles }),
    guidance: {
      agents: compactGuidanceItems(summarizeGuidance(agents, keywords, { alwaysIncludeTop: true, limit: 4 })),
      contributing: compactGuidanceItems(summarizeGuidance(contributing, keywords, { limit: 4 })),
      executionProtocol: compactGuidanceItems(summarizeGuidance(executionProtocol, keywords, { limit: 4 })),
      enforcement: compactGuidanceItems(summarizeGuidance(enforcement, keywords, { limit: 3 })),
      projectGuidelines: compactGuidanceItems(summarizeGuidance(guidelines, keywords, { limit: 4 })),
      manual: compactGuidanceItems(summarizeGuidance(manual, keywords, { limit: 4 })),
      knowledge: compactGuidanceItems(summarizeGuidance(knowledge, keywords, { limit: 3 }))
    }
  };
}
