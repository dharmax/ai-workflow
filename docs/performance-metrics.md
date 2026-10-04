# Performance Metrics and Benchmark Evidence

**Status:** authoritative design for implemented AIWF operation telemetry and controlled benchmark evidence.

## Purpose

AIWF must support claims with measurements rather than anecdotes.

The telemetry layer should answer:

- how often high-level operations complete, need input, block or fail;
- how long they take;
- which models/providers were used;
- how many calls/tokens they consumed;
- whether provider cost is known or unavailable;
- why model/Actor runs terminated;
- how much deterministic/tool work occurred;
- whether verification passed on the first attempt;
- how much repair/Critic revision occurred;
- how much human intervention was required;
- whether high-level AIWF delegation reduces external-agent archaeology in controlled A/B studies.

Operational telemetry is not a quality score. Benchmark evidence combines telemetry with explicit acceptance/evaluation.

## Ownership boundary

`@dharmax/llm-utils` owns generic cognition telemetry:

- provider/model calls;
- prompt/completion tokens;
- provider latency;
- provider failure kind;
- provider finish reason;
- System-1 activity;
- Actor steps/tool calls/failures/recovery/halt reason.

AIWF owns engineering-operation telemetry:

- operation trace/span;
- project/artifact identity;
- effective policy;
- deterministic/tool/edit/test counters;
- Critic/repair counters;
- evidence-candidate counters;
- acceptance verification;
- project/engine provenance;
- benchmark tags;
- local persistence/query/export.

AIWF must not estimate or re-count model token usage already emitted by llm-utils.

## One trace per high-level operation

Each high-level operation gets one trace:

```text
investigate_ticket
prepare_ticket
resolve_ticket
process_epic / process_feature / process_story
digest
```

Nested operations use child spans and the same trace.

One compact summary is persisted after each high-level span finishes.

## Operation summary

A persisted row contains no prompt/source/output contents.

Conceptually:

```ts
interface OperationSummary {
  traceId: string
  spanId?: string
  parentSpanId?: string

  operation: string
  artifactId: string
  startedAt: string
  durationMs: number
  outcome: 'complete' | 'needs_input' | 'blocked' | 'rejected' | 'error'

  tags: Record<string, string | number | boolean>

  version: string
  aiwfRevision: string
  llmUtilsVersion: string
  llmUtilsRevision: string

  project: {
    revisionBefore: string
    revisionAfter: string
    branch: string
    dirtyBefore: boolean
    dirtyAfter: boolean
  }

  runtime: {
    bun: string
    platform: string
  }

  policy: {
    completeness?: string
    depth: number | 'all'
    maxArtifacts: number
    critic: string
  }

  counters: {
    artifactVisits?: number
    artifactsCreated?: number
    artifactsReused?: number
    toolCalls?: number
    sourceReads?: number
    exactSymbolReads?: number
    codeEdits?: number
    filesTouched?: number
    testsRun?: number
    testFailures?: number
    repairs?: number
    criticRounds?: number
    criticRevisions?: number
    systemOneCalls?: number
    reasoningCalls?: number
    optionalCandidates?: number
    optionalSelected?: number
    humanInterventions?: number
  }

  cognition: {
    llm: AggregateMetrics
    costAvailable: boolean
    structuredRepairs: number
    models: string[]
    modelConfigs: Array<{
      providerId: string
      modelId: string
      maxTokens?: number
      contextWindow?: number
    }>

    phases: Record<string, {
      calls: number
      totalTokens: number
      latencyMs: number
    }>

    systemOne: ...
    actor: ...

    termination: {
      llmFailureKinds: Record<string, number>
      finishReasons: Record<string, number>
      actorHaltReasons: Record<string, number>
    }
  }

  verification?: boolean

  acceptance?: {
    criteriaPassed: number
    criteriaTotal: number
    aspectsPassed: number
    aspectsTotal: number
  }
}
```

## Revision provenance

Cross-project dogfood requires two different revisions:

- **AIWF revision** — which AIWF engine implementation performed the work;
- **llm-utils revision** — which shared cognition/runtime implementation was embedded;
- **project revision** — which target repository state was operated on.

Never collapse these into one ambiguous `revision` field.

Compiled AIWF binaries bake the AIWF and llm-utils revisions at build time; source-mode falls back to sibling Git evidence. Record project revision both before and after the operation. A mutation may leave an uncommitted tree, so dirty-before/dirty-after is also material evidence.

## Cost semantics

A numeric zero is not equivalent to free.

`costAvailable` is true only when **every** LLM call in that run has cost data. Aggregate `totalCostUsd` is therefore null if any included run lacks complete cost coverage; `knownCostUsd` may still report the measured subset.

`costAvailable` distinguishes:

- measured/provider-priced cost;
- unavailable cost information.

Sales/benchmark reports must never infer “$0” when the provider did not supply or AIWF did not calculate pricing.

Local-model runs may legitimately have no API price; report tokens/latency and describe infrastructure cost separately if needed.

## Termination provenance

Failures must remain distinguishable without parsing prose.

Examples:

- provider `timeout`;
- provider `quota`;
- provider `rate_limit`;
- provider `invalid_response`;
- finish reason `length` / `max_tokens`;
- Actor `max_steps_exceeded`;
- Actor `error`;
- Actor `completed`.

This is why llm-utils preserves both failure kind and provider finish reason.

Do not report “AIWF failed” when the evidence actually says provider quota, cold-model timeout or output exhaustion.

## Phase metrics

High-level semantic operations may tag cognition calls with a small phase label.

Digest uses:

```text
phase=analyze
phase=reconcile
phase=review
phase=reconcile_revision
phase=review_revision
```

These are metric dimensions only, not workflow state.

They allow later evidence such as:

- review consumed 18% of total tokens;
- one revision round cost X tokens/Y seconds;
- analysis dominated latency;
- schema repair added one extra provider call.

Do not persist phase state outside telemetry.

## Persistence

Runtime telemetry lives in:

```text
.ai-workflow/metrics.jsonl
```

One JSON line per completed high-level span.

It is operational/local data and remains outside the semantic graph and projections.

Telemetry failure must never fail engineering work.

## Benchmark tags

Controlled runs use ordinary metric tags; no experiment platform is needed.

Recommended keys:

```text
study
scenario
variant
trial
baseline
```

Example:

```bash
aiwf resolve TKT-CS-ALIGN-01 \
  --completeness production \
  --critic auto \
  --tag study=consuela-resolve-v1 \
  --tag scenario=context-manager-ticket \
  --tag variant=aiwf \
  --tag trial=1
```

Tags are labels, not claims.

## Durable benchmark evidence

Runtime JSONL is not sufficient evidence for a future commercial document because it is local and mutable.

Controlled studies therefore export a sanitized evidence bundle into the repository:

```bash
aiwf metrics export \
  docs/verification/benchmarks/consuela-resolve-v1.json \
  --tag study=consuela-resolve-v1
```

The bundle contains:

- schema version;
- export timestamp;
- query;
- aggregate summary;
- sanitized operation rows.

It intentionally excludes prompts/source/output contents.

Commit the bundle together with a concise human-readable benchmark note that records:

- task/scenario definition;
- frozen input/project revisions;
- variant definitions;
- acceptance/evaluation method;
- environmental caveats;
- facts that were unavailable.

The committed bundle is evidence; the prose note interprets it.

## Quality and acceptance evidence

Operational success is necessary but not sufficient.

For Ticket resolution, useful quality evidence includes:

- authored acceptance criteria passed/total;
- applicable Aspects passed/total;
- tests;
- independent Critic result;
- original defect/oracle where relevant.

For Digest, useful quality evidence includes:

- final independent review verdict;
- material findings supported by provenance;
- controlled seeded-fault detection;
- human acceptance/rejection of substantive synthesis changes.

AIWF must not self-assign a marketing quality score.

## Human intervention

A benchmark should count meaningful human intervention:

- clarification answers;
- manual code edits;
- manual tool rescue;
- manual retry caused by AIWF logic;
- manual acceptance decision when the study requires it.

Do not count passive observation as intervention.

When an operation ends `needs_input`, the subsequent user-answer/retry should be associated with the same study/scenario tags so the study can report the interaction honestly.

## Controlled A/B claims

A claim such as “AIWF reduces tokens/tool calls/time” requires comparable variants.

Freeze:

- task/scenario;
- repository revision or equivalent starting snapshot;
- model/provider;
- model context/output budgets;
- acceptance rubric;
- allowed tools/environment.

Compare:

- correctness/acceptance;
- external-agent tokens when available;
- external-agent tool/source reads when available;
- AIWF internal tokens/cost/latency;
- wall time;
- user interventions;
- repair/review loops.

If external-agent usage is unavailable, say unavailable. Do not substitute AIWF internal metrics for external-client usage.

## Useful derived metrics

Examples:

- success/needs-input/blocked/error rate;
- median/p95 duration;
- tokens per verified Ticket;
- tokens per accepted Digest;
- first-pass verification rate;
- repair loops per resolution;
- Critic revision rate;
- human intervention rate;
- Actor tool-failure/recovery counts;
- termination/failure distribution;
- evidence reduction ratio where candidate pruning is actually used;
- phase token/latency distribution;
- cost per accepted outcome when cost is genuinely available.

These are observations, not one synthetic score.

## CLI

Queries:

```bash
aiwf metrics
aiwf metrics --operation resolve_ticket
aiwf metrics --ticket TKT-X
aiwf metrics --trace <trace-id>
aiwf metrics --since 7d
aiwf metrics --tag study=consuela-resolve-v1
```

Durable export:

```bash
aiwf metrics export docs/verification/benchmarks/run.json --tag study=...
```

## Privacy and evidence integrity

Never persist in metrics:

- prompt text;
- source text;
- model output text;
- credentials;
- private user content.

Benchmark prose may quote only deliberately selected non-sensitive evidence.

Do not edit exported metric values to improve a result. If a run was contaminated, retain it or explicitly mark/exclude it in the benchmark note with the reason.

## Non-goals

Do not build:

- a dashboard;
- cloud telemetry;
- OpenTelemetry infrastructure;
- an experiment-management service;
- automatic marketing copy;
- synthetic quality scores;
- prompt/source logging.

## Success criterion

After a real dogfood run, a future reader can determine:

1. exactly which AIWF and target-project revisions were used;
2. which model/provider and budgets were involved;
3. what the operation consumed;
4. how it terminated;
5. whether acceptance/verification succeeded;
6. how much repair/human intervention occurred;
7. which claims are measured and which data was unavailable.

That is sufficient raw material for a credible AIWF sales/technical-evaluation document without retrofitting telemetry later.
