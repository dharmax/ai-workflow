# Cycle 2 — Product, Stories, review and delivery specification

**Migration note (2026-10-21):** Candidate US/source inventory for [the revised US-led test digestion plan](US-TEST-CONSOLIDATION-PLAN.md). The earlier cycle labels and file-centric retirement proposals are historical; do **not** treat them as the final accepted Story catalog, test-file organization, numerical reduction goal or instructions to discard real non-pristine/sub-flow/bug cases.
Status: **proposed for developer review**. Read with `US-COVERAGE-01-ENGINEERING.md`.
Every Story below requires public-facing acceptance evidence. Internal schema tests remain supporting contracts, not Story proof.

## US-P01 — Author coherent top-level product intent
**Actor/intent:** Developer defines Goals, Concepts, Flows, Features and Epics without creating a misleading containment tree.
**Initial:** New or existing project, optionally carrying legacy authored definitions.
**Action:** Create, link, revise and inspect a concrete capability and delivery scope.
**Observable:** One stable canonical identity, upstream intent flows into downstream context, unrelated Stories/Features remain independent.
**Adverse:** Title-only Story, ambiguous legacy ownership, dangling or reversed link, duplicate conceptual identity and accidental delivery completion are refused.
**Executable owners:** `tests/dharmax-s1.test.ts`, `tests/top-level-product-intent.test.ts`, `tests/product.test.ts`, `tests/product-operability-definition.test.ts`.

## US-P02 — Derive executable proof before implementation Tickets (test-first)
**Actor/intent:** Developer accepts a complete User/Actor Story and wants work derived from observable behavior rather than speculative implementation tasks.
**Initial:** Accepted Story (actor, intent, initial state, action, expected result, material exceptions/bounds), current code and inherited Aspects.
**Action:** Derive/review a public-interface test specification, materialize it as skipped/unstarted, identify unsupported obligations, then propose/reconcile Tickets for *those* obligations.
**Observable:** Test specification and approved TestNode identity precede new implementation-oriented Todo Tickets. Starting linked Ticket activates the *same* test; observed, attributable expected-red precedes implementation; green and independent verification close work.
**Adverse:** Incomplete Story, stale revision, uncovered fixture, misleading nonbehavioral failure, already-green work, repeated derivation, unrelated backlog tests and ambiguous scope preserve distinct truthful states.
**Existing partial evidence:** `tests/dharmax-s4.test.ts` (review/materialization), `tests/dharmax-s5.test.ts` (activation and red/green), `tests/product-processing.test.ts` (identity/reuse).
**MISSING executable acceptance:** Current S4 permits implementation Tickets in the *same initial proposal* before its Story test exists. Add an executable public-Workspace test asserting test-first ordering and Ticket derivation from failing obligations; activate only after developer review. This is a real product gap, not a pretext to delete legacy coverage. Keep technical maintenance Ticket creation independent of Stories.

## US-P03 — Review exact Product mutations, never agent self-approval
**Actor/intent:** Human reviews meaningful Product Intent and commits only the exact approved revision.
**Initial:** Proposed complete definition/relationship change, concurrent revisions possible.
**Action:** Inspect diff/impact, accept/reject/cancel, reopen and inspect canonical state.
**Observable:** Preview inert, host-owned review authority, exact fingerprint and atomic accepted mutation, stable version/identity.
**Adverse:** Read-only/MCP model yes, stale basis, later invalid mutation, SQL mid-batch fault, legacy direct writer, nested/detached authority, cancellation all fail without partial approval.
**Owners:** `tests/dharmax-s2.test.ts`, `tests/product-change.test.ts`, `tests/product-authority.test.ts`, `tests/pc1a-safety.test.ts`.
**Technical support:** `tests/product.test.ts` invariants.

## US-P04 — Edit governed relationships as one native canonical row
**Actor/intent:** Developer attaches/replaces/clears notes or changes links without corrupting graph identity.
**Initial:** Existing endpoints, notes, versions, potentially protected indexed/verifying edges.
**Action:** Discover links, preview and confirm change using Workspace/CLI/Shell/MCP.
**Observable:** One stable native edge ID; notes and visibility preserved across restart, precise pagination and staleness.
**Adverse:** Wrong direction, endpoint revisions, ambiguous ID, duplicates, cycle, payload-only ABA, SQL failure and model assent refuse coherently.
**Owners:** `tests/product-operability-links.test.ts`; public interface parity `tests/product-operability-commands.test.ts`, `tests/dharmax-s3.test.ts`.
**Consolidation:** Keep one comprehensive link-law suite and one public human journey; repeated grammar matrices belong to the shared command tests.

## US-P05 — Operate reviewed intent in Workspace without divergent meaning
**Actor/intent:** Developer works through browser forms, including incomplete work and concurrent edits.
**Initial:** Current canonical graph and optional second editor.
**Action:** Review/save/cancel definitions, links, Aspects, Bugs and Story tests, reload state.
**Observable:** Same identities/policy as typed MCP and CLI; draft preserved on stale/cancel and truthful save-vs-reload errors.
**Adverse:** Stale editor, invalid Story, failed reload, proposal import, keyboard cancel and protected host transport.
**Owners:** `tests/dharmax-s3.test.ts`, `tests/dharmax-s4.test.ts`, `tests/dharmax-s5.test.ts`.
**Consolidation:** S3 is an oversized 16-case historical collection: preserve one public journey per independent observable outcome; move shared invariants out of browser repetition.

## US-P06 — Inherit authoritative Aspects and Rules without duplicate ceremony
**Actor/intent:** Developer defines reusable constraints and expects all affected work to honor them.
**Initial:** Accepted Rule/Aspect on project/module/parent and optional candidates.
**Action:** Link, revise, investigate and verify governed work.
**Observable:** Exact effective precedence, inherited obligations in implementation/verification, one authoritative definition and auditable evidence.
**Adverse:** Draft overriding accepted meaning, wrong scope, omission during optional pruning and governance weakening.
**Owners:** `tests/aspects.test.ts`, `tests/dharmax-s1.test.ts`, `tests/doctrine-model.test.ts`, `tests/doctrine-management.test.ts`, `tests/doctrine-verifier.test.ts`.

## US-P07 — Derive useful work without inventing or duplicating it
**Actor/intent:** Developer processes accepted Epic/Feature/Story or direct technical work.
**Initial:** Existing graph with some valid child work and optional completeness targets.
**Action:** Propose/review compatible descendants, apply accepted work and retry.
**Observable:** Stable reused identities, bounded meaningful scope, only missing work added; accepted Story obligations drive implementation Ticket derivation.
**Adverse:** Duplicate identity, reversed Feature/Story ownership, ceremony-only Ticket, scope guess, wrong depth, Critic approval mistaken as developer approval.
**Owners:** `tests/product-processing.test.ts`, `tests/decompose.test.ts`, `tests/top-level-product-intent.test.ts`, `tests/dharmax-s4.test.ts`.
**Known design correction:** Story test-first dependency remains uncovered; do not mark US-P07 complete using existing "Ticket first" fixtures.

## US-P08 — Maintain a first-class Bug or technical Ticket without a fabricated Story
**Actor/intent:** Engineer tracks an evidenced defect or technical obligation.
**Initial:** Bug report may have unknown reproduction; constraints and dependencies exist.
**Action:** Triage, prioritize, edit, claim, sync and resolve.
**Observable:** Same Ticket identity; unknowns explicit, dependencies/foreign leases respected, no false Done/proof.
**Owners:** `tests/bug-public.test.ts`, `tests/pc1a-safety.test.ts`, `tests/ticket-preparation.test.ts`, `tests/product.test.ts`.

## US-P09 — Export, edit and recover authored state without laundering acceptance
**Actor/intent:** Developer wants readable projection, durable manifest and faithful recovery.
**Initial:** Product graph includes reviewed and legacy records.
**Action:** Export/sync/edit/reload/import into a clean workspace.
**Observable:** Authored meaning/identity survives; display-only code/verification evidence is not reimported as authority.
**Adverse:** Edited markdown, incompatible legacy content, malformed fields and changed version do not silently create new accepted intent.
**Owners:** `tests/product.test.ts`, `tests/top-level-product-intent.test.ts`, `tests/product-operability-definition.test.ts`, `tests/dharmax-s2.test.ts`.

## US-P10 — Bind existing technical tests without faking Story acceptance
**Actor/intent:** Developer attaches an existing TestNode to reviewed technical scope.
**Initial:** Explicit source/test/dependency contracts.
**Action:** Prepare/review exact binding and execute local plus dependent regression checks.
**Observable:** Stable TestNode, independent proof, current dependency/source hash and truthful inconclusive/changed status.
**Adverse:** Generic TestNode mutation, stale binding, incomplete rule/aspect review, failing dependency or self-approval cannot produce Done.
**Owners:** `tests/technical-proof.test.ts`, `tests/ticket-resolution.test.ts`, `tests/doctrine-scope.test.ts`.

## Cycle 2 overlap candidates — do not delete without equivalence
| Candidate consolidation | Retained behavior that must survive |
|---|---|
| `dharmax-s1/s2/s3/s4/s5` historical files → cohesive public Story suites | Each distinct human-visible lifecycle boundary; do not reduce browser end-to-end to registry mocks |
| Product preview tests repeated in `product-change`, `dharmax-s2`, `product-authority` | Keep one transaction-law suite, one host-authority adversarial suite and one real CLI/MCP/Workspace public Journey |
| Link grammar repeated in `product-operability-links` and `product-operability-commands` | Keep detailed link semantics in links suite, actual CLI/Shell normalization in commands suite |
| `decompose` and `product-processing` identity/reuse cases | Preserve proposer purity, actual persistence and acceptance boundaries; mark duplicate fixture-only cases after review |
| `dharmax-s4` Ticket-first fixture | Retire/rework **only after** approved US-P02 test-first behavior supersedes it; do not call failing target behavior successful |

### Cycle 2 double-check
All 18 Product-category test files are mapped to an observable Story or its technical contract. Do not auto-accept these proposed Story definitions. The principal uncovered feature is US-P02. Keep skipped test state and red evidence truthful. A raw reduction of test counts without an oracle inventory is not consolidation.
