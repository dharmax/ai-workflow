# Product Intent Graph — Design

This document is architectural truth for the Product Intent Graph work.

Implementation order and gates are in [product-intent-plan.md](product-intent-plan.md).
The constrained Codex/AIWF execution handoff is in [product-intent-codex.md](product-intent-codex.md).

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
 observable behavior                  |
        ^                             | targets / modifies
        | verifies                    v
       Test                    Module / File / Symbol

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

Existing direct technical work remains valid:

```text
Ticket --implements--> Epic
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

Tickets may participate in several causal links:

```text
Ticket --implements--> Epic
Ticket --implements--> Feature
Ticket --addresses---> UserStory
Ticket --targets-----> Module/File/Symbol
Ticket --modifies----> Module/File/Symbol
```

These links answer different questions and are not redundant:

- implements Epic: which initiative owns this work?
- implements Feature: which capability is this work realizing?
- addresses Story: which behavior does the work satisfy?
- targets/modifies code: where is the implementation?

A Ticket need not have every relation.

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
| Ticket | implements | Epic | Ticket belongs to/implements initiative |
| Ticket | implements | Feature | Ticket directly implements capability |
| Ticket | addresses | UserStory | Ticket implements/changes behavior |
| Ticket | targets / modifies | code node | Work-to-code grounding |
| Test | verifies | Feature/UserStory | Explicit verification evidence |
| Decision | governs | relevant node | Architectural/product constraint |
| any appropriate node | depends_on / blocks | relevant node | Existing dependency semantics |

Do not duplicate these relations in entity fields.

## 5. Product-intent lifecycle is not implementation coverage

A serious source of future bugs would be conflating editorial lifecycle with implementation state.

For Epic, Feature, and UserStory, use only intent lifecycle values:

```ts
type ProductIntentStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'deprecated'
```

Do not write `implemented` or `verified` into Feature/UserStory status based on code state.

Implementation and verification are derived by `coverage()`.

Ticket lifecycle remains Ticket-specific.

Existing broad `EntityStatus` may remain for other entity types; Product Intent operations must enforce the narrower values for these three entities.

## 6. Coverage is derived graph state

Never persist:

```text
complete = true
implemented = true
verified = true
coveragePercent = 80
```

for Epic/Feature/UserStory.

Those values rot immediately when graph edges change.

Expose one deterministic primitive:

```ts
coverage(entityId): Promise<CoverageReport>
```

Conceptually:

```ts
type CoverageState =
  | 'complete'
  | 'blocked'
  | 'structurally_incomplete'
  | 'unimplemented'
  | 'partially_implemented'
  | 'unverified'

interface CoverageReport {
  entityId: string
  entityType: 'Epic' | 'Feature' | 'UserStory'
  state: CoverageState

  satisfied: CoverageFact[]
  missing: CoverageFact[]
  blockers: string[]

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

Exact response types may be slightly smaller, but semantics below are frozen.

### UserStory coverage

For an accepted UserStory inspect:

1. **Feature membership** — incoming Feature `contains` Story.
2. **Acceptance contract** — at least one acceptance criterion.
3. **Implementation work** — incoming Ticket `addresses` Story.
4. **Code grounding** — at least one addressing Ticket reaches code through `targets` or `modifies`.
5. **Verification** — incoming Test `verifies` Story.
6. **Blockers** — incoming active `blocks` relation where applicable.

Coverage does not require every related Ticket to target code. Design/docs/migration tickets may legitimately be related. It requires at least one real grounded implementation path.

State precedence:

```text
active blocker                  -> blocked
no Feature membership/criteria  -> structurally_incomplete
no implementation Ticket        -> unimplemented
Ticket exists but no code path  -> partially_implemented
no verification                 -> unverified
otherwise                       -> complete
```

Draft/proposed Stories still return the same facts, but callers should not treat lack of implementation as project failure until the Story is accepted.

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

Feature verification is satisfied when either:

- an explicit Test verifies the Feature directly; or
- every accepted contained Story is verified.

If neither applies, it is unverified.

### Epic coverage

Inspect:

1. incoming Ticket `implements` Epic;
2. targeted Features/Stories;
3. whether each targeted Feature/Story has at least one causal path from an Epic Ticket:
   - Epic <-implements- Ticket -implements-> Feature
   - Epic <-implements- Ticket -addresses-> Story
4. code grounding of Epic Tickets;
5. verification of targeted intent;
6. blockers.

A purely technical Epic may have zero Feature/Story targets and still become complete through grounded Tickets plus appropriate verification/evidence.

The key Epic invariant is not “must have Stories”; it is:

> If an Epic declares a Feature/Story target, its implementation work must connect back to that target.

## 7. Coverage is path-based, not percentage-based

Do not introduce a numerical completeness score.

The useful questions are categorical:

- Which causal path exists?
- Which expected edge/evidence is missing?
- Which target is unconnected?
- Which behavior is unverified?

A percentage hides exactly the information needed for safe modifications.

## 8. Product impact

Expose one deterministic primitive:

```ts
productImpact(entityId): Promise<ProductImpact>
```

It accepts an Epic, Feature, or UserStory.

It returns the compact semantic neighborhood needed before modification/refactoring:

- starting intent node;
- targeted/containing intent nodes;
- implementing/addressing Tickets;
- direct code targets/modifications;
- verifying Tests;
- governing Decisions;
- directly relevant `depends_on` / `blocks` relationships.

It does **not** duplicate AST blast analysis.

Instead it returns concrete code targets ready for the existing blast/symbol/dependency tools.

This keeps responsibilities clean:

```text
productImpact  -> why/behavior/work/code anchors
blast          -> code consequences
```

No embeddings, cache, RAG layer, or second graph is needed.

## 9. Epic semantic decomposition

The normal human-facing “add an Epic” flow should, by default, propose a complete enough intent model.

Conceptually:

```text
Epic description
    ↓
inspect existing nearby Features/Stories
    ↓
one bounded semantic decomposition
    ↓
proposal:
  reuse Feature A
  create Feature B
  reuse Story C
  create Stories D/E
  unresolved question Q
    ↓
review/edit via shell-ui
    ↓
deterministic apply
```

### Crucial split: propose vs apply

Semantic reasoning never directly mutates the graph.

Use:

```text
proposeEpicStructure(...)
applyEpicStructure(proposal)
```

The proposal is data.

The apply step is deterministic and validates every reference before writing.

This prevents an LLM/actor from partially mutating the graph while still deciding what the Epic means.

### Existing entity reuse

Decomposition must receive relevant existing Feature/Story summaries and explicitly choose:

```ts
action: 'reuse' | 'create'
```

Do not generate near-duplicate capabilities merely because wording differs.

Use existing Semantika/graph search facilities. Do not add embeddings or a second semantic index for this.

### IDs

The model does not invent canonical graph IDs.

After semantic output is validated, host code assigns/reserves IDs for new proposal entities once. Those IDs are returned in the proposal.

Therefore applying the same proposal twice is idempotent rather than creating new IDs each time.

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

The normal interactive command/flow for adding an Epic performs decomposition by default:

```text
add Epic
→ propose structure
→ interactive review
→ apply accepted structure
```

Provide an explicit `--no-decompose` escape hatch for manual/technical Epics.

This gives the desired default behavior without corrupting the deterministic tool layer.

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
  FeatureData + ProductIntentStatus + public report/proposal types

src/graph/ontology.ts
  Feature descriptor only; predicates already exist

src/product/coverage.ts
  deterministic coverage() owner

src/product/impact.ts
  deterministic productImpact() owner

src/product/decompose.ts
  bounded semantic proposal generation + schema validation
  NO graph mutation

src/product/apply.ts
  validate + apply Epic structure proposal
  deterministic/idempotent

src/tools/product.ts
  thin tool registration for Epic/Feature/Story CRUD,
  coverage, impact, propose/apply

src/graph/projections.ts
  product Markdown projections

src/cli.ts / src/shell.ts
  human-facing default Epic flow + display only
```

Do not create separate manager/repository/service classes for Epic, Feature, and Story.

Do not keep both `stories.ts` and `product.ts` after migration unless there is a concrete reason. One small product-intent tool surface is preferable.

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
2. Features outlive Epics; an Epic targets rather than owns a Feature.
3. Stories are optional and never generated as ceremony.
4. Relations live in graph predicates, not duplicated ID fields.
5. Coverage is derived, categorical, and deterministic.
6. Semantic proposal generation cannot mutate the graph.
7. Applying the same accepted proposal twice does not duplicate entities/edges.
8. Low-level CRUD remains deterministic.
9. Human-facing Epic creation decomposes intent by default.
10. Product impact stops at code anchors; AST blast remains the code graph's job.
11. No new generic framework is introduced.
12. Technical work remains representable without fake Features/Stories.
