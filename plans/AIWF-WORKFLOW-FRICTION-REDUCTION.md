# AIWF — reduce engineering friction without reducing trust

**Status:** Stage 1, Stage 2 and the first US test-suite relocation are green **per developer-reported local focused/full test gates** (2026-11-10; raw logs/counts not available). Stage 3 has instrumentation only, not a validated governance optimization. Stages 4–5 remain planned. The intermittent public CLI/Shell help mismatch is not root-caused. No measured speedup asserted.
**Reviewed base:** `master` `960f9f9` (2026-11-09).
**Scope:** Existing Ticket investigation, source navigation/index freshness, effective governance, proof collection and lease ergonomics. No new command framework, policy engine, database, agent, risk taxonomy or parallel implementation path.
**Developer constraint:** At most one *AIWF user* operates on a particular branch/worktree at once. That **does not** guarantee no concurrent processes, editors, test subprocesses, crashes, or independent modifications to code/config/graph. This plan supersedes older sequencing only if the developer explicitly authorizes this work; it does not mark release Gate 5 complete.

## Execution checkpoint — 2026-11-09

- `4de2821`: add `astReconciliations` and `astFilesConsidered` engineering counters inside the existing metrics/indexer owners; baseline **not measured** yet.
- `48d7dad` and `251cbd1`: regression cases for one graph navigation reconciliation, zero AST reconciliation for raw disk/text Actor navigation, observed responses and optional `AIWF_BENCH_FRESHNESS=1` output. The new regression would be expected to fail before the implementation; red test execution was **not observed** in this remote environment.
- `20fc5d2`: existing `withAstSnapshot` encloses host-authorized refresh and subsequent read-only graph navigation; disk-only tools bypass the extra graph refresh. Source mutation, governed scope, preview fingerprints and independent acceptance are unchanged.
- **Stage 1 local gate:** developer reports all tests passed after the `132768d` check-count correction. No log/elapsed-time data for that latest run were provided; the reported result is accepted as a test-status assertion, not an independently measured performance improvement.
- **Stage 2 changes:** `7887282` adds test-first cases; `24249ba` adds the narrowly bounded deterministic investigation path; `7e1a227` adds Product-linked coverage. Normal advisory routing remains for Bugs, unanchored targets, optional candidates, Product scope, inspection uncertainty and multi-criterion work. Atomicity cannot be proved solely from one criterion; the existing verification still governs completion. No source authorization, policy or receipt changes.
- **Gate:** developer reported Stage 2 and first US migration tests passed; fast-forward merged to `master` at `a7131b1`. Performance measurements still pending; previous intermittent public help mismatch remains unclassified.

## Goal

A well-grounded, one-file technical change should require **one meaningful work contract, one coherent guarded change and proportionate verification**. The system must do the mechanics: no user-driven chains of investigate → prepare → claim → preview → re-review → resolve when the same facts are already known. Preserve the independence and validity of completion evidence.

**Success:** Less measured elapsed time, I/O, LLM usage and user intervention on equivalent tasks, without weaker source/approval/Story/policy/receipt behavior. **No percentage speedup is claimed before measurement.**

## Verified source findings (not timings)

| Finding | Current owner / proof in source | Friction mechanism | Assessment |
| --- | --- | --- | --- |
| Duplicate freshness on Actor graph navigation | `src/ticket/implementation.ts` calls `context.refreshSource()` before tools; `src/tools/graph-queries.ts` and `src/helpers/target-resolver.ts` call `ensureAstFresh()` again | Two reconciliations/scans can occur for one read, including unnecessary preliminary refresh for raw workspace text/file tools | High-confidence optimization target |
| Index reconciliation is not a cheap token check | `src/graph/indexer.ts:ensureAstFresh/reconcileAst` enumerates files, stats sources and examines external dependencies; `withAstSnapshot` already memoizes within a scope | Repeated calls can scale with workspace size | Measure actual cost |
| System-1 routing attempted for every full investigation | `src/services/investigation-routing.ts:assessRouting` calls System-1 unless `mandatoryEvidenceOnly` | Even completely explicit, ordinary technical Tickets pay a cognitive step | High-confidence unnecessary work for a demonstrably deterministic subset |
| Preparation already has the desired atomic shortcut | `src/ticket/prepare.ts` returns immediately for ready dossier with no enrichment; `resolve.ts` reuses its dossier when preparation made no changes | The problem is reaching the existing shortcut cheaply, not absence of a second fast-path engine | **Do not create a new fast-path implementation** |
| Governance is repeatedly reconstructed | `resolveTicketGovernance` in `src/ticket-operation-types.ts` traverses Product/Module/Rule/Decision/Aspect context; `resolve.ts` checks it repeatedly, and source preview/apply re-resolve it | Expensive repetition may occur while inputs are unchanged | Optimize only after measuring and proving invalidation |
| Proof baseline examines all TestNodes | `src/ticket/verification.ts:captureCheckBaseline` loads all indexed TestNodes and calls `currentTestEvidence` for all before a focused command | Potentially excessive graph reads/hashing | Optimize only with rigorous pre-execution evidence semantics |
| Separate ownership/lease layers | `src/graph/store.ts`, `src/ticket/source-scope.ts`, `src/managers/source-manager.ts`, `src/ticket/resolve.ts` | A direct public source edit requires an existing active Ticket claim; normal `resolve` already claims automatically | UX candidate, not an immediate security deletion |
| Independent acceptance is conditional already | `src/ticket/verification.ts:verifyTicketAcceptance` skips model review when no obligations remain, or recognizes adequately reviewed Story/technical proof | Model cost is not uniformly mandatory | Preserve this evidence-first design; optimize the remaining work, not the verifier away |

## Essential vs negotiable obligations

**Never weaken:** host-owned project-write and code-mutation permission; host-owned Product/dirty-file consent; Ticket-to-change attribution; approved Product intent/Story acceptance oracle; exact affected-file and scope authorization; path protection; stale/ABA and concurrent disk change rejection; admission/lease fencing at commit; current relevant tests/Rule/Aspect/Decision evidence; independent acceptance for uncovered semantic obligations; honest partial filesystem/graph results; atomic receipt/Done; cancellation and restart cleanup.

**Negotiable execution cost:** repeated AST scans within a single operation, optional System-1 classification for already explicit work, repeated resolution of *unchanged* governing data, all-TestNode preflight for provably bounded test commands, user-supplied agent identity/repeated claim handling when the host already owns one operation.

**The one-user premise changes UX/coordination priorities, not filesystem truth.** SQLite CAS/commit guards and final content hashes still earn their place. Do not construct a new branch-lock or per-user synchronization framework.

## Work sequence — independently gated, simplest first

### 0 — Characterization and baseline (no speculative optimizations)

1. Read actual local HEAD, working-tree status, sibling dependencies, installed CLI/MCP version and applicable Rules; preserve unrelated dirty files. Record the already-known full-suite baseline (866 passed / 0 failed / 7 skipped on the prior refactor gate) as **historical**, not a fresh benchmark.
2. In disposable project fixtures, exercise: **(a)** explicit one-file technical Ticket with one navigation and one governed edit; **(b)** two-file TypeScript symbol rename/import/anchor migration; **(c)** accepted Story test baseline → implementation → verification; **(d)** stale/dirty/unauthorized denial. Separately characterize a failing check and an unresolved Aspect or Rule.
3. Run the same fixture cold and warm several times; distinguish deterministic mock-model workflow time from configured provider latency. Capture wall-clock, focused/full checks, System-1/reasoning/critic calls, Actor steps, test counts, requests for input, failed/stalled attempts and any skipped verification. Existing `.ai-workflow/metrics.jsonl` and opt-in `AIWF_TRACE_RESOLUTION=1` are the starting instruments.
4. Add *only if needed* cheap counters for actual AST reconciliations/files considered, effective governance resolutions and current-test evidence reads. Counters must not store prompts/source/credentials or alter correctness. Classify time spent in CPU/I/O/LLM/human; no unsupported claim about the largest latency contributor.

**Gate 0:** reproducible fixtures and real baseline counters, including all safety-denial observables. If a suspected bottleneck contributes negligible time, change priorities rather than adding caching.

### 1 — Remove redundant freshness within *one* navigation call

1. In `src/ticket/implementation.ts`, classify existing Actor navigation by its real needs: graph-backed calls (e.g. `find_symbol`, `search_graph`, `get_symbol_source`, `get_file_outline`, entity-target references) versus raw disk/LSP calls (e.g. `read_workspace_file`, `search_workspace_text`; inspect target resolution before exempting LSP calls).
2. For graph-backed navigation, reuse **existing** `withAstSnapshot` around the host-authorized `context.refreshSource()` **and** the subsequent read-only `commandRegistry.execute` call. The handler's inner `ensureAstFresh` then shares that exact scoped refresh. Keep the exception small and explicit: the two known disk-only operations are `read_workspace_file` and `search_workspace_text`; inspect other tools before exempting them. Do not add a competing tool metadata/catalog system. Never let the scope span a source mutation, a separate Actor turn, a test run or an unbounded session.
3. Skip gratuitous preliminary graph refresh for operations reading current disk directly, provided they do not need indexed graph state. Never let a read-only tool silently gain indexing write authority or return an unlabelled stale graph.
4. Preserve each public graph tool's own freshness behavior for standalone calls and preserve `resolveCodeTarget` source/graph semantics. No global dirty flags, watchers, TTL cache or new indexer.
5. Regression: count one actual reconciliation rather than two for a composite graph call; no pre-refresh for pure raw reads; new source/rename appears in the next tool turn; external edit during LLM inference is observed (existing `tests/ticket-resolution.test.ts` case); no source writes from read-only execution; failed refresh does not serve cached evidence.

**Gate 1:** typecheck, focused graph/navigation, Actor, stale/authorization, change and Ticket-resolution tests. Cold/warm measurements must improve the redundant work without changing public result shapes or protection. Full suite at the cohesive stage boundary.

### 2 — Stop routine cognitive triage for already grounded technical work

1. Reuse the **existing** `prepareTicket` atomic early return; introduce no alternative resolver or Ticket type. Make `investigateTicket` recognize an evidence-derived deterministic-ready subset **before** `assessRouting` (or inside the existing routing owner).
2. Initially restrict skip to a non-Bug technical Ticket with explicit executable acceptance, current exact mandatory source targets, no unresolved ownership/required evidence, no proposed semantic enrichment, no contradictory known context, **one nonblank acceptance criterion**, and **zero optional discovery candidates**. This conservative predicate must use already collected evidence; it must not call another model to decide whether optional candidates matter. Widen it later only with independent cases. Provide concise recorded rationale/provenance for the skipped *advisory* routing, not fictitious System-1 evidence.
3. Keep System-1 and semantic reasoning for ambiguity, substantive Bug diagnosis, missing targets, requested new Product meaning and unclear dependencies. Known factual absence remains `needs_input`/blocked; never use "high confidence" as a substitute for observing source/test evidence.
4. When preparation is unchanged, continue reusing its dossier as `resolve` already does. Re-investigate after an actual scope/Story/semantic change, not merely because a stage name changed.
5. Regression: explicit atomic work reaches guarded implementation without System-1; ambiguous or incomplete work still escalates; unanchored Bugs remain source-grounded or precisely unknown; accepted Story test activation/review unchanged; independent semantic acceptance still occurs if obligations remain.

**Gate 2:** compare reasoning calls, human interventions and completion correctness against Gate 0. Fail closed when deterministic readiness cannot be proved.

### 3 — Prune redundant governance work *only at proven boundaries*

1. Instrument and enumerate each `resolveTicketGovernance` call in `resolve.ts`, `source-scope.ts`, `SourceManager`, receipts and investigation. Identify duplicate same-state evaluations vs checks after real filesystem/graph/policy changes.
2. Reuse the existing `GovernedChangeScope.governance` within a bounded operation **only** where the same admitted state is guaranteed. Remove demonstrably adjacent duplicate evaluations first. A held governance admission fences canonical policy mutation, **not** arbitrary external source/config changes or derived index changes; do not mistake the former for the latter. Maintain authoritative rechecks before source commit and proof/Done commit, after changes affecting module ownership/Rules/Aspects/Decisions/config, and after external edits or long asynchronous review.
3. **Do not implement a cross-operation policy cache or invent a policy-epoch counter.** Current policy fingerprints depend on effective Rules, linked Decisions, Aspects, target module ownership, reviewer/config and code-derived graph state; Ticket version alone does not validate them. A cache needs an actual complete invalidation proof, or must be rejected.
4. Preserve original stale preview/fingerprint and governed-scope revision semantics; no relaxed authorization for generated LSP edits, dirty files, changed Rule references or partial reconciliation.

**Gate 3:** new adversarial tests mutate effective Rule/Aspect/Decision, configuration, source/module ownership or Ticket scope between relevant boundaries and during reviewer latency; denial and exact error/evidence states must match baseline. Benchmark governance call counts. Stop if proof of equivalent applicability is unclear.

### 4 — Evidence preflight cost, only if still material

1. Profile `captureCheckBaseline`, `currentTestEvidence`, `recordTestExecution` and `verifyingTestsForTargets`. The baseline currently reads all TestNodes even for a targeted `bun test file.ts`; distinguish cost of listing from hashing referenced files.
2. For commands whose runnable TestNode set is safely known **before execution**, consider capturing pre-run hashes for that bounded set. For broad/unknown/dynamic commands, retain complete pre-run capture. Never hash source *after* executing tests and then claim it was pre-execution evidence.
3. Preserve full-suite attribution, skipped/zero-test detection, selected-vs-reported paths, changed test oracles, passing only current executed TestNodes, dependency/Aspect evidence and receipts. No extra verification schema or secondary proof store.

**Gate 4:** targeted and full-suite tests produce identical trustworthy proof sets; timing improves on realistic fixtures; failed/unreported/changed tests cannot be promoted to green.

### 5 — Single-user workflow ergonomics (optional, only after observed friction)

1. `resolve` already claims Tickets automatically; avoid changing it for a hypothetical benefit. For direct public source edit workflows, consider deriving the current agent/lease from the *host-owned* active operation instead of requiring the user to supply repeated identifiers/claim commands.
2. Preserve a durable exact Ticket claim at write time, its lease-expiry/replacement fence and one bounded source scope. Source preview must not mint write authority; cancelling must release only that operation's claim.
3. No automatic approval of dirty target/meaning change; no permanent branch lock, second lease database, background heartbeat by default or concession to caller-supplied `decision:'accept'`.
4. Only proceed if Gate 0 shows meaningful user intervention or repeated claim cost. Otherwise **defer**.

## Minimal acceptance matrix (use existing test owners)

| Scenario | Required result |
| --- | --- |
| Repeat two graph queries without edits | Each invocation fresh; no duplicate reconciliation **inside** one invocation |
| External file modified between Actor turns | Next graph-dependent call discovers latest valid source |
| Raw text/file read after external edit | Reads current disk; no unexpected graph write |
| Source modified between preview and apply, or dirty non-owned target | No unauthorized write; exact stale/dirty refusal |
| Rule/Aspect/Decision/config/owner changed while work is in progress | No stale authorization, false proof or Done |
| Same-agent replacement, expired claim, concurrent CLI, cancellation/restart | Old owner cannot commit; no invented completion |
| Technical Ticket with complete atomic evidence | No unnecessary advisory LLM triage; same guarded change and proportional proof |
| Bug/Story lacking source, test or meaning | Precise unknown/needs input; genuine Story-test baseline and acceptance retained |
| Focused vs full test execution | No invented executed tests, false green, changed-oracle reuse or widened proof |
| Disk commit succeeds, index reconciliation fails | Existing explicit committed-but-unreconciled status; never falsely verified |
| CLI / Shell / MCP / REST | Existing external schemas, authority and effects unchanged |

## US-driven test migration (developer directive, 2026-11-10)

- **Audit and first migration:** see `plans/AIWF-US-TEST-OWNERSHIP-AUDIT.md` (all 97 suites) and `plans/AIWF-MISSING-US-DRAFTS.md` (ten draft names reconciled to existing 30 candidates; no new IDs). Moved two already-labeled public Story suites into `tests/us/`, and one internal fixture suite into `tests/integration/` without changing assertions. Local targeted and full suite gates are pending; do not generalize this move into mass renaming.

- **US first, tests second.** Every new user-visible behavior begins with an official accepted US (Actor, Intent, Initial State, Action, Expected Result), then its genuine acceptance tests. Do not infer the oracle from implementation or green historical tests.
- **File ownership:** default one cohesive acceptance-test file per US; split into multiple files tied to the *same US* when length/clarity justifies it. Require a clear US ID reference in each file; filenames alone are not semantic authority.
- **Historical inventory:** map the existing `tests/**/*.test.ts` files/cases to accepted US IDs and identify genuine gaps. Verify existing `user-stories.md`/canonical graph entries first. Draft missing real-world episodes, secure Product acceptance, and then adjust tests. Preserve valuable legacy coverage throughout migration.
- **Rare exceptions:** focused tests of critical internal invariants and skeleton wiring may exist independently, with a stated reason and related Story/engineering obligation. An orphan suite is a review item, not an automatic deletion or permission to manufacture a fictional US.
- **Refactoring sequence:** before adding or substantially rewriting a test, identify its governing US (or justified exception), preserve the Story-based oracle, ensure existing acceptance remains independently valid, and only then reorganize test files. Do not introduce a mandatory Story for a purely technical maintenance Ticket when no product episode exists; link it to the protected behavior/US where relevant.

## Current execution: Story-led module ownership (2026-11-10)

**Authoritative basis:** `docs/api/public-interface.md` is the approved command semantics; `US-E03`, `US-E02`, `US-E04` in the older `plans/US-COVERAGE-01-ENGINEERING.md` are candidate actor episodes, **not automatically accepted canonical Product definitions**. Reconcile actual graph records and submit any substantive missing expected results to the developer; never mint accepted US or alter the oracle because tests are green.

1. **US-E03, command grammar/parity:** use the single existing `CommandRegistry` as declaration/availability owner, `artifact-command.ts` for Commander parsing/legacy lexical aliases, `command-presentation.ts` for generated CLI/Shell projection, and `cli.ts`/`shell.ts` only as transport/interaction adapters. Diagnose intermittent `tests/public-read-surfaces.test.ts` help-parity failure using full CLI/Shell outputs and exact argv before behavioral changes; inspect simultaneous registry mutation as a hypothesis, **not established cause**. Keep existing authoritative US-E03 scenarios in `product-operability-commands`, `artifact-command`, `cli-help` and `public-read-surfaces`; do not create a new independent test suite while US contract is unapproved.
2. **US-E02/E04, source authority and owner cleanup:** `ticket/source-scope.ts` owns the exact allowed Ticket scope, `ticket/governance.ts` owns effective Rule/Decision/Aspect/module applicability and its fingerprint, `services/code-mutation` owns exact proposed effects/apply, `ticket/verification.ts` owns current proof. Do not duplicate authorizers, conditionally cache live authority, or move unrelated logic to general-purpose managers.
3. **Current extraction:** `177ac71` moves the unchanged `resolveTicketGovernance` algorithm into `src/ticket/governance.ts`; shared `TicketGovernance` type remains in `ticket-operation-types.ts`, and all known direct callers and the one affected technical test import have been updated. **No test assertions were altered. No Bun/typecheck gate has executed remotely.** Structural cleanup only—`governanceResolutions` and all provenance checks retained; no performance improvement claimed.
4. **Next refactor, only after green local gate:** move Rule-assessment contract checks and verification signatures to their true verification owner if their complete dependency/call map proves simpler, then remove redundant governance **computations** only where fresh Rule/Aspect/Decision/source invalidation remains guaranteed. Do not conflate function relocation with optimization.

**Gate:** targeted `tests/doctrine-verifier.test.ts`, `tests/doctrine-scope.test.ts`, `tests/ticket-resolution.test.ts`, `tests/ticket-investigation.test.ts`, `tests/source-change-authorization.test.ts` and the affected CLI/Shell parity files, plus `bun run typecheck` and `bun test`. Require no changed test oracle, current rejection of stale source/governance, and no unexpected module-loading cycle. Stop on any failure and inspect production root cause before editing tests. Finish a stable stage and fast-forward merge; avoid new branch proliferation.

## Mandatory structural cleanup while optimizing (2026-11-10)

**Developer instruction:** Every touched function is assessed for a single suitable owner and placement; do not merely split large files or introduce pass-through managers. Prefer relocating code into a **real existing owner**. A new module is justified only when it establishes a coherent domain boundary. No forest of abstraction, duplicate dispatchers, "temporary" compatibility layers or needless background machinery.

**Observed ownership problems and intended destinations (inspect callers before each move):**

| Current responsibility | Current location | Canonical owner/direction |
| --- | --- | --- |
| Effective Ticket governance resolution (rules, decisions, Aspects, code/module ownership, fingerprint) | `src/ticket-operation-types.ts` (mixed with schemas, signatures and acceptance) | Focused `src/ticket/governance.ts`; data contracts remain data-only; migrate real imports rather than adding aliases |
| Acceptance-rule validation and Ticket verification signature/receipt calculations | `src/ticket-operation-types.ts` | Existing `src/ticket/verification.ts` or one small proof-specific module if it demonstrably tightens responsibility |
| Graph evidence discovery and investigation classification | `src/services/investigation-evidence.ts` / `investigation-routing.ts` | Keep evidence collection distinct from advisory routing; move contract/ownership decisions into their actual Ticket/Product owner, no second dispatcher |
| Source scope admission, reviewed effects and freshness checks | `src/ticket/source-scope.ts` plus `src/managers/source-manager.ts` | `source-scope.ts` owns admissibility and governed fingerprints; `SourceManager` owns one host-facing source transaction, not duplicated domain policy |
| Ticket orchestration (583 lines) | `src/ticket/resolve.ts` | Orchestrate dependencies/attempts only; concrete proof belongs to verification, source mutations to source manager/service, durable lease to store |
| CLI and Shell domain execution/help | `src/cli.ts` (1028 lines), `src/shell.ts` (1291), `src/artifact-command.ts` (703) | One existing command grammar/registry for both; CLI/Shell only adapt input/output/interaction. Move true domain operations to their owners, not a new universal dispatcher |
| Persisted entity/graph operations | `src/graph/store.ts` (1089 lines) | Preserve canonical persistence/atomicity owner; relocate unrelated workflow domain logic only if callers and transaction boundaries remain intact |

**Per-function test:** necessity; correct owning domain; invariant enforced exactly once; input/return shape; executable effect; narrow dependency graph; no duplicated scans/reasoning/calls. Review *whole touched method*, not only diff. Avoid cross-domain cycles or aliases added to hide a bad module boundary.

**Order:** (A) diagnose the CLI/Shell help parity failure with complete exact outputs; (B) relocate governance calculation and proof logic to their actual owners **before** attempting governance caching; (C) measure and remove only verified duplicate governance work; (D) simplify the resolver and transport adapters after guarding public parity. Each independent move must pass typecheck, targeted public/authority/stale/receipt regression and a coherent full-suite gate. Do not relocate dozens of methods in one unverifiable patch.

**Current failure state:** user observed one flaky public-help parity failure in full suite, but standalone execution passed. Cause not established. The next failure should include the exact argv and full CLI/Shell outputs (no assertion weakening); do not attribute it to Stage 2 without evidence.

## Execution and stop rules

- One short-lived implementation branch at a time; small coherent commits; merge/delete promptly after developer acceptance. No branch forest. This document is **not** authority to mutate production code.
- Prefer test-first characterization and *whole touched method* review, not wrappers around an existing bad flow. Do not duplicate stores, registries, indexers, scopes, reviewers or model routers.
- Use AIWF itself for read-only navigation and *one* small real governed edit as an actual dogfood check; if it blocks unnecessarily, record the exact operation/result as a usability defect rather than fabricating Ticket artifacts.
- Run focused/typecheck after each stage; pack and full deterministic suite at a cohesive release point; record all failures and skips. Use live configured provider tests only when actually authorized/configured; mark absent as unverified.
- Stop/revert the isolated stage if denial becomes permissive, a preview writes, a stale Rule or source slips through, a test becomes falsely current, accepted Story meaning changes, a partial write is reported complete, or added coordination exceeds removed complexity.
- Final report: measured before/after per fixture, calls/I/O/time/LLM/human, changed owners/files, safeguards, focused/full test counts, unresolved risks and disposition of every stage.
