# AIWF — Follow-up work: ingestion seed

**Prepared:** 2026-10-18  
**Purpose:** Preserve agreed decisions, review findings, and exploratory topics for *later ingestion into AIWF's own canonical Ticket graph*. This file is an import brief, **not** a Ticket database, implementation authorization, or a replacement for existing plans.  
**Repository:** `dharmax/ai-workflow`  
**Initial discussion baseline:** `e1aa57a6bc053e03723b7e591cbdd1e3a31258d6`. **Last remote review:** `master` at `f91b1be520565caf465fa7b5621e82d763b4a676`, after implementation `7bc53d01a17f72e478140e73ec6879fbec6e3d4b`. Recheck actual HEAD, worktree, canonical DB, dependencies and acceptance at ingestion time.  
**Earlier seed:** `plans/AIWF-EXTERNAL-SURFACE-ISSUE-SEED.md` (do not duplicate or supersede).  

## Ingestion contract

1. Read the repository's `skills/ai-workflow/SKILL.md`, current relevant plan/design and **canonical DB**. Search existing Tickets by meaning, marker, owner and acceptance—not title alone.
2. **Reuse/update existing Tickets** where scopes overlap; retain identity, relationships, claim, history, evidence and lane. These markers are stable reconciliation keys: `FOLLOWUP-HELP-01`, `FOLLOWUP-QUERY-01`, `FOLLOWUP-OUTLINE-01`, `FOLLOWUP-LOG-01`, `FOLLOWUP-LSP-TEARDOWN-01`. The review-note section below is *not* a separate implementation Ticket. Record this file path and marker in each retained Ticket.
3. Distinguish **agreed scope** (`HELP`, `QUERY`), an **observed outline defect / proposed remedy** (`OUTLINE`, pending review), a **discussion-only topic** (`LOG`, not design), and a **verified acceptance blocker / separately owned corrective task** (`LSP-TEARDOWN`, scope pending independent owner review). Do not present tentative implementation as already approved.
4. Newly needed items start Backlog. Do not create GitHub Issues, alter projection Markdown as state, use raw SQL, invent review/approval, or begin implementation as a side effect of ingestion.
5. Preserve active P0 / checkpoint order: implementation of `TKT-EXT-SURFACE-10` was pushed, but it remains Blocked pending the pristine aggregate, independent acceptance/model routing, and D1 decision; do not silently advance PC2/PC3/PC4/S6, Gate 5 or the unrelated Engineering Intelligence roadmap.
6. For every marker, report `UPDATED EXISTING / CREATED / ALREADY COVERED / BLOCKED`, actual canonical ID, lane, overlap/reason and next small eligible slice. Report ambiguity instead of duplicating.
7. Keep changes simple, source-grounded, incremental, and test through real CLI, shell and (where applicable) MCP. No unmeasured performance claims, fabricated proof, branch forest, or new subsystem when an existing owner suffices.

---

## FOLLOWUP-HELP-01 — One command specification → help, parsing and Fish/Bash/Zsh completion

**Decision status:** AGREED scope; implementation later.  
**Type / suggested priority:** UX task / P2, following the active P0.  
**Potential existing owners / overlap:** `src/artifact-command.ts` (`createCommandTree`, Commander 15), `src/setup.ts`, `src/setup-command.ts`, `src/cli.ts`, `src/shell.ts` (`SHELL_COMMANDS`); reconcile with `TKT-EXT-SURFACE-02` (CLI/shell semantic parity), PC4 shell facilitation, and `TKT-1585` only if directly relevant. Do not duplicate the semantic-parity Ticket.

### Requirement

One authoritative typed command/option specification drives:
- `aiwf help` and topic-scoped help;
- actual CLI argument parsing and AIWF interactive-shell command parsing;
- generated Fish, Bash and Zsh completion.

Do **not** parse formatted help output or maintain three completion catalogs (or a second command grammar). Existing legacy passthrough commands should receive accurate public metadata progressively rather than be silently advertised as fully described.

### Proposed public UX (syntax can be reconciled with canonical grammar at implementation)

```sh
aiwf setup --completion
aiwf setup --check
aiwf completion fish
aiwf completion bash
aiwf completion zsh
```

Normal `aiwf setup` should also install/update relevant available-shell completion. An explicit `completion <shell>` emits the script to stdout without mutating the home directory. Support user-level, non-root installation for the three shells and safe shell-specific initialization (especially Bash and Zsh).

### Acceptance

- All publicly supported commands, nested commands, aliases, flags, known enum values and descriptions come from one specification; `help`, CLI, shell and completion agree. Unknown syntax is not advertised.
- Adding or changing command metadata automatically updates help and completion, without editing shell-specific command lists. Retain native path completion; never require project DB, model, network, code scan, or setup writes just to complete a command.
- `setup --check` is read-only, accurately identifies absent/stale completion; repeated normal setup is idempotent. Existing user shell configuration is preserved; install/update errors are explicit. `completion <shell>` does not install anything.
- Real Fish/Bash/Zsh interactive or shell-native completion tests plus CLI/shell parser/help consistency tests; distinguish shells unavailable in CI instead of claiming they passed.
- No new completion registry, heavyweight dependency, separate parser, or unrelated CLI refactor.

### Notes from inspected source

`createCommandTree` already exists in `src/artifact-command.ts`. `src/setup-command.ts` currently allows only `--check`, `--global/-g`, `--mcp`, `--link`. `src/shell.ts` separately lists `SHELL_COMMANDS`. This is **a consistency problem to resolve**, not a reason to add another authoritative list.

---

## FOLLOWUP-QUERY-01 — Compositional, evidence-grounded engineering questions

**Decision status:** AGREED direction/scope; implement via bounded proof slice after relevant prerequisites, not a generic query framework now.  
**Type / suggested priority:** Engineering Intelligence investigation + small feature slice / P2.  
**Potential existing overlap:** `TKT-INTELLIGENCE-FIRST-USECASE`, `TKT-EXT-SURFACE-09`, existing graph/source/search/impact interfaces, Semantika consumer-contract work. Deduplicate; an existing Engineering Intelligence Ticket may own the investigation and the first proof.

### Requirement

AIWF should answer engineering **questions**, not just return a symbol-match list. Support compositional requests across exact symbols, relationships, constraints, bounded traversal, product intent, tests and current evidence:

1. Exact/symbolic: find `applyProductMutations`.
2. Structural: identify exported/public call paths that reach it.
3. Investigative/semantic: identify pathways that may mutate Product state without established developer review, separating proven paths, likely paths and unknowns.

Other valuable questions: blast radius of a public API change; accepted Stories lacking current test evidence; code with overlapping responsibilities; source/tests related to a Feature or Ticket; callers that may mishandle an error.

### Ownership and approach

- **Semantika** supplies existing canonical graph/predicates/traversal/tag mechanisms. **Inventory its real public API and contract tests first**; do not assume arbitrary query-language support.
- **AIWF** supplies engineering-specific entity semantics, AST/LSP exact grounding, valid traversal plans, evidence freshness/provenance, filtering and bounded orchestration.
- **LLM/Actor** interprets fuzzy natural-language questions and synthesizes conclusions from retrieved evidence only where useful. Deterministic operations establish exact facts. Do not let System-1 become a blocking gate.
- No second graph/store, parallel query language, blanket vector indexing, speculative “architectural truth”, or full-repository rescans by default.
- Label observed fact vs inference vs proposal, cite precise source paths/symbols/lines/revisions, and surface uncertainty/non-exhaustiveness explicitly.

### First acceptance proof

On an independently prepared fixture, ask:

> Find all reachable paths through which Product state can be mutated; identify paths that can bypass developer review, and show exact evidence.

Require an inspectable traversal plan, exact relevant public entrypoints and source links, a tested unsafe/authorized negative-positive case, honest unknowns, and bounded context/cost. Compare against manual symbol search using measurable retrieval/tool/time/token counts where available. No claim of exhaustive program analysis if dynamic paths cannot be established.

### Verified Semantika starting points

As of inspected README, Semantika documents `sp.traverse(startId, { maxDepth, predicateTypes, direction, limit })`, predicate access and durable tag querying, plus **optional configured semantic search for tags**. This does **not** by itself prove that all imagined semantic/compound query operators exist. Recheck installed sibling package, exported API and contract tests first.

---

## FOLLOWUP-OUTLINE-01 — Engineering-grade source outline

**Decision status:** User-reported quality failure; source inspection CONFIRMED major limitations. Remedy below is a proposal to reconcile with the developer before implementation.  
**Suggested type / priority:** Existing source/navigation-quality Bug or small improvement / P2 unless an active acceptance gate depends on it.  
**Potential overlaps:** `TKT-EXT-SURFACE-07` (source façade), `FOLLOWUP-QUERY-01`, existing AST/source index and LSP tooling. Deduplicate; do not introduce a second source indexing framework.

### Reproduction from the user's actual AIWF shell

```text
aiwf outline tools/aspects.ts
tools/aspects.ts (8 symbols):
  - Line 9    [constant] fields
  - Line 10   [function] loadAspect
  - Line 11   [constant] aspect
  - Line 15   [function] loadScope
  - Line 16   [constant] scope
  - Line 17   [constant] kind
  - Line 24   [function] registerAspectTools
  - Line 39   [constant] aspects
```

The actual examined repository file is `src/tools/aspects.ts`; the request's shorter `tools/aspects.ts` succeeds through suffix matching. The file is about 56 lines and `registerAspectTools` registers **eight capabilities**: `create_aspect`, `update_aspect`, `get_aspect`, `list_aspects`, `link_aspect`, `unlink_aspect`, `get_applicable_aspects`, `assess_aspects`. The outline shows none of those registrations or method signatures, while presenting incidental local variables as peers of its public entrypoint.

### Verified underlying causes and relevant existing facilities

- `src/tools/graph-queries.ts` / `get_file_outline` returns `name`, `containerName`, `fullName`, `kind`, `exported`, `line`, and `signature`, sorted by line, but filters paths using `.endsWith(normPath)`. `src/cli.ts` and `src/shell.ts` discard everything except line/kind/name. The tool description promises exported symbols, but implementation includes all indexed matches.
- The inspected `dharmax/codebase-parser` `src/js-family.mjs` implements JS/TS symbol extraction using **regexes**, not a scope-aware TS AST. It extracts nested `const`/variables as equivalent inventory items and does not represent registration-call semantics. Its current regex labels a plain `const` as `variable`, while user's indexed output says `constant`; verify local installed library/version and existing index before claiming why.
- `ensureAstFresh` uses filesystem modification-time/size checks and does not explicitly check parser/index schema version. Rebuilding the parser need not refresh unchanged source files. `reconcileAst` catches individual indexing errors without surfacing them. This deserves a bounded freshness/diagnostics audit.
- Crucial reuse: `src/change/ts-lsp.ts` already implements `getDocumentSymbols(filePath)` with LSP **hierarchical document-symbol support**, as well as other exact TS source operations. Prefer this for fresh, precise TS/JS outlines where available; preserve honest supported-language fallback instead of a new general parser.
- The inspected GitHub master for `codebase-parser` need not match the installed `file:` sibling package; check both.

### Desired usefulness (proposal, not predetermined implementation)

For ordinary source files, prioritize the **module's externally relevant shape**: exported declarations, exact signatures, hierarchy, then important private top-level helpers. Local variables belong under their enclosing owner or in explicit detail mode, not as peers. For registration modules such as `aspects.ts`, the user should also be able to see the *actual exposed capabilities* and source locations, using authoritative registry metadata/source evidence when possible; don't duplicate a domain-specific tool catalog in the generic parser.

The command must not claim exactness for regex fallback, conflate declarations with runtime-registered facilities, show stale source as fresh, or silently match a different file having the same suffix.

### Bounded acceptance probes before coding

1. Reproduce `outline` on `src/tools/aspects.ts`, compare with exact source and sibling parser output/version; inspect CLI, shell and tool result consistently.
2. Confirm `registerAspectTools()` signature and export status are visible; local variables no longer drown important declarations. Its eight exposed capabilities should be discoverable using an existing domain-owner path (whether in outline or a coherent linked facility).
3. Confirm hierarchical method/interface/class outline for another nested TS fixture and appropriate fallback for a non-TS supported file.
4. Paths are canonical, unambiguous and constrained to projectRoot; parser changes invalidate stale indexed symbol shape, and refresh errors are observable rather than returning confidently incomplete results.
5. No second AST/parser/command registry, no full repository reindex by default, no model call to render a source outline, and no unrelated navigation rewrite.

---

## FOLLOWUP-LOG-01 — Log investigation for agents and AIWF shell (discussion placeholder only)

**Decision status:** EXPLORATORY. The user explicitly requested further deliberation, **not design**. This is not an approved implementation specification, interface contract, task decomposition or acceptance matrix. Do not implement, prioritize, or silently promote it based on this note. Revisit together before Ticket ingestion.

### Agreed motivation and scope of discussion

AI coding agents routinely process substantial test, build and runtime output. Investigate whether AIWF can materially improve this through its existing deterministic, graph/source/test and optional reasoning capabilities, in ways useful both to external agents and within AIWF's standalone interactive shell. The question is broader than merely shortening log text.

### Existing basis observed on the inspected AIWF master

- `src/tools/test-runner.ts` has `triage_test_failures`, which executes tests, records TestNode evidence and returns concise failures and graph-local likely causes.
- `src/graph/test-artifacts.ts` owns test-execution evidence.
- `src/shell-trace.ts` records the last AIWF Actor shell trace, and the shell has `/triage` mode.
- These prove there is relevant existing machinery, **not** that general log investigation or its ideal boundaries have been designed.
- The current runner's sequential whole-output stdout/stderr consumption deserves investigation if relevant; do not treat a preliminary observation as an authorized refactor.

### Open deliberation (no decisions yet)

- What are the highest-value real log-processing jobs: navigation/filtering, identifying first meaningful failure and cascades, grouping, explanation, cross-run comparison, or something else?
- Should the concept cover arbitrary existing files, AIWF-captured executions, live streams, and/or operational service logs? What is actually needed first?
- How should a human interrogate evidence iteratively rather than merely receive a one-shot summary? What should an external coding agent get?
- Which observed facts can deterministic processing establish, and what uncertainty remains for model-assisted interpretation?
- How do raw logs relate to, but remain distinct from, authoritative TestNode receipts, code change evidence and Product/Story verification?
- What does successful assistance look like on two or three actual painful logs, compared with how coding agents work today?

Illustrative examples previously mentioned (`aiwf log analyze`, asking the shell about the last failure) are **conversation prompts only**, not settled command names, behaviors, or implementation commitments.

**Next action:** deliberate the problem and real use cases with the developer. Only after explicit agreement convert this into a concise approved ingestion brief; search/reuse existing relevant Tickets first.

---

## FOLLOWUP-LSP-TEARDOWN-01 — Bounded native LSP shutdown and pristine aggregate blocker

**Decision status:** New observed blocker from Codex's published audit, not an approved broad refactor. **Owner:** existing TS7 LSP / TS6 refactor native client lifecycle, deduplicate against existing native teardown/test-lifecycle Bug. **Priority:** Blocker for independent EXT-SURFACE-10 acceptance; do not fold unrelated implementation into the Product-authority correction.

**Evidence:** implementation commit `7bc53d0` passed root aggregate 541/5/0 and packed routes 23/0, but an actual detached pristine checkout passed **540 / 5 opt-in skips / 1 fail**: `tests/change-engine.test.ts` “Unsupported Rich Refactor Probe”, 10-second beforeEach/afterEach hook timeout; two dangling processes had to be killed. Body assertions completed. `closeAllTsLspClients()` and `closeAllTs6RefactorClients()` are awaited in teardown; both `src/change/ts-lsp.ts` and `src/change/ts6-refactor.ts` `close()` await `sendRequest('shutdown')` before disposal/child termination, without an upper bound. The retained trace does **not** isolate which of the two failed to answer.

**Bounded investigation / possible fix:** Reproduce the native teardown, identify the stalled owner if possible, provide bounded graceful shutdown and guaranteed disposal/child termination/descriptor cleanup even when the server doesn't answer. Respect actual process/connection lifecycle and idempotent close; do not merely increase test timeouts, skip assertions, launch orphan cleanup as a substitute, or mask genuine test failure. Prove an unresponsive-server negative and normal graceful close, then rerun the same full test command on detached pristine tracked AIWF source and relevant packed public tests. Report sibling dependency provenance honestly. Keep Product-authority Ticket Blocked unless all acceptance gates genuinely pass.

**No automatic execution, closure, PC-stage advance, or new framework is authorized by this note.**

---

## Active P0 review notes — historical cautions, superseded where indicated by `7bc53d0` (NOT new Tickets)

These are **historical review observations and acceptance cautions**, not additional authorization. The first bypass was subsequently reproduced and corrected in `7bc53d0`; do not treat pre-commit questions below as outstanding defects without rechecking current methods and tests:

- Direct public MCP allowlist removal alone is not whole authority enforcement. Check **every active** internal Actor/registry/CLI/MCP mutation path, optional `reviewed` admission in `applyProductMutations`, and D1 host/developer acceptance. Project-write capability and an LLM-supplied `decision:'accept'` are not themselves evidence of developer approval. Preserve preview/fingerprint/staleness/atomicity and legitimate internal S4/S5/Ticket owners.
- Codex supplied a `tests/product-authority.test.ts` proposal testing `Ticket.prepare()` under project-write with two technical children and `depends_on` after reopen. The shown `bun -e` generated `/tmp/ext-owner-test.json` replacement instructions; exit 0 **does not prove** the test was applied or run. Require positive/negative regression evidence.
- User supplied `assertProductRelationWrite` excerpt guards any relation touching `Product`/`Goal`/`Concept`/`Flow`/`Epic`/`Feature`/`UserStory`/`Aspect`, with a `TestNode -> verifies` exception and early return when no execution context. Reconcile guard with authoritative relation ownership (`PRODUCT_RELATIONS` H/O/L), rather than a divergent kind allow/deny list. Test legitimate `Ticket -> implements -> Feature`, `Ticket -> targets -> Module`, `Test -> verifies -> Aspect`, `Ticket -> depends_on -> Ticket`, importer paths, and unauthorized counterparts. In the last inspected remote master, that exact guard was not yet present; treat user excerpt as local ongoing Codex work.
- Existing `src/product/mutation.ts` enforces nonblank `body` whenever the merged **accepted** Feature is validated on update, so a metadata-only edit to a valid historical accepted-but-empty Feature can fail. Historical data read/recovery versus **newly accepted or meaningfully revised** intent are different contracts. Do not silently rewrite historical fixtures merely to make tests green; examine expected legacy semantics and preserve original assertions.
- `src/graph/aspect-projections.ts` legacy Aspect importer calls `applyProductMutations(store, mutations)` directly. Its legitimate local sync behavior must survive without turning an import route into an externally callable generic authorization bypass. Test direct and indirect call paths, not just allowlist absence.
- `src/ticket/prepare.ts` already uses `CausalChangeEngine.previewChange` and re-previews after a Ticket lease before `applyChange`; protect that owner-controlled technical preparation, without treating it as generic Product-definition approval.
- An observed AIWF investigation retrieved canonical criteria and doctrine without model calls; optional lexical search matched methods named `close` poorly, while exact callers/blast queries were more useful. This is a concrete motivation for `FOLLOWUP-QUERY-01`, **not** permission to replace exact queries with mandatory LLM classification.

---

## Published EXT-SURFACE-10 handoff — current status, not acceptance

- Commits verified on remote `master`: `7bc53d01a17f72e478140e73ec6879fbec6e3d4b` (host-reviewed Product mutation correction), followed by `f91b1be520565caf465fa7b5621e82d763b4a676` (pristine-validation report/projections). Codex reports remote/local HEAD match and clean working tree; remote commit order independently observed.
- Correction audit: `docs/ext-surface-10-authority-2026-10-18.md`. Before-fix regression showed actual registry project-write `define_product` bypass. Owner now requires exact reviewed request/fingerprint and host-owned review context; detached nested contexts expire with their parent's lifetime. Actor/MCP direct and self-approval routes are covered, with legitimate S4/S5/Ticket paths retained per report. **Do not claim an independent review on the basis of a reported test summary alone.**
- Root aggregate: 541 pass / 5 opt-in skips / 0 fail; packed public routes: 23 pass / 0 fail; typecheck, pack and diff check passed. **Pristine implementation commit**: 540 pass / 5 skips / 1 LSP teardown hook timeout; typecheck/pack/diff and packed public routes passed. Five skips are not proof of opt-in/provider journeys. Clean detached AIWF inputs reused installed sibling `node_modules`; Semantika sibling was dirty, llm-utils ahead of remote. Do not claim independent dependency reproducibility.
- Canonical `TKT-EXT-SURFACE-10` remains **Blocked**. No independent VERIFY receipt/Done. Do not start EXT-SURFACE-01, PC3, PC4, S6 or Gate 5.
- **Three remaining independent blockers:** (i) `FOLLOWUP-LSP-TEARDOWN-01` / pristine full aggregate, (ii) project dev/design/critic route still selects OpenRouter and actual `resolve` got `User not found` twice (Ollama reachable does not fix routing/authentication), (iii) unresolved D1 external-host Product-review trust contract. See `plans/AIWF-S5-POSTCONDITION-DESIGN.md` D1: recommended external default is proposal/read; exact host/user-reviewed fingerprint, or explicitly developer-delegated bounded deterministic session scope. MCP `decision:accept` and project-write do not prove human approval; no invented token/approval service. Developer must choose. Until then unsupported external-host application remains inert `review_required`.

---

## Work-in-progress hygiene — 2026-10-18 board observation (discussion / no mutation)

**Status:** Developer expressed concern about accumulating In Progress/Blocked Tickets. This is an operating recommendation awaiting any deliberate reconciliation, **not** authorization to edit lanes, create a housekeeping Ticket, close checkpoints, or ingest this seed.

- Inspected published `master` `kanban.md` at `f91b1be`: 10 In Progress, 7 Blocked, 31 Backlog, 56 Done (projection counts only; canonical graph and active claims were **not** queried). Several In Progress summaries describe implementation completed but awaiting independent review (`TKT-DW-S1`, `TKT-TRANSACTION-PRODUCT-BATCH`, `AIWF-TOPLEVEL1-PHASE-A`). `TKT-DOCTRINE-G5-RELEASE` remains projected In Progress although its body describes a blocker. Preserve the distinction between *lane*, *lease/actively worked*, *implementation evidence*, *blocked dependency*, and *independent acceptance*.
- **Freeze roadmap expansion and seed ingestion** until one read-only canonical reconciliation of active In Progress + Blocked entries, current leases, real prerequisites, and existing acceptance/VERIFY receipts. Do not infer canonical state from prose/projection. No bulk moves, mass closure, synthetic receipts, duplicate follow-up Tickets, changes to historical identities, or new status taxonomy just to tidy the board.
- Suggested lightweight operating discipline (not a schema change): at most one *primary coding implementation slice* selected for this handoff, with independent review/discussion allowed separately; all other entries remain pending acceptance/blocked/deferred with their recorded truth. Work from blocker → owner → independent verification; choose the next eligible stage only after actual gate closure. The immediate primary repair candidate is existing LSP client teardown needed for EXT-SURFACE-10's pristine aggregate; first deduplicate against real canonical Ticket ownership, and do not silently widen the Product authority correction.
- Reconcile in this order: read current canonical Ticket statuses, claims, relation/dependency graph and actual source/evidence; classify `actively executing / implemented-awaiting-review / genuinely blocked / merely stale`; prepare a *proposed* per-ID list and ask developer approval before any writes; perform only individually justified changes through supported canonical operations; sync once and validate projection. Reconcile old Gate/stage Tickets without confusing historical Gate 5 names with the current Doctrine Gate 5.
- Keep `FOLLOWUP-HELP-01`, `FOLLOWUP-QUERY-01`, `FOLLOWUP-OUTLINE-01` as **file-only planned scope**, not additional live canonical work. `FOLLOWUP-LOG-01` remains deliberation-only. Prior acceptance stops (no EXT-SURFACE-01, PC3, PC4, S6 or Gate 5 auto-advancement) remain in force.

---

## Recommended work order and decision boundary

1. Freeze new seed ingestion and reconcile actual WIP/blocked state read-only before scheduling more work. Treat `7bc53d0`/`f91b1be` as delivered-but-Blocked; resolve the separate native teardown blocker, configured independent model route, and explicit D1 developer policy, then seek actual independent EXT-SURFACE-10 acceptance. Reconcile PC2/PC gates by canonical plans. No unrelated CLI/Product changes while this P0 is still awaiting acceptance.
2. Ingest/deduplicate `FOLLOWUP-HELP-01` and `FOLLOWUP-QUERY-01` as **agreed Backlog scope**; reconcile `FOLLOWUP-OUTLINE-01` with existing source-facade/quality work after developer review. Keep `FOLLOWUP-LSP-TEARDOWN-01` tied to the pristine blocker rather than an unrelated roadmap feature. Retain current roadmap ordering. Help/completion can be a compact standalone UX slice when its prerequisites are clear.
3. Keep `FOLLOWUP-LOG-01` as a discussion placeholder only. Deliberate real use cases and boundaries first; seek explicit approval before turning it into an actionable Ticket.
4. For each actual implementation stage: plan, reproduce/expected red as appropriate, implement minimally, run focused tests and affected safety regressions, inspect changed whole functions/direct callers, report skips/blockers, then independently accept. Do not auto-execute the next stage.

## Source pointers (not acceptance certificates)

- AIWF source and plan: `https://github.com/dharmax/ai-workflow/tree/e1aa57a6bc053e03723b7e591cbdd1e3a31258d6`
- `src/artifact-command.ts`, `src/setup.ts`, `src/setup-command.ts`, `src/shell.ts`
- `src/tools/test-runner.ts`, `src/graph/test-artifacts.ts`, `src/shell-trace.ts`
- `src/tools/aspects.ts`, `src/tools/graph-queries.ts`, `src/graph/indexer.ts`, `src/change/ts-lsp.ts`, `src/change/ts6-refactor.ts`, `src/graph/aspect-projections.ts`, `src/product/mutation.ts`, `src/ticket/prepare.ts`
- `docs/ext-surface-10-authority-2026-10-18.md` (published implementation/pristine blocker report)
- `dharmax/codebase-parser/src/js-family.mjs` (inspected upstream source; check installed package separately)
- Existing seed: `plans/AIWF-EXTERNAL-SURFACE-ISSUE-SEED.md`
- Semantika public README: `https://github.com/dharmax/semantika/blob/master/README.md`

**Explicit status:** No canonical Tickets were created/updated by writing this file; no code changes or runtime test results are claimed.