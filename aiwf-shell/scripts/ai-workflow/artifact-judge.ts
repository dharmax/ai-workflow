#!/usr/bin/env node
import { runArtifactJudge } from "aiwf-common-core/services/artifact-verification";

const exitCode = await runArtifactJudge(process.argv.slice(2), process.env);
if (typeof exitCode === "number") {
  process.exit(exitCode);
}
