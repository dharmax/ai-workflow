# Performance Metrics — Implementation Plan

Design authority: docs/performance-metrics.md.

This is a separate deferred AIWF development flow. Do not mix it into the current artifact-operation implementation tickets.

External gate: llm-utils LLMUTILS-PERFORMANCE-METRICS must provide correlated generic cognition metrics.

# AIWF-PERFORMANCE-METRICS

## Start

1. aiwf sync
2. create/reuse and claim AIWF-PERFORMANCE-METRICS
3. confirm the llm-utils metrics capability/version
4. inspect current aiwf metrics command and artifact-operation execution path surgically.

## Gate 1 — operation trace + run summary

Create one trace ID per high-level artifact operation and propagate llm-utils MetricsContext.

Collect only deterministic AIWF counters/outcomes not already owned by llm-utils.

Produce one in-memory run summary first.

Acceptance: nested llm-utils LLM/System-1/Actor metrics correlate to the same trace without duplicate token accounting.

## Gate 2 — durable project-local summaries

Persist compact completed run summaries outside the semantic graph/projections.

Keep storage append-only and simple.

No prompts, source text, model outputs or tool parameters/results.

Acceptance: restart preserves historical summaries; malformed metric persistence cannot fail the engineering operation.

## Gate 3 — useful aggregates/CLI

Make aiwf metrics report real performance measures:

- operation duration;
- outcomes/intervention;
- verification/repair;
- llm-utils tokens/cost/latency;
- System-1 use/escalation;
- Critic revisions;
- evidence pruning;
- source/tool/edit/test counts.

Support filtering by operation/artifact/time/tag.

Do not create a dashboard.

## Gate 4 — controlled benchmark proof

Use at least one historical Ticket from before artifact operations.

Run a controlled comparison with the same external model/task where feasible:

- normal coding-agent workflow;
- AIWF high-level artifact operation.

Record correctness, external tokens/tool/source reads when available, AIWF internal usage, latency and intervention.

Only then make token-saving claims.

## Completion

~~~bash
bun run typecheck
bun test
~~~

Then full diff + KISS audit + inspect real metric records for accidental content leakage.

Reject if implementation creates a telemetry platform, graph metric entities, duplicate LLM accounting, hidden prompt logging, or a synthetic quality score.