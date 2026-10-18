# EXT-SURFACE-10: Product mutation authority correction

Scope: `dharmax/ai-workflow`, master starting at `e1aa57a` (following the partial `3d2a040` fix). No EXT-SURFACE-01, PC3, PC4, S6, Gate 5 certification, or S8 migration work is included.

## Reproduction and authority boundary

Before implementation, `bun test tests/product-authority.test.ts` failed because a project-write registry caller successfully ran `define_product`. The expected refusal instead received a resolved promise. Removing the tool from the advertised MCP allowlist did not remove its registry implementation or Actor discovery.

The correction belongs to `applyProductMutations`. A Product-definition commit requires a reviewed request, the matching current fingerprint, and host-owned review context. The existing `WorkflowStore.withExecutionContext` carries that exact fingerprint; tool arguments and `ToolContext.executionAuthority` cannot supply it. Nested contexts inherit it without being able to upgrade it. Authority is rechecked before the synchronous batch commit.

An additional lifetime reproduction demonstrated that a detached nested context could apply after its host callback returned (`appliedAfterHostReturned:true`). Context liveness now includes its parent's liveness. The corresponding regression checks refusal and reopened canonical state.

`CausalChangeEngine.applyChange` reports `ok:false,status:review_required` with the inert preview when the domain owner requires review. Rejection, cancellation, preview validation, stale fingerprint/basis checks, admission, conditional SQLite batch assertions, and post-commit verification remain in place. No new approval service, permission registry, persistence owner, or mutation service was added.

## Routes inspected

| Route | Result / ownership |
| --- | --- |
| Legacy `define_product/update_product`, Goal/Concept/Flow/Epic/Feature/Story writers | Still registered internally, but their unreviewed call to the mutation owner is refused. Hiding them from tools/list is not the guard. |
| Legacy Aspect create/revise/apply/remove methods | Same canonical mutation guard. |
| `link_product/unlink_product` | Definition relations require the same reviewed path; validated technical Ticket work ordering/source scope and scoped Test ownership remain available. |
| Typed `link`, definition previews, process/decomposition proposals | Inert until the reviewed application path. |
| Registry `apply_change` | `decision:accept` is review data, not host authorization. Project-write alone yields `review_required` for definitions. |
| Actor discovery and direct `tool.execute` | The Actor's existing execution context reaches the same owner; legacy discovery cannot evade the guard. |
| Actual stdio MCP `tools/call` | Read-only is retained; explicit project-write still cannot approve its own Product edit. No external-host approval/delegation contract is invented. |
| Local CLI/shell review handlers and Workspace apply handler | Supply the fingerprint only at their existing local review boundary, then call the same S2 operation. |
| Generic store upsert/update/erase and relation methods in tool context | Refuse direct definition/intent authoring. Existing operational completeness controls, technical Ticket operations, indexed source ownership, scoped Story-test evidence and independent completion retain their owners. |
| Legacy Aspect projection import | Uses the existing preview/fingerprint engine; local sync compatibility remains, and an unapproved agent execution context cannot authorize itself through import. |
| AIWF test/Playwright runner | Drains stdout and stderr while observing exit concurrently; retains real exit codes, output and canonical Test evidence. |
| S4/S5 / Ticket operations | Their existing Test scope or validated technical work mutations are preserved; those exceptions do not approve changes to Product meaning. |

The host boundary is an application/API boundary, not an OS security sandbox. D1 still must decide external-host exact approval or bounded delegation. Arbitrary OS/database access cannot be represented as proof that a developer reviewed a Product proposal.

## Verification and aggregate failures

The new suite executes the real registry, scripted Actor discovery/execution, real stdio MCP, and local CLI reviewed application, then reopens SQLite. It covers direct mutation, model self-approval, wrong/nested/expired host review, read-only and aborted calls, reject/cancel, one approved application, stale application, raw legacy store writing, and technical Ticket preparation.

Existing S1–S5/PC1a/PC1b tests now emulate explicit local host review where they previously treated agent project-write plus `decision:accept` as approval. Accepted Feature fixtures name their required responsibility. Assertions for rollback, freshness, identity, cancellation and owner proof were retained.

The first sandbox aggregate encountered cache write restrictions, LSP setup timeouts and denied local sockets. That log was retained at `/tmp/ext-surface-full-initial.log`; it is not a passing result.

The first unrestricted aggregate raised `EBADF: bad file descriptor, epoll_ctl` in the S4 fixture subprocess, where exit observation started after stdout/stderr consumption. The test now observes exit and both streams together, retaining the real subprocess and all assertions. The later Workspace acceptance assertion also checks the actual HTTP result. Subsequent aggregate evidence, including any remaining transport failure, is recorded below; no isolated passing run substitutes for the aggregate.

Observed on the final source tree; the final full command was executed through the existing AIWF registry test runner:
- `bun test --max-concurrency=1`: **541 pass / 5 opt-in skips / 0 fail**, 546 tests across 70 files, 3,649 assertions.
- `bun run typecheck`, `bun run pack`, `git diff --check`: passed.
- Packed CLI/MCP: `AIWF_PUBLIC_BINARY=$PWD/dist/aiwf bun test tests/product-authority.test.ts tests/product-operability-links.test.ts tests/product-operability-definition.test.ts --max-concurrency=1`: **23 pass / 0 fail**.
- The five skips are existing opt-in/provider journeys; no skipped acceptance is reported as passing.

The first unrestricted aggregate retained two S4 failures and later stalled in the stdio link test. Exit and both streams are now observed together in that S4 fixture. An instrumented transport run and a later plain run completed 541/5/0; temporary checkpoints were then removed and the unused stderr pipe inherited. A subsequent audit run exposed a separate S5 failure: Chromium closed after a failing fixture subprocess (540 pass / 5 skips / 1 fail). That failure is retained at `/tmp/ext-surface-full-audited.log`.

Inspection found the same sequential stdout/stderr/exit ownership in the existing AIWF test runner. Both of its existing runner paths now await all three together, preventing blocked stderr consumption and late exit observation without a new runner or helper. The focused S4/S5/authority/PC1a run passed, followed by the entire unisolated `bun test --max-concurrency=1` through `aiwf triage`: 541 pass / 5 skips / 0 fail, 3,649 assertions, 102.26 seconds. Actual command/output evidence was persisted on canonical TestNodes. The precise Bun-internal cause of the timing-sensitive transport/browser failures is not established; failed/stalled runs are not counted as passes.

Pristine-source reproduction before publication uses a detached checkout of the correction commit, then the same full-suite/typecheck/pack commands and the packed-public command above. Installed sibling dependencies are reused through an ignored node_modules symlink. This verifies tracked AIWF inputs, not a fresh independent dependency installation.

Dependency provenance: Semantika HEAD `0d395ee2b2cef6a03a7cdee23b3a23fe9073e575` has existing dirty source/test/projection files; llm-utils HEAD `f8222aaa155a0b86f50b7cacbe0701ed29d86840` is clean but ahead of its remote by one commit. Neither sibling was modified for this correction. Do not claim remote-only dependency reproducibility.

## AIWF observations

- `resolve` was tried first and stopped before editing: the configured OpenRouter route returned `User not found`. Final metrics recorded two remote authentication failures, no successful edit and no verified resolution.
- Doctor subsequently confirmed Ollama at `http://lotus:11434` was reachable. The project dev/design/critic route overrides still name OpenRouter models; Ollama availability alone does not repair that recorded cloud authentication failure.
- `investigate` returned the canonical criteria and universal doctrine without a reasoning call. Before source links, optional discovery overmatched the word “close”. Adding exact `Ticket modifies File` links made those files mandatory dossier evidence, while optional candidates remained noisy.
- Exact outlines, slices, callers, blast radius, and `resolve_test_target` were useful for bounding ownership. After the regression imported/called the mutation owner, graph test discovery found the new authority suite.
- Parallel CLI graph reads produced optimistic index conflicts; subsequent graph navigation was serialized.
- The connected MCP edit host was read-only and refused `apply_change`. Manual source changes still used the existing Causal Change Engine's preview, original hashes, fingerprint and apply, rather than native file editing.
- `aiwf triage` ran focused real tests and persisted their output on TestNodes. Its concise failure parser did not name one Bun failure; reading the retained TestNode output through `aiwf eval` exposed the original failure. No unrelated triage redesign is included.

## Acceptance and blockers

Canonical TKT-EXT-SURFACE-10 remains **Blocked**, with the demonstrated assisted implementation/test evidence recorded in its existing body. Both real `resolve` attempts stopped at configured OpenRouter authentication (`User not found`) before any successful Actor edit. The independent acceptance owner did not close the Ticket; no receipt or Done transition was manufactured. The lease is released before publication.

D1 remains unresolved. External-host review UI/delegation and general cross-surface acceptance are not claimed. Local deterministic CLI and Workspace review are the demonstrated host paths. This delivery does not accept PC2 as a whole, PC4, S6 or Gate 5.

Publication procedure: retain the canonical Blocked status; release the lease; run `aiwf sync` for the supported projections and authored snapshot; commit the bounded correction on master; validate its detached pristine source checkout; fast-forward push master; compare local HEAD with `git ls-remote --heads origin master`. The final delivery response records the actual published commit and validation outcome.


## Pristine checkout outcome and remaining aggregate blocker

Detached clean AIWF source at implementation commit `7bc53d01a17f72e478140e73ec6879fbec6e3d4b`, path `/tmp/aiwf-ext-surface-10-pristine.PHYfIY`:

- Typecheck, pack and `git diff --check` passed; tracked working state stayed clean.
- Full aggregate: **540 pass / 5 opt-in skips / 1 fail**, 3,649 assertions, 110.45 seconds. Failure: `tests/change-engine.test.ts`, “Unsupported Rich Refactor Probe”, a 10-second beforeEach/afterEach hook timeout; two dangling processes were killed. Log: `/tmp/ext-pristine-full.log`. No isolated run or retry replaces this result.
- The synchronous beforeEach creates only fixture files/store. The asynchronous afterEach awaits `closeAllTsLspClients()`, then `closeAllTs6RefactorClients()`. Both existing `close()` methods await an unbounded `sendRequest('shutdown')` before connection disposal/child termination. All body assertions completed; the retained trace does not distinguish which server failed to answer shutdown. This is a native-client teardown blocker, not demonstrated acceptance of a pristine aggregate. A shutdown-behavior change belongs to that separate owner and was deferred rather than folded into Product authority work.
- Independently required packed public routes on that pristine build: **23 pass / 0 fail**, 260 assertions, 3.15 seconds. Log: `/tmp/ext-pristine-packed-public.log`. This is separate evidence and does not turn the failing full aggregate green.

The subsequent evidence-only commit changes this report, canonical Blocked-state projections and publication metadata; implementation/test/package inputs remain identical to `7bc53d0`. Ticket acceptance remains blocked by the pristine aggregate, configured independent-resolution authentication, and unresolved D1 external-host trust policy. No clean/pristine whole-release acceptance is claimed.
