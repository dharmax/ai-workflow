# Dharmax Way — US-led Test Digestion and Consolidation

**Status:** Revised execution plan, 2026-10-21. **Branch:** `USs-and-consolidation`. Maximum **three iterations**, each with batches followed by analysis, double-check and corrections. No merge or Radar work. This replaces earlier *organizational* and numeric test-reduction suggestions in the four US coverage catalogs and coverage matrix; those remain **historical evidence**, not an automatically accepted Story catalog or deletion order. Do not infer product approval from these plans.

## The organizing principle

**One executable test file per accepted, real User/Actor Story (US).** The file represents an actual episode of use, **not** a function, class, subsystem, historical development stage, or number of assertions. Within that file, group the smallest set of meaningful scenarios:

- **Primary flow:** actor, meaningful initial conditions, action through the real/public interface, observable outcome.
- **Non-pristine flow:** the *same* US with realistic, altered starting conditions—partially completed work, old/legacy state, stale evidence, prior changes, restart/retry, interrupted execution, dirty workspace, existing claims, concurrent actors, different permissions, etc., where applicable.
- **Sub-flows/choices:** alternatives the actor may actually encounter; not an invented branch for every parameter.
- **Discovered bug/edge case:** an attributable refinement of that US's observable contract. A regression joins the owning file, with a concrete initial condition, action and expected observable; never create a free-floating `bug-x.test.ts` suite merely because a defect was fixed.
- **Necessary safety/failure guarantees:** preserve meaningful counterexamples (unauthorized write, false Done, rejected review, partial commit, corrupted proof, etc.) as variants of their owning US. Some tests may inspect internal evidence to establish those guarantees, but implementation methods are not independently a reason for a new file.

Old tests are **not automatically disposable**: retain, move or refine an old case if it exercises an actual primary, non-pristine, alternative, sub-US, discovered-regression or necessary failure flow. Conversely, a unique implementation assertion alone is not a reason to keep it. An old case that seems unmatched must be inspected for a **missing real US or sub-flow**, not immediately deleted or repackaged into a fictitious Story. Do not manufacture a product Story merely to shelter a technical-only concern; identify the real actor/engineering journey and its observable consequences or report the unresolved coverage question for review.

All reusable setup belongs in small shared **non-test** helpers only when demonstrably useful. Avoid a one-file giant scenario, a parallel test framework or test count as a target. One US can legitimately require several scenarios.

### Story-first truth and authority

For a newly accepted behavior: complete Story → reviewed executable public-interface test **in its US file** → establish unmet obligations → propose/reconcile implementation Tickets → activate the same test when implementation begins → observe attributable expected red → implement → green → independent acceptance. Already-implemented/legacy behavior is tested honestly in its current state; never invent historical red. Existing acceptance, safety and review authority remain intact. Keep the five conditional/live skipped cases visibly unverified until actually executed or specifically reviewed; no false-green replacement.

## Iteration 1 — Digest the USs and all old cases

Work through the **30 candidate** USs in `US-COVERAGE-01..04` and the current historical test map, in domain-sized batches (Engineering/Ticket; Product/Story; Actor/Operations). Candidate count is **not** a target; merge, refine, split or reject only on real actor/intent/flow grounds. Respect existing approved canonical Story IDs/meaning; proposed changes need developer review.

For each digested US record its identity, actor and intent; primary initial/action/observable; meaningful non-pristine states and alternative/sub-flows; discovered bug/safety regressions; one intended `tests/us/<story-id>.test.ts` file; applicable Aspects/Rule guarantees; and *every* historical case mapped to **move/retain, refine, merge as true duplicate, proposed missing case, or candidate retirement with reason**. A single historical file may feed multiple US files.

**Per-batch review:** inspect whether a proposed US is actually a Feature/function dressed up as a Story; test non-pristine scenarios against the real behavior (not speculative parameter permutations); audit safety cases and uncovered public acceptance, including the six proposed gaps in `US-ACCEPTANCE-TEST-SPECS.md`. Resolve overlaps and ambiguities before the next batch. Do not delete files in this iteration.

**Deliverable:** digested, reviewable US catalog and exhaustive *case-level* migration map. The previous 74-file inventory is input, not evidence that all 74 files or each of their assertions must survive.

## Iteration 2 — Migrate cases into the owning US files

Move by a few complete USs per batch, never all at once. Establish its primary public flow and non-pristine variants using actual interfaces; carry over/refine real old scenarios and relevant safety counterexamples. Eliminate duplicate setup and repeated oracles *within* the US. Move any meaningful test from a retired historical file to its correct owner(s); remove an old file only after **all** its meaningful cases are accounted for and the replacement has passed. Keep old tests temporarily where migration cannot yet be validated.

After every batch: inspect complete scenarios and their assertions, compare with the original tests for lost behavior (especially previously discovered bugs, failure boundaries, and legacy/retry/concurrency); correct the new file; request/run targeted Bun tests and typecheck, then commit a stable checkpoint. Do not convert a low-level mock into proof of a real external journey. A product gap stays an explicit proposed/blocked US scenario, not a green placeholder.

**Deliverable:** one scenario-grouped test file per migrated accepted US; updated map identifying any remaining old files and why, with verified versus pending states.

## Iteration 3 — Adversarial second digestion; verify and stop

Review all migrated USs *again* as a developer/user: start with a non-pristine project, cross interfaces, restart/retry, authority/permission failure, conflicting edits, independent proof, partial work and previously discovered defects where relevant. Compare every removed historical case with its actual replacement, identify weak assertions, false-green mocks, fabricated red, unowned cases and duplicate Stories. Correct in coherent batches, each followed by targeted proof.

Run full `bunx tsc --noEmit` and `bun test` **after** targeted green; report actual files/cases/runtime and each remaining skip or external live gate. If Bun cannot be executed by the current operator, obtain the user's actual output—never claim it ran. Final status must distinguish verified, pending live, uncovered product behavior and blocked migration. No forced percentage or case quota.

**Stop after iteration 3.** If gaps remain, publish a precise accepted-US/sub-flow and missing-proof list for separate product work; do not quietly schedule iteration 4 or add ceremony to make the migration look complete. No merging or branch proliferation.

## Completion gate

- Each accepted US has exactly one owning test file, with substantive primary and applicable non-pristine/alternative/regression flows.
- Every historical **meaningful flow** survives in the correct owner; every deletion has a concrete mapped explanation, not merely overlapping names or implementation focus.
- No accepted US is falsely marked proven by a missing fixture, skipped/live test, internal mock or old pass count; no invented historical red.
- Safety, independent acceptance, current source/Rule/Aspect obligations and cross-surface authority are not weakened.
- Targeted suites, full suite and typecheck are green on the resulting branch, or any unavailable check is explicitly reported as unverified.

**Measure meaningful US coverage, clarity, repeatability and suite cost—not a projected number of tests.**
