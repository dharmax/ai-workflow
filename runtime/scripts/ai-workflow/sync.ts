#!/usr/bin/env node

import { parseArgs } from "./lib/cli.ts";
import { syncProject } from "../../../core/services/sync.ts";

const args = parseArgs(process.argv.slice(2));
const result = await syncProject({
  projectRoot: process.cwd(),
  writeProjections: Boolean(args["write-projections"])
});

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write([
    `DB: ${result.dbPath}`,
    `Indexed files: ${result.indexedFiles}`,
    `Symbols: ${result.indexedSymbols}`,
    `Claims: ${result.indexedClaims}`,
    `Notes: ${result.indexedNotes}`
  ].join("\n") + "\n");
}
