# Digest — Implementation Plan

**Goal:** add Digest directly to AIWF as a small, reliable high-level semantic operation and retire the need for a separate `aiwf-digest` package.

Work directly on `master`. Keep each gate independently green and review the actual code for KISS after each gate.

## Gate 0 — prove AIWF execution health first

Before implementing Digest, complete one real external `resolve_ticket` dogfood run against the Consuela project.

Reason: Digest will depend on the same model routing, structured output, context budgeting, project-root grounding and cleanup discipline. Do not build a new high-level operation on top of an execution substrate that is still observably broken.

Acceptance:

- correct target project/store is selected;
- real Ticket is found;
- implementation reaches safe mutation;
- tests/verification run;
- terminal reason is truthful;
- process/resources clean up;
- any failure is classified concretely rather than hidden behind generic Actor failure.

Digest implementation may proceed if the remaining failure is clearly unrelated to shared semantic infrastructure.

## Gate 1 — semantic core

Add a small module, preferably:

```text
src/digest.ts
```

Do not create a subsystem directory unless the file genuinely becomes too large.

Implement:

- `DigestSource`;
- `DigestInput`;
- `DigestResult`;
- compact Zod schemas for analysis and review;
- `digest(input, options)`.

Internal control flow should visibly be:

```ts
analysis = analyze(...)
if (material questions) return needs_input

synthesis = reconcile(...)
review = review(...)

if (review requests concrete revision)
  synthesis = reconcile(...review findings...)
  review = review(...)

return complete | needs_input | blocked
```

Use `Asker.json(..., { maxRetries: 1 })` for each structured call.

No Actor, Pipeline, persisted state or mutation.

Tests:

- coherent source completes;
- contradiction against evidence is detected/reconciled;
- material ambiguity returns `needs_input`;
- unsupported invention is rejected by review;
- first review defect can be repaired once;
- persistent review failure ends honestly;
- schema-invalid first response can repair once through llm-utils;
- persistent invalid structured output fails honestly.

## Gate 2 — bounded AIWF evidence adapter

Add the smallest adapter from AIWF project state to `DigestSource[]`.

Inputs:

- subject workspace paths;
- explicit `--against` paths/IDs.

Automatically add only directly relevant authoritative evidence:

- governing Decisions;
- applicable Aspects;
- directly related Product Intent;
- explicit document references;
- a bounded optional candidate set when justified.

Keep deterministic retrieval separate from semantic synthesis.

Acceptance:

- explicit evidence is always retained;
- unrelated repository material is not loaded;
- evidence set has a hard configurable item/token bound;
- result reports participating source IDs;
- no new search/index implementation;
- no whole-repo prompt construction.

If automatic evidence selection is not clearly useful in the first dogfood, keep v1 to explicit evidence rather than inventing heuristics.

## Gate 3 — public AIWF surface

Expose one operation through the existing high-level transports:

```bash
aiwf digest <subject...> [--against <source>]...
```

MCP:

```text
digest
```

In-process API should call the same semantic implementation.

Update:

- README high-level command examples;
- help;
- AIWF skill instructions.

Do not add a separate `digest_prepare`, `digest_review`, `digest_apply` family.

Acceptance:

- CLI/MCP/in-process results have the same status/result semantics;
- `needs_input` is preserved, not converted to an exception;
- no implicit writes occur;
- project root is explicit/correct in tests.

## Gate 4 — real debugging-design dogfood

Run:

```bash
aiwf digest docs/debugging-design.md \
  --against docs/artifact-operations.md \
  --against docs/aspects.md \
  --against docs/product-intent-graph.md
```

Use the configured real reasoning model.

Human-review the result.

The run succeeds only if:

- source intent is preserved;
- real contradictions/gaps are surfaced;
- criticism is not manufactured;
- synthesis is materially cleaner/more coherent;
- provenance is useful;
- unresolved material choices become `needs_input`;
- independent review catches at least deliberately seeded regressions in a controlled test.

Record concise evidence, not giant transport dumps unless diagnosing a failure.

## Gate 5 — optional interaction polish

Once shell-ui's renderer-neutral interaction API is ready, map:

- Digest `needs_input` → elicitation/forms;
- completed synthesis → editable review;
- accept/revise/cancel → caller-level action.

Do not make shell-ui a dependency of Digest semantics.

This gate is optional for the first functional Digest proof.

## Gate 6 — retire separate aiwf-digest

Only after the AIWF dogfood is accepted:

1. compare AIWF Digest against any still-useful code/docs in `dharmax/aiwf-digest`;
2. move only genuinely useful tests/wording;
3. mark that package/repo deprecated or archive it;
4. do not keep two live implementations.

No compatibility layer is required unless a real consumer exists.

## Final acceptance

Run:

```bash
bun run typecheck
bun test
aiwf doctor
aiwf audit
```

Then perform a method-level KISS audit.

The final implementation should still be describable as:

```text
bounded sources
  → analyze
  → reconcile
  → independent review
  → complete / needs_input / blocked
```

If the implementation contains a new planner, workflow graph, persistent session model, retrieval stack or mutation engine, it is wrong.

## Non-goals

Do not implement during this program:

- arbitrary web research inside Digest;
- permanent source corpora;
- vector search;
- generic document management;
- automatic Product Intent mutation;
- automatic Ticket generation;
- large-corpus infrastructure before a real source set requires it;
- a second Critic framework;
- a second model router;
- a separate package merely for architectural neatness.
