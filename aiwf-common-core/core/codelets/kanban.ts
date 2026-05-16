/**
 * Responsibility: Manage the markdown-based Kanban board.
 */
import { KanbanManager } from "../services/kanban-manager.ts";


export async function run(args: any, hub: any) {
  const manager = new KanbanManager(hub.context);
  const subcommand = args._[0];

  switch (subcommand) {
    case "new": return manager.newTicket(args);
    case "move": return manager.moveTicket(args.id, args.to, args);
    case "next": return manager.getNext(args);
    case "archive": return manager.archiveDoneTickets(args);
    default: throw new Error(`Unknown kanban subcommand: ${subcommand}`);
  }
}
