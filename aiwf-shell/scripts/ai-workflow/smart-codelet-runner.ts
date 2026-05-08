#!/usr/bin/env node
import { runCodeletScript } from "./_run-codelet.ts";

await runCodeletScript({
  codeletId: "smart-codelet-runner",
  presenterId: "smart-codelet-runner"
});
