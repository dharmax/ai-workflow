#!/usr/bin/env node
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "aiwf-common-core/lib/cli";
import { resolveOperatingContext } from "aiwf-common-core/lib/operating-context";
import { evaluateProjectReadiness } from "aiwf-common-core/services/sync";
import { resolveHostRequest } from "aiwf-common-core/services/operator-brain";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const tutorialPath = path.resolve(repoRoot, "runtime", "web", "tutorial", "index.html");

export async function runTutorialWeb(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const context = await resolveOperatingContext({
    cwd: process.cwd(),
    mode: args.mode ? String(args.mode) : null,
    root: args.root ? String(args.root) : null,
    evidenceRoot: args["evidence-root"] ? String(args["evidence-root"]) : null,
    allowExternalTarget: true
  } as any);
  const projectRoot = context.mode === "tool-dev" ? context.evidenceRoot : context.repairTargetRoot;
  const host = String(args.host ?? "127.0.0.1");
  const requestedPort = await resolveRequestedPort(Number(args.port ?? 3210), host);
  const html = await readFile(tutorialPath, "utf8");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/tutorial") {
        return writeJson(res, 200, {
          mode: context.mode,
          repairTargetRoot: context.repairTargetRoot,
          evidenceRoot: context.evidenceRoot,
          operationalRoot: projectRoot
        });
      }
      if (url.pathname === "/api/readiness") {
        const goal = String(url.searchParams.get("goal") ?? "beta-readiness").replace(/_/g, "-");
        const question = String(url.searchParams.get("question") ?? "Is this ready?");
        const payload = await evaluateProjectReadiness({
          projectRoot,
          request: {
            protocol_version: "1.0",
            operation: "evaluate_readiness",
            goal: {
              type: goal,
              target: "project",
              question
            },
            host: tutorialHostDescriptor()
          }
        });
        return writeJson(res, 200, {
          ...payload,
          operation: "evaluate_readiness",
          meta: buildMeta(context, projectRoot)
        });
      }
      if (url.pathname === "/api/ask") {
        const text = String(url.searchParams.get("text") ?? "").trim();
        if (!text) {
          return writeJson(res, 400, { error: "text query parameter is required" });
        }
        const response = await resolveHostRequest({
          projectRoot,
          text,
          continuationState: null,
          host: tutorialHostDescriptor()
        });
        return writeJson(res, 200, {
          ...response,
          meta: buildMeta(context, projectRoot)
        });
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (error: any) {
      writeJson(res, 500, { error: error?.message ?? String(error) });
    }
  });

  await new Promise<void>((resolve) => server.listen(requestedPort, host, () => resolve()));
  const closeServer = () => server.close(() => process.exit(0));
  process.on("SIGTERM", closeServer);
  process.on("SIGINT", closeServer);
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  const payload = {
    ok: true,
    mode: context.mode,
    host,
    port,
    url: `http://${host}:${port}/`,
    repairTargetRoot: context.repairTargetRoot,
    evidenceRoot: context.evidenceRoot,
    operationalRoot: projectRoot
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`Tutorial available at ${payload.url}\n`);
  }
  return payload;
}

function tutorialHostDescriptor() {
  return {
    surface: "tutorial-web",
    capabilities: {
      supports_json: true,
      supports_streaming: false,
      supports_followups: true
    }
  };
}

function buildMeta(context: any, operationalRoot: string) {
  return {
    mode: context.mode,
    repair_root: context.repairTargetRoot,
    repair_target_root: context.repairTargetRoot,
    evidence_root: context.evidenceRoot,
    operational_root: operationalRoot
  };
}

function writeJson(res: any, status: number, payload: any) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function resolveRequestedPort(port: number, host: string) {
  if (port !== 0) {
    return port;
  }
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = 32_000 + Math.floor(Math.random() * 20_000);
    if (await canBind(candidate, host)) {
      return candidate;
    }
  }
  throw new Error("Unable to find an available tutorial server port.");
}

async function canBind(port: number, host: string) {
  return await new Promise<boolean>((resolve) => {
    const probe = createNetServer();
    const done = (ok: boolean) => {
      probe.removeAllListeners();
      probe.close(() => resolve(ok));
    };
    probe.once("error", () => done(false));
    probe.listen(port, host, () => done(true));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runTutorialWeb();
}
