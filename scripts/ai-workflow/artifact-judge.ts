#!/usr/bin/env node
import { runArtifactJudge } from "../../core/services/artifact-verification.ts";

const exitCode = await runArtifactJudge(process.argv.slice(2), process.env);
if (typeof exitCode === "number") {
  process.exit(exitCode);
}
