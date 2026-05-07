#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const tutorialPath = path.resolve(repoRoot, "runtime", "web", "tutorial", "index.html");

export async function runTutorialWeb(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith("--")) args.set(key.slice(2), value);
  }
  const host = args.get("host") || "127.0.0.1";
  const port = Number(args.get("port") || 3210);
  const html = await readFile(tutorialPath, "utf8");
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const payload = { ok: true, host, port, url: `http://${host}:${port}/` };
  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`Tutorial available at ${payload.url}\n`);
  }
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runTutorialWeb();
}
