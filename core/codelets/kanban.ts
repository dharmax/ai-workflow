/**
 * Responsibility: Manage the markdown-based Kanban board.
 * Scope: Smart Codelet for ticket lifecycle operations.
 */

import type { ServiceHub } from "../services/service-hub.ts";

export async function run(args: any, hub: typeof ServiceHub) {
  const subcommand = args._[0];

  switch (subcommand) {
    case "new":
      return hub.kanban.newTicket(args);
    case "move":
      return hub.kanban.moveTicket(args.id, args.to, args);
    case "next":
      return hub.kanban.getNext(args);
    default:
      throw new Error(`Unknown kanban subcommand: ${subcommand}`);
  }
}
