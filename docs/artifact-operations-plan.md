# Artifact Operations Program — Sole Implementation Plan

Status: **sole authoritative execution plan for the current AIWF program**.

If Codex is given one instruction, it should be:

> Follow `docs/artifact-operations-plan.md` completely. Use AIWF itself as the primary development/navigation/work-management system. Do not invent a parallel plan.

All other documents in `docs/` are **design references**, not competing execution plans. Read them only when this plan or AIWF context makes them relevant.

Do not create additional plan/handoff/status documents for this program. Durable implementation state belongs in AIWF Product Intent/Tickets/graph plus Git.

---

## 1. Program outcome

Turn AIWF from a collection of useful engineering primitives into an engineering system that can own high-level artifacts end-to-end:

~~~
Ticket.investigate() / investigate_ticket
Ticket.prepare()     / prepare_ticket
Ticket.resolve()     / resolve_ticket

UserStory.process()  / process_story
Feature.process()    / process_feature
Epic.process()       / process_epic
~~~

External agents should delegate work to AIWF instead of manually orchestrating symbol/graph/source/refactor/test primitives.

The result must be measurably better: less external repository archaeology, fewer expensive-agent tool calls/tokens where measurable, truthful code intelligence, safe execution, strong completeness/Aspect/Critic handling, and simple implementation.

---

## 2. Non-negotiable working rules

1. **Work on `master`.** Do not create a branch forest. Do not create per-ticket branches. If an external constraint forces a temporary branch, merge/delete it at the first green stable point.
2. **AIWF first.** Use current AIWF graph/Product Intent/ticket/code-navigation tools before reading source broadly.
3. **One active implementation ticket at a time.** Exactly one program ticket should normally be `Todo`/`In Progress`; later gates remain `Backlog` until promoted.
4. **No fixed source-file preload.** Let AIWF identify relevant symbols/files; inspect exact source surgically.
5. **Semantika entity pattern.** Every semantic entity is a real JS/TS class with its DCR. Tightly-related business logic belongs on the entity class. MCP/shell tools are thin load→call→serialize adapters.
6. **No service-layer cosplay.** No `TicketService`, `AspectManager`, generic workflow engine, policy engine, repository layer, or second graph/model unless a concrete acceptance case makes it unavoidable.
7. **Truth before convenience.** Approximate graph facts may discover candidates; correctness-sensitive TS/JS facts use exact language tooling when available.
8. **No hidden state.** Artifact operations are re-entrant over durable graph/project state; `needs_input`/`blocked` returns do not create opaque continuation sessions.
9. **Gate before Done.** Never call `aiwf done` merely because code compiles. All gate acceptance, typecheck, tests, diff/KISS audit and required real proof must pass first.
10. **Preserve user work.** Never reset/stash/clean/commit unrelated user changes automatically.
11. **Commit only green coherent gates.** Keep commits small enough to audit but do not manufacture micro-commits. Sync AIWF projections with the same gate commit.
12. **Cross-package prerequisites are part of the program.** `llm-utils` owns generic System-1 and cognition metrics, but a missing required capability must not terminate this program. Pause the AIWF ticket, implement/verify the smallest required sibling-package gate on that package's `master`, then return, sync, and continue. Never copy sibling-owned machinery into AIWF.

---

## 3. Bootstrap this program into current AIWF

Do this once, idempotently, before implementation.

### 3.1 Establish current state

Run:

~~~bash
aiwf sync
aiwf status
aiwf doctor
aiwf epics
aiwf features
aiwf stories
aiwf tickets
~~~

Inspect only enough graph state to avoid duplicates. Do not read source yet.

### 3.2 Deterministically instantiate the program graph

This plan **already is the decomposition**. Do **not** feed it through today's `propose_epic_structure` and let an older LLM reinterpret it.

Prefer AIWF MCP deterministic Product Intent tools because they support exact IDs and canonical relation validation:

- `create_epic`
- `create_feature`
- `create_user_story`
- `create_ticket`
- `link_product`

Reuse an equivalent existing artifact rather than duplicating it. Prefer the stable IDs below when creating new artifacts. If an equivalent pre-existing artifact has another ID, reuse it and record the mapping once in the AIWF scratchpad.

Create/reuse this Epic:

~~~
EPIC-AIWF-ARTIFACT-OPS
Artifact Operations: AIWF as the Engineering Agent
~~~

Create/reuse these durable Features:

| ID | Capability | Final target |
| --- | --- | --- |
| `FEAT-AIWF-TRUTHFUL-PRIMITIVES` | Truthful, efficient code intelligence/change primitives | production |
| `FEAT-AIWF-ARTIFACT-POLICY` | Completeness/depth/critic operation policy | production |
| `FEAT-AIWF-ASPECTS` | First-class cross-cutting Aspects | production |
| `FEAT-AIWF-TICKET-OPS` | Ticket investigation, preparation and end-to-end resolution | production |
| `FEAT-AIWF-PERFORMANCE-METRICS` | Correlated AIWF + llm-utils performance telemetry | production |
| `FEAT-AIWF-PRODUCT-PROCESSING` | Story/Feature/Epic semantic processing | production |
| `FEAT-AIWF-PRIMARY-INTERFACE` | High-level shell/MCP delegation surface | production |

Create/reuse these UserStories only because they express observable caller behavior:

| ID | Feature | Behavior |
| --- | --- | --- |
| `STORY-AIWF-INVESTIGATE-TICKET` | Ticket Ops | Caller can obtain a grounded Ticket dossier without doing repository archaeology itself |
| `STORY-AIWF-PREPARE-TICKET` | Ticket Ops | Caller can make a broad Ticket executable or receive precise missing-input requirements |
| `STORY-AIWF-RESOLVE-TICKET` | Ticket Ops | Caller can delegate a Ticket and receive verified completion / needs-input / blocked |
| `STORY-AIWF-PROCESS-INTENT` | Product Processing | Caller can process Story/Feature/Epic into the next useful work/intent layer without ceremonial artifacts |
| `STORY-AIWF-DELEGATE-WORK` | Primary Interface | External coding agent can delegate artifact work to AIWF instead of orchestrating dozens of primitives |

Link:

- Epic `targets` every Feature above.
- Feature `contains` its Story/Stories above.

Create/reuse the program Tickets below. Put **only the first unfinished gate in `Todo`**; every later unfinished gate starts in `Backlog`.

| Order | Ticket ID | Implements / addresses |
| ---: | --- | --- |
| 1 | `AIWF-PRIMITIVE-TRUTH` | implements Truthful Primitives |
| 2 | `AIWF-OPERATION-POLICY` | implements Artifact Policy |
| 3 | `AIWF-ASPECTS` | implements Aspects |
| 4 | `AIWF-TICKET-INVESTIGATION` | implements Ticket Ops; addresses Investigate Ticket |
| 5 | `AIWF-TICKET-PREPARATION` | implements Ticket Ops; addresses Prepare Ticket |
| 6 | `AIWF-PERFORMANCE-METRICS` | implements Performance Metrics |
| 7 | `AIWF-TICKET-RESOLUTION-FIRST-PROOF` | implements Ticket Ops; addresses Resolve Ticket |
| 8 | `AIWF-PRODUCT-PROCESSING` | implements Product Processing; addresses Process Intent |
| 9 | `AIWF-PRIMARY-INTERFACE` | implements Primary Interface; addresses Delegate Work |
| 10 | `AIWF-FINAL-DOGFOOD-AUDIT` | Epic-contained final integration/measurement work |

Link the Epic `contains` every Ticket. Link each Ticket to the Feature/Story listed above using canonical `implements` / `addresses` relations.

Today's bootstrap Ticket schema does not yet have structured `acceptanceCriteria`. Put each gate's concise acceptance contract in the Ticket body. After structured Ticket criteria exist, migrate **remaining unfinished Tickets only** to the real field; do not rewrite history needlessly.

Current AIWF does not yet expose the future Ticket→Ticket decomposition semantics required by this program. Do not fake dependency relations. The bootstrap execution order is represented simply by **one Todo ticket at a time**.

After bootstrap:

~~~bash
aiwf sync
aiwf coverage EPIC-AIWF-ARTIFACT-OPS
aiwf audit
~~~

Coverage gaps are expected because implementation has not happened yet. What matters here is that the program graph is coherent and non-duplicated.

---

## 4. Per-ticket execution protocol

Until the new high-level operations replace parts of this protocol, every gate runs like this:

~~~text
aiwf sync
→ aiwf next codex
→ verify it is the expected gate
→ aiwf claim <ticket> --agent codex --minutes 60
→ aiwf move <ticket> "In Progress"
→ AIWF graph/product/code discovery
→ surgical source/design reads only as needed
→ implement
→ focused tests
→ bun run typecheck
→ bun test
→ aiwf diff
→ method/file-level KISS audit
→ aiwf audit
→ aiwf sync
→ aiwf done <ticket>
→ promote the next gate from Backlog to Todo
~~~

Use `aiwf impact <Feature-or-Story>` before substantial changes when it can narrow the semantic/code neighborhood. Use `aiwf symbol`, graph, source, references, blast and test triage only for unresolved details—not as a ritual sequence.

### Progressive dogfooding

The protocol deliberately changes as AIWF improves:

- After Gate 4, call `investigate_ticket` / `Ticket.investigate()` on every subsequent Ticket before manual repository investigation. Manual discovery should become fallback.
- After Gate 5, call `prepare_ticket` / `Ticket.prepare()` on every subsequent Ticket. If it legitimately decomposes work, execute the generated child Tickets rather than bypassing them.
- After Gate 7, `resolve_ticket` / `Ticket.resolve()` becomes the **default executor** for every remaining implementation Ticket. Codex intervenes only for `needs_input`, `blocked`, explicit review, or a demonstrated capability gap.
- After Gate 8, use `process_epic/feature/story` on this program itself to discover remaining semantic gaps.

This self-hosting progression is part of acceptance, not optional polish.

---

## 5. External package gates

### LLMUTILS-SYSTEM1

`AIWF-TICKET-INVESTIGATION` requires the shared System-1 contract/adapters from `@dharmax/llm-utils`.

Before Gate 4, verify the installed/package dependency actually exports the required capability and its tests/version are green. If missing, pause `AIWF-TICKET-INVESTIGATION`, complete `LLMUTILS-SYSTEM1` in `llm-utils` on `master`, verify it there, then return and continue. Do not copy `ai-cli`'s Laya wrapper into AIWF. The shared implementation should generalize the proven ai-cli mechanism; ai-cli should consume the shared primitive rather than remain a second generic Laya wrapper.

### LLMUTILS-PERFORMANCE-METRICS

`AIWF-PERFORMANCE-METRICS` requires llm-utils correlated generic LLM/System-1/Actor metrics.

Verify that gate before Gate 6. If missing, pause `AIWF-PERFORMANCE-METRICS`, complete `LLMUTILS-PERFORMANCE-METRICS` in `llm-utils` on `master`, verify it there, then return and continue before the end-to-end resolution benchmark. The purpose is to measure the proof, not reconstruct telemetry afterward.

---

## 6. Gate 1 — AIWF-PRIMITIVE-TRUTH

### Goal

Make AIWF's low-level hands truthful, fast, and worthy of autonomous use.

### Design references

Read only the relevant sections of `docs/artifact-operations.md` and `docs/causal-change-engine.md` after AIWF context has identified the implementation surface.

### Work

1. Make `aiwf sync` reconcile changed code/index state as well as Markdown projections.
2. Remove unnecessary persistent writes from repeated read/query freshness checks, especially unchanged external dependency indexing.
3. Allow one higher-level operation to perform one bounded freshness reconciliation and reuse that snapshot.
4. Make `get_symbol_source` return the actual symbol body/range when it claims exactness; otherwise explicitly label an excerpt.
5. For correctness-sensitive TS/JS definitions/references/callers, use existing TS LSP facilities; keep AST graph facts for cheap discovery.
6. Add the smallest exact symbol/function replacement capability through the existing safe Causal Change path if current primitives cannot replace a known unit without the caller supplying its old body.
7. Do not build a general AST editor or another exact code graph.

### Acceptance

On the AIWF repository, prove:

- locate a known symbol;
- return its exact source;
- find exact TS references;
- inspect dependencies;
- perform an existing semantic rename/refactor;
- replace one known function/method in a disposable worktree/fixture;
- run its targeted test;
- repeated reads of an unchanged project do not cause graph rewrites/lock noise;
- measured result sizes/timings are recorded for comparison.

Then full typecheck/tests + method-by-method KISS audit.

---

## 7. Gate 2 — AIWF-OPERATION-POLICY

### Goal

Add the tiny shared policy substrate required by artifact operations—nothing more.

### Design reference

`docs/artifact-operations.md` § operation policy/completeness/Critic/depth.

### Work

Implement:

~~~
type CompletenessLevel = 'poc' | 'functional' | 'advanced' | 'production'

interface ArtifactOperationOptions {
  completeness?: CompletenessLevel
  depth?: number | 'all'
  maxArtifacts?: number
  critic?: ArtifactCritic | { id: string } | 'auto' | 'none'
}
~~~

Add optional `completenessTarget` to Module/Epic/Feature/UserStory and a project default. Do **not** persist completeness on Ticket.

Implement deterministic completeness resolution exactly as designed, including scope-specific Ticket completeness context; do not collapse POC Feature + production Module into one semantic scalar.

Add:

- `set_completeness_target`
- `get_completeness_target`
- shared depth/maxArtifacts validation/accounting
- small read-only `ArtifactCritic` contract and transport-ID resolver
- derived `CompletenessAssessment` shape without fake percentages.

Remove/deprecate legacy persisted `Module.completionPercent`; ensure `ProjectHealth.completionPercent` is not presented as semantic completeness.

No real AI Critic yet—use injected test critics only.

### Acceptance

Prove override/inheritance rules, explicit child targets, multi-scope Ticket context, clearing targets, depth semantics and maxArtifacts stop behavior.

Reject generic policy engines, recursive frameworks, critic registries, hard-coded model names, or persisted achieved completeness.

### Dogfood immediately

After this gate, set `production` completeness targets on the program Epic and every durable Feature created in §3. Re-run coverage/completeness views and keep the target state in AIWF.

---

## 8. Gate 3 — AIWF-ASPECTS

### Goal

Make Aspects first-class cross-cutting intent before ticket automation depends on them.

### Design reference

`docs/aspects.md`.

### Work — checkpoint A: entity + graph semantics

Add a real Semantika `Aspect` entity class + DCR using IntentStatus and optional acceptance criteria.

Add only the new `applies_to` predicate and the relation shapes defined in the design:

- Aspect `applies_to` Idea/Module/Epic/Feature/UserStory;
- Ticket `addresses` Aspect;
- Test/Artifact `verifies` Aspect;
- Decision `governs` Aspect.

Aspect-local behavior lives on `Aspect`; applicable-Aspect behavior lives on the relevant entity classes, backed only by small bounded helpers where genuinely cross-entity.

Extend the existing Product Intent/Causal Change mutation owner. No `AspectService`, `AspectChange`, taxonomy framework or shadow graph.

Add deterministic CRUD/query + `aspects.md` projection with single relation ownership.

### Work — checkpoint B: applicability + assessment

Implement bounded `get_applicable_aspects` semantics exactly from the design—no unrestricted inheritance traversal.

Implement derived structural Aspect assessment: applicable concerns, addressing work, tests/evidence artifacts, governing Decisions and known gaps. No score/percentage.

### Work — checkpoint C: cognition

Use System-1 only to shortlist candidate missing Aspects from a bounded vocabulary/project set. Reasoning/Critic adjudicates materiality. No AI silently persists an Aspect.

### Acceptance

Prove Feature direct Aspect, Story inheritance, Epic→contained-Ticket applicability without contaminating targeted Feature, Module→targeting Ticket, parent/child Ticket handling, dedup/cycle safety, evidence via code/test/report/Decision, and both omission + anti-ceremony behavior.

### Dogfood immediately

Create/reuse and apply at least these **material** Aspects to this program where appropriate:

- `Maintainability / KISS` — program Epic;
- `Robustness / truthfulness` — Truthful Primitives and Ticket Ops Features;
- `Execution efficiency / token attention` — Ticket Ops and Primary Interface Features.

Do not add irrelevant standard Aspects merely to exercise the feature.

Run Aspect assessment on the program before proceeding.

---

## 9. Gate 4 — AIWF-TICKET-INVESTIGATION

### Goal

Implement `Ticket.investigate()` plus thin `investigate_ticket` transport operation.

### External gate

`LLMUTILS-SYSTEM1` must be available.

### Work

1. Add structured Ticket `acceptanceCriteria?: string[]`.
2. Allow Decision `governs` Ticket.
3. Centralize coherent Ticket lane/status transitions and fix current Blocked→planned behavior.
4. Investigation is semantically read-only; code-index freshness may update.
5. Gather mandatory graph/Product/Decision/Lesson/Aspect/code/test evidence first.
6. Run one compact batched System-1 assessment for work kind/scope/atomicity/reasoning depth/context families.
7. Deterministically retrieve a bounded optional candidate set; System-1 may rank/prune only optional candidates, never mandatory evidence.
8. Use bounded reasoning only for unresolved semantics.
9. Return dossier + proposed enrichments + provenance + disposition (`ready`, `needs_preparation`, `rejectable`) or shared `needs_input`/`blocked`.
10. Investigation itself never writes semantic enrichments, creates children, edits code, or moves lane.

### Acceptance

Prove:

- well-grounded Ticket avoids unnecessary autoregressive calls;
- high-confidence routing avoids irrelevant evidence;
- low confidence/contradiction escalates;
- System-1 unavailable still yields correct behavior;
- stale/missing code target is identified exactly;
- ambiguous product ownership yields `needs_input`, not a guess;
- duplicate/already-satisfied work yields grounded `rejectable`;
- material explicit Aspect is always present and cannot be pruned;
- dossier is substantially more useful than today's manual symbol/graph sequence.

### Dogfood immediately

Run `investigate_ticket` on `AIWF-TICKET-PREPARATION`, save/inspect the dossier, and use it as the primary context for Gate 5.

---

## 10. Gate 5 — AIWF-TICKET-PREPARATION

### Goal

Implement `Ticket.prepare()` plus thin `prepare_ticket`, ordinary Ticket→Ticket decomposition, and the first real Critic path.

### Work

1. Add exactly `Ticket --contains--> Ticket`; no SubTask/ManagementTicket/Plan entity.
2. Start from semantically read-only investigation.
3. If no enrichment/decomposition is needed, return quickly.
4. Claim before the first durable mutation.
5. Apply confirmed investigation enrichments through the canonical safe mutation path.
6. Use System-1 only as atomic-vs-split/escalation hint.
7. When decomposition is genuinely useful, reasoning model proposes a small coherent child set with bodies + acceptance criteria + relevant Product/Aspect/code relations.
8. Add `depends_on` only when real ordering exists and the canonical graph path supports it.
9. Before apply: selected Critic reviews proposal → accept/revise/needs_input/reject → deterministic validation → apply.
10. Built-in `critic=auto` must use an independent review context; advanced/production must not rely on producer self-critique.
11. Bound revision attempts; no silent completeness downgrade.
12. Rerun is idempotent and reuses children.
13. Release leases acquired by the call before returning `needs_input`/`blocked`.

### Acceptance

Prove atomic Ticket remains atomic, broad Ticket decomposes meaningfully, technical Ticket needs no fake Story, rerun creates no duplicates, dependency cycles reject, Critic catches omission/duplication/ceremony, Critic revision converges, custom critic works, `critic=none` bypasses only semantic critic—not deterministic validation.

### Dogfood immediately

Run `prepare_ticket` on `AIWF-PERFORMANCE-METRICS` and `AIWF-TICKET-RESOLUTION-FIRST-PROOF`. Honor any justified child decomposition rather than bypassing it.

---

## 11. Gate 6 — AIWF-PERFORMANCE-METRICS

### Goal

Land enough correlated telemetry to measure the first real end-to-end resolution proof.

### External gate

`LLMUTILS-PERFORMANCE-METRICS` must be available.

### Design reference

`docs/performance-metrics.md`.

### Work

1. Create one trace ID per high-level artifact operation and propagate llm-utils `MetricsContext`.
2. Collect AIWF-owned deterministic counters/outcomes only; never duplicate llm-utils LLM/System-1/Actor token/latency accounting.
3. Produce compact run summaries: operation/artifact/policy/outcome, version/model/backend, artifact visits/creates/reuse, tool/source/edit/test counts, critic rounds, System-1 routing/pruning, correlated LLM usage, verification.
4. Persist one JSON line per completed operation in gitignored `.ai-workflow/metrics.jsonl`; metrics failure never fails engineering work.
5. Repurpose/extend `aiwf metrics` to query/filter useful performance aggregates by operation/artifact/time/tag.
6. No prompt/source/output/tool-argument content in metrics.

### Acceptance

Prove restart persistence, no duplicate token accounting, correlation across investigate/prepare + nested llm-utils calls, no content leakage, useful median/p95/outcome/repair/System-1/Critic/evidence-reduction metrics, and negligible instrumentation overhead.

Do not build a dashboard, telemetry platform, OpenTelemetry layer, metric graph entities, or synthetic quality score.

---

## 12. Gate 7 — AIWF-TICKET-RESOLUTION-FIRST-PROOF

### Goal

Implement `Ticket.resolve()` plus thin `resolve_ticket` and prove that AIWF can actually own engineering work end-to-end.

### Deterministic lifecycle

~~~text
investigate
→ claim before first mutation
→ prepare if needed
→ resolve ready leaf work
→ targeted verification
→ bounded repair
→ verify Ticket acceptance + material Aspects
→ verified/Done
→ release
→ sync
~~~

Parent Tickets use a bounded child work set, cycle detection and dependency order. Do not implement uncontrolled recursive agent calls.

### Cognition

- deterministic evidence first;
- System-1 for optional evidence pruning, mechanism/failure classification and model-tier hint;
- context-manager to pack surviving evidence where useful;
- Asker for synthesis not requiring tools;
- LLMActor only when implementation genuinely requires tool interaction;
- exact refactor/edit/test primitives first choice.

Workspace safety: inspect Git state after targets are known; unrelated dirty files may remain, dirty target requires `needs_input` by default; never reset/stash/commit user work automatically.

### Acceptance

Prove with deterministic tests/fixtures plus real controlled work:

- surgical code fix;
- function-level change;
- safe TS refactor;
- parent with children;
- needs-input case;
- failed-test repair loop;
- unrelated dirty file allowed;
- dirty target safely stops;
- no Done unless acceptance is explicitly verified;
- metrics record the complete run.

### Mandatory dogfood transition

After this gate is green, **stop manually implementing later program Tickets by default**.

Use `resolve_ticket` for:

- `AIWF-PRODUCT-PROCESSING`
- `AIWF-PRIMARY-INTERFACE`
- `AIWF-FINAL-DOGFOOD-AUDIT`

Codex may intervene only when the operation returns `needs_input`/`blocked`, or when a concrete bug in `resolve_ticket` itself must be fixed. Such bugs become child Tickets and are resolved through the same system once fixed.

---

## 13. Gate 8 — AIWF-PRODUCT-PROCESSING

### Goal

Implement entity-owned:

~~~
UserStory.process() ↔ process_story
Feature.process()   ↔ process_feature
Epic.process()      ↔ process_epic
~~~

### Design references

`docs/artifact-operations.md`, `docs/product-intent-graph.md`, `docs/aspects.md`.

### Rules

- Story reconciles existing work and creates/reuses only necessary addressing Tickets.
- Feature creates/reuses meaningful Stories when they clarify observable behavior; direct Tickets remain valid for technical work.
- Epic reuses stable Features/Stories; technical Epics may create direct Tickets.
- Preserve `Epic targets Feature/UserStory` and `Epic contains Ticket`; never make Epic own Feature.
- completeness controls thoroughness, not counts;
- depth controls artifact expansion depth; Aspect discovery itself does not consume depth;
- maxArtifacts bounds breadth;
- every generated batch is reviewed before apply;
- advanced/production depth>1 receives final root-level cross-layer Critic review;
- raising completeness fills gaps idempotently; lowering never deletes valid work;
- applicable Aspects and materially missing candidate Aspects participate in proposal/Critic review.

Epic processing normally uses stronger-than-minimal reasoning after deterministic retrieval + System-1 candidate narrowing.

### Acceptance

Prove Feature/Story reuse, technical Epic without fake Stories, Story→useful Ticket work, ambiguity→needs_input, rerun idempotence, no duplicate intent/work, coherent Coverage/Impact/AspectAssessment, and POC→production upgrade that adds only genuinely missing work.

### Dogfood immediately

Run `process_epic` on `EPIC-AIWF-ARTIFACT-OPS` with:

~~~
completeness: production
depth: 1
critic: auto
~~~

Review and accept only real missing intent/work. Do not allow the new processor to manufacture ceremonial artifacts merely to make its own graph look richer.

---

## 14. Gate 9 — AIWF-PRIMARY-INTERFACE

### Goal

Make artifact-level operations the obvious first-choice shell/MCP/skill surface.

### Work

1. Shell help/natural-language flow prioritizes `resolve_ticket`, `prepare_ticket`, `investigate_ticket`, `process_epic/feature/story`.
2. Shell/MCP expose `completeness`, `depth`, `maxArtifacts`, `critic` consistently; remembering completeness is explicit via completeness-target operations, never a hidden side effect.
3. Installed AIWF skill tells external coding agents to **delegate artifact work first** and use primitives only for explicit drill-down/debugging.
4. Existing low-level primitives remain available.
5. Measure whether legacy bucket-router/WorkflowActor responsibilities are now redundant. Remove/simplify only what the new operations demonstrably replace; do not introduce semantic-registry merely for architectural symmetry.
6. Update README/examples to show the new preferred workflow using commands that are actually verified.

### Acceptance

An external coding agent given a Ticket should naturally invoke high-level AIWF rather than reproduce the old status→graph→symbol→slice→blast choreography.

---

## 15. Gate 10 — AIWF-FINAL-DOGFOOD-AUDIT

### Goal

Use the completed system on itself and produce measured evidence that the program succeeded.

### Self-review

Run the program Epic through the final high-level system:

1. production completeness;
2. applicable Aspect assessment;
3. `critic=auto`;
4. bounded processing/resolution of any real remaining gaps;
5. Product Coverage and Product Impact;
6. `aiwf doctor`, `aiwf audit`, full typecheck/tests;
7. full repository diff/code-method KISS audit.

No known program gap may be hidden merely to complete the Epic. Conversely, do not generate ceremony to chase an imaginary score.

### Controlled A/B measurement

Use a historical engineering task with a known-good outcome from before this program; prefer the prior `AIWF-PRODUCT-CHANGE` task if it can be reconstructed safely.

Compare the same external model/task under:

~~~
A: normal repository/tool workflow
B: high-level AIWF delegation first
~~~

Measure:

- correctness/acceptance outcome;
- external paid tokens when actually available;
- external source reads/tool calls;
- AIWF internal LLM/System-1 tokens/cost/latency;
- wall time;
- user interventions;
- evidence-candidate reduction;
- Critic revisions;
- first-pass verification/repair loops.

Do not claim paid-token savings unless measured.

### Final program state

- all program Tickets terminal and truthful;
- no active leases;
- no unintended Blocked/In Progress work;
- program Features/Stories/Aspects coherent;
- Epic coverage/Aspect/completeness assessment has no known material gap at production target;
- master green and clean;
- projections synced;
- relevant README/skill docs current;
- Epic marked completed only now.

Produce one concise final report from measured facts. Do not create a new handoff document.

---

## 16. Global rejection criteria

Stop and simplify if implementation introduces:

- generic workflow/state-machine infrastructure;
- a second Product/project graph;
- Service/Manager/Repository wrappers around Semantika entity behavior;
- persisted operation sessions/resume tokens;
- duplicate context/vector/search system;
- hidden LLM writes to canonical semantics;
- broad tool catalogs rendered to every Actor step;
- arbitrary decomposition/count thresholds;
- Aspect taxonomy bureaucracy or percentage scores;
- persistent achieved-completeness flags;
- duplicate LLM/System-1 metric accounting;
- prompt/source logging in metrics;
- a new entity/predicate without a concrete acceptance case;
- complex code for a simple artifact lifecycle.

The governing rule remains:

> **If a simple engineering operation looks architecturally complicated in code, treat that as a defect and simplify it.**

---

## 17. Design-reference map

Use this map only when a gate needs semantic detail. Do not preload all documents:

| Gate | Design reference |
| --- | --- |
| Primitive Truth | `docs/causal-change-engine.md`, relevant primitive sections of `docs/artifact-operations.md` |
| Operation Policy / Ticket Ops / Product Processing / Primary Interface | `docs/artifact-operations.md` |
| Aspects | `docs/aspects.md` |
| Product relations/coverage/impact | `docs/product-intent-graph.md`, `docs/product-change.md` |
| Performance Metrics | `docs/performance-metrics.md` |

`docs/product-intent-graph.md` contains an intentionally unresolved future question about directional relation propagation (downward inheritance vs upward union per relation family). **Do not design or implement a generic propagation mechanism in this program.**