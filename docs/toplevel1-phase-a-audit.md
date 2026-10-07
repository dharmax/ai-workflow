# Toplevel1 Phase A audit and verification

Phase A only. Baseline: `e25975c`; comparison master: `c353b42`.
Tracking Ticket: `AIWF-TOPLEVEL1-PHASE-A`. Work stayed on `toplevel1`.
The handoff and all seven listed authoritative sources were read. No Phase B,
execution-substrate work, sibling source change, merge, or live product acceptance occurred.

## Baseline and failure classification

- Initial working tree clean; branch `toplevel1`.
- `bun run typecheck`: failed with three TS2339 errors in
  `tests/top-level-product-intent.test.ts:169-171`. The map inferred `{}` from
  an untyped captured proposal context. Introduced by this branch; fixed by
  typing the capture as the existing `IntentContext`, retaining the assertions.
- `bun test --concurrency=1`: **268 pass, 2 fail**, 270 tests / 34 files, 48.44s.
- Ticket investigation failure: branch Aspect changes lost legacy Feature
  concerns, and the new context collector replaced mandatory scope Test
  evidence. Restored legacy concern inheritance and scope verification reads.
- Installed-skill equality failure: branch updated the repository skill but
  omitted its canonical installer text in `src/setup.ts`. Synchronized the text.
- Master snapshot: strict typecheck passed; **265 pass, 0 fail**, 33 files,
  40.63s, using the same dependencies and original checkout working directory.
  The two initially failing suites and debugger comparison separately passed
  **19/19**. No inherited source failure or provider failure was found.
- Snapshot verification used `git archive`, without a branch or checkout change.
  An initial archive-location run exposed a missing sibling path and the
  debugger's hard-coded original checkout path. Supplying the same sibling
  dependency path and working directory resolved those harness differences;
  neither source nor test assertions were changed for the comparison.

## Entire implementation/test diff audit

Every implementation/test file in the original `master...toplevel1` diff is
listed below, including changes restored to master. Additional Phase A files
are listed too. Classifications apply to logical changes, not whole subsystems.

| File / logical change | Journey | Why needed / disposition | Audit |
| --- | --- | --- | --- |
| `src/graph/ontology.ts`: Goal/Concept/Flow DCRs and `serves`/`enables` | J1.1, J1.2 | Preserve accepted upstream meaning through existing entities/predicates. | KEEP |
| `src/graph/ontology.ts`: Story-first processing/links | J1.1, J1.2, J6.1 | Derive Features/Tickets from Stories; reject Feature-to-Story expansion; allow direct technical Tickets. | KEEP |
| `src/graph/ontology.ts`: upstream processing/investigation context | J2.3, J3.1, J4.1, J5.1 | Carry linked narrative, Goal, Flow, Concept and Decision evidence through existing operations. Preserve mandatory scope Tests. | KEEP |
| `src/graph/ontology.ts`: legacy Story/Feature reads | J3.1, J6.1 | Existing projects remain investigable without migration or manufactured Flows. | COMPAT |
| `src/graph/ontology.ts`: repeated Ticket expansion, sideways Feature/Epic expansion, three new entity aliases | J2.3 | Duplicate Ticket reads removed; only initial Feature scopes expand Stories; investigation does not expand containing Epic targets. Unused new aliases removed. | REMOVE |
| `src/artifact-policy.ts` | J6.1 | Remove the exploratory policy rewrite; retain master policy, including old containment inheritance only. Canonical enablement introduces no inheritance. Final file equals master. | REMOVE / COMPAT |
| `src/aspects.ts`: direct top-level scope recognition | J2.3 | Existing Aspect primitive can read directly authored concerns on new scopes. No new propagation mechanism. | KEEP |
| `src/aspects.ts`: Goal-to-Flow-to-Story propagation and replacement of legacy inheritance | J3.1, J6.1 | New propagation is unneeded for the baseline; remove it and preserve established legacy Feature containment behavior. | REMOVE / COMPAT |
| `src/product/mutation.ts`: entities, field validation, canonical relation combinations | J1.1, J1.2 | Existing mutation engine authors/validates the minimal semantic graph. | KEEP |
| `src/product/mutation.ts`: legacy link authoring | J1.2 | Remove Feature `contains` Story from authorable relations. Existing edges remain readable and explicitly unlinkable. | REMOVE / COMPAT |
| `src/product/decompose.ts` | J1.1, J1.2, J1.3, J6.1 | Journey-first prompt/context; optional enabling capability; unknown reference becomes a blocking question instead of an invented/arbitrary Feature. | KEEP |
| `src/product/apply.ts` | J1.1, J1.2, J6.1 | Author only `enables` when a Feature is explicitly present; preserve Story-only proposals. | KEEP |
| `src/tools/product.ts`: deterministic top-level CRUD/read and canonical views | J1.1, J1.2 | Reuse the existing thin Product tool module, with Flow membership and enabling Features. | KEEP |
| `src/tools/product.ts`: legacy edges and old response field names | J5.1, J6.1 | Read/preserve existing state and existing consumers; authoring remains canonical. | COMPAT |
| `src/product/coverage.ts` | J3.1, J4.1 | Minimal canonical-edge reads and Flow membership; old containment still satisfies its legacy parent contract. No new coverage engine, scores, or top-level coverage API. | KEEP / COMPAT |
| `src/product/impact.ts` | J2.3, J4.1 | Minimal canonical-edge reads; separate containing Flow from Feature; preserve legacy reads and the existing bounded report. | KEEP / COMPAT |
| `src/graph/projections.ts`: canonical owner/read display | J1.2, J5.1 | Existing Feature projection owns `enables`; Story projection shows Flow/Feature context without new top-level projection files. | KEEP |
| `src/graph/projections.ts`: legacy display/import preservation | J1.2, J6.1 | Legacy Story section is read-only; old-format edits cannot implicitly promote containment. Preserve graph-owned Goal/Concept/Flow Epic targets during Markdown edits. | COMPAT |
| `src/tools/surface.ts` | J5.1 | Remove all six added public top-level readers. Existing investigation/delegation carries product context and existing preview/apply supports canonical mutations. Final allowlist equals master. | REMOVE |
| `tests/artifact-policy.test.ts` | J6.1 | Restore independent legacy policy assertions; no new canonical inheritance tests replace them. Final file equals master. | REMOVE / COMPAT |
| `tests/aspects.test.ts` | J3.1, J6.1 | Remove exploratory propagation fixture; restore existing concern/evidence assertions. Final file equals master. | REMOVE / COMPAT |
| `tests/decompose.test.ts` | J1.1, J1.2, J6.1 | Mechanism tests for canonical enablement, reuse, and no fabricated Feature. | KEEP |
| `tests/product-processing.test.ts` | J1.2, J6.1 | Mechanism tests for Story-derived capability and rejection of reversed expansion. | KEEP |
| `tests/product.test.ts` | J1.2, J3.1, J4.1 | Canonical relations, Flow membership, bounded impact, causal coverage and projection round-trip mechanisms. | KEEP |
| `tests/top-level-product-intent.test.ts` | J1.2, J2.3, J6.1 | Retain registry/operation mechanism checks; fix typing; add context-boundary and old-state/Markdown preservation regressions. Suite explicitly says mechanisms. | KEEP / COMPAT |
| `src/setup.ts` (Phase A addition) | J5.1, J6.1 | Keep installed skill identical to accepted repository instructions. No installer redesign. | KEEP |
| `tests/product-change.test.ts` (Phase A addition) | J1.2, J5.1 | Update two stale authoring fixtures to `enables`, retaining their preview/apply assertions. Add rejection of legacy authoring and explicit legacy removal through Causal Change. | KEEP / COMPAT |

Documentation changes retain the journey model and authoritative Phase boundaries.
Aspect/completeness documentation now states the reduced baseline and legacy
exceptions. The new audit is an evidence report, not a replacement plan.
Markdown ledger changes are synchronized views of the Phase A Ticket/current graph.

## Exact removal and simplification

1. Restored `src/artifact-policy.ts` and its tests to master, deleting the branch's
   completeness-policy change rather than inventing a replacement policy.
2. Deleted new Flow-to-Goal Aspect propagation and replacement Story-to-Flow
   Aspect inheritance. Kept only direct recognition of the three new scopes and
   existing legacy behavior; restored the original Aspect regression suite.
3. Deleted six public MCP allowlist additions: `get_goal`, `list_goals`,
   `get_concept`, `list_concepts`, `get_flow`, `list_flows`.
4. Deleted redundant Ticket neighborhood reads from `collectProductMeaning`,
   prevented sideways expansion through enabling Features, and excluded unrelated
   containing-Epic targets from investigation. Removed `GoalEntity`,
   `ConceptEntity`, and `FlowEntity` aliases.
5. Deleted legacy containment authoring permission; retained explicit unlink only.
   No migration subsystem or bulk conversion exists.
6. Removed implicit projection migration: legacy edges display separately and
   survive import. Epic imports reconcile only the projected Feature/Story targets.
7. Restored mandatory scope verification evidence; typed the existing proposal
   context test; synchronized the existing installer skill text.

The first post-shrink full run exposed two old Causal Change fixtures that authored
now-forbidden containment. These were classified as stale authoring contracts,
updated to `enables`, and augmented with a negative legacy-authoring regression.
No test was deleted or weakened to clear a failure.

## Final verification

- Focused: **89 pass, 0 fail**, 11 files, 9.49s. Command:
  `bun test tests/artifact-policy.test.ts tests/aspects.test.ts tests/decompose.test.ts tests/product-processing.test.ts tests/product.test.ts tests/top-level-product-intent.test.ts tests/ticket-investigation.test.ts tests/artifact-command.test.ts tests/tool-discovery.test.ts tests/setup.test.ts tests/product-change.test.ts --concurrency=1`.
- `bun run typecheck`: **passed** with no errors.
- `bun test --concurrency=1`: **274 pass, 0 fail**, 34 files, 43.17s.
- `git diff --check`: **passed**.
- No sibling suite was run; no sibling source changed.
- Full-suite results are recorded in canonical TestNode evidence. These are test
  execution results, not product journey acceptance or a model-authored acceptance proof.

## Remaining risks and merge readiness

**Ready for review and merge to master as the Phase A mechanical baseline.**
No merge was performed. Phase B and `TKT-8D3F` remain untouched.

- Real configured proposal/review/apply, semantic-conflict detection, recommendation
  parity, J2.4 composition and dogfood acceptance remain later-phase work.
- Legacy containment remains in existing project state. Compatibility preserves
  it without treating it as canonical or silently rewriting it.
- New top-level intent is graph/tool owned. There are no new Markdown projections,
  no public MCP reader expansion, and no new completeness/Aspect propagation policy.
- Mechanism tests do not establish live product acceptance. The Phase A Ticket
  remains awaiting human review, with its lease released; it is not marked Done
  through a fabricated acceptance receipt.
