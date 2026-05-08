#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "aiwf-common-core/lib/cli";
import { ServiceHub } from "aiwf-common-core/services/service-hub";
import { initializeRegistry } from "aiwf-common-core/services/registry-init";
import { ShellPresenter } from "aiwf-common-core/services/presenter";
import { ExecutionMode } from "aiwf-common-core/services/execution-context";

export async function runCodeletScript({
  codeletId,
  modulePath = null,
  presenterId = codeletId
}: {
  codeletId: string;
  modulePath?: string | null;
  presenterId?: string;
}) {
  const args = parseArgs(process.argv.slice(2));
  ServiceHub.setContext({
    projectRoot: process.cwd(),
    mode: ExecutionMode.Shell
  });
  initializeRegistry();

  let result;
  if (ServiceHub.has(codeletId)) {
    result = await ServiceHub.execute(codeletId, args);
  } else {
    if (!modulePath) {
      throw new Error(`Unknown codelet: ${codeletId}`);
    }
    const mod = await import(pathToFileURL(path.resolve(modulePath)).href);
    if (typeof mod.run !== "function") {
      throw new Error(`Codelet module is missing run(): ${modulePath}`);
    }
    result = await mod.run(args, ServiceHub);
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(ShellPresenter.formatCodeletResult(presenterId, result));
}
