#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runCodeletScript } from "../../../scripts/ai-workflow/_run-codelet.ts";

export * from "aiwf-common-core/lib/dogfood-utils";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCodeletScript({ codeletId: "dogfood" });
}
