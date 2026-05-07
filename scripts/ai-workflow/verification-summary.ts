#!/usr/bin/env node

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { judgeArtifacts } from "../../core/services/artifact-verification.ts";
import { judgeShellTranscripts } from "../../core/services/shell-transcript-verification.ts";
import { normalizeHonestyContract, isHonestyContractPass } from "../../core/contracts/honesty-contract.ts";
import { openWorkflowStore } from "../../core/db/sqlite-store.ts";
import { asArray, parseArgs } from "../../core/lib/cli.ts";
import { stableId } from "../../core/lib/hash.ts";

const execFileAsync = promisify(execFile);

export async function runVerificationSummary(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const root = path.resolve(String(args.root ?? process.cwd()));
  const artifactPaths = asArray(args.artifact).map(String).filter(Boolean);
  const judge = String(args.judge ?? "artifact").trim();
  const goal = args.goal ? String(args.goal) : null;
  const rubric = args.rubric ? String(args.rubric) : "";
  const providerId = args.provider ? String(args.provider) : null;
  const modelId = args.model ? String(args.model) : null;
  const runId = stableId("verification-summary", root, JSON.stringify({ artifactPaths, judge, goal, rubric, providerId, modelId, cmd: args.cmd ?? null }));
  const commands = asArray(args.cmd).map(String).filter(Boolean);

  const commandResults = [];
  for (const command of commands) {
    commandResults.push(await runVerificationCommand(command, root, env));
  }

  const artifactJudgment = judge === "shell-transcript"
    ? await judgeShellTranscripts({
        projectRoot: root,
        artifactPaths,
        rubric,
        goal,
        providerId,
        modelId
      })
    : artifactPaths.length || rubric
      ? await judgeArtifacts({
          projectRoot: root,
          artifactPaths,
          rubric,
          goal,
          providerId,
          modelId
        })
      : null;

  const verdict = artifactJudgment?.result ?? null;
  const honestyContract = verdict?.contract
    ? normalizeHonestyContract(verdict.contract, {
        goal,
        fallbackWish: goal ?? rubric,
        fallbackSuccessDefinition: rubric,
        fallbackScore: Number(verdict?.score ?? 0)
      })
    : buildFallbackHonestyContract({ goal, rubric, verdict });
  const commandsOk = commandResults.every((item) => item.exitCode === 0);
  const artifactOk = artifactJudgment ? verdict?.status === "pass" && verdict?.needs_human_review !== true : true;
  const contractOk = honestyContract ? isHonestyContractPass(honestyContract) : true;
  const conclusion = commandsOk && artifactOk && contractOk ? "verified" : "not verified";
  const gapReview = buildGapReview({ conclusion, honestyContract, artifactJudgment, commandResults });

  await persistVerificationRecords({
    runId,
    root,
    honestyContract,
    gapReview,
    artifactJudgment,
    commandResults
  });

  return {
    runId,
    root,
    judgeMode: judge,
    conclusion,
    verificationCommands: commandResults,
    artifactJudgment,
    honestyContract,
    gapReview
  };
}

async function runVerificationCommand(command, cwd, env) {
  try {
    const result = await execFileAsync("/usr/bin/bash", ["-lc", command], {
      cwd,
      env,
      maxBuffer: 8 * 1024 * 1024
    });
    return {
      command,
      exitCode: 0,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? "")
    };
  } catch (error: any) {
    return {
      command,
      exitCode: Number(error.code ?? 1),
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? error)
    };
  }
}

function buildFallbackHonestyContract({ goal, rubric, verdict }) {
  if (!verdict) {
    return null;
  }

  return normalizeHonestyContract({}, {
    goal,
    fallbackWish: goal ?? "Satisfy the verification rubric.",
    fallbackSuccessDefinition: rubric || "Verification evidence must pass without overclaiming.",
    fallbackScore: Number(verdict.score ?? 0)
  });
}

function buildGapReview({ conclusion, honestyContract, artifactJudgment, commandResults }) {
  if (conclusion === "verified") {
    return {
      status: "resolved",
      severity: "low",
      summary: "Verification evidence is strong enough to close the gap review.",
      gapTypes: [],
      actions: []
    };
  }

  const actions = [];
  if (honestyContract?.reportTruthfulness?.status === "fail" || honestyContract?.misleadingRisk === "high") {
    actions.push({ type: "revise-report", reason: honestyContract.reportTruthfulness.reason });
  }
  if (artifactJudgment?.result?.needs_human_review) {
    actions.push({ type: "human-review", reason: "The judge requested human review." });
  }
  if (commandResults.some((item) => item.exitCode !== 0)) {
    actions.push({ type: "fix-verification-command", reason: "One or more verification commands failed." });
  }
  if (!actions.length) {
    actions.push({ type: "collect-more-evidence", reason: "Verification is not closure-safe yet." });
  }

  const severity = honestyContract?.reportTruthfulness?.status === "fail" || honestyContract?.misleadingRisk === "high"
    ? "high"
    : "medium";
  return {
    status: "open",
    severity,
    summary: severity === "high"
      ? "Verification evidence is misleading or incomplete."
      : "Verification still needs stronger evidence before closure.",
    gapTypes: [
      ...(honestyContract?.reportTruthfulness?.status === "fail" ? ["report-truthfulness"] : []),
      ...(commandResults.some((item) => item.exitCode !== 0) ? ["failing-command"] : []),
      ...(artifactJudgment?.result?.needs_human_review ? ["human-review"] : [])
    ],
    actions
  };
}

async function persistVerificationRecords({ runId, root, honestyContract, gapReview, artifactJudgment, commandResults }) {
  const store = await openWorkflowStore({ projectRoot: root });
  try {
    store.upsertWorkflowRun({
      id: runId,
      prompt: `verification-summary ${artifactJudgment?.codelet?.id ?? "artifact"} ${root}`,
      code: "",
      status: gapReview.status === "resolved" ? "completed" : "failed",
      currentState: "verification-summary",
      result: {
        artifactJudgment,
        commandResults,
        honestyContract,
        gapReview
      }
    });
    if (honestyContract) {
      store.upsertWorkflowContract({
        runId,
        root,
        source: "verification-summary",
        userWish: honestyContract.userWish,
        successDefinition: honestyContract.successDefinition,
        attemptedStatus: honestyContract.attemptedRealWish.status,
        fulfillmentStatus: honestyContract.wishFulfillment.status,
        truthfulnessStatus: honestyContract.reportTruthfulness.status,
        enlightenmentStatus: honestyContract.reportEnlightenment.status,
        misleadingLevel: honestyContract.misleadingRisk,
        summary: honestyContract.summary,
        evidence: {
          artifactJudgment,
          commandResults
        }
      });
    }
    store.upsertWorkflowGapReview({
      runId,
      root,
      source: "verification-summary",
      status: gapReview.status,
      severity: gapReview.severity,
      summary: gapReview.summary,
      gapTypes: gapReview.gapTypes,
      actions: gapReview.actions,
      evidence: {
        artifactJudgment,
        commandResults
      }
    });
  } finally {
    store.close();
  }
}

function renderText(summary) {
  const lines = [
    `Conclusion: ${summary.conclusion}`
  ];
  if (summary.artifactJudgment?.result?.summary) {
    lines.push(`Artifact judgment: ${summary.artifactJudgment.result.summary}`);
  }
  if (summary.honestyContract?.summary) {
    lines.push(`Honesty contract: ${summary.honestyContract.summary}`);
  }
  if (summary.gapReview?.summary) {
    lines.push(`Gap review: ${summary.gapReview.summary}`);
  }
  return `${lines.join("\n")}\n`;
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1]).href;
if (isEntrypoint) {
  const summary = await runVerificationSummary();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(renderText(summary));
  }
}

function pathToFileUrl(filePath: string) {
  return new URL(`file://${path.resolve(filePath)}`);
}
