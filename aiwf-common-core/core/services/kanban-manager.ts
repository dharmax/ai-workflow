/**
 * Responsibility: Provide programmatic access to Kanban board management.
 * Scope: Handles ticket lifecycle within the markdown-based Kanban board.
 */

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { readText } from "../lib/fs-utils.ts";
import { withWorkspaceMutation } from "../lib/workspace-mutation.ts";
import {
  archiveOldDoneTickets,
  createTicket,
  getNextTicket,
  moveTicket,
  parseKanbanDocument,
  renderKanbanDocument
} from "../lib/kanban-edit-utils.ts";
import type { ExecutionContext } from "./execution-context.ts";

export class KanbanManager {
  constructor(private context: ExecutionContext) {}

  async newTicket(options: any) {
    const root = this.context.projectRoot;
    const kanbanPath = path.resolve(root, options.file ?? "kanban.md");
    const markdown = await readText(kanbanPath);
    const document = parseKanbanDocument(markdown);
    
    const result = createTicket(document, options);
    const nextMarkdown = renderKanbanDocument(document);

    if (!options.dryRun) {
      await withWorkspaceMutation(root, "kanban new", async () => {
        await writeFile(kanbanPath, nextMarkdown, "utf8");
      });
    }

    return result;
  }

  async moveTicket(ticketId: string, targetSection: string, options: any = {}) {
    const root = this.context.projectRoot;
    const kanbanPath = path.resolve(root, options.file ?? "kanban.md");
    const markdown = await readText(kanbanPath);
    const document = parseKanbanDocument(markdown);
    
    const result = moveTicket(document, ticketId, targetSection, options);
    const nextMarkdown = renderKanbanDocument(document);

    if (!options.dryRun) {
      await withWorkspaceMutation(root, "kanban move", async () => {
        await writeFile(kanbanPath, nextMarkdown, "utf8");
      });
    }

    return result;
  }

  async getNext(options: any = {}) {
    const root = this.context.projectRoot;
    const kanbanPath = path.resolve(root, options.file ?? "kanban.md");
    const markdown = await readText(kanbanPath);
    const document = parseKanbanDocument(markdown);
    
    return getNextTicket(document, options);
  }
}
