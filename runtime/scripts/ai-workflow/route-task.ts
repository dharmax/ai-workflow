#!/usr/bin/env node

import { parseArgs, printAndExit } from "./lib/cli.ts";
import { routeTask } from "../../../core/services/router.ts";

const [taskClass, ...rest] = process.argv.slice(2);
if (!taskClass) {
  printAndExit("Usage: route-task.mjs <task-class> [--json]", 1);
}
const args: any = parseArgs(rest);
const route = await routeTask({
  root: process.cwd(),
  taskClass,
  preferLocal: args["prefer-local"] === undefined
    ? undefined
    : args["prefer-local"] !== false && args["prefer-local"] !== "false"
});

if (args.json) {
  process.stdout.write(`${JSON.stringify(route, null, 2)}\n`);
} else if (route.recommended) {
  process.stdout.write(`${route.recommended.providerId}:${route.recommended.modelId}\n${route.recommended.reason}\n`);
} else {
  process.stdout.write(`No route available for ${taskClass}\n`);
}
