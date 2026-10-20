# AIWF v1 — active execution checkpoint (2026-10-20)

**Current work instruction for subsequent coding sessions.** Read this after `AGENTS.md`, alongside [the existing three-iteration release plan](AIWF-USABLE-V1-RELEASE-PLAN.md). It records the developer's current priorities and delivery budget; it does **not** supersede [Dharmax-way semantics](AIWF-DHARMAX-WAY-DESIGN.md), the [staged plan](AIWF-DHARMAX-WAY-PLAN.md), S5/PC0–PC5, Gate 5, or canonical Ticket/acceptance state. Earlier dated investigations and `handoff.md` are historical, not competing instructions.

## Mission and fixed iteration budget

**Finish a usable AIWF v1 in three iterations total, not three more.** Iteration 1's engineering work has finished. Aim to complete the remaining product and release work in **Iterations 2 and 3**. Do not add an automatic fourth round; if a required release gate remains impossible, report the concrete blocker and request an explicit scope/priority decision. Preserve all already agreed mandatory v1 features in the release plan; do not quietly shrink the product to satisfy the schedule.

Release success is *not* an internal green suite: in the **same separate, tracked external project**, AIWF itself must (A) implement genuinely missing Feature behavior and (B) repair a first-class Bug in existing behavior. Both use the reviewed public Product/Story/Bug workflow, real public tests, native Ticket resolver and guarded code change, appropriate Aspect/Rule obligations, a genuinely independent current verifier, canonical receipt/Done, released claim, and restart/reopen proof. Codex/AGY may repair **AIWF** but must not manually implement/fix the external application in place of AIWF.

## Actual checkpoint after Iteration 1

Remote master at this checkpoint: `d64ccb969e7b99344e38286999e760e03167a638` (recheck HEAD before work). Bun 1.4.3; source and pristine full suites each **553 pass / 5 pre-existing opt-in skips / 0 fail**; pristine packed public checks **46 pass / 0 fail**; typecheck and pack pass. The obsolete SQLite assertion, Bun subprocess issue, and bounded LSP investigation are closed on this evidence. Five skips are **not** live acceptance.

I1 established typed public Bug operations, reviewed Product/Story-test surfaces, a tracked external Ledger fixture with accepted Stories and observed, genuine expected-red public tests. I1 **execution is complete, but its formal GO gate is not falsely declared satisfied**: provider inference and independent normative PC5/Gate 5 acceptance are outstanding. Carry these into the *start* of I2; do not silently bypass S5→S6 entry requirements or mint `VERIFY`/Done from test counts. The canonical graph, not this note or Markdown projections, determines current Ticket lanes/claims.

Existing Ledger input is `docs/evidence/iteration1-ledger.bundle`; setup/replay context is `docs/iteration1-2026-10-19.md` and `scripts/iteration1-ledger-journey.py`. Reuse its identities and observed source/test baseline:

- `T-MEAN` / `S-MEAN`: absent public `mean 2 4` should return `3`.
- `B-TOTAL` / `S-TOTAL`: existing decimal total `total 1.5 2.5` must return `4`, preserving existing Feature/Story identities.
- Neither external source repair, native Done, nor independent verifier receipt has yet been demonstrated.

## I2 — make AIWF deliver the actual work

1. Qualify an actual bounded model response from the configured implementer and separately from the independent verifier. Endpoint/model discovery is not inference. Use existing supported provider routing and credentials; do not re-architect Actor or forge model acceptance to bypass quota/nonresponse. Establish the remaining real PC5/Gate 5 S6-entry acceptance, or explicitly report the unmet contract for developer decision.
2. Once entry is authorized, prove narrow S6a evidence-only resolution of already implemented work: no gratuitous model-driven edits, independent current acceptance *or* exact blocked/needs_input and released claim.
3. Continue the existing Ledger repository through **actual configured AIWF Ticket.resolve** for `T-MEAN`, then `B-TOTAL`. AIWF must investigate, claim, discover existing capability, preview/apply a guarded source change, execute real test red→green, check applicable Rules/Aspects, obtain independent current proof, commit receipt/Done and release claim. Observe source changes, paths/hashes, model/provider, outcome, claim and restart state. No Codex-authored target-app solution.
4. Repair only the **first reproduced blocker on that journey**, in its existing source owner; preserve the live fixture and previously accepted records. Previously reported R2/R3/navigation/context/skill problems are in scope only if reproduced here. If blocked, keep exact residual failure and stop; don't report partial work as completion.

**I2 GO:** AIWF itself completes both journeys (and S6a) with current independent evidence, mandatory gates and no forged claims. I2 cannot be declared GO by mock verdicts, a scripted agent, manual external app edits or source-only green tests.

## I3 — usable public release, not another research iteration

Qualify the *packed/public* build from the supported install/dependency setup in a separate clean project root. Repeat the **same Feature and Bug journeys** through real CLI/shell/Workspace/MCP as relevant, with human/host review, configured live implementer and independent verifier, restart/receipt/history and negative authority/dirty/stale/rollback cases. Verify current PC0–PC5/Gate 5 contract, then deliver a short executable quickstart, actual provider/dependency requirements, concise GO/NO-GO, and truthful canonical Kanban. No unproved claim of fully portable installation while local `file:../...` dependencies remain mandatory.

## Working rules / anti-drift

- **Product progress first:** each engineering action should materially advance the two native external journeys or an actually blocking v1 release contract. No fourth speculative architecture/infrastructure round, new fixture, duplicate subsystem, ceremony or documentation-only substitute for implementation.
- **KISS / am-i-allowed:** use existing graph, Actor, LLM-utils, Semantika, skill, change, Ticket and verification owners. Existing tools first; if a needed capability is absent, create the smallest fitting one, or report an actual blocker. Preserve Product human-reviewed approval and distinct independent verification.
- **Current stable tools:** normally use latest stable Bun/TypeScript/dependencies, pin exact **tested** versions and check upstream fixes before patching obsolete-runtime symptoms. No unnecessary backward-compatibility scaffolding.
- **Validation proportionality:** focused tests during development; ordinary aggregate/typecheck/pack at coherent iteration boundary; **one** detached clean/pristine and packed public qualification at release/checkpoint, not after each minor correction. Record that the prior pristine run reused installed `node_modules`; it was clean *tracked source*, not fresh-install dependency independence. Do not archive routine successful logs in Git. Retain compact outcome, precise failed evidence and commit/dependency provenance.
- **Failure convergence:** diagnose first causal failure, not the downstream cascade. After two unsuccessful attempts reassess the hypothesis; never inflate timeouts, relax tests or add retries as a substitute for causal correction.
- **Execution hygiene:** use master; no forest of branches. Claim canonical owner when editing source/test code, release lease, preserve unrelated dirty files, push stable coherent changes. Keep Board truthful (one primary executing Ticket; few actionable Todo; actual blockers in Blocked; noncritical work in Backlog). Preserve mandatory scope and defer all noncritical improvements from `AIWF-USABLE-V1-RELEASE-PLAN.md`.
- **Reporting:** one short status after each meaningful step: demonstrated external user behavior, exact source owner/fix if any, observed real model/test/proof outcomes, the one current blocker, and next action. Green tests alone never imply developer authorization or release acceptance.

**Next action:** start I2 at the provider + PC5 S6-entry reality check, then drive the existing Ledger `T-MEAN` and `B-TOTAL` through AIWF's native resolver. No further pristine/LSP investigation without a *new* observed blocker.
