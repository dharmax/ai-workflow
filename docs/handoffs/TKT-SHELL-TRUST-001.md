# TKT-SHELL-TRUST-001 Handoff

## Goal

Recover trust in `ai-workflow shell` by making it useful in real operator sessions, not just in narrow happy-path tests.

This work is driven by direct operator feedback:

- the shell was not useful enough to complete real work
- shell tests did not prove the behavior honestly enough
- fixing and coding matter more than unfinished parallel-dispatch work

## Honest current state

The shell is not blank. It already has pieces that matter:

- shell routing can answer and execute some deterministic requests
- operator planning can fall back across providers
- `sweep bugs` already does baseline verification, patch retries, and post-change verification

But those pieces do not add up to a trustworthy operator surface yet.

The real gaps are:

1. proof and observability are weak, so the shell can appear smarter than the evidence supports
2. the fixer loop is too narrow and does not leave behind enough reasoning, prioritization, and learning
3. shell introspection and self-configuration are inconsistent in natural-language use
4. knowledge capture and reuse are too static
5. findings are not graded and structured before execution
6. proactive advice is weak
7. module, feature, ownership-boundary, and drift recognition are still coarse heuristics

## What just changed

`TKT-SHELL-TRACE-001` is complete:

- `trace on file <path>` now writes shell trace to a file
- shell workflow trace no longer pollutes stderr in the shell path
- trace file mode persists through `--state-file`
- dedicated CLI proof lives in `tests/shell-trace-file.test.mjs`

This is not the whole trust fix. It is the first debugging and evidence prerequisite.

## Priority order

Parallel dispatcher work is lower priority than coding and fixing. The execution order should be:

1. `TKT-FIXER-LOOP-001`
2. `TKT-SHELL-TRUST-001`
3. `TKT-SHELL-INTROSPECTION-001`
4. `TKT-SHELL-FINDINGS-001`
5. `TKT-SHELL-ADVICE-001`
6. `TKT-KNOWLEDGE-LOOP-001`
7. `TKT-ARTIFACT-RECOGNITION-001`

## Execution plan

### 1. Strengthen the fixer loop first

Make `sweep bugs` behave like a real autonomous repair loop:

- choose work in a defensible order
- explain why a bug was selected
- preserve patch attempts and failure causes
- record what changed and how verification behaved
- surface reusable lessons after success or failure

Acceptance:

- the loop leaves behind structured per-bug evidence
- failed attempts are inspectable, not collapsed into a single vague error
- successful fixes record changed files and verification outcome

### 2. Replace weak proof with audit-grade shell evidence

Expand beyond unit-style mocks:

- transcript-backed shell runs
- per-turn artifacts for generated plans and execution paths
- explicit provider/model provenance
- shell tests that prove the operator-visible result rather than only internal return shapes

Acceptance:

- a skeptical operator can inspect one run and see what the shell planned, executed, and verified
- shell tests fail when the operator-visible surface regresses

### 3. Improve shell introspection and self-configuration

Teach the shell to answer:

- what tools exist
- what providers/models are available
- how it is currently configured
- what safe configuration changes it recommends

Acceptance:

- natural-language questions about shell/tool/provider capability produce grounded answers
- configuration help is based on actual local state, not generic LLM advice

### 4. Grade findings before execution

Before mutating, the shell should return a structured view:

- findings
- importance
- tags
- evidence
- proposed plan

Acceptance:

- broad prompts return an ordered decision surface, not a flat answer
- execution plans are visibly derived from graded findings

### 5. Add proactive advice without becoming noisy

Use DB state, recent failures, and learned patterns to surface timely advice when it is genuinely useful.

Acceptance:

- proactive advice is tied to evidence
- advice is suppressible and high-signal

### 6. Strengthen knowledge capture and artifact recognition

Capture durable knowledge from successful work and improve module/boundary/drift recognition so shell reasoning stops relying on shallow folder heuristics.

Acceptance:

- knowledge evolves after real work
- module summaries and drift recognition are materially better than `Heuristic module for <path>`

## What not to pretend

- the fixer loop is not absent; it is partial
- the shell is not useless for every task; it is unreliable enough that trust is the main issue
- this roadmap should not claim completion until transcript-level proof and operator-facing results match the promises
