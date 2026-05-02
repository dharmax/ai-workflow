#!/usr/bin/env node

import { parseArgs } from "./lib/cli.ts";
import { buildTelegramPreview } from "../../../core/services/telegram.ts";

const args: any = parseArgs(process.argv.slice(2));
const preview = await buildTelegramPreview({ projectRoot: process.cwd() });

if (args.json) {
  process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
} else {
  process.stdout.write(preview.text);
}
