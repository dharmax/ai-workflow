#!/usr/bin/env node
import { runCodeletScript } from "./_run-codelet.ts";

await runCodeletScript({
  codeletId: "kanban-ops",
  modulePath: "core/codelets/kanban.ts",
  presenterId: "kanban-ops"
});
