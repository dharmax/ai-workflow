#!/usr/bin/env node
import { runCli } from "./_run-cli.ts";

runCli(["project", "search", ...process.argv.slice(2)]);
