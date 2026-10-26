# AIWF / DHARMAX-WAY — STAGED IMPLEMENTATION PLAN

**2026-10-20 priority correction:** P0 AI engineering through MCP/skill/plugin → P1 native Digest → P2 ai-cli dogfooding → P3 Shell → P4 Workspace last. This supersedes Workspace-first scheduling, not safety or acceptance. See [the approved release-plan sequence amendment](AIWF-USABLE-V1-RELEASE-PLAN.md#approved-p0-sequence-amendment--2026-10-20). **Developer approved core AI engineering before Workspace acceptance on 2026-10-20.** Bounded P0 S6a may proceed under the approved clause; S6b requires accepted S6a and authorized scope. Full PC5 remains pending. Any older full-PC5-before-S6 clause below is superseded only in that sequence requirement; all safety, review and independent proof obligations remain. No Workspace rewrite/polish cycle now; retain current backend/regressions, canonical Semantika/Gate 5 obligations and independent proof.

**2026-10-21 correction:** Product charter is mandatory and developer-approved; the [definitions](../docs/definitions/product.md) govern alignment review and explicitly answered warnings for downstream Aspects, Features, Epics and USs. Older optional-charter language is superseded. Implementation is not implied by this plan. See [Proposal and Acceptance](../docs/definitions/proposal-and-acceptance.md) and [Verification](../docs/definitions/verification.md).

Companion specification: `AIWF-DHARMAX-WAY-DESIGN.md` (read for architecture and public contracts); **[the canonical definitions glossary](../docs/definitions/README.md) owns terminology and US fields**. Do not derive alternative fields or inheritance rules from older planning prose. Revision: 2026-10-21 (Story-test-first ordering synchronized; proposed US coverage catalog in cycles 1–4, with 76-file matrix). This file is **a staged execution plan, not authorization to run all stages automatically**. Execute exactly one authorized stage; report and stop. Stage advancement requires observed acceptance and developer decision. Work on current `master`/`main`; no forest of feature branches; preserve unrelated user changes. Use AIWF to manage this plan as real, minimal canonical work once its public operations allow it; do not keep creating Epics/Tickets to work around AIWF.

## A. Critical corrections to previous plan (binding)

1. Do **not** close legacy Gate 5 at any cost before changing the core workflow. Preserve pushed governed-change work, Semantika contract and original counterexample; retain G5 Blocked until its actual criteria pass. Current narrow prerequisite failed on Actor navigation budget and then provider `User not found`, **not** on an established Semantika behavioral failure. Do not silently label G5 accepted, discard its protections or run indefinite provider retries. Treat DW-07 below as the new workflow's concrete regression; if a currently demonstrated unsafe path exists, fix that safety defect immediately.
2. No replacement graph/store/Actor/repository architecture. Existing product model, process, mutation, Aspects, test and change engine are real and partially useful. Modify their current owners; delete obsolete pieces only after equivalent observable behaviors pass.
3. Developer review is missing from current AI `processIntent`; proposed intent must become non-mutating and editable before application. AI critic acceptance cannot stand in for user approval. No `acceptanceCriteria=[title]` fallback.
4. `validateProductMutations()` followed by a series of individual writes is not an atomic reviewed acceptance. Prove coherent product mutation or implement the smallest existing-Semantika-backed batch adapter before making UI/editor rely on it. Do not promise Graph + filesystem atomicity.
5. Current `UserStory` fields do not encode full Story. Migrate without inventing unknown State/Action/Result; UI must make ambiguous legacy material reviewable. Structural coverage is not Story satisfaction; projection `- [ ]` is unconditional and not an acceptance oracle.
6. **UI is integral**: build real editor early, after safe canonical operations, rather than defer all human review until the very end. Still avoid building UI on Markdown and avoid selecting a heavyweight frontend by default.
7. Story-first tests are not hundreds of hypothetical unit tests. Each accepted real Story owns one executable test file: primary user flow, real non-pristine variants/sub-flows, discovered bug regressions and meaningful safety/failure boundaries. Digest valuable old cases into the right Story, rather than indiscriminately deleting them or preserving implementation suites because they are distinct. Skip only while implementation has not started; activate and establish attributable expected red when work begins. Existing implemented work is verified as it stands, not forced to replay fictional history. The bounded [US consolidation plan](US-TEST-CONSOLIDATION-PLAN.md) governs this migration.
8. Explicit portable export/restore must precede deletion of tracked Markdown projections, since canonical `.ai-workflow/state/` is Git-ignored. Remove live sync only after end-to-end UI/CLI/MCP and migration acceptance succeeds.

## B. Operational rules for every stage

- Source basis: pushed AIWF `47bf495b3366c1b2faa40f769efd004328bf7d4f`, pushed Semantika `0d395ee2b2cef6a03a7cdee23b3a23fe9073e575`; inspect HEAD/dirty state first. Do not assume reports about older local runs prove new HEAD. Pin/read actual local sibling versions.
- Before mutation: record current feature/story and expected observable behavior; inspect relevant **whole functions and direct callers**, public contract, and current state. Keep scope to required owners. State changes as Concepts → Architecture → Flow → Implementation in a brief working note, **not** four new documents. Check exact exception/cancellation/bounds.
- Story test first for any newly implemented behavior: write/accept executable public-interface scenario; activate relevant tests on stage start; run expected-red (for new behavior/bug reproduction), then implement minimum code. If missing interface/fixture, stop for the necessary clarification, not fake tests.
- Run targeted Story and regression tests after edits. Full deterministic suite/build/typecheck at stable stage boundaries that materially affect shared contracts; configured live provider tests only when the stage depends on them. Explicit skipped/unknown/blocked counts. No repeated costly run without relevant change. Audit methods touched and their immediate interactions before claiming done.
- Use guarded `preview → fingerprint → apply` for source mutations managed by AIWF. Approved canonical changes obey same public validation/version/authorization through CLI/MCP/UI. Keep Semantika public batch; no SQL or permission bypass merely to obtain green status.
- On failure: preserve exact error, affected state and minimal reproduction; classify provider/fixture/Story/implementation/persistence failures accurately; repair only established owner, one bounded iteration then report if still blocked. Never silently widen work scope, budget or model selection.
- Preserve dirty/untracked unrelated files and repo history. Stage may be committed on master after independently demonstrable stable boundary and explicit permission; never promise push/merge without authorization. No automatic whole-plan execution.
- Report for each stage: changed owners; Story with Given/Action/Observed; before/after results; current skipped/unknown; code-method review; residual defects; whether stage can safely be marked complete. Short report, not a ceremony.

### Bounded Autonomy — architectural prerequisite (pending design review)

The developer requires Bounded Autonomy as a core AIWF invariant across **all** autonomous workflows and future features, including nested delegation, retries and recovery. The [single-mechanism design and review implications](AIWF-BOUNDED-AUTONOMY-DESIGN.md) are the implementation basis under review; the [proposed Product charter amendment](../docs/product-charter.md#proposed-amendment--bounded-autonomy-pending-design-review) makes inheritance explicit.

This is a cross-cutting architectural prerequisite within the existing priority/stage boundaries, not a new execution framework, additional iteration, Gate 5 acceptance or authorization to begin runtime coding. First review the design and defaults, then apply the reviewed canonical Product amendment and approve one outward Story/public test. Reuse the current execution context, llm-utils budgeting/cancellation, existing repair/delegation owners and Semantika journal. Establish the actual baseline and run that same Story through shared-budget exhaustion, durable completed/remaining-work reporting, reopening and explicit continuation across the autonomous entry points. Add proportionate nested/concurrent/recovery/crash boundaries before independent acceptance.

Each future autonomous feature must identify its governing execution budget, inherited child allowance, terminal outcomes and durable report in its normal design/acceptance context. A new Actor, Asker, pipeline, store, retry or recovery cannot renew the governing budget. Resource exhaustion ends an execution; it neither completes nor discards the long-lived Ticket. Required verification remains truthful, and completion gates do not authorize repairing unrelated systems.

## C. Stages and exact gates

### S0 — Ground and protect the actual pushed product (read-only first; minimal safeguard only)

**Purpose**: establish the starting point without destroying recent valuable Gate 5 work or relying on stale projection claims.

**Inspect**: git HEAD/status, README/scripts; AIWF `ontology`, `product/process{,-types}`, `product/mutation`, `aspects`, `coverage`, `impact`, `change/engine`, `ticket/{resolve,implementation,verification}`, `graph/store`, CLI/MCP, `graph/projections`; Semantika's actual installed package and public `applyBatch`. Read existing G5 evidence and actual canonical G5/prerequisite status. No whole-codebase rescan.

**Produce**: a file/owner-specific Keep / Correct / Eventually Remove list; exact current public Actor Stories and their runnable tests; source/DB backup location and restoration method (SQLite-consistent backup/closed-store snapshot including WAL state where relevant; never assume `cp graph.db` while open is sufficient); migration risks (legacy Story fields, implicit projections, contradictory status, sibling package resolution). Locate existing appropriate Epic/Tickets; reconcile later through AIWF rather than cloning roadmap. A narrow safe Git checkpoint only with explicit approval; if no restore currently exists, establish a tested **non-destructive** backup before schema work.

**Gate**: reopening a copy of the existing DB yields same IDs, relationships, claims and observed historical evidence; no accidental changes to real project; baseline execution commands/results reproducible. Report open Gate 5 status factually. **Stop.**

### S1 — Correct canonical product definitions, Aspect application and Story semantics

**Owner candidates**: `graph/ontology.ts`, `graph/types.ts`, `product/mutation.ts`, `tools/product.ts`, `aspects.ts`; only affected readers/writers. Retain existing entity identities/types/predicates.

**Implement**:
- Accepted Story requires explicit Actor, Intent, Initial State, Action, Expected Observable Result, relevant exceptions/bounds. Existing `actor/story/context/acceptanceCriteria/sla` remain readable during migration. A legacy Story with unmappable content is *needs review*, not automatically rewritten or marked verified. Decide actual on-disk schema from inspected code; do not encode everything as an opaque blob merely to dodge validation.
- Feature priority where product semantics need it. Aspect as canonical single policy definition, explicit `applies_to` for concrete supported entity types (extend narrow relation validation only as proven necessary), documented inheritance rules, stable change tracking via existing record versions. Distinguish Aspect and effective Rule ownership.
- Change in an existing Feature/Story/Aspect is an in-place governed revision. Proposed content remains proposed until explicit acceptance. For this schema/migration stage, do not yet auto-accept newly generated Stories; new Stories may remain draft/proposed until reviewed operations and test-derivation are ready. Existing reviewed acceptance retained unless deliberately changed; stale proof detection to be completed in S7. Check real Aspect `applies_to` coverage for all artifact kinds the product supports: present whitelist excludes File/Symbol/Ticket/Test/Artifact; extend narrowly with defined inheritance and a real use Story, not an indiscriminate tag-anything cast.

**Story tests (activate for S1)**: DW-02 Story content can be created/read/edited/reopened via actual public product operations with all fields intact; legacy data survives migration or is accurately flagged; DW-05 applicable Aspect definition is retrieved once and exact direct tagging is visible; invalid links/conflicting policy do not silently become accepted.

**Gate**: backward-readable identity-preserving DB round trip and Story/Aspect public operations green; no data loss; no false acceptance. Do not yet rewrite Ticket execution.

### S2 — One safe canonical product edit path and inert proposals

**Owner candidates**: `product/mutation.ts`, `product/process.ts`, `process-types.ts`, `product/context.ts`, `change/engine.ts` product branch, existing Semantika-backed `graph/store.ts`, CLI/MCP adapters as needed.

**Implement**:
- Separate **propose/preview** from **reviewed commit** at the existing ownership boundary. Proposal is structured, editable, carries source entity revisions, intended creates/updates/links/removes, impact/ambiguities and original developer request. Merely running `processIntent`/critic must not mutate product definitions or export projections as a side effect.
- Accepted application revalidates current revisions, relation/identity semantics and permissions, and makes one coherent canonical change. Reuse `SqliteStore.applyBatch` optimistic assertions and current store APIs; if public semantics genuinely insufficient, document exact missing narrow contract and pause rather than produce shadow batch/rollback code. Failed/stale preview: **no partial accepted entities/edges**.
- Direct human edits and AI-generated proposals use the same operation. Stable IDs, explicit ambiguity handling, no title-equals-identity rule, no auto-generated pseudo-criteria or duplicate active Feature/Story/Ticket. Deletion requires review of actual dependents.

**Story tests**: DW-01 through headless public operations, DW-02 propose/edit/accept vs reject, DW-06 revise same identity. Negative: forced DB failure midway, simultaneous stale proposals, malformed relation, canceled proposal, rejected AI critic; reopen DB to verify invariants. Minimal Semantika isolated contract tests are justified for atomicity.

**Gate**: observable proposal causes *zero* canonical mutations; one approved edit applies fully, stale or failure applies none; public CLI/MCP path demonstrates identical results. No UI-specific business code.

### S3 — Workspace vertical slice: excellent product and Story editing

**Owner**: smallest suitable new UI presentation surface over S2's public domain operations; existing setup/CLI routing only as necessary. Inspect current `shell-ui` and host conventions before choosing browser/TUI. Do not introduce React or a full SPA framework by default. A browser-based local UI is acceptable if needed for good rich editing, but keep one presentation layer and no duplicate state rules.

**Deliver first**: global search, canonical entity list/details; Feature/Aspect editor, dedicated Story form (`Actor / Intent / State / Action / Expected Result / Exceptions & Bounds`), proposal diff/edit/reject/accept; relationship picker and applicable Aspect/affected-object display; actual Save and reload, useful errors and keyboard navigation. Add Work and Verification views progressively where needed for ensuing Story tests; don't build graph spectacle or dashboard charts first.

**Story tests**: DW-01 and DW-02 from the *actual UI* (not direct DB or component-only mock); change Aspect through UI, reload from DB; canceled proposal leaves unchanged DB; stale second editor gets a conflict instead of overwriting. CLI/MCP read the same result.

**Gate**: developer can define/review/edit accepted Avatar Filters Feature and Save Story without touching Markdown/DB; exact fields/links survive restart. This historical UI vertical-slice gate does not precede P0 engineering under the approved 2026-10-20 sequence amendment; Workspace redesign is P4.

### S4 — Derive and reconcile work from accepted product intent

**Owner candidates**: existing `product/process.ts`, `process-types.ts`, `context.ts`, `prompts.ts`, `impact.ts`, `mutation.ts`, current Epic/Ticket operations, S3 proposal editor. No new general planning engine.

**Flow**: from accepted new/changed Feature and applicable Aspects, inspect current graph and architectural evidence → AI proposes *complete* Stories (not titles) and relevant Epic → developer edits/accepts Stories → derive/review their executable public-interface tests → identify unmet tested obligations → propose/reconcile necessary scoped implementation Todo Tickets for those obligations → developer reviews and applies via S2 coherent mutation. Existing Feature/Story/Tickets are reused/updated based on identity and reviewed intent. Recursion/number of proposals bounded by existing configuration; return precise ambiguity rather than generate filler. Include a non-generative/manual path. Changes at any level can revise previous accepted entities by explicit decision. Technical-only work stays direct without fake product ceremony.

**Test derivation in this stage**: Once a proposed Story is reviewed/accepted, generate/review its real public-interface test file/suite via guarded source mutation and link the existing TestNode in the canonical DB. Initial skip is allowed only for a materialized executable test whose implementation has not started; if generation/fixture is blocked, leave Story explicitly uncovered and prevent implementation until resolved. SQLite product acceptance and filesystem test-file creation are separate boundaries: never describe them as one atomic transaction. If work is already In Progress, activate the new test immediately rather than calling it skipped. S5 completes execution/expected-red/green handling.

**Story tests**: DW-03 new Avatar Filters; repeat same intent/modify priority/change description and assert reuse, not duplicates; change an existing Story and see affected work proposal; explicit rejected Story creates no Ticket. Negative: cannot derive tests where actual interface/scenario still ambiguous; return review requirement.

**Gate**: reviewed Story-test identity and executable public-interface specifications precede derived implementation Tickets; each new Ticket resolves a concrete unmet tested obligation. Developer sees coherent Epic/Stories/tests/Tickets (skipped only before work starts), no unapproved writes or duplicates. Missing fixture is uncovered, never skipped/green. Already-green behavior creates no redundant implementation Ticket.

### S5 — Story test specification and test-first lifecycle

**Owner candidates**: existing `TestNode`, `tools/test-runner.ts`, `ticket/verification.ts`, Story readers, S2 product operations, minimal test-generation integration; inspect existing source indexing of tests. Keep test code in real project test files; graph stores identity/command/fixtures/revision/evidence, not a fake second test runner.

**Implement**: use the reviewed executable Story test/suite produced from accepted Story at S4, based on the project's *real public UI/CLI/API and runnable fixture*; keep it skipped only before its implementation work begins. When Ticket work starts, activate the corresponding test and execute before code edits; record expected missing-behavior red distinct from infrastructure/provider error. Tie command, test identity, affected Story revision, applicable Aspect revision and source/fixture evidence to current verification. A Story may have multiple cases in one suite; no default files/tests for internal function trivia. If interface cannot yet be specified, Story remains uncovered/blocked, not falsely green. Existing implemented Stories get current-state tests without fabricated red history.

**Story tests**: DW-04 against a small *real* executable client/public-interface fixture plus an AIWF-native Story. Demonstrate skipped → expected red → green in the same test identity; unaffected Story skipped; failed fixture classified accurately; failing exception case cannot be bypassed by passing happy path.

**Gate**: developer sees exact Story/test status and can identify why it is skipped, red, green, blocked or stale; successful run is actual public behavior, not generated assertion of its own spec string.

### S5 postcondition — Product Operability (P0 sequence amended)

The published S5 test-lifecycle scope stands; its acceptance is **not** the acceptance of AIWF's everyday product-management experience. Product Definition & Manifest (historical PC2) uses the already validated architecture; do not make premature removal of legacy two-way Markdown sync a prerequisite. Its explicit human projection is `product-manifest.md`. Preserve `sync`'s existing incremental code indexing, add a recoverable Git-trackable export of non-reproducible authored canonical state, and ensure relevant source-dependent operations refresh changed files automatically through the existing indexer. AIWF-managed Git publication runs sync before commit and checks the exported snapshot before push. For full Product Operability acceptance, complete the separate bounded postcondition [design](AIWF-S5-POSTCONDITION-DESIGN.md) and [plan](AIWF-S5-POSTCONDITION-PLAN.md), PC0 → PC5, each with its own observed gate and explicit developer authorization for advancement. Cover product/architecture intention, a compact topic-oriented CLI and typed MCP façade, one governed `link` operation, first-class Bug UX on existing Ticket ownership, cross-surface usability and independent public-journey evidence. The postcondition is not a replacement implementation subsystem, nor permission to bypass S2/S5, Gate 5 or the S8 migration boundary. Its specification being published does **not** establish its acceptance or authorize execution. **For P0, the developer-approved 2026-10-20 sequence amendment permits bounded S6a before full PC5; S6b still requires accepted S6a and authorized scope. PC5 itself remains unaccepted.**

### S6 — Align governed implementation and resolution; preserve Gate 5 protections

**Entry prerequisite:** for bounded P0 S6a, the explicitly approved 2026-10-20 sequence amendment and its relevant independently established safety/authority, accepted intent/test, Semantika and governance obligations. S6b requires observed S6a acceptance and authorized scope. Full PC0–PC5 acceptance remains required for claiming the full Product Operability/Workspace experience, not for starting core P0 execution. Publication or test totals alone establish neither gate.

**Owners**: existing `ticket/{resolve,implementation,verification}.ts`, `ticket-operation-types.ts`, `verification-context.ts`, `change/engine.ts`, `graph/store.ts`, public tools, not a replacement executor.

**Flow**: accepted Story + Ticket/current scope + applicable Aspect and effective Rules + known test/evidence → activate/red Story test (for new work) → narrow inspection of current architecture/flow/source → deterministic operation or bounded AI synthesis through existing actor/asker only if needed → guarded `preview/fingerprint/apply` → Story + relevant specialist tests → independent current acceptance → one replaceable `VERIFY-${id}` and coherent Done/verified transition. Already-implemented Ticket: test/verify with existing evidence, **do not launch producer merely to navigate files**. Allow child Tickets each own attributable changes; no silent dependency expansion. Provider unavailable stops before claiming implementation success; release leases.

**Specific audit before edit**: follow exact `resolve_ticket → Ticket.resolve → implementTicket → LLMActor → Asker`, supplied test commands, repeated FileNode retrieval, dossier/history retransmission and budget reservation; check whether latest pushed context correction remains accurate. Remove duplicate/unused steps only if the trace and public Story demonstrate it. Keep project-wide governance admission, dirty-file/new-file/rename scope, conflict handling, failure/restart and independent verifier. Do not loosen token guard as workaround.

**Bound the stage into two sequential checkpoints**: S6a prove already-implemented evidence-only resolution (and diagnose exact provider failure independently if present); S6b prove new Story red → governed code change → green and safety negatives. Stop after S6a if its actual Story fails; do not compensate by running S6b or expanding the Actor budget.

**Story tests**: DW-07 with controlled configured provider (first test provider independently; if unavailable, report provider blocker and do not call acceptance success); DW-04 implementation end-to-end; DW-09 unauthorized secondary edit, mandatory Rule violation, stale proof, dirty-file conflict, transactional completion failure. Existing PD-01 adversarial reproduction stays a required regression; prior passing log alone is not current release proof if code changed.

**Gate**: a narrow implemented prerequisite resolves/needs_input for an *actual criterion*, not a context tour; new work goes expected-red → governed implementation → actual green; safety regressions remain intact. G5 can be accepted only if its own current canonical release criteria and independent review are actually satisfied, never by renaming or bypassing the Gate.

### S7 — Accurate Story satisfaction, Aspect impact and modification loop

**Owner candidates**: `product/coverage.ts` (retain structural role), `product/impact.ts`, `aspects.ts`, existing TestNode evidence, Ticket proof, Workspace Verification view. Do not create a second persistence engine or event-history system.

**Implement**: show (a) structural links, (b) definition status, (c) current observed Story result with exact test/revision/Aspect/fixture, (d) unknown/missing evidence. On Feature/Story/Aspect revision use existing graph relationships to return direct and derived affected paths; invalidate only relevant *current* proof; show speculative inference separately; make developer-approved adjustments to existing Stories/work. Make effects inspectable in UI. Historical completed Ticket is not indiscriminately reopened; unchanged facts remain facts. No unconditional checklist `[x]` from a mere graph edge.

**Story tests**: DW-05 Persistency Aspect change reaches multiple tagged consumers and their current Story proof, not unrelated items; DW-06 reproduce/fix existing behavior without duplicate product definitions; a formally 'complete' graph with no executed Story must display *unverified*. Recovery/reopen of DB retains evidence and accurate freshness.

**Gate**: developer can answer "What works now? What does this Aspect change affect? Which current Stories need rerun?" with demonstrable paths and actual results. Counts always separate skipped, stale and unknown.

### S8 — Portable import/export and removal of live Markdown projections

**Owner candidates**: existing graph/store + CLI/MCP/setup/doctor/sync/projection callers; add only narrow import/export implementation needed. Confirm actual ignored files, backing SQLite/WAL semantics and data required by UI before deciding format.

**Implement in safe sequence**:
1. Define explicit versioned portable export format for canonical entities, predicates, important configuration (without credentials), accepted product definitions and meaningful verification references; deterministic stable identity/order, integrity check and documented compatibility. Retain explicit human-readable Markdown export from DB (including `product-manifest.md`), and extend the narrower authored-state publication snapshot introduced with Product Definition & Manifest to full independent portable project restore.
2. Implement independent restore into a fresh project, schema version validation, preview/diff/identity conflict policy, all-or-nothing import with rollback on injected failure. Handle external source paths/tests: preserve references as references and revalidate at new root; never present copied old execution as current verified code without checking.
3. Make Workspace and CLI/MCP fully usable with no projection files. Check fresh initialize, existing-project migration, `doctor`, setup, explicit export/import, restart and test discovery.
4. **Only after presenting the successful independent restore and obtaining explicit approval for the destructive transition**, remove automatic bidirectional sync, mtime/sync-state logic, implicit projection export/import and tracked Markdown's role as working data. Keep explicit one-way documentation export and optional legacy one-time importer. Check callers comprehensively (`cli.ts`, `product/process.ts`, `graph/projections.ts` and others actually found).

**Story tests**: DW-08 export → fresh independent restore → compare IDs/relations/accepted specs/aspects/test associations; UI edit and MCP/CLI query after restore; changed version/conflict/corruption/partial import safely refused; no automatic Markdown disk mutation; legacy input remains recoverable. DW-09 negative on bad imports.

**Gate**: verified independent portable round-trip and meaningful operation with Markdown absent; safe to remove live sync. Do not delete projections because they are architecturally undesirable *before* this gate passes.

## D. Whole-product acceptance after S8 (not an additional subsystem)

Run DW-01 through DW-09 as complete public journeys in fresh project state, with developer-review interactions emulated through the actual UI or public reviewed API; where model-dependent, record exact provider and distinguish provider faults. Required demonstrations:

1. Developer requests Avatar Filters (+ priority), reviews proposed Feature and complete Stories, edits/accepts, sees a coherent Epic, Tickets and Story tests; repeated input/changed intent reconciles same entities.
2. Start Save Story; establish real expected red, implement by guarded source change, observe saved avatar in actual client UI/API and persistence behavior; exceptions correctly preserve previous image. Never infer persistence from an Aspect label alone.
3. Edit Persistency Aspect once; UI reveals grounded affected entities and current test/acceptance consequences, developer reviews corrections; unrelated feature remains intact.
4. Fix an existing accepted Story and verify revised behavior without duplicated Feature/Story; an old proof does not falsely certify new behavior.
5. Resolve already-implemented prerequisite without navigation exhaustion given valid provider/evidence; invalid provider returns provider failure and leaves canonical state unchanged.
6. Project survives export/import into new root and operates from DB with no live Markdown projection; failed import cannot partially mutate canonical product.
7. The original PD-01 unauthorized/mandatory-rule case, dirty-file conflicts, concurrent governance change and completion rollback still fail safely.

For each: record Intent/State/Action/Expected vs Observed, real public invocation, relevant code/DB state, Story revision/test identity and exact result. No "all tests pass" substitution. Inspect changed method bodies and immediate callers after the final integration. Reconcile canonical Story, Feature, Aspect and Ticket status **only** against current evidence. Existing unrelated roadmap work remains outside scope. No new global Release Manager, CPV duplicate engine or long-running autonomous audit loop.

## E. Change containment / source map

| Existing source | Planned disposition |
| --- | --- |
| `src/graph/ontology.ts`, `graph/types.ts` | Retain first-class entities; minimally strengthen Story/Aspect/Test semantics, preserve old data. |
| `src/product/mutation.ts`, `graph/store.ts`, Semantika `applyBatch` | Retain owner; correct canonical coherent reviewed edit and stale version handling. |
| `src/product/process.ts`, `process-types.ts`, `prompts.ts`, `context.ts` | Change proposal semantics to inert/editable/approved; reconcile existing work instead of auto-committing derived text. |
| `src/aspects.ts`, `product/impact.ts`, `product/coverage.ts` | Reuse explicit graph relationships; tighten applicability/reverse impact and separate structural vs observed acceptance. |
| `src/tools/product.ts`, CLI, shell, MCP | Reuse public operations; add exact Story fields/approval and present same domain contracts. |
| `src/ticket/*`, `src/change/engine.ts`, `graph/store.ts` | Retain Gate 5 safety; simplify only demonstrated flow waste and adapt to Story-first verification. |
| `src/graph/projections.ts`, sync callers and files | Temporary compatibility; remove *automatic* sync only at S8 after independent restore/UI acceptance; leave optional one-way export. |
| Tests | For this approved consolidation, digest real old flows/non-pristine cases into one file per accepted US, using limited shared non-test helpers. Preserve valuable safety and bug regressions within their owning US; inspect unmatched cases for missing US/sub-flows. No manufactured Stories, deletion quotas or falsified passing evidence. See [US consolidation plan](US-TEST-CONSOLIDATION-PLAN.md). |

## F. Definition of safe execution / stopping rule

A stage is done only if its **specified public Story works**, modified method boundaries withstand review, necessary regressions pass and current canonical state is truthful. If missing owner, provider, interface definition, reproducibility or data integrity prevents demonstration, report precise gap and STOP. Do not invent answers, fake Story outcomes, create duplicate product entities, silently reauthorize scope or start the next stage. Dharmax-way must be visible in actual AIWF behavior, not simply quoted in prompts.

## Model Radar / System-1 routing alignment (decision 2026-10-26; planned, not implemented)

**Owner:** generic implementation in `llm-utils`, consumed by AIWF; avoid a second AIWF-local selector. This entry records a scoped requirement and does not supersede the active AIWF lifecycle priority or authorize out-of-sequence implementation.

1. **Contract and tests first.** Inspect existing Authority, Radar, System-1, and routing contracts. Specify a minimal `{ provider, model }` selection result and rich input containing **both task and original query**, bounded session/goal/context, current Authority mapping and its freshness/evidence, capability and policy constraints, provider health/cost/latency, local installed/resident/previous model, and observed or estimated model-switch overhead. Distinguish known facts from unknowns. Write user-story-oriented tests before implementation.
2. **Wire one decision path.** Radar assembles the envelope; existing System 1 selects; router validates and executes. Preserve explicit overrides, authorization, availability checks, existing fallback, and the ownership boundary where Authority researches/maps but does not decide each invocation. Remove or delegate any competing ad-hoc ranking code rather than keep duplicate model-choice systems. Never infer residency solely from the previous model.
3. **Verify behavior and integrate.** Cover distinct task/query semantics; context-sensitive critic/coding/ordinary selection; loaded-versus-previous model; cheap local reuse, justified switching for quality/capability or expected workload, unknown switching cost/residency; explicit overrides; forbidden/unavailable models; stale mapping, malformed System-1 responses, timeout and safe fallback. Confirm AIWF uses the llm-utils path without a second ranking implementation, run affected test suites and typecheck, document observability and remaining unknowns. Only mark complete after actual evidence.

