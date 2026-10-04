# Benchmark: Consuela High-Level Ticket Resolution

**Study ID:** `consuela-resolve-v1`  
**Status:** pre-registered continuation of the recorded Consuela dogfood failure.

## Question

Can repaired AIWF carry `TKT-CS-ALIGN-01` through real high-level resolution in the ai-cli/Consuela project without manual implementation rescue?

## Run protocol

Run from the target ai-cli project root:

```bash
aiwf status
aiwf sync
aiwf tickets Todo
aiwf resolve TKT-CS-ALIGN-01 \
  --completeness production \
  --critic auto \
  --tag study=consuela-resolve-v1 \
  --tag scenario=context-manager-authority \
  --tag variant=aiwf-high-level \
  --tag trial=1
```

Do not manually edit implementation files during the measured run.

If an AIWF defect is exposed, preserve that failed trial, repair AIWF separately, and increment `trial`.

## Qualification evidence

Record whether the run:

- selects the correct project/store;
- finds the Ticket;
- investigates grounded current state;
- applies real safe changes;
- preserves unrelated dirty work;
- runs verification;
- performs bounded repair when needed;
- verifies authored acceptance;
- terminates with a precise reason;
- exits without leaked runtime processes.

Provider quota/timeout/output exhaustion is reported separately from AIWF logic failure.

## Metrics

Use the standard operation summary:

- AIWF + target revisions;
- model/provider;
- tokens/latency/cost availability;
- Actor steps/tool calls/failures/recovery;
- edits/files/tests/repairs;
- Critic rounds/revisions;
- acceptance criteria/aspects;
- human intervention;
- termination reasons.

Export after meaningful trials:

```bash
aiwf metrics export docs/verification/benchmarks/consuela-resolve-v1.json \
  --tag study=consuela-resolve-v1
```

The JSON file is produced in the **target project** because metrics belong to the measured target-project run. A copy may be added to AIWF verification evidence only deliberately, with its origin/revision retained.

## Claim rules

This study demonstrates high-level engineering execution on one substantial external task. It does not by itself prove universal autonomous software engineering.

Retain failed trials and environmental limitations.
