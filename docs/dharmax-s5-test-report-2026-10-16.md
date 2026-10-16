# S5 real Story test lifecycle — DW-04 evidence report

**Date:** 2026-10-16
**Stage:** S5 only — Story test specification and test-first lifecycle
**Starting source:** `0655ba21ddf8ae86edab82349b09de79f6dd68fa` (`master`)
**Canonical work item:** `TKT-7MI2`, In Progress; this report does not accept or complete it.
**Primary journey:** `tests/dharmax-s5.test.ts`, executed through the real Workspace and its existing Bun test runner.

## Result

DW-04 is demonstrated end-to-end. A developer-reviewed, materialized public-interface Story test starts skipped because implementation has not begun. Starting the addressed Ticket activates the same path-keyed TestNode and makes it runnable. The actual test passes its happy save assertion and then fails the exception-preservation assertion against the deliberately faulty fixture; AIWF records expected-red. A guarded change repairs the fixture, and the same test becomes green. A malformed fixture is classified blocked, its guarded repair permits another green run, and reopening the canonical store retains the TestNode and current run evidence. An unrelated backlog Story remains skipped. Changing the authoritative applicable Aspect invalidates the earlier green result as stale.

The journey also proves that a passing happy-path case cannot hide a failing boundary case: both assertions are in the same executable test, the runner reports failure at the prior-value assertion, and the Story state is expected-red rather than green. The test command is the existing targeted Bun runner; no secondary runner, execution engine, event history, or persistence layer was added.

## Canonical grounding and ownership

The stage follows `plans/AIWF-DHARMAX-WAY-DESIGN.md` and the S5 gate in `plans/AIWF-DHARMAX-WAY-PLAN.md`. The approved Story specifies actor, intent, initial state, action, observable result, and exception behavior. Its accepted Aspect supplies the relevant persistence obligation. The actual test source remains in the project; the canonical graph carries the path-keyed `TestNode`, links, revision basis, lifecycle classification, reason, and execution evidence.

The Workspace journey uses its actual browser client/server, calls the registered public Product and Ticket operations, and invokes the existing targeted test runner. Ticket start, Workspace test run, Product mutation preview/apply, and the Causal Change Engine remain the respective owners. The same TestNode ID (`test:tests/dw04-save.test.ts`) is asserted before activation, after red, after green, after a blocked run, and after reopening. The independently materialized backlog test has a distinct path identity and remains skipped.

Filesystem and database effects are distinct boundaries. Test-file materialization and canonical linking retain S4's explicit partial outcome. During S5 activation, guarded source activation can succeed before canonical status application. The operation reports that partial failure; a retry reconciles the exact reviewed marker change on the same TestNode. No cross-filesystem/SQLite transaction is claimed.

## Public Story and controlled fixture

**Actor:** signed-in user saving an avatar after applying a filter.
**Initial state:** a previous avatar exists and the filtered preview is ready; the reviewed Bun test is materialized and skipped while its Ticket is Todo.
**Action:** start the Ticket using the public Ticket-state operation, then run the active Story test through Workspace.
**Expected result:** the filtered value is saved and readable; if persistence throws, the previous value remains intact.
**Fixture:** tracked `tests/fixtures/dw04-avatar-store.ts`, copied into the temporary project as `src/avatar.ts`. It exposes the real imported public function `saveFilteredAvatar`. The initial implementation clears the prior value before writing, intentionally violating the exception contract.

The Story test imports that public export, executes the happy path, then executes the throwing write and verifies both the error and preservation of the previous value. It does not infer behavior from graph edges or generated specification prose. The Workspace journey itself performs guarded `preview_change` / fingerprint / `apply_change` operations for the implementation repair, malformed syntax injection, and fixture recovery.

## Observed lifecycle and failure cases

| Point | Public action and observed evidence | Canonical classification |
| --- | --- | --- |
| Uncovered | An accepted Story with no materialized test has no executable proof. | `uncovered`; it is not represented as skipped. |
| Before implementation | Review and accept the executable test against the public fixture while Ticket `T` is Todo. The source contains `it.skip`; same path-keyed TestNode is linked. | `skipped`, with reason that implementation has not started. |
| Ticket start | Call `update_ticket_state` for `T` → `In Progress`. Guarded source edit removes the skip marker; the TestNode identity remains unchanged. | `not-run` / activated, with a reason requiring pre-implementation execution. |
| Expected red | Workspace runs the test. Output shows the happy-path assertion completed, then the exception-preservation assertion fails after `disk failure`. This is a real assertion failure against the still-reviewed faulty fixture. | `expected-red`, `passed=false`, with a current `lastRun`; it cannot be mistaken for infrastructure failure. |
| Repair and green | Guarded change removes the destructive clear-before-write operation. A subsequent Workspace run executes the same test successfully. | `green`, `passed=true`; the same TestNode and Story identities remain. |
| Malformed fixture | Guarded edit injects invalid TypeScript syntax. Workspace run returns compiler failure and no valid behavioral assertion result. | `blocked`, not expected-red and not green. |
| Recovery | Guarded repair restores valid fixture source; Workspace reruns the test. | `green` only after a new actual passing execution. |
| Unrelated work | Query the separate backlog Story before/after the journey. No Ticket start or run applies to it. | Remains `skipped`. |
| Reopen and revision change | Stop Workspace, close/reopen WorkflowStore, inspect the same TestNode and evidence, then revise the linked accepted Aspect. | Persisted current run is visible after reopen; after Aspect revision, prior green is `stale`. |

The S5 journey asserts the status/reason and run result at each relevant boundary. It verifies test identity, Story identity, `passed`, `lastRun`, execution hashes, the backlog skip state, compiler output for malformed source, and stale invalidation after Aspect change. A passing Story is never inferred solely from `verifies`/`addresses` relationships.

## Reproduction

Run from the repository root with Bun and the repository dependencies installed:

```sh
bun test tests/dharmax-s5.test.ts
bun test tests/dharmax-s5.test.ts tests/dharmax-s4.test.ts tests/mcp.test.ts tests/tools.test.ts
bun test --max-concurrency=1
bun run typecheck
bun run pack
git diff --check
```

Observed in this verification pass:

- Focused S5 + S4 + MCP + tools regression: **18 passed, 0 failed, 231 assertions**. The DW-04 Workspace journey is included, not skipped.
- Full suite, serialized to avoid competing subprocess pressure: **490 passed, 5 skipped, 0 failed; 3,208 assertions; 495 tests across 65 files**. The five skips are existing opt-in skill/synthesis, live OpenRouter, and configured live Gate 5 verifier journeys. None is the S5 test.
- `bun run typecheck`: passed with zero diagnostics in the source checkout and clean validation worktree.
- `bun run pack`: passed in both checkouts; dirty source reported build 900 at the starting commit, and the clean committed checkout reported build 901 at `885ff2a38e08`.
- `git diff --check`: passed for the reviewed change set and the pristine commit worktree.
- Pristine source validation used a detached clean worktree at the S5 commit under review. `git ls-files` confirmed the S5 journey, public fixture, implementation, Workspace client, and report are tracked; the worktree began clean. The focused four-file journey passed again with **18 passed / 0 failed / 231 assertions**.

The relevant S4 suite is included in the focused command and passes its reviewed DW-03 journeys: inert proposal and explicit approval, stable reconciliation, edit/rejection/ambiguity behavior, and separate filesystem/database recovery. This is regression evidence, not a relabeling of S4 or a claim that the unavailable model-backed proposal route is qualified; its previously recorded `authentication: User not found` remains a known provider limitation and was not retried for deterministic S5.

## Truthfulness, freshness, and limits

The current classification is accepted only with current source hashes, the reviewed test hash, Story revision, applicable Aspect basis, and a newly persisted `lastRun`. Missing fixture/test source is uncovered; a changed fixture/test or intent basis makes old evidence stale; malformed source or non-attributable runner failure is blocked/unknown. An absent or unchanged `lastRun` after runner invocation cannot be classified as a test result. Skipped never contributes to a pass.

A green Story test is evidence for that Story's current executable contract. It does not by itself verify a Feature, close its Ticket, establish a release receipt, or accept Gate 5. The Story test is not claimed as proof of broad autonomous implementation. S6's governed Ticket implementation/resolution redesign is outside this deliverable. No provider-backed proposal was used or retried.

## Touched S5 deliverable surface

- `src/graph/ontology.ts`, `src/product/mutation.ts`: typed TestNode lifecycle fields and guarded canonical update validation.
- `src/product/story-tests.ts`: current Story/Aspect/source basis inspection, uncovered/stale/blocked states, Ticket activation, existing-runner execution and evidence classification, and current pre-implementation proof guard.
- `src/tools/product.ts`, `src/tools/tickets.ts`: public status/run and Ticket-start activation entry points.
- `src/workspace/server.ts`, `src/workspace/client.js`, `src/workspace/page.ts`: Workspace status/run interaction through those same domain operations.
- `tests/dharmax-s5.test.ts`, `tests/fixtures/dw04-avatar-store.ts`: the real Workspace DW-04 journey and tracked controlled public-interface fixture.
- `docs/dharmax-s5-2026-10-16.md`: concise stage evidence; this file provides the deeper test record.

Review covered the complete changed Story-test methods and their immediate callers: status inspection and revision basis, Ticket activation and recovery, the implementation proof guard, runner classification, preparation/materialization, Product and Ticket tool adapters, and the Workspace route/client action. The ontology and Product mutation field contracts were checked alongside the existing test-runner persistence contract. Existing Gate 5 safety regressions ran in the full suite. The canonical S5 Ticket remains In Progress. No S5 acceptance receipt or Done transition is fabricated, no Gate 5 state is changed, and no S6-or-later work is included.
