#!/usr/bin/env node
import { assertDirectCommandChannel } from "aiwf-common-core/lib/command-channel";
import { runCodeletScript } from "./_run-codelet.ts";

assertDirectCommandChannel("ai-workflow kanban");

await runCodeletScript({
  codeletId: "kanban-ops",
  presenterId: "kanban-ops"
});
