#!/usr/bin/env node
import { runCodeletScript } from "./_run-codelet.ts";

await runCodeletScript({
  codeletId: "context-pack",
  modulePath: "core/codelets/context-pack.ts",
  presenterId: "context-pack"
});
