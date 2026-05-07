#!/usr/bin/env node
import { runShellTranscriptJudge } from "../../core/services/shell-transcript-verification.ts";

const exitCode = await runShellTranscriptJudge(process.argv.slice(2), process.env);
if (typeof exitCode === "number") {
  process.exit(exitCode);
}
