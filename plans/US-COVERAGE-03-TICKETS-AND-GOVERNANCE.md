# Cycle 3 — Ticket execution, governance and proof Stories

**Migration note (2026-10-21):** Candidate US/source inventory for [the revised US-led test digestion plan](US-TEST-CONSOLIDATION-PLAN.md). The earlier cycle labels and file-centric retirement proposals are historical; do **not** treat them as the final accepted Story catalog, test-file organization, numerical reduction goal or instructions to discard real non-pristine/sub-flow/bug cases.
Status: **proposed**, complementary to Engineering and Product cycles.

## US-T01 — Investigate and prepare a grounded Ticket
**Actor/intent:** Engineer wants useful evidence, scope, work order and exact blockers before acting.
**Initial:** Real Ticket and graph, optional authored source/test/Aspect/Rule evidence.
**Action:** Investigate, prepare and inspect dossier using public operation, then decide to proceed or supply missing input.
**Observable:** Mandatory evidence preserved; optional candidates never trim authored targets; equivalent work reused, actual dependency/scope blockers explicit. Pure technical work stays technical.
**Adverse:** Missing/stale symbol/file, ambiguous Feature ownership, duplicate work, invalid child dependencies, unsupported acceptance and foreign claim.
**Existing tests:** `ticket-investigation`, `ticket-preparation`, `top-level-product-intent`, `product-processing`; provenance evidence in `doctrine-producer-context`.
**Gap:** Confirm explicit planned creation is not conflated with an ordinary missing indexed file on the same public path.

## US-T02 — Resolve with attributable source, tests and independent acceptance
**Actor/intent:** Owning engineer or agent executes existing Ticket against its reviewed obligations.
**Initial:** Claimable Ticket with reviewed tests/technical scope, relevant source and bounded resources.
**Action:** Claim, produce guarded edits, run selected/full regression tests, independently verify acceptance and complete/release.
**Observable:** One coherent Done plus proof; no source change, unproved criterion or stale TestNode promoted to verified. Receipt reuse only on exact current evidence.
**Adverse:** Skipped tests, failing decoy, mutated oracle/source during verification, changed contract, foreign lease, malformed proof, stopped Actor and failed acceptance preserve honest state.
**Existing tests:** `ticket-resolution`, `technical-proof`, `doctrine-verifier`, `doctrine-scope`, `pc1a-safety`.
**Gap:** External installed MCP Story E02 must reach independent verification; a mere file-write result is insufficient.

## US-T03 — Preserve source authority while performing multi-stage governed work
**Actor/intent:** Engineer changes files under existing reviewed Ticket scope without authorizing extra or dirty targets.
**Initial:** Active lease, authored File/Symbol targets and current governed snapshot; unrelated local edits.
**Action:** Preview/apply multi-file edits, rename targets, repeat and finish.
**Observable:** New/old module Rule/Aspect obligations and provenance survive creation, renaming, reindexing, restart and failed acceptance. Only attributable edits allowed.
**Adverse:** Dirty target, unauthorized expansion, governance weakened during execution, partial SQL/file failure and unrelated changes refuse.
**Owners:** `doctrine-scope`, `ticket-resolution`, `change-engine`, `change-bridge`.
**Gap:** Public injected mid-commit failure proof and crashed/stale owner recovery separately tested.

## US-T04 — Manage layered engineering Doctrine without self-approval
**Actor/intent:** Maintainer defines and evolves one authoritative Rule across universal/project/module scopes.
**Initial:** Active inherited policy, possibly outdated defaults and drafts/overrides.
**Action:** Prepare/review/add/replace/delete with exact revision, verify applicability, persist/restart.
**Observable:** Correct precedence and mandatory inheritance, honest provenance, collision-free IDs, audit and rollback together.
**Adverse:** Draft weakening, unknown mandatory language, invalid references, stale editor, SQL fault and producer self-mutating governing rules.
**Owners:** `doctrine-model`, `doctrine-management`, `doctrine-batch`, `doctrine-verifier`, `doctrine-scope`.
**Technical-only:** `doctrine-management-live`, `doctrine-enforcement-live` retain their real-provider gates; skipped/conditional runs must be reported explicitly.

## US-T05 — Verify operative rules and Aspects against current evidence
**Actor/intent:** Independent verifier judges the full effective contract, not a producer's selected subset.
**Initial:** Authored scope, current rules/Decisions/Aspects and test/source evidence.
**Action:** Review proof with exact citations, evaluate checkers and compare fingerprints before completion/reuse.
**Observable:** Passing TestNodes alone do not bypass mandatory Rule or Aspect proof. Exact expected violations reported, unknown/inconclusive never silently green.
**Adverse:** Missing declaration, absent checker, incomplete structural source, changing normative text, false evidence citation and producer dossier mutation.
**Owners:** `doctrine-verifier`, `doctrine-producer-context`, `doctrine-scope`, `technical-proof`, `aspects`.

## US-T06 — Persist, export and recover workflow facts coherently
**Actor/intent:** Developer reopens project after authorized work or failed mutation.
**Initial:** Canonical SQLite graph plus authored projections, potentially concurrent writer/old process.
**Action:** Reopen and inspect claims, TestNode identity, graph relations, proof, audit, exported state.
**Observable:** Durable authored rows only, no partial completion, index-derived records distinguishable from governance, repeatable projection truth.
**Adverse:** SQLite failure, abort, stale process, expired authority, temp cleanup and legacy data.
**Owners:** `graph`, `store-lifecycle`, `pc1a-safety`, `ticket-resolution`, `doctrine-batch`, `product-operability-definition`.

## Technical invariants (not counterfeit User Stories)
- `graph.test.ts`: typed entities, predicate traversal, index/reconciliation and local dependency graph.
- `store-lifecycle.test.ts`: DB statement/fd lifecycle.
- `doctrine-model/batch/verifier.test.ts`: exact normalization, persistence, atomicity and language folding.
- `performance-metrics.test.ts`: provenance counts exclude content.
- `ticket-preparation.test.ts`: deterministic cycle validation and caller-owned leases.

## Cycle 3 consolidation audit
| Area | Current split | Proposed cohesive owner | Do not lose |
|---|---|---|---|
| Ticket resolution | one enormous `ticket-resolution.test.ts` plus doctrine scope/verifier | Separate PUBLIC acceptance journey, RESOLVER proof-reuse/restart contracts, GOVERNANCE counterexamples, ACTOR budget/recovery; share fixture setup | Full-suite evidence, changed oracle, unrelated dirty edits, independent proof, lease cleanup |
| Mandatory governance | `doctrine-model`, `doctrine-management`, `doctrine-batch`, `doctrine-verifier`, `doctrine-scope` | Model/persistence; human Rule review; live effect & verification | SQL rollback, concurrent owner, module creation/rename, pinned references |
| Index relationships | `graph`, `ticket-resolution`, `ast-freshness-and-search` | Graph index contract and one end-to-end proof reconciliation | Authored vs derived verifies and repeated reconciliation |
| Technical proof | `technical-proof`, `ticket-resolution`, `dharmax-s5` | Keep technical binding distinct from reviewed Story test | Distinct test prerequisites and green evidence semantics |

**Potential redundant assertions:** repeated unchanged-receipt reuse and source-hash staleness cases, repeated deterministic dirty-path cases, repeated graph-index smoke. Candidate removal requires matching assertions and keeping adversarial differences (ABA, concurrent source write and changed oracle are NOT identical).

### Double-check
Mapping covers all 14 Ticket/Governance-category files plus cross-cutting public tests. No blind deletion. A large test-file split alone improves diagnosis, not test count; exact duplicate scenarios should be pruned only once mapped to retained oracles.
