#!/usr/bin/env node
import { runCodeletScript } from "./_run-codelet.ts";

await runCodeletScript({
  codeletId: "execute-ticket",
  modulePath: "core/codelets/execute-ticket.ts",
  presenterId: "execute-ticket"
});
