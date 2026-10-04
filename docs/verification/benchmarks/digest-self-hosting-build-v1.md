# Benchmark: Native Digest Self-Hosting Build

**Study ID:** `digest-self-hosting-build-v1`  
**Status:** pre-registered; implementation not yet started.

## Question

Can the current stable AIWF high-level operation layer implement native Digest inside AIWF itself from the accepted design/plan with bounded human intervention and without a coding agent manually reproducing AIWF's repository archaeology?

## Frozen starting point

Record before the first implementation Ticket:

- AIWF revision;
- llm-utils revision;
- target AIWF repository revision;
- model/provider configuration;
- `docs/digest.md`;
- `docs/digest-plan.md`.

The implementation agent may read those documents, but should delegate accepted work to AIWF high-level operations first.

## Execution rule

Create/reconcile one Epic for native Digest, then let AIWF produce the smallest useful work decomposition.

For every implementation Ticket use:

```text
study=digest-self-hosting-build-v1
scenario=native-digest-implementation
variant=aiwf-high-level
trial=<ticket/run ordinal>
```

The coding host may inspect a precise AIWF blocker, but must not silently take over normal implementation merely because it can.

If AIWF itself requires a repair:

1. preserve the blocked/failed run;
2. fix the AIWF defect as explicit work;
3. rebuild/reinstall AIWF if runtime code changed;
4. continue with a new trial.

## Evidence

Capture:

- number of Product/Ticket artifacts actually needed;
- high-level operation outcomes;
- source/tool reads;
- edits/files/tests;
- model calls/tokens/latency;
- Actor steps/tool failures/recoveries;
- structured repairs;
- Critic rounds/revisions;
- acceptance verification;
- provider/Actor termination reasons;
- AIWF and target revisions for every run;
- manually recorded human intervention where automatic measurement is unavailable.

Do not infer zero intervention when it was not instrumented.

## Product acceptance

The build is successful only when:

- native Digest matches `docs/digest.md`;
- V1 remains analyze → reconcile → independent review;
- no new entity/session/workflow/retrieval/mutation subsystem appears;
- typecheck/tests pass;
- CLI/MCP/in-process surfaces agree;
- the measured debugging-design benchmark can run.

## Evidence export

After the implementation program:

```bash
aiwf metrics export \
  docs/verification/benchmarks/digest-self-hosting-build-v1.json \
  --tag study=digest-self-hosting-build-v1
```

Commit the bundle and append concise results to this note.

## Claim rules

This study may support claims about self-hosted engineering execution and implementation efficiency for this feature only.

It does not by itself establish universal autonomous development performance.

Failed trials remain part of the evidence.
