# Proposed public acceptance tests — uncovered Story obligations
Status: **specifications for developer review, not executable/approved tests and not passing evidence**. These are **scenario additions to the owning US test file**, not six standalone test files. Their existing/non-pristine variants must be digested alongside historical tests under [the revised plan](US-TEST-CONSOLIDATION-PLAN.md).
Basis: US coverage cycles 1–4 and the 76-file ownership matrix. Implement each accepted test first; activate expected red on starting the corresponding work. Reuse existing owners/fixtures, no new parallel test framework.

## AT-P02 — Derive implementation work from a reviewed Story test
**Owner:** US-P02/US-P07; intended home: existing `tests/dharmax-s4.test.ts` (public Workspace Story journey).
- Given an accepted complete Save-filtered-avatar Story, a real small public API fixture, and no current linked executable TestNode.
- When the developer prepares work, any initial Story/epic proposal remains inert; the interface requires the Story's *actual* public test to be specified and reviewed before proposing implementation Todo Ticket obligations.
- When the developer reviews/materializes that test, it has a stable linked TestNode and skipped/unstarted status. An explicitly unmet asserted behavior yields a proposed, scoped implementation Ticket attached to the same Story/test obligation. Equivalent already-present work is reused.
- Assert no Ticket derived merely from a title, no new implementation Ticket when current behavior is already green, no false skipped when fixture missing and no mutation from a declined proposal.
- Starting this Ticket activates the same test; capture actual expected-red without inventing it.
**Current gap:** The historical S4 fixture creates `T` before specifying `tests/save.test.ts`; it does not prove this Story. Do not delete that fixture until the replacement is approved and green.

## AT-E02 — Installed external host performs a complete reviewed Ticket lifecycle
**Owner:** US-E02/US-T02; intended home: existing `tests/p0-engineering.test.ts` integrated host Story.
- Given an installed MCP host with a host-bound write grant, accepted Story/test and claimed reviewed Ticket, plus unrelated dirty work.
- Verify typed discovery; first execute same reviewed Story test and record attributable missing-behavior red.
- Preview/apply cohesive authorized edits (replace/create/delete/rename as relevant), run actual public fixture and regressions, inspect the resulting filesystem, then independently verify Ticket and release/complete lifecycle.
- Assert green test identity/revision, current proof, source attribution, Ticket status and unchanged unrelated work. No Product self-approval.
- Negatives: read-only, foreign claim, wrong root, stale preview, changed source/test, missing expected-red, fixture failure and unsupported dependency cannot produce verified Done.
**Current gap:** P0's current giant test ends with `verificationState === 'unverified'`; successful source writing is not independent acceptance.

## AT-E02-ROLLBACK — Distinguish stale refusal from write-time atomicity
**Owner:** US-E02/US-T03; intended home: existing `tests/change-engine.test.ts` (engine contract) with one installed-host assertion in P0 if needed.
- Given a valid reviewed two-file change whose preview and admission both pass.
- Induce a deterministic failure *during* the second file write, after the first write has completed.
- Assert restored exact bytes for both files (including partially modified failing destination), unchanged unrelated files, no success receipt and truthful rollback error if recovery itself fails. Do not assert crash-atomicity beyond documented guarantees.
- Separate control: invalidate second file *between preview/apply*, assert refusal occurs before any first write. These are different counterexamples.
**Constraint:** Use a controlled existing I/O seam or justify the smallest test-only seam; do not rely on races, permissions or global monkeypatches that contaminate the suite.

## AT-E03 — Actual canonical syntax parity across executable surfaces
**Owner:** US-E03; intended home: `tests/product-operability-commands.test.ts` with existing Commander/PTY fixture.
- Given the same authorized Ticket and controlled source fixture, execute `aiwf source:change PREVIEW` and `aiwf source change PREVIEW` through the actual binary (reset or isolate fixture per form), then equivalent Shell command.
- Assert equivalent normalized typed request, previewed affected files, refusal cases and actual authorized application—not parser string equivalence alone.
- Typed MCP discovery receives semantic fields, never a CLI string. Help does not initialize a DB or write.
- Negatives: malformed JSON, missing owner/fingerprint, stale preview and wrong scope.

## AT-E01 — Cold read-only sibling inspection survives restart
**Owner:** US-E01; intended home: `tests/mcp-client-investigation.test.ts` (actual MCP Client).
- Given installed host with a write grant only for its own root and an undeclared sibling containing source + package marker, read-only there.
- Invoke exact sibling search/outline/source, close server and open a new Client/server, repeat and return to host root.
- Assert correct exact evidence each time, no persistent sibling `.ai-workflow` or changed source, no inherited write authority and no leaked host/Semantika binding.
- Negatives: invalid root and changed/removed file produce truthful result/refusal rather than silently querying the default root.

## AT-P02-MIGRATION — Existing green behavior has no invented expected-red
**Owner:** US-P02/US-P10; intended home: `tests/dharmax-s5.test.ts`.
- Given a legacy accepted Story with a real currently implemented public behavior but no historical red record, review a current executable acceptance fixture.
- Assert honest current green or uncovered/blocked, never synthetic red and no implementation Ticket when no behavior is missing.

## Acceptance handoff
For each reviewed test: attach Story identity/revision, relevant Aspects, executable fixture/public action, exact initial/observed state, negative cases and expected-red explanation. Preserve existing TestNode identity on later revisions. At most one cohesive acceptance suite per Story plus narrowly justified technical regressions. Do not count these proposed specs as six new passing tests.
