# AIWF test suites → User Story ownership audit

**Status:** 97-suite ownership audit; user reports passing migration gates. Previously drafted ten candidate IDs have been reconciled with the older US catalog.
**Audit basis:** `59abe33` of `perf/streamline-freshness`; current file locations reflected after relocation at `83c9c56`; `user-stories.md` and each of the **97 test files** inspected (suite titles, representative cases, source imports). **All 97 are accounted for exactly once.**
**Important:** `user-stories.md` is a projection, not proof that a full effective US meets the current required fields. It lists **12 `STORY-*` entries plus `US-REVIEWER-RELIABILITY`**; several have only a narrative + checklists, without Actor, Intent, Initial State, Action and Expected Result as separate canonical fields. Verify the live graph before declaring them complete. A fixture US created inside a test is *not* proof of a persisted, accepted product US.

## Operational rules

1. Official accepted effective US defines the acceptance oracle; **one US → normally one suite**, multiple suites only if the US suite becomes unwieldy. At least one genuine public-path acceptance test, not just private method tests.
2. Legacy suites are not renamed into `tests/us/` purely by topic. Keep technical tests as supporting checks, and explain rare exceptions.
3. For every mixed file, migrate **individual test cases** by observable episode; no blind mass move or rewriting test expectations to match code.
4. Earlier `P-*` placeholders overlap the existing 30 proposed `US-E/P/T/A` catalog; no duplicate Stories should be created.
5. At least one supporting TestNode/verifies relationship (where available) should point to the correct accepted US without lying about whether a test is genuine acceptance. Filename/header links are navigation, **not** graph proof.
6. Track no-loss case migration. During split/move, compare test names and before/after counts; verify typecheck, targeted suite, then broad suite. A skipped/live US test is not passed acceptance.

## First migration checkpoint (developer reports passed local gate)

- `07acf25` — moved `tests/user-story-j24-sophisticated-goal.test.ts` → `tests/us/story-aiwf-sophisticated-goal.test.ts`, rebased 8 source imports, zero assertion/case changes. Existing projection: `STORY-AIWF-SOPHISTICATED-GOAL`; full canonical effective Story definition still needs checking.
- `9f707ca` — moved `tests/bug-public.test.ts` → `tests/us/story-aiwf-report-bug.test.ts`, rebased 5 source imports, zero assertion/case changes. Existing projection: `STORY-AIWF-REPORT-BUG`; full canonical definition still needs checking.
- `83c9c56` — moved fixture-only `tests/us/file-change-synchronization.test.ts` → `tests/integration/file-change-synchronization.test.ts` **byte for byte**. Its internally created `US-FILE-CHANGE` was not proof of an official persisted US.
- Repository tree audit confirms **97/97 test files still present** and recognized as moves. `package.json` does not refer to the old paths. No runtime tests were executed remotely.
- **Gate disposition (2026-11-10):** developer reports the three relocated suites, TypeScript check and full suite passed after this migration. Exact logs/counts were not supplied; treat this as reported green, not independently observed execution. The intermittent CLI/Shell help-parity mismatch previously seen in an aggregated run is not root-caused merely because a subsequent run passed.
- **Next:** reconcile effective canonical US definitions, review the existing 30 candidate episodes against canonical Product state, then move genuinely mixed suites by public episode. Do not mass-rename or auto-accept Product state.

## Findings

| Category | Files |
| --- | ---: |
| Candidate public acceptance (must validate oracle) | 11 |
| Mixed behavior/mechanics; split by US and internal contract | 23 |
| Focused critical technical exceptions (justify individually) | 7 |
| Supporting technical checks (not independent US proof) | 56 |
| Assigned to proposed, **not yet accepted**, US | 65 |
| **Total distinct files inventoried** | **97** |

Categories above overlap only in the separate proposed-owner metric; the four role categories are mutually exclusive.

### Existing Story candidates

| Projection ID | Related suites / qualification |
| --- | --- |
| `STORY-AIWF-INVESTIGATE-TICKET` | `ticket-investigation`; strong low-level support, not by itself an end-to-end caller acceptance |
| `STORY-AIWF-PREPARE-TICKET` | `ticket-preparation`; low-level and integration, requires public journey validation |
| `STORY-AIWF-RESOLVE-TICKET` | `ticket-resolution` and related proof/Story lifecycle; `tests/us/resolve-greeting-story` is opt-in/live and normally skipped |
| `STORY-AIWF-PROCESS-INTENT` | `product-processing`, `decompose`, `dharmax-s4`; mixed mechanics |
| `STORY-AIWF-DELEGATE-WORK` | Actor, discovery and `artifact-command`; mixed routes and invariants |
| `STORY-AIWF-SOPHISTICATED-GOAL` | `user-story-j24-sophisticated-goal` already labels the US and its three criteria; suitable first safe move |
| `STORY-AIWF-PUBLIC-CONTRACT-CONSUMER` | `primitive-truth` and structural migration are supporting tests |
| `STORY-AIWF-CONTEXTUAL-EDIT` | **No obvious direct acceptance** for “edit last ticket”; confirmed gap candidate |
| `STORY-AIWF-REPORT-BUG` | `bug-public` exercises a public journey, but validate the full intended outcome |
| `STORY-AIWF-FAILURE-TO-PRODUCT` | `debugger` is supporting mechanism; bidirectional US trace acceptance **not demonstrated** |
| `STORY-AIWF-CLAIM-TO-EVIDENCE` | `doctrine-verifier`, `technical-proof`, `us/file-change-synchronization` (fixture US only) need proof of a genuine claim-inspection journey |
| `STORY-AIWF-EVIDENCE-BACKED-INSIGHT` | **No clear public acceptance** demonstrated |
| `US-REVIEWER-RELIABILITY` | `us/reviewer-reliability.story` + supporting `reviewer-reliability`; projection explicitly says `missing_acceptance_contract`: repair definition before treating test as official proof |

### Earlier drafts reconciled against existing candidates

| Earlier duplicate draft | Prior candidate US(s) | Overlap |
| --- | --- | --- |
| `US-A08` | `US-A08` / `US-T01` | Read existing work |
| `US-E03` | `US-E03` | CLI/Shell/MCP parity |
| `US-E02` | `US-E02` / `US-E04` | Reviewed source changes |
| `US-P03` | `US-P03` / `US-P01` | Product definition and review |
| `US-T04` | `US-T04` / `US-T05` | Rule management and proof |
| `US-A04` | `US-A04` | Model routing |
| `US-A06` | `US-A06` / `US-E05` | Setup and MCP installation |
| `US-A02` | `US-A02` / `US-A05` | Capability/skill discovery |
| `US-E01` | `US-E01` | Sibling repository inspection |
| `US-A07` | `US-A07` | Traces and execution metrics |

**No ten new User Stories are needed.** Existing 30 proposed US-E/P/T/A episodes already cover these domains; actual canonical acceptance must be checked independently. The mappings below are **file-level starting points**—mixed files can contain cases for different Stories.

## File-by-file inventory

| Current test file | Role | Candidate owning US | Disposition |
| --- | --- | --- | --- |
| `tests/actor-budget-policy.test.ts` | Supporting checks | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/actor-engine-boundaries.test.ts` | MIXED / split by episode | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/actor-prompts.test.ts` | Supporting checks | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/actor-runtime-refresh.test.ts` | Supporting checks | `US-A04` | Proposed Story only; do not count as accepted US proof |
| `tests/actor.test.ts` | MIXED / split by episode | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/artifact-command.test.ts` | US candidate (public behavior) | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/artifact-policy.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/aspects.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/ast-freshness-and-search.test.ts` | Supporting checks | `US-E01` | Proposed Story only; do not count as accepted US proof |
| `tests/us/story-aiwf-report-bug.test.ts` | US candidate (public behavior) | `STORY-AIWF-REPORT-BUG` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/change-bridge.test.ts` | Supporting checks | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/change-commit.test.ts` | TECHNICAL exception | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/change-edits.test.ts` | TECHNICAL exception | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/change-engine.test.ts` | MIXED / split by episode | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/change-foundation.test.ts` | MIXED / split by episode | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/cli-help.test.ts` | Supporting checks | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/command-registry.test.ts` | TECHNICAL exception | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/compiler.test.ts` | Supporting checks | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/config.test.ts` | Supporting checks | `US-A04` | Proposed Story only; do not count as accepted US proof |
| `tests/debugger.test.ts` | Supporting checks | `STORY-AIWF-FAILURE-TO-PRODUCT` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/decompose.test.ts` | MIXED / split by episode | `STORY-AIWF-PROCESS-INTENT` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/dharmax-s1.test.ts` | MIXED / split by episode | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/dharmax-s2.test.ts` | MIXED / split by episode | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/dharmax-s3.test.ts` | MIXED / split by episode | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/dharmax-s4.test.ts` | MIXED / split by episode | `STORY-AIWF-PROCESS-INTENT` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/dharmax-s5.test.ts` | US candidate (public behavior) | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/doctrine-batch.test.ts` | TECHNICAL exception | `US-T04` | Proposed Story only; do not count as accepted US proof |
| `tests/doctrine-enforcement-live.test.ts` | Supporting checks | `US-T04` | Proposed Story only; do not count as accepted US proof |
| `tests/doctrine-management-live.test.ts` | Supporting checks | `US-T04` | Proposed Story only; do not count as accepted US proof |
| `tests/doctrine-management.test.ts` | Supporting checks | `US-T04` | Proposed Story only; do not count as accepted US proof |
| `tests/doctrine-model.test.ts` | Supporting checks | `US-T04` | Proposed Story only; do not count as accepted US proof |
| `tests/doctrine-producer-context.test.ts` | MIXED / split by episode | `US-T04` | Proposed Story only; do not count as accepted US proof |
| `tests/doctrine-scope.test.ts` | Supporting checks | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/doctrine-verifier.test.ts` | Supporting checks | `STORY-AIWF-CLAIM-TO-EVIDENCE` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/escalation.test.ts` | Supporting checks | `US-A04` | Proposed Story only; do not count as accepted US proof |
| `tests/evidence-first-verification.test.ts` | Supporting checks | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/execution-economics.test.ts` | Supporting checks | `US-A07` | Proposed Story only; do not count as accepted US proof |
| `tests/graph.test.ts` | MIXED / split by episode | `US-E01` | Proposed Story only; do not count as accepted US proof |
| `tests/human-output.test.ts` | MIXED / split by episode | `US-A08` | Proposed Story only; do not count as accepted US proof |
| `tests/integration/graph-field-migration.test.ts` | Supporting checks | `STORY-AIWF-PUBLIC-CONTRACT-CONSUMER` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/kb.test.ts` | Supporting checks | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/lsp-shutdown.test.ts` | TECHNICAL exception | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/mcp-public-surface.test.ts` | Supporting checks | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/model-advice-story.test.ts` | Supporting checks | `US-A04` | Proposed Story only; do not count as accepted US proof |
| `tests/model-headers.test.ts` | TECHNICAL exception | `EXCEPTION` | Review necessity; preserve critical persistence/style assertions |
| `tests/model-runtime.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/model-service.test.ts` | Supporting checks | `US-A04` | Proposed Story only; do not count as accepted US proof |
| `tests/numeric-priority.test.ts` | MIXED / split by episode | `US-A08` | Proposed Story only; do not count as accepted US proof |
| `tests/os.test.ts` | Supporting checks | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/p0-engineering.test.ts` | Supporting checks | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/pc1a-safety.test.ts` | MIXED / split by episode | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/performance-metrics.test.ts` | Supporting checks | `US-A07` | Proposed Story only; do not count as accepted US proof |
| `tests/primitive-truth.test.ts` | Supporting checks | `STORY-AIWF-PUBLIC-CONTRACT-CONSUMER` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/product-authority.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-change.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-charter-screen.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-operability-commands.test.ts` | MIXED / split by episode | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-operability-definition.test.ts` | US candidate (public behavior) | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-operability-links.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-operability-parity.test.ts` | MIXED / split by episode | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/product-processing.test.ts` | US candidate (public behavior) | `STORY-AIWF-PROCESS-INTENT` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/product.test.ts` | MIXED / split by episode | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/public-api-s1.test.ts` | MIXED / split by episode | `US-A08` | Proposed Story only; do not count as accepted US proof |
| `tests/public-read-surfaces.test.ts` | MIXED / split by episode | `US-A08` | Proposed Story only; do not count as accepted US proof |
| `tests/reviewer-policy.test.ts` | Supporting checks | `US-REVIEWER-RELIABILITY` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/scaffold.test.ts` | Supporting checks | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/setup-truth.test.ts` | Supporting checks | `US-A06` | Proposed Story only; do not count as accepted US proof |
| `tests/setup.test.ts` | Supporting checks | `US-A06` | Proposed Story only; do not count as accepted US proof |
| `tests/shell-config-setup.test.ts` | MIXED / split by episode | `US-A06` | Proposed Story only; do not count as accepted US proof |
| `tests/shell-daily.test.ts` | Supporting checks | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/shell-trace.test.ts` | Supporting checks | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/shell.test.ts` | MIXED / split by episode | `US-E03` | Proposed Story only; do not count as accepted US proof |
| `tests/skill-manager-bridge.test.ts` | Supporting checks | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/skill-synthesis-acceptance.test.ts` | Supporting checks | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/source-change-authorization.test.ts` | Supporting checks | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/source-synthesis.test.ts` | Supporting checks | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/store-lifecycle.test.ts` | MIXED / split by episode | `EXCEPTION` | Review necessity; preserve critical persistence/style assertions |
| `tests/structured-repair.test.ts` | Supporting checks | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/technical-proof.test.ts` | Supporting checks | `STORY-AIWF-CLAIM-TO-EVIDENCE` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/ticket-investigation.test.ts` | Supporting checks | `STORY-AIWF-INVESTIGATE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/ticket-preparation.test.ts` | Supporting checks | `STORY-AIWF-PREPARE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/ticket-resolution.test.ts` | Supporting checks | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/timeout-recovery.test.ts` | Supporting checks | `STORY-AIWF-RESOLVE-TICKET` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/tool-discovery.test.ts` | Supporting checks | `STORY-AIWF-DELEGATE-WORK` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/tools.test.ts` | MIXED / split by episode | `US-A02` | Proposed Story only; do not count as accepted US proof |
| `tests/top-level-product-intent.test.ts` | Supporting checks | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/ts6-refactor-sync.test.ts` | TECHNICAL exception | `US-E02` | Proposed Story only; do not count as accepted US proof |
| `tests/us/basic-product-intent.test.ts` | US candidate (public behavior) | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/us/e01-investigate-sibling.test.ts` | US candidate (public behavior) | `US-E01` | Proposed Story only; do not count as accepted US proof |
| `tests/integration/file-change-synchronization.test.ts` | Supporting checks | `US-E01` | Proposed Story only; do not count as accepted US proof |
| `tests/us/product-charter-feature.test.ts` | US candidate (public behavior) | `US-P03` | Proposed Story only; do not count as accepted US proof |
| `tests/us/resolve-greeting-story.test.ts` | US candidate (public behavior) | `STORY-AIWF-RESOLVE-TICKET` | Confirm official definition/real acceptance, then retain |
| `tests/us/reviewer-reliability.story.test.ts` | US candidate (public behavior) | `US-REVIEWER-RELIABILITY` | Confirm official definition/real acceptance, then retain |
| `tests/us/reviewer-reliability.test.ts` | Supporting checks | `US-REVIEWER-RELIABILITY` | Confirm official definition/real acceptance, then retain |
| `tests/us/ticket-journal.test.ts` | Supporting checks | `US-A08` | Proposed Story only; do not count as accepted US proof |
| `tests/us/story-aiwf-sophisticated-goal.test.ts` | US candidate (public behavior) | `STORY-AIWF-SOPHISTICATED-GOAL` | Associate to confirmed US; remain supplemental until proven end-to-end |
| `tests/workspace-text.test.ts` | Supporting checks | `US-E02` | Proposed Story only; do not count as accepted US proof |

## Migration order and acceptance gates

**M1 (move completed; developer-reported green gate):** The `STORY-AIWF-SOPHISTICATED-GOAL` and `STORY-AIWF-REPORT-BUG` public suites now reside in `tests/us/`. The fixture-only file-change check is in `tests/integration/`. Validate the moved suites and full suite before more changes; do not claim canonical US completeness from filename relocation.

**M2 (product authority):** Reconcile live canonical US records against the existing 30 proposed US-E/P/T/A episodes. Create a new Story only for a genuinely missing episode after explicit developer approval. No automatic acceptance.

**M3 (behavior-first):** Split `public-read-surfaces` by actual Story episode: Ticket reading/graph relationships (`US-A08`), help/invalid-command inertness (`US-E03`), and read-only investigation (`STORY-AIWF-INVESTIGATE-TICKET`). Reuse the original fixtures where appropriate; maintain standalone CLI/Shell/MCP real parity. Retain complete mismatch diagnostics.

**M4 (large/technical):** Refactor the 1415-line `ticket-resolution` test file by observable US outcome, not implementation stage: successful resolution and evidence, blocked/needs-input and stale proof, cancellation/leases, repair; use multiple files for the **same** Story when warranted. Keep invariant-specific tests separately if needed, and eliminate duplicated fixture setup rather than adding a test framework.

**M5:** Continue per-US and exception migration in small testable batches. Avoid superficial renames, US-per-test fragmentation, redundant fixtures and moving code without tests.

## Explicit non-claims

- This is an evidence-backed **candidate ownership inventory**, not 97 confirmed graph edges or 97 accepted US acceptance suites.
- A historical green test is not sufficient proof of current accepted US behavior. `tests/us/` currently contains several test-created Stories whose canonical parent may be absent from the Product graph.
- No production code, test assertion or graph/Product acceptance should change solely because of the inventory.
