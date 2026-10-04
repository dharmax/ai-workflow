# Digest — Dogfood-First Implementation Plan

**Goal:** implement native Digest inside AIWF while proving the high-level AIWF substrate with measured dogfood evidence.

Work on `master`. Keep every gate green. Prefer AIWF high-level operations for implementation; manual intervention is for truthful `needs_input` or a concrete AIWF defect.

## Gate 0 — measurement/runtime readiness

Before measured dogfood, verify:

- AIWF revision and target-project revisions are recorded separately;
- dirty-before/dirty-after is recorded;
- provider/model/tokens/latency and cost availability are recorded;
- provider failure kind + finish reason are preserved;
- Actor halt/tool-failure/recovery counts are preserved;
- cognition can be tagged by phase;
- artifact commands accept repeated benchmark tags;
- sanitized `aiwf metrics export` works;
- provider adapters honor configured output budgets consistently;
- missing-artifact errors name the active project root.

Run AIWF and llm-utils typecheck/tests. Do not trust benchmark data until this passes.

## Gate 1 — Consuela resolve_ticket qualification

Run from the **ai-cli/Consuela project root**:

```bash
aiwf status
aiwf sync
aiwf tickets Todo
```

Confirm `TKT-CS-ALIGN-01` exists, then:

```bash
aiwf resolve TKT-CS-ALIGN-01 \
  --completeness production \
  --critic auto \
  --tag study=consuela-resolve-v1 \
  --tag scenario=context-manager-authority \
  --tag variant=aiwf-high-level \
  --tag trial=1
```

No manual implementation edits during the run.

Qualify the substrate when AIWF reaches real safe mutation, runs tests, keeps repair bounded, explicitly verifies acceptance, distinguishes its own edits from unrelated dirty work, reports a precise terminal reason, and exits cleanly.

Provider quota/timeout/output exhaustion is not an AIWF engineering failure, but must be recorded as such.

After each meaningful trial:

```bash
aiwf metrics export docs/verification/benchmarks/consuela-resolve-v1.json \
  --tag study=consuela-resolve-v1
```

Failed trials stay in the evidence; use a new `trial` value after a fix.

## Gate 2 — Digest semantic core

From this gate through Gate 4, tag measured AIWF implementation runs with:

```text
study=digest-self-hosting-build-v1
scenario=native-digest-implementation
variant=aiwf-high-level
trial=<ordinal>
```

See `docs/verification/benchmarks/digest-self-hosting-build-v1.md`.

Prefer one initial `src/digest.ts`.

Implement the contract in `docs/digest.md` with obvious control flow:

```text
analyze
  ├─ material question → needs_input
  ↓
reconcile
  ↓
independent review
  ├─ accept → complete
  ├─ needs_input → needs_input
  └─ revise → one reconcile + one review
                    ├─ accept → complete
                    ├─ needs_input → needs_input
                    └─ revise → blocked
```

Use `Asker.json(..., { maxRetries: 1 })`.

No Actor, Pipeline, Session, persistence or mutation.

Tag reasoning calls:

```text
phase=analyze
phase=reconcile
phase=review
phase=reconcile_revision
phase=review_revision
```

Core regressions must prove coherent completion, evidence-backed contradiction handling, no fabricated criticism, material ambiguity/decision retry, one bounded review revision, honest non-convergence, structured-response repair, and no prompt/source/output leakage into metrics.

## Gate 3 — explicit source adapter

V1 supports:

```bash
aiwf digest <subject-path>...
aiwf digest <subject-path>... --against <evidence-path>...
```

Workspace-relative existing regular files only; read-only; preserve source IDs/locations.

Do **not** add heuristic repository search or automatic whole-project context in V1.

Direct AIWF relations may be added later only when a concrete artifact-based use case demonstrates value.

## Gate 4 — one public operation

Expose exactly `digest` through in-process API, CLI, MCP and AIWF skill instructions.

Preserve `complete | needs_input | blocked`.

Do not add `digest_prepare`, `digest_review`, `digest_apply` or a Digest manager.

No implicit writes.

## Gate 5 — controlled Digest benchmark

Study:

```text
study=digest-debugging-design-v1
scenario=debugging-design-reconciliation
```

Freeze AIWF revision, project revision, subject/evidence files, model/provider, context/output budgets and evaluation rubric.

### Variant A — direct model baseline

Give the same model the same subject/evidence and ask directly for a reconciled design, without Digest's structured three-call operation.

Record available wall time, calls/tokens, tool/source reads, termination reason and user intervention. Mark unavailable measurements as unavailable.

### Variant B — AIWF Digest

```bash
aiwf digest docs/debugging-design.md \
  --against docs/artifact-operations.md \
  --against docs/aspects.md \
  --against docs/product-intent-graph.md \
  --tag study=digest-debugging-design-v1 \
  --tag scenario=debugging-design-reconciliation \
  --tag variant=aiwf-digest \
  --tag trial=1
```

### Quality evaluation

Use both:

1. **seeded controlled subject** with known contradiction, lost invariant and invented requirement;
2. **real debugging-design.md** with human review of accepted improvements, fabricated findings, lost intent and unresolved issues.

Digest never scores itself.

Export:

```bash
aiwf metrics export docs/verification/benchmarks/digest-debugging-design-v1.json \
  --tag study=digest-debugging-design-v1
```

Commit the sanitized bundle plus a concise benchmark note. Raw transport traces are diagnostic evidence only.

## Gate 6 — shell-ui interaction

After semantic proof, map:

- `needs_input` → renderer-neutral elicitation/form;
- synthesis → editable review;
- revise → explicit feedback;
- accept/cancel → caller action.

This is UX, not Digest semantics.

## Gate 7 — retire aiwf-digest

After Gate 5 succeeds:

1. inspect `dharmax/aiwf-digest` once more;
2. migrate only useful tests/wording not already represented;
3. archive/deprecate the separate package/repo;
4. remove real consumer dependencies;
5. keep no compatibility facade without a real consumer.

## Final acceptance

```bash
bun run typecheck
bun test
aiwf doctor
aiwf audit
```

Then perform a method-level KISS audit.

Reject the implementation if it adds a second graph, retrieval/vector stack, generic workflow/state machine, persisted Digest state, duplicate routing/metrics, mutation inside Digest, unbounded retries, or benchmark claims unsupported by exported evidence.

The implementation must still read approximately as:

```text
bounded explicit sources
  → analyze
  → reconcile
  → independent review
  → complete / needs_input / blocked
```

Dogfooding is part of the product evidence, not merely the development method.
