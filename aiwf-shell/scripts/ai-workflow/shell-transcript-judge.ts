#!/usr/bin/env node
import { runShellTranscriptJudge } from "aiwf-common-core/services/shell-transcript-verification";

const exitCode = await runShellTranscriptJudge(process.argv.slice(2), process.env);
if (typeof exitCode === "number") {
  process.exit(exitCode);
}
