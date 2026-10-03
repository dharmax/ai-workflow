# Product Intent Graph — Design

Status: authoritative architectural truth for AIWF Product Intent. The core graph is implemented; Ticket acceptance criteria and Ticket→Ticket containment documented below are the explicit next extensions required by [artifact-operations.md](artifact-operations.md).

## 1. Purpose

AI Workflow should make a software project causally navigable from intent to evidence.

For any meaningful change, the graph should cheaply answer:

1. Why does this exist?
2. Which stable capability does it serve?
3. Which observable behavior does it provide?
4. What work implements it?
5. Which code realizes it?
6. What proves it works?
7. What else is affected if it changes?

The Product Intent Graph supplies the missing intent/behavior layers above the existing Ticket → Code graph.

It is not a Scrum framework and not a requirements-management product.

## 2. Frozen conceptual model

```text
                    Epic
                 initiative/work
                     |
                   targets
                     v
        +--------- Feature ---------+
        |      stable capability    |
        |                           |
        | contains                  | implemented by
        v                           ^
    UserStory <----- addresses ----- Ticket
 observable behavior                  ^   |
        ^                              |   | targets / modifies
        | verifies              contains  v
       Test                        Epic   Module / File / Symbol

Decision --governs--> any relevant intent/code node
```

An Epic is deliberately **not the owner of a Feature**.

Features are durable capabilities. Epics are temporary initiatives that may create, extend, repair, migrate, or refactor the same Feature over time.

Therefore the canonical Epic relation is:

```text
Epic --targets--> Feature
Epic --targets--> UserStory   // when the Epic specifically changes/introduces that behavior
```

not:

```text
Epic --contains--> Feature
```

This distinction is essential for long-lived semantic change navigation.

## 3. Entity semantics

### Epic

A substantial initiative/objective/workstream.

Examples:

- Connector first proof
- Replace legacy persistence layer
- Add shared calendars
- Improve scheduler reliability

An Epic is work scope, not a permanent product capability.

Epic scopes its executable work:

```text
Epic --contains--> Ticket
```

An Epic does **not** require a Feature or UserStory if it is genuinely technical.

### Feature

A stable product/system capability that remains meaningful even when its implementation changes.

Examples:

- Calendar event creation
- Durable scheduled execution
- Contact search
- Session history persistence

Minimal intrinsic data:

```ts
interface FeatureData extends BaseEntityData {
  acceptanceCriteria?: string[]
}
```

Do not store Epic IDs, Story IDs, Ticket IDs, code IDs, or Test IDs on the entity. Those are graph relations.

Do not add a feature-kind taxonomy in the first proof.

### UserStory

An observable behavior or stakeholder outcome belonging to a Feature.

Existing useful fields remain:

```ts
interface UserStoryData extends BaseEntityData {
  actor?: string
  story?: string
  context?: string
  acceptanceCriteria?: string[]
  sla?: string
}
```

The entity is called UserStory, but generated text is not required to use ceremonial “As a … I want …” phrasing.

A UserStory is optional. Never manufacture stories merely to satisfy a hierarchy.

Good:

```text
Feature: Calendar event creation
  Story: User can create a timed event
  Story: Scheduled agent can create an event after approval
```

Also good:

```text
Epic: Remove obsolete persistence adapter
  Ticket → Code
```

Bad:

```text
Story: As a developer I want to remove an obsolete adapter
```

when there is no real behavioral contract.

### Ticket

Executable implementation work.

A Ticket also owns its own execution acceptance contract:

```ts
interface TicketData extends BaseEntityData {
  lane: TicketLane
  priority?: 'P0' | 'P1' | 'P2' | 'P3'
  acceptanceCriteria?: string[]
  claim?: TicketClaim
  estimateTokens?: number
}
```

Ticket acceptance criteria describe completion of the work item. They do not replace Feature/UserStory behavioral acceptance criteria.

Tickets may participate in several causal links:

```text
Epic   --contains----> Ticket
Ticket --contains----> Ticket
Ticket --implements--> Feature
Ticket --addresses---> UserStory
Ticket --targets-----> Module/File/Symbol
Ticket --modifies----> Module/File/Symbol
```

These links answer different questions and are not redundant:

- Epic contains Ticket: which initiative owns this work?
- Ticket contains Ticket: which ordinary work item decomposes into child work?
- implements Feature: which capability is this work realizing?
- addresses Story: which behavior does the work satisfy?
- targets/modifies code: where is the implementation?

There is no separate SubTask or ManagementTicket entity. A parent Ticket is an ordinary Ticket whose role is expressed by graph relations.

A Ticket need not have every relation.

### Completeness target

Artifact Operations add one durable **desired** completeness target to work/product scopes:

```ts
type CompletenessLevel = 'poc' | 'functional' | 'advanced' | 'production'
```

The optional `completenessTarget` field is valid on:

- Module;
- Epic;
- Feature;
- UserStory.

It expresses the desired engineering/product thoroughness for future processing. It does **not** claim the artifact currently meets that level.

Ticket deliberately has no persisted completeness target. Ticket completion is its explicit acceptance contract; tickets inherit/run under the relevant Module/Epic/Feature/UserStory target or operation override.

Current completeness remains derived from Product Coverage, acceptance evidence, tests and semantic review under the selected profile.

Do not persist achieved completeness, completeness percentages, or `productionReady=true`.

Effective-target inheritance and operation overrides are defined in `artifact-operations.md`; Product Intent stores only explicit artifact targets.

### Test

Evidence.

```text
Test --verifies--> UserStory
Test --verifies--> Feature
```

A direct Feature verification is allowed for capability-level integration/acceptance tests.

Tests that merely happen to touch the same source file are not automatically behavioral verification. The verifies edge is explicit semantic evidence.

### Decision

Existing relation remains:

```text
Decision --governs--> Epic/Feature/UserStory/Ticket/Module/File/Symbol
```

No new decision subsystem is part of this work.

## 4. Canonical predicates

Use existing predicates. Do not add product-specific predicates unless implementation proves one is genuinely impossible to express.

| Source | Predicate | Target | Meaning |
| --- | --- | --- | --- |
| Epic | targets | Feature | Initiative affects/creates/changes capability |
| Epic | targets | UserStory | Initiative specifically affects behavior |
| Feature | contains | UserStory | Behavior belongs to stable capability |
| Epic | contains | Ticket | Initiative scopes executable work |
| Ticket | contains | Ticket | Work item decomposes into child work |
| Ticket | implements | Feature | Ticket directly implements capability |
| Ticket | addresses | UserStory | Ticket implements/changes behavior |
| Ticket | targets / modifies | code node | Work-to-code grounding |
| Test | verifies | Feature/UserStory | Explicit verification evidence |
| Decision | governs | relevant node | Architectural/product constraint |
| any appropriate node | depends_on / blocks | relevant node | Existing dependency semantics |

Do not duplicate these relations in entity fields.

## 5. Lifecycle is not implementation coverage

Do not force Epic, Feature, and UserStory through one shared status model.

They represent different things.

### Epic lifecycle

An Epic is an initiative/work scope:

```ts
type EpicStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'completed'
  | 'cancelled'
```

Epic completion is project/workflow state. Do not derive it merely from code edges.

### Feature / UserStory lifecycle

Feature and UserStory are durable intent artifacts:

```ts
type IntentStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'deprecated'
```

Do not write `implemented`, `verified`, or `completed` into Feature/UserStory status based on code state.

Implementation/verification evidence is derived from graph coverage.

### Existing data

The current broad base `status` field may remain for compatibility with Semantika and other entity types, but product tools and product projections must normalize/enforce the appropriate lifecycle above.

Do not build a migration framework preemptively. If real persisted legacy Epic/UserStory statuses exist, handle the concrete observed values with the smallest deterministic mapping.

## 6. Coverage is derived structural/causal graph state

Never persist:

```text
complete = true
implemented = true
verified = true
coveragePercent = 80
```

for Epic/Feature/UserStory.

Those values rot immediately when graph edges change.

Coverage deliberately answers:

> Given the semantic entities we already know about, are their expected causal connections present?

It does **not** claim:

> We have discovered every requirement, behavior, code path, or test that ought to exist.

Semantic completeness is established by design/digest/decomposition passes. Once intent nodes exist, coverage deterministically checks whether they are causally connected to work, code, and evidence.

Expose one deterministic primitive:

```ts
coverage(entityId): Promise<CoverageReport>
```

Conceptually:

```ts
interface CoverageGap {
  kind:
    | 'missing_parent'
    | 'missing_acceptance_contract'
    | 'missing_work'
    | 'missing_code_grounding'
    | 'missing_verification'
    | 'missing_target_path'
    | 'blocked'
  message: string
  relatedIds?: string[]
}

interface CoverageReport {
  entityId: string
  entityType: 'Epic' | 'Feature' | 'UserStory'

  complete: boolean
  gaps: CoverageGap[]

  related: {
    epics: string[]
    features: string[]
    stories: string[]
    tickets: string[]
    code: string[]
    tests: string[]
  }
}
```

`complete` is a derived convenience meaning **no known structural/causal gaps under this contract**. It is never persisted and must never be described as proof that the product itself is semantically complete.

Coverage is intentionally independent of `completenessTarget`. Artifact Operations combine this structural report with the effective target and semantic/critic review to derive a broader CompletenessAssessment.

Avoid a second rigid workflow-state enum such as `partially_implemented` / `unverified` as canonical data. Callers can derive display labels from `gaps` when useful.

### UserStory coverage

For an accepted UserStory inspect:

1. **Feature membership** — incoming Feature `contains` Story.
2. **Acceptance contract** — at least one acceptance criterion.
3. **Implementation work** — incoming Ticket `addresses` Story.
4. **Code grounding** — at least one addressing Ticket reaches code through `targets` or `modifies`.
5. **Verification** — incoming Test `verifies` Story.
6. **Blockers** — incoming active `blocks` relation where applicable.

Coverage does not require every related Ticket to target code. Design/docs/migration tickets may legitimately be related. It requires at least one real grounded implementation path.

For an accepted Story, each missing expectation becomes a separate gap. Multiple gaps may coexist.

Draft/proposed Stories return the same facts, but callers should not treat their missing implementation/evidence as project failure until the Story is accepted.

### Feature coverage

Inspect:

1. direct implementing Tickets: Ticket `implements` Feature;
2. contained accepted Stories;
3. addressing Tickets of those Stories;
4. code grounding through all relevant implementation Tickets;
5. direct Test `verifies` Feature;
6. Story verification;
7. blockers.

A Feature with no Stories is **not** structurally incomplete merely because Stories are absent.

Feature verification evidence exists when either:

- an explicit Test verifies the Feature directly; or
- accepted contained Stories have verification evidence.

This is **evidence coverage**, not a proof that the Feature's full semantics have been exhausted. Feature-level acceptance criteria that are not represented by Stories may still justify a direct Feature verification Test.

### Epic coverage

Inspect:

1. contained Tickets: Epic `contains` Ticket;
2. targeted Features/Stories;
3. whether each targeted Feature/Story has at least one causal path through a Ticket contained by the Epic:
   - Epic -contains-> Ticket -implements-> Feature
   - Epic -contains-> Ticket -addresses-> Story
4. code grounding of contained Epic Tickets;
5. verification of targeted intent;
6. blockers.

A purely technical Epic may have zero Feature/Story targets and still become complete through grounded Tickets plus appropriate verification/evidence.

The key Epic invariant is not “must have Stories”; it is:

> If an Epic declares a Feature/Story target, its implementation work must connect back to that target.

## 7. Coverage is gap/path-based, not percentage-based

Do not introduce a numerical completeness score.

The useful deterministic output is:

- which expected causal path exists;
- which expected relation/evidence is missing;
- which target is unconnected;
- which known behavior lacks verification.

A percentage hides the exact missing edge needed for safe modification.

## 8. Product impact

Expose one deterministic primitive:

```ts
productImpact(entityId): Promise<ProductImpact>
```

It accepts an Epic, Feature, or UserStory.

It returns the compact semantic neighborhood needed before modification/refactoring.

Scope rules are explicit; do not use unrestricted graph traversal.

### Starting from UserStory

Include:

- containing Feature(s);
- active/planned Epics directly targeting that Story;
- Tickets addressing that Story;
- code directly targeted/modified by those Tickets;
- Tests verifying that Story;
- Decisions governing the Story, its containing Feature(s), or returned code anchors;
- direct blockers/dependencies attached to the returned work/intent nodes.

Do **not** automatically include sibling Stories.

### Starting from Feature

Include:

- contained accepted Stories;
- active/planned Epics targeting that Feature;
- direct Feature-implementing Tickets;
- Tickets addressing contained accepted Stories;
- direct code anchors of those Tickets;
- direct Feature/Story verification Tests;
- governing Decisions;
- direct blockers/dependencies.

Completed/cancelled historical Epics are excluded by default from Feature/Story impact to avoid history noise. They remain queryable through ordinary graph tools.

### Starting from Epic

Include:

- that Epic's targeted Features/Stories;
- Tickets contained by that Epic;
- those contained Tickets' Feature/Story/code edges;
- relevant verification Tests and governing Decisions;
- direct blockers/dependencies.

`productImpact` does **not** duplicate AST blast analysis.

It returns concrete code anchors ready for the existing blast/symbol/dependency tools:

```text
productImpact  -> why / behavior / work / code anchors
blast          -> code consequences
```

No embeddings, cache, RAG layer, or second graph is needed.

## 9. Epic semantic decomposition

The normal human-facing “add an Epic” flow should, by default, propose a complete-enough intent model **before persisting a new Epic**.

Conceptually:

```text
Epic draft (plain data)
    ↓
current bounded product-intent graph
    ↓
one semantic decomposition
    ↓
proposal:
  Epic candidate
  reuse Feature A
  create Feature B
  reuse Story C
  create Stories D/E
  unresolved question Q
    ↓
review/edit via shell-ui
    ↓
deterministic apply
    ↓
Epic + accepted relations persisted together
```

For an already-existing Epic, the same proposal flow may enrich/reconcile its structure.

### Crucial split: propose vs apply

Semantic reasoning never directly mutates the graph.

Use:

```text
proposeEpicStructure(epicDraftOrExistingId)
applyEpicStructure(proposal)
```

The proposal is data.

For a new Epic, proposal generation performs zero graph mutation. Aborting leaves no orphan Epic.

The apply step validates every reference before writing and is safe to retry.

This prevents an LLM/actor from partially mutating the graph while still deciding what the Epic means.

### Existing entity reuse

Decomposition must receive relevant existing Feature/Story summaries and explicitly choose:

```ts
action: 'reuse' | 'create'
```

Do not generate near-duplicate capabilities merely because wording differs.

AI Workflow is defined to operate on a healthy project chunk. For the first implementation, provide the model the **current non-deprecated Product Intent Graph** (Epics only when relevant, Features, Stories, and concise accepted Decisions) rather than inventing fuzzy retrieval that might miss duplicates.

This is product metadata, not the source-code corpus.

If that bounded intent graph itself cannot fit the configured semantic model with safe headroom, fail clearly and ask the user to narrow/clean the project scope. Do not add hierarchical summarization, embeddings, or a second semantic index here.

### IDs

The model never invents canonical graph IDs.

After semantic output is validated, host code assigns stable **candidate IDs** to newly proposed Epic/Feature/Story entities. Those IDs live in the proposal.

There is no separate reservation subsystem.

On apply:

- if a candidate ID is unused, create it;
- if it already refers to the same entity produced by an earlier apply, treat it idempotently;
- if it collides with unrelated state, fail clearly rather than generating another ID mid-apply.

Applying the same proposal twice must not create duplicate entities or edges.

### Unknowns

The decomposition proposal may contain unresolved questions/unknowns.

Do not add an Unknown entity as part of this feature unless the repository already gains one for another reason.

For this slice, unknowns remain explicit proposal items requiring user resolution or acceptance.

Do not hallucinate certainty just to generate Stories.

## 10. “Automatic by default” means UX, not hidden CRUD semantics

Low-level deterministic tools remain deterministic:

- `create_epic`
- `create_feature`
- `create_user_story`

They must not unexpectedly call an LLM.

The normal interactive command for a **new** Epic does not call `create_epic` first. It builds an Epic draft, proposes the structure, reviews it, then applies the accepted proposal.

```text
epic add <draft>
→ propose structure
→ interactive review
→ apply accepted proposal
```

Provide explicit `--no-decompose` for manual/technical Epic creation; that path may call deterministic `create_epic` directly.

For MCP/non-interactive consumers, proposal and apply are separate explicit operations.

## 11. Semantic decomposition implementation boundary

Do not create another general actor framework.

Preferred implementation:

- reuse existing aiwf LLM gateway / `Asker` / model routing;
- make one bounded structured semantic request;
- validate its result with Zod;
- no autonomous ReAct loop;
- no tool mutation during proposal generation.

If current llm-utils offers a clean structured-output helper, use it.

If not, request JSON once and validate/repair only with the smallest existing utility. Do not build a generic structured-agent subsystem.

The existing `WorkflowActor` remains the general interactive actor; it may orchestrate the product tools, but decomposition itself should be a small proposal function.

## 12. Product projections

Canonical state remains Semantika.

Projected files:

- `epics.md`
- `features.md`
- `user-stories.md`
- existing `kanban.md`
- existing `decisions.md`
- existing `modules.md`

### Projection responsibilities

`epics.md`
- Epic text/status
- targeted Features/Stories
- implementing Tickets
- derived coverage summary

`features.md`
- Feature text/status/criteria
- Epics targeting it
- contained Stories
- direct implementing Tickets
- Tests
- derived coverage summary

`user-stories.md`
- Story text/status/criteria/SLA
- containing Feature
- Epics targeting it
- addressing Tickets
- Tests
- derived coverage summary

Coverage output is generated and never imported as canonical state.

Relationship import/export must round-trip exactly. Removing a relationship from an editable projection must remove the graph edge if that relation is owned by that projection.

Do not maintain the same editable relationship in multiple projections. Choose one projection as the edit owner per relation and render it read-only elsewhere.

Suggested ownership:

- Epic `targets` Feature/Story: `epics.md`
- Feature `contains` Story: `features.md`
- Ticket links remain graph/tool owned, displayed read-only in product projections
- Test verification links remain graph/tool owned initially, displayed read-only

This avoids two Markdown files fighting over one edge.

## 13. Proposed source ownership

Keep code small and responsibility-driven.

```text
src/graph/types.ts
  FeatureData + EpicStatus + IntentStatus + report/proposal contracts

src/graph/ontology.ts
  Feature descriptor + small status validators/defaults

src/product/coverage.ts
  deterministic structural/causal coverage owner

src/product/impact.ts
  deterministic bounded productImpact owner

src/product/decompose.ts
  bounded semantic proposal generation + schema validation
  NO graph mutation

src/product/apply.ts
  validate + idempotently apply accepted proposal

src/tools/product.ts
  thin deterministic Epic/Feature/Story CRUD,
  constrained relation mutation,
  coverage/impact/propose/apply registration

src/graph/projections.ts
  product Markdown projections

src/cli.ts / src/shell.ts
  human-facing product flows + display
```

Do not create separate manager/repository/service classes for Epic, Feature, and Story.

Do not keep both `stories.ts` and `product.ts` after migration unless there is a concrete reason. One small product-intent tool surface is preferable.

### Constrained relation mutation

Do not make `link_product_intent` a generic predicate gateway.

The first implementation allows exactly these semantic combinations:

```text
Epic    --targets----> Feature
Epic    --targets----> UserStory
Epic    --contains---> Ticket
Feature --contains---> UserStory
Ticket  --implements-> Feature
Ticket  --addresses--> UserStory
Test    --verifies---> Feature
Test    --verifies---> UserStory
Decision--governs----> Epic | Feature | UserStory
```

Existing generic graph mechanisms continue to own other relations such as `depends_on` and `blocks`.

## 14. Migration from the current partial UserStory branch

The work already done on `feat/user-stories-first-class` is useful but not authoritative.

Keep:

- removal of `epicId` / `linkedTicket` from UserStory canonical data;
- graph-native Ticket `addresses` Story and Test `verifies` Story;
- story CRUD/query ideas;
- projection round-trip tests;
- MCP/CLI/REPL exposure patterns.

Replace:

- direct Epic `contains` Story as canonical structure;
- story-specific coverage booleans;
- story-only tool module if `product.ts` is simpler;
- projection format that assigns the same editable relation to multiple files.

Do not merge this branch until the full deterministic gate passes.

## 15. Explicit non-goals

Do not add:

- Scrum/sprint framework;
- story points;
- numerical coverage scoring;
- Feature taxonomy bureaucracy;
- embeddings/vector search;
- RAG subsystem;
- generic planning workflow engine;
- second actor framework;
- persisted coverage flags;
- automatic Ticket creation during Epic decomposition;
- Unknown/Risk entity system as part of this slice;
- refactoring mutation logic;
- digest dependency;
- Semantic Studio dependency.

Digest integration comes later through graph mapping, not package coupling.

## 16. Design invariants

The implementation is wrong if any of these become false:

1. Semantika is canonical state.
2. Features outlive Epics; an Epic targets Features/Stories but contains its own Tickets.
3. Stories are optional and never generated as ceremony.
4. Relations live in graph predicates, not duplicated ID fields.
5. Coverage is derived, deterministic structural/causal evidence; it never claims undiscovered semantic completeness.
6. Semantic proposal generation cannot mutate the graph.
7. Applying the same accepted proposal twice does not duplicate entities/edges; no ID-reservation subsystem exists.
8. Low-level CRUD remains deterministic.
9. Human-facing new-Epic creation decomposes intent before persisting the Epic by default.
10. Product impact stops at code anchors; AST blast remains the code graph's job.
11. No new generic framework is introduced.
12. Technical work remains representable without fake Features/Stories.
