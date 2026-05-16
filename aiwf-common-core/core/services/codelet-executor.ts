
import { ServiceHub } from "./service-hub.ts";
/**
 * @file codelet-executor.js
 * @brief Auto-generated header for codelet-executor.js. Needs detailed responsibility and scope.
 */

import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { TaskExecutor } from "@dharmax/shell-proc-utils";
import { getWorkspaceRoot } from "../lib/toolkit-root.ts";

export async function executeCodelet(codelet, args = [], { cwd = process.cwd(), env = process.env, mode = "stream" } = {}) {
  if (ServiceHub.has(codelet.id)) {
    return ServiceHub.execute(codelet.id, normalizeRegisteredCodeletArgs(args));
  }

  const entry = codelet.entryPath ?? (codelet.entry ? path.resolve(cwd, codelet.entry) : null);
  if (codelet.runner !== "node-script") {
    throw new Error(`Unsupported codelet runner: ${codelet.runner}`);
  }
  if (!entry) {
    throw new Error(`Codelet ${codelet.id} is missing an executable entry.`);
  }

  if (mode !== "capture" && isJsExecutionCodelet(codelet, entry) && !isCliScriptWrapper(entry)) {
    const inProcess = await tryRunInProcess(entry, args, { env, cwd });
    if (inProcess.used) {
      return inProcess.result;
    }
  }

  return mode === "capture"
    ? runNodeScriptCaptured(entry, args, { cwd, env })
    : runNodeScriptStreamed(entry, args, { cwd, env });
}

function isJsExecutionCodelet(codelet, entry) {
  return codelet.execution === "js"
    || codelet.runtime === "js"
    || String(entry ?? "").includes("smart-codelet-runner.ts");
}

function isCliScriptWrapper(entry) {
  return String(entry ?? "").includes(`${path.sep}aiwf-shell${path.sep}scripts${path.sep}ai-workflow${path.sep}`);
}

async function tryRunInProcess(entry, args, { env, cwd = process.cwd() }) {
  const module = await import(pathToFileURL(entry).href);
  const runner = module.runSmartCodelet ?? module.runCodelet ?? module.run ?? module.main ?? module.default;
  if (typeof runner !== "function") {
    return { used: false, result: null };
  }

  // Ensure hub context is set for the current workspace
  ServiceHub.setContext({ projectRoot: cwd, mode: ServiceHub.context.mode });
  
  // Provide the static ServiceHub to the codelet
  const result = await runner(args, ServiceHub);
  return { used: true, result };
}

async function runNodeScriptCaptured(scriptPath, args, { cwd, env }) {
  return mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "ai-workflow-codelet-")).then(async (captureDir) => {
    const stdoutPath = path.join(captureDir, "stdout.log");
    const stderrPath = path.join(captureDir, "stderr.log");
    const command = `${shellQuote(process.execPath)} ${getTsxCliArgs(scriptPath, args).map(shellQuote).join(" ")} > ${shellQuote(stdoutPath)} 2> ${shellQuote(stderrPath)}`;

    try {
      const result = await TaskExecutor.spawn("/usr/bin/bash", ["-lc", command], {
        cwd,
        env
      });
      const stdout = await readFile(stdoutPath, "utf8").catch(() => "");
      const stderr = await readFile(stderrPath, "utf8").catch(() => "");
      if (!result.ok) {
        throw new Error(stderr || stdout || result.stderr || result.combined || "Codelet capture command failed.");
      }
      return `${stdout}${stderr}`.trimEnd() + "\n";
    } finally {
      await rm(captureDir, { recursive: true, force: true });
    }
  });
}

async function runNodeScriptStreamed(scriptPath, args, { cwd, env }) {
  return new Promise((resolve) => {
    const child = TaskExecutor.spawn(process.execPath, getTsxCliArgs(scriptPath, args), {
      cwd,
      env,
      onStdout: (data) => process.stdout.write(data),
      onStderr: (data) => process.stderr.write(data)
    });
    child.then((result) => resolve(result.exitCode ?? (result.ok ? 0 : 1)));
  });
}

function shellQuote(value) {
  return JSON.stringify(String(value));
}

function getTsxCliArgs(scriptPath, args = []) {
  const workspaceRoot = getWorkspaceRoot();
  return [
    path.resolve(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    scriptPath,
    ...normalizeCliArgs(args)
  ];
}

function normalizeCliArgs(args) {
  if (Array.isArray(args)) {
    return args.map((value) => String(value));
  }
  if (!args || typeof args !== "object") {
    return [];
  }

  const cliArgs = [];
  for (const [key, value] of Object.entries(args)) {
    if (key === "_") {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item != null) cliArgs.push(String(item));
      }
      continue;
    }
    if (value == null || value === false) {
      continue;
    }
    cliArgs.push(`--${key}`);
    if (value !== true) {
      cliArgs.push(String(value));
    }
  }
  return cliArgs;
}

function normalizeRegisteredCodeletArgs(args) {
  if (!Array.isArray(args)) {
    return args ?? {};
  }

  const options: any = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const raw = String(args[index] ?? "");
    if (!raw.startsWith("--")) {
      options._.push(raw);
      continue;
    }

    const key = raw.slice(2);
    const next = args[index + 1];
    if (next != null && !String(next).startsWith("--")) {
      options[key] = next;
      index += 1;
      continue;
    }
    options[key] = true;
  }

  if (options.id && !options.ticketId) {
    options.ticketId = options.id;
  }
  if (options._[0] && !options.ticketId) {
    options.ticketId = options._[0];
  }
  if (options._[0] && !options.query) {
    options.query = options._.join(" ");
  }
  return options;
}
