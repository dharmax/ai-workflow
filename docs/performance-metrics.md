# Performance Metrics — Design

Status: deferred feature design. Implement after the artifact-operation core is proven.

## 1. Purpose

AIWF should be able to answer, with measurements rather than claims:

- how fast artifact operations are;
- how many model/System-1/tool calls they use;
- how many tokens/cost they consume;
- how often they finish without user intervention;
- how often they need clarification, block, reject or fail;
- how often first-pass verification succeeds;
- how much repair/rework occurs;
- whether System-1/evidence pruning actually reduces expensive cognition;
- whether high-level AIWF operations reduce external-agent archaeology/tool usage in controlled comparisons.

llm-utils supplies generic cognition telemetry. AIWF supplies engineering-operation telemetry and persistence/reporting.

## 2. Ownership boundary

llm-utils owns provider/System-1/Actor metrics and correlation primitives.

AIWF owns:

- artifact-operation run IDs/traces;
- operation/policy/outcome tags;
- deterministic tool/source/edit/test counters;
- Critic/revision/input/blocking counters;
- evidence-candidate/pruning counters;
- aggregation by Ticket/Epic/Feature/operation/version;
- local persistence and CLI reporting.

AIWF must not re-count LLM tokens/latency already measured by llm-utils.

## 3. One trace per high-level operation

Every investigate/prepare/resolve/process operation creates a trace ID and passes it through llm-utils MetricsContext.

Persist one compact AIWF run summary after the operation finishes.

Conceptually:

~~~
operation
artifactId/type
startedAt / durationMs
outcome: complete | needs_input | blocked | rejected | error
effective completeness/depth/maxArtifacts/critic
artifacts visited/created/reused
internal tool calls
source reads / exact-symbol reads
code edits / files touched
tests run / failures / repairs
critic rounds / revisions
System-1 calls/latency/escalations
candidate evidence before/after pruning
LLM calls/tokens/cost/latency
actor steps/tool calls
verification outcome
~~~

Do not store prompt/source/output contents in metrics.

## 4. Persistence

Metrics are operational telemetry, not Product Intent graph truth.

Do not store metric events as semantic graph entities.

First implementation should persist compact run summaries in an append-only project-local store outside projections. Prefer the smallest durable form that supports filtering/aggregation; do not introduce an analytics database.

Detailed llm-utils events may remain transient if their aggregates are captured into the run summary.

## 5. Useful derived metrics

Examples:

- median/p95 operation duration;
- success / needs-input / blocked / error rates;
- first-pass verification rate;
- average repair loops per resolved Ticket;
- model calls/tokens/cost per successfully resolved Ticket;
- System-1 latency and escalation rate;
- evidence reduction ratio: optional candidates before vs after System-1;
- critic revision rate and non-convergence rate;
- artifacts processed per run;
- external intervention rate;
- source-read/tool-call counts per resolved Ticket.

These are observations, not quality scores.

Do not collapse engineering quality into one synthetic number.

## 6. Token-savings claims

AIWF may report its own internal usage exactly.

It must not claim external paid-token savings from a normal run unless the external client provides comparable usage or a controlled A/B benchmark is run.

For A/B studies, tag runs with a scenario/version/variant and compare:

- correctness/acceptance outcome;
- external client tokens when available;
- external source reads/tool calls;
- AIWF internal tokens/cost;
- wall time;
- user interventions.

Arbitrary tags are sufficient. Do not build an experiment-management framework.

## 7. CLI

Repurpose/extend aiwf metrics toward actual performance telemetry.

Useful views:

~~~
aiwf metrics
aiwf metrics --operation resolve_ticket
aiwf metrics --ticket TKT-X
aiwf metrics --since 7d
aiwf metrics --tag variant=aiwf
~~~

Project health/Kanban counts may remain available elsewhere; they are not performance metrics.

## 8. Relation to Aspects

Metrics and Aspects are separate.

Operational AIWF metrics measure how AIWF itself performs.

A performance/cost/robustness Aspect may use benchmark/report Artifacts as evidence about the software being built.

Do not silently treat AIWF telemetry as application Aspect evidence unless an explicit Artifact/verification path is created.

## 9. Non-goals

Do not build dashboards, cloud telemetry, OpenTelemetry integration, universal tracing infrastructure, quality scores, prompt logging, or an experiment platform in the first implementation.

## 10. Success criterion

After a real resolve_ticket run, AIWF can explain where time/tokens/tool calls went and compare runs without guessing.