#!/usr/bin/env bun
/**
 * @file ai-workflow.js
 * @brief Auto-generated header for ai-workflow.js. Needs detailed responsibility and scope.
 */


import { writeSync } from "node:fs";
import { main } from "./lib/main.ts";

installSynchronousWrites(process.stdout);
installSynchronousWrites(process.stderr);

try {
  const code = await main(process.argv.slice(2));
  process.exitCode = code;
  process.exit(code);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
}

function installSynchronousWrites(stream) {
  const originalWrite = stream.write.bind(stream);
  stream.write = (chunk, encoding, callback) => {
    let resolvedEncoding = encoding;
    let resolvedCallback = callback;

    if (typeof resolvedEncoding === "function") {
      resolvedCallback = resolvedEncoding;
      resolvedEncoding = undefined;
    }

    try {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), resolvedEncoding);
      writeSync(stream.fd, buffer);
      resolvedCallback?.(null);
      return true;
    } catch (error) {
      resolvedCallback?.(error);
      return originalWrite(chunk, encoding, callback);
    }
  };
}
