# AIWF / DHARMAX-WAY — CANONICAL PRODUCT & ENGINEERING DESIGN

**2026-10-20 priority correction:** P0 AI engineering through MCP/skill/plugin → P1 native Digest → P2 ai-cli dogfooding → P3 Shell → P4 Workspace last. This supersedes Workspace-first scheduling, not safety or acceptance. See [the approved release-plan sequence amendment](AIWF-USABLE-V1-RELEASE-PLAN.md#approved-p0-sequence-amendment--2026-10-20). **Developer approved core AI engineering before Workspace acceptance on 2026-10-20.** Bounded P0 S6a may proceed under the approved clause; S6b requires accepted S6a and authorized scope. Full PC5 remains pending. Any older full-PC5-before-S6 clause below is superseded only in that sequence requirement; all safety, review and independent proof obligations remain. No Workspace rewrite/polish cycle now; retain current backend/regressions, canonical Semantika/Gate 5 obligations and independent proof.

Document role: **authoritative design/engineering constraints for AI execution**, not a completion report or instruction to implement all stages at once. **Product terminology and US fields are controlled by [the definitions glossary](../docs/definitions/README.md); this plan cannot silently add or redefine fields.** Companion: `AIWF-DHARMAX-WAY-PLAN.md`. Revision: 2026-10-21 (Story-test-first ordering synchronized; proposed US coverage catalog in cycles 1–4, with 76-file matrix). Do not automatically copy this file over existing project rules or replace approved product definitions. Apply approved changes through AIWF.

**2026-10-16 roadmap amendment:** S5's Story-test lifecycle acceptance is distinct from the [S5 Product Operability postcondition](AIWF-S5-POSTCONDITION-DESIGN.md) and its [bounded PC0–PC5 plan](AIWF-S5-POSTCONDITION-PLAN.md). This postcondition still requires independent acceptance for full cross-surface/Workspace claims; bounded P0 S6a may precede it under the approved 2026-10-20 sequence amendment. It does not add a runtime subsystem or retroactively change S5's accepted scope. Publication alone does not authorize execution.

## 0. Foundation and source baseline

Dharmax-way governs AIWF's **actual workflow** and how its code is designed/reviewed. It does not authorize overriding user-approved product decisions, current safety constraints or truthful acceptance just because an implementation stage is inconvenient. It is the operational meaning of the Prime Directive, not an extra optional doctrine, framework, persona or ceremonial document. Product intent is owned by the developer; AI assists in clarifying, proposing and engineering it. Work must yield actual working product behavior, not a structurally complete graph or a large passing internal suite.

Inspected pushed GitHub `dharmax/ai-workflow` at commit `47bf495b3366c1b2faa40f769efd004328bf7d4f`; `dharmax/semantika` at `0d395ee2b2cef6a03a7cdee23b3a23fe9073e575` (Semantika's atomic SQLite batch change appears at `11adc8bb2d6d5f42b87c13f5bad86e0f16a3ba93`). Revalidate current HEAD and working-tree state before each stage. This document is based on pushed source and past reported test outcomes, **not on fresh local execution**. Existing evidence reports AIWF 456 pass / 0 fail / 5 skipped; Semantika 49 pass / 0 fail, build green; configured Gate 3/4/5 journeys 3 pass; subsequent context-change focused regression 82 pass / 1 skipped, and a live retry failed at provider initialization (`User not found`). Never combine these into a claim that current HEAD passed a new final release or that Gate 5 was accepted. Read the canonical DB; `epics.md`/`kanban.md` are projections, not reliable current state.

Existing reusable owners (verify implementation and contracts, retain unless proven unsuitable): `src/graph/ontology.ts` (Goal, Concept, Flow, Feature, Aspect, UserStory, Epic, Ticket, TestNode, source entities); `src/product/{mutation,process,context,coverage,impact}.ts`; `src/aspects.ts`; `src/change/engine.ts` guarded preview/fingerprint/apply; `src/ticket/{resolve,implementation,verification}.ts`; `src/graph/store.ts` Semantika-backed canonical graph, governance admission and coherent Ticket completion; CLI, shell and MCP. `src/graph/projections.ts` is current live bidirectional Markdown machinery to retire **only after** reliable import/export, restore and replacement UI are proven. Avoid shadow persistence, another registry, another Actor executor, additional receipt/history machinery, or parallel business logic for UI/CLI/MCP.

### 0.1 Verified source-level deficiencies / risks to address, not excuses for a rewrite

- `UserStory` currently stores `actor`, `story`, `context`, `acceptanceCriteria`, `sla`; the required explicit scenario fields are absent. Existing content must be preserved and ambiguous fields reviewed during migration.
- `processIntent()` proposes Feature/UserStory/Ticket descendants and then applies the proposal after its AI critic approves; **critic approval is not developer approval**. `IntentProposalSchema` does not represent complete Story scenarios, and process code falls back to `[item.title]` as acceptance criteria. Fix these semantics at the existing owner.
- `applyProductMutations()` validates the intended mutations, then commits operations in a sequential loop. This does not prove an all-or-nothing multi-entity edit or protection against stale preview. Use the *existing* Semantika conditional batch contract where the operation demands atomicity; implement only missing narrow adapter behavior, not a new transaction system.
- `getCoverage()` measures structural graph links, not executed Story outcomes. `projections.ts` emits every Story criterion as `- [ ]` unconditionally; never convert these to `[x]` based merely on structural coverage or a Ticket's lane.
- `applicableAspects()` already implements explicit Aspect applicability through `applies_to`, with limited inherited work scopes; `productDependents()` currently lists immediate edges; `product/impact.ts` exists. Precise reverse-impact traversal and applicability semantics must be specified and tested, not replaced with a second tagging engine. Preserve distinction between an Aspect (authoritative reusable product/engineering concern) and a Rule (effective engineering instruction); do not mirror their text across entities.
- `TestNode` has execution fields but currently no proven, comprehensive Story lifecycle. Don't infer skipped/red/green/verified directly from its `passed` boolean or a static `verifies` edge.
- `Ticket.resolve()` has recently added governed source scope, admissions, tests and current proof. Preserve its demonstrated safety boundaries. Its expensive navigation and provider failures are evidence for a smaller, Story-grounded execution flow, **not** justification for a fresh executor or unlimited context.
- `README.md`, CLI and `src/product/process.ts` currently depend on live Markdown export/sync; stage removal must inventory **all** callers and migration/doctor/setup behaviors, not just delete `projections.ts`.
- The project is Bun-first, private, with local `file:../...` ecosystem dependencies. Verify exact Semantika revision when reproducing any release result. Do not claim independently installable packaging until tested.

## 1. Product concepts — exact meaning and ownership

1. **Product definition**: see [Product](../docs/definitions/product.md) and [Canonical Project Graph](../docs/definitions/project-graph.md). First-class Goals, Concepts, Features, Aspects, User/Actor Stories and relationships define intended behavior and qualities. Product Flow is optional for significant journeys. Proposed changes are not authoritative until developer acceptance.
2. **Goal / Concept / Feature / Aspect**: see [Goal](../docs/definitions/goal.md), [Concept](../docs/definitions/concept.md), [Feature](../docs/definitions/feature.md) and [Aspect](../docs/definitions/aspect.md). Their meanings and ownership are defined there; current/staged implementation details are specified in the relevant sections below.
3. **User/Actor Story**: the complete and exact fields, including **Expected Result**, are in [User/Actor Story](../docs/definitions/user-story.md), with variant semantics in [Sub-US](../docs/definitions/sub-user-story.md).
4. **Epic / Ticket**: see [Epic](../docs/definitions/epic.md) and [Ticket](../docs/definitions/ticket.md). One designated primary Epic at most is agreed; whether assignment is mandatory/defaulted remains open. Technical maintenance can use a direct Ticket without fabricating a Feature/Story.
5. **Test**: see [Test](../docs/definitions/test.md). The ordinary acceptance test is US-driven (one cohesive file per accepted US); technical tests are narrowly justified exceptions, not substitutes for behavioral acceptance. See [US test digestion plan](US-TEST-CONSOLIDATION-PLAN.md).
6. **Architecture / Flow / Implementation**: actual owner/responsibilities, [engineering execution Flow versus Product Flow](../docs/definitions/flow.md), and actual methods/structures. Do not mistake a process description for proof of implementation.
7. **Rule / Guideline / Decision / Artifact**: see [Rules and Guidelines](../docs/definitions/rules-and-guidelines.md), [Decision](../docs/definitions/decision.md) and [Artifact](../docs/definitions/artifact.md). Preserve distinct governance, evidence and ownership.

### 1.1 Complete Story example, not title-only prose

Feature: `Avatar Image Filters`, priority High. Example proposed Story: `Save filtered avatar`.

- Actor: signed-in user.
- User intent: keep the avatar currently displayed in Preview.
- Initial state: preview lightbox is open; a selected filter is visibly applied to an unsaved avatar; the previous saved avatar exists.
- Action: user activates **Save**.
- Expected Result: saved avatar displays the previewed filtered image; it survives reload/new session as required by the applicable Persistency Aspect; preview exits or remains open according to the accepted UI contract. If saving fails, the previous saved avatar remains intact and the user receives a truthful result. (This example still needs developer resolution of the preview outcome before it can serve as authoritative acceptance.)

AI may suggest this Story. Developer edits/accepts or rejects it; no acceptance by generation, critic or mere persistence.

### 1.2 State meaning — no manufactured green

Separate these dimensions; do not use one overloaded `status` or infer one from another:

- **Intent status**: draft → proposed → accepted (or deprecated). Acceptance means approved definition, **not implemented**.
- **Work status**: Backlog/Todo/In Progress/Blocked/Done with coherent verification contract for Done.
- **Story test lifecycle**: no test yet / uncovered (may include an accepted but not-yet-processed Story; never display as skipped); executable test specified and skipped (implementation not started); active/red (implementation started, expected missing behavior observed); active/green (actual run passed); failed for unrelated reason / blocked / not-run are distinct from a valid expected red or green. If existing functionality is migrated, establish observed current behavior; never falsify a historical red phase.
- **Story satisfaction**: unknown/not yet implemented/verified for current Story revision and applicable Aspects; invalidate stale proof when those change. Structural graph coverage is reported separately as structure, not acceptance.

Do not report skipped as passing or hide skips in a successful aggregate. Missing provider, unavailable fixture and malformed test are blocked/unknown, **not** demonstration of missing product behavior. Successful Ticket checks alone do not prove a Feature or Story.

## 2. The operating workflow — normal path and corrections

### 2.1 Developer adds functionality

Developer expresses intent (+ optional priority and constraints) → locate existing Goal/Feature/Story/Aspect/code and duplicates → propose **in-place change or new Feature** and relevant Aspect links → developer sees/edits/accepts proposal through UI or corresponding public API → derive/reconcile Epic and real Tickets → derive/review an executable Story test from the accepted Story before starting its implementation (only a **materialized executable test** is skipped while work is not started; ungenerated tests are uncovered, not skipped; unknown public action/fixture requires clarification) → before implementation activate relevant test and establish expected red via public interface → investigate current architecture, flow and code narrowly → guarded preview/fingerprint/apply → execute Story tests, applicable Aspect cases and necessary specialist tests → independently assess actual results → update canonical graph and current verification. No automatic creation/implementation triggered by a mere proposal. The ideal path can loop back to correct intent, Story, architecture or code. Changes modify existing identities; do not retain duplicate active versions as pseudo-history.

### 2.2 Developer modifies, fixes or removes functionality

Find original entity and affected relationships. Revise its canonical definition in place through a reviewed, version-checked edit. Show what Stories, Aspects, Tickets, tests, modules, files and proof may be affected; distinguish known direct links from inferred possibilities. Reconcile existing work (create only missing tasks), update/activate Story tests as needed, then implement and verify. Deletion is explicit and refuses dangling dependents until reviewed handling is supplied. Already accepted human decisions remain authoritative until deliberately changed. Retain normal Git/source history, not duplicate active product entities.

### 2.3 Aspect definition or applicability changes

For Aspect `Persistency`, the definition is the only policy text owner. The intended relationships include `Aspect --applies-to--> Feature` and the optional `US --has-aspect--> Aspect` graph predicate (**not a US field**). Current implementation uses `Aspect --applies_to--> Feature/UserStory` and does not yet implement `has-aspect`; reconcile this separately without falsely claiming parity. Documented, narrow inheritance may establish further actual applicability. When definition or applicability changes: validate revision → enumerate direct tagged entities and affected downstream Stories, work, code, tests and current proof using grounded graph paths → show exact known affected items plus separately labeled unknown/unlinked possibilities → developer reviews resulting Story/work revisions → invalidate proof tied to changed current policy/scope **prospectively and precisely**; don't reopen unrelated completed history automatically. Avoid implicit Aspect propagation from arbitrary Epic `targets` relationships. Detect/report conflicting applicable policies rather than silently selecting a winner.

### 2.4 Provider or tool fails

A provider failure happens before product work and is reported as such. Don't mutate canonical completion, consume all repair rounds, blame product acceptance, switch models blindly or expand token budgets. Deterministic paths and provided tests/evidence are used before optional discovery. Cache/reuse unchanged evidence within the operation as appropriate, obey existing bounds; no context tours or repeated full dossiers. An operation that cannot finish is resumable or returns a precise missing input/blocked reason, releasing claims and preserving user changes.

## 3. Architecture: existing owners and desired public contracts

Do not prescribe new classes by name before inspecting the actual owner. The following are **responsibilities**, implemented by tightening existing code where possible.

| Owner | Public responsibility / contract |
| --- | --- |
| `graph/ontology.ts`, `graph/types.ts` | First-class typed definitions and existing identities; safe additive/migrated Story fields; canonical test/intent semantics. |
| `product/mutation.ts` + `graph/store.ts` | One validated/versioned canonical create/update/link/unlink/delete path; preview differences, stale-edit refusal and atomic coherent multi-entity commits when required; no partial accepted proposal. |
| `product/process.ts`, `process-types.ts`, `context.ts`, `prompts.ts` | Bounded proposal from current product intent. **Proposal is inert** until edited/explicitly accepted; derivation/reconciliation uses current graph instead of title-only pseudo-identity. |
| `aspects.ts` + existing impact/graph APIs | Single Aspect definition, explicit applicability, inspectable affected paths, narrow documented inheritance and stale-proof detection. |
| `coverage.ts` / `impact.ts` | Keep structural coverage distinct from current execution-based Story satisfaction; show factual links/evidence, unknowns and hypotheses separately. |
| `TestNode` + existing test-runner/verification owner | Story-to-test relation, test runner command/fixture identity, lifecycle, executed results, freshness and attribution. One cohesive test suite can cover multiple cases within one Story. |
| `ticket/{resolve,implementation,verification}.ts` and `change/engine.ts` | Ticket work grounded in approved Story and exact evidence. Deterministic first. Retain Gate 5 protections: guarded source mutation, per-Ticket scope, effective Rules, admission barrier, dirty-file/rename attribution and coherent completion. Avoid repetitive Actor navigation. |
| CLI/shell/MCP plus minimal Workspace UI | Same application/domain operations and authorization. UI edits actual canonical entities, shows proposals and real acceptance evidence; frontend owns presentation, not rules/persistence. |
| Semantika | Canonical graph and existing public optimistic batch. Avoid new transactional API inside AIWF. |
| Import/export owner (prefer existing graph/storage boundary) | Explicit versioned export, safe preview/import/restore, optional one-way documentation export; **no live projection synchronization** once migrated. |

### 3.1 Public operation contracts (logical behaviors, not a demand for duplicate APIs)

- **Read**: view/search relevant canonical product entities, explicit and derived relations, revisions and current proof without global repository scanning.
- **Propose change**: return a *non-mutating* reviewable structured proposal + intended updates/links/deletions + ambiguity/affected items + basis/unknowns. Existing `processIntent` should be split or adapted **at its existing ownership boundary** to satisfy this.
- **Review/edit/accept**: developer modifies proposal and applies an explicit acceptance, enforcing schema, identity, relationship, freshness/expected versions, applicability and coherent persistence. Review must be possible in UI and headless CLI/MCP.
- **Derive/reconcile work**: given accepted intent, find/reuse existing Epics and reviewed Story-oriented public tests *before* deriving/reconciling implementation Todo Tickets from identified unmet test obligations. Preserve stable identities and explicit ambiguity handling; no duplicate work by matching title alone or unconstrained recursion. Technical maintenance can use direct Tickets without fabricated Stories.
- **Execute Story**: from accepted current Story revision, establish controlled initial state, perform action through real public interface, assert expected result/exception/bound; record exact command/fixture/version and applicability. If unable to run, report why.
- **Execute Ticket**: operate in existing governed change machinery; independent acceptance of the actual public outcome; current proof coherent with Ticket state, applicable obligations and source/test revision. Existing semantic critic/LLM may assist but is not the sole oracle.
- **Inspect impact**: on Feature/Story/Aspect change, show graph-grounded affected entities with paths, separately mark inferred unknowns; propose reconciliation rather than blindly modifying all.
- **Export/import**: explicit public operations with portable schema/version, validation, preview, conflict handling and all-or-nothing restore; no implicit disk/DB mtime reconciliation.

### 3.2 Failure and boundary rules

- Provider/auth error ≠ Story failure; expected red ≠ test infrastructure failure; passing unit suite ≠ verified Feature.
- UI/CLI/MCP cannot bypass the same domain validation, permissions and version checks. Mutations never happen simply by displaying/previewing a proposal.
- Exact work/dependency scope must be established before an Actor executes. Out-of-scope unresolved dependency is reported with its exact ID; it is not silently admitted. Standalone verification of already-implemented work should not invoke a coding Actor merely to browse existing source.
- Never promote source without controlled guarded mutation; do not weaken Rule governance in migration. Failed multi-entity writes do not leave partial accepted product intent/Done.
- Source files are not part of SQLite's atomic transaction; existing guarded baseline/dirty/conflict handling remains mandatory.
- Every Stage has a bounded Actor Story, a stop condition and no speculative follow-up. When failure demonstrates a defect, amend only its owner and rerun the relevant Story.

## 4. Testing: Stories are the measure

Canonical Story test format: **given actual initial state → invoke public user/actor action → observe expected outcome**, including relevant Aspect policy and error case. For AIWF itself, use actual public CLI/MCP/Workspace operations and persistent/reopened DBs where needed; for a sample client Feature, use a small real executable fixture application, not mock product logic or only test the generated text. External/model dependencies may be controlled if the actual AIWF product path under test still executes. A proposed Story must be reviewed before its test is authoritative. An accepted Story without a defined public action/fixture may be explicitly uncovered/needs-input, but cannot enter implementation or be called test-covered; a legacy accepted Story may remain uncovered/needs-review during migration; never emit a tautological placeholder as verified behavior.

Test-first on *new* implementation: accepted Story → generate/review runnable public-interface test/suite (skipped only if not started) → identify unmet behavioral obligations → derive/reconcile implementation Todo Tickets from those obligations → activate the same test on Ticket start → run and establish **correctly attributable expected red** → guarded implementation → green → independent current acceptance. A test precedes its derived Ticket; observed red normally follows starting that Ticket. Already-green and technical-only work must not acquire fictional red history. For fixes, existing Story test should reproduce observed malfunction (red), then demonstrate the fix. For already-implemented migrated work, use current behavioral verification; don't force imaginary historical failure. Specialized unit tests only where justified by specific internal complexity/atomicity (e.g., Semantika concurrent batch, leases, critical parser), never as replacement for the public Story. Show Story counts, uncovered/unknown/skipped counts and current evidence; raw test totals do not mean completed product.

### 4.1 Mandatory self-dogfood Stories, to implement across stages

- DW-01 **Define Feature**: Developer opens canonical UI, creates/revises Avatar Filters Feature with priority and explicit Aspect links; reload persists exact accepted definition, no duplicate.
- DW-02 **Edit Story**: Developer views AI-proposed `Save filtered avatar`, edits Intent/State/Action/Result and failure case, accepts it; unaccepted proposals never become authoritative.
- DW-03 **Derive work**: Accepted Feature yields reviewed complete Stories and their public-interface tests first; unmet tests determine necessary scoped implementation Tickets and a coherent Epic. Repeating/revising reuses identities; no Ticket is invented from a title before executable behavioral obligations are known.
- DW-04 **Test-first execution**: Work begins on a real Story; skipped test becomes active, fails for missing behavior through public interface; governed implementation makes that same Story green; unrelated backlog Story remains skipped.
- DW-05 **Aspect blast radius**: Change authoritative Persistency definition; show explicit affected Story/Feature/code/test paths, don't alter unrelated entities; stale current acceptance handled accurately.
- DW-06 **Fix existing**: Developer reports observed bug against existing accepted Story; edit/reconcile same entities, reproduce and fix without inventing a duplicate Feature/Story.
- DW-07 **Existing-evidence resolution**: Agent requests resolution of already-implemented narrow Semantika prerequisite with bounded evidence and working provider; it completes independently or reports exact unmet criterion without redundant FileNode touring, false Done or indefinite retries.
- DW-08 **Portable project**: Explicitly export, restore elsewhere, compare identities/relations/accepted specs/test evidence and operate through public UI/CLI/MCP; no live Markdown dependency.
- DW-09 **Safety negative**: Unapproved proposal, stale edit, conflicting policy, unauthorized secondary file, missing mandatory Rule, failing Story and provider failure never become accepted/verified; failed persistence is coherent.

## 5. UI constraints (simple, powerful, essential)

A small Workspace with search/list/tree + detail/editor, not a giant graph visualization: Product (Goals/Features/Aspects/Stories), Work (Epics/Tickets), Verification (Story/Ticket results) and import/export. Good keyboard operation, meaningful empty/unknown/error states and concise visible source relationships. Story editor gives dedicated controls for Intent, State, Action, Expected Result, relevant exception/bounds and Aspect application, with readable preview; proposal diff shows create/update/link/remove against actual existing identity, and requires explicit Accept. Aspect editor shows definition + tagged items + affected paths before applying changes. Ticket view shows which Story and current evidence it serves, why blocked and what is actually still missing. Use current project stack and the lightest UI implementation compatible with existing shell/CLI environment; choose a browser UI only if it materially improves editing. No React or heavy general UI framework requirement. Shared public domain operations are prerequisite; do not build UI on Markdown or duplicate policies in presentation code.

## 6. Migration/removal constraints

- Migration preserves canonical IDs, relationships, approved intent, existing Ticket claims/lanes and old evidence (with truthful freshness); ambiguously mapped old Story fields remain visible and need developer review; do not auto-accept guessed scenario text.
- Existing accepted Stories may remain legacy until upgraded; they must not silently qualify as executable, fully verified new-format Stories.
- Existing aspect applies/inheritance semantics and Rules are preserved until a tested, explicit replacement is ready; change the minimum supported relations required for intended tagging.
- Back up/export + independent restore before removing bidirectional projections. For live SQLite/WAL, use an appropriate SQLite-consistent backup/closed-store snapshot; copying an active single `.db` file is not proof of a recoverable backup. `.ai-workflow/state` is Git-ignored; tracked Markdown currently provides incidental portability: deleting it first would risk data loss. Do not store credentials, environment secrets or host-specific absolute paths in portable export. Clarify what raw evidence is portable vs references that need fresh validation at destination. Git does **not** become a shadow product DB.
- Canonical DB remains the authority. Preserve the existing legacy two-way Markdown sync while it is still useful and non-destructive; removing it is not a priority for Product Definition & Manifest. Its new explicit human projection is `product-manifest.md`, never an independent editing authority. `aiwf sync` retains code freshness and emits a versioned, Git-trackable/restorable snapshot of non-reproducible authored state. AIWF-managed publication syncs before commit, includes the intended exports (narrow forced Git inclusion if ignored), and checks currentness before push. Keep live SQLite/WAL/cache/secrets ignored: Markdown alone is not full recovery. Source-dependent operations automatically refresh changed files via the existing incremental indexer. Retire old Markdown mtime/import/auto-export machinery only at the separately accepted S8 gate after restore and projection-free operation are proven.
- Do not reopen historical completed Tickets solely for a new Aspect policy or changed spec; invalidate only current claims/proof where actual affected current behavior demands it. Keep normal code history in Git, not duplicate active Stories.

## 7. Standing engineering review ([Dharmax-way](../docs/definitions/dharmax-way.md) / [Prime Directive](../docs/definitions/prime-directive.md))

For *each* meaningful change, answer in this order, concisely and against inspected code:

1. **Concepts**: Which actual product Story/Feature/Aspect changes? Is it developer-approved or still a proposal?
2. **Architecture**: Which existing owner/API/type is responsible? What is reused; what new thing, if any, must exist?
3. **Flow**: Exact caller/callee/data paths; success, exception, cancellation, bounds and persistence. Trace observed failure before adding machinery.
4. **Implementation**: Whole changed methods and immediate callers; no dead branches, shadow state, unjustified abstractions, hidden side effects or misleading status. Smallest coherent correction.
5. **Proof**: What real public Story ran? What initial state/action/observable result? What is still skipped/blocked/unknown? Did it fail for the expected reason before new implementation?

If a proposal cannot answer these, it is not ready to implement. Never elevate a function bug into a new subsystem by default. No philosophical/process vocabulary in place of an exact code/behavior explanation. Add to this design only when an actual missing product concept or demonstrated defect requires refinement.
