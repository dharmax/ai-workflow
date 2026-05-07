#!/usr/bin/env node
import { runCli } from "./_run-cli.ts";

runCli(["telegram", "preview", ...process.argv.slice(2)]);
