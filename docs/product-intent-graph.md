# Product Intent Graph — Design and Implementation Plan

Status: design for replacing the partial UserStory feature branch with a coherent product-intent graph.

## Goal

Make AI Workflow answer, cheaply and reliably:

- why does this code exist?
- what user-visible/system behavior does this change serve?
- what implements this behavior?
- what verifies it?
- what is incomplete or unverified?
- what would a requested modification affect?

The graph should support lightning-fast, bounded change/refactoring analysis without forcing every project into Scrum ceremony.

## Core model

```text
Epic
  └─ contains → Feature
       └─ contains → UserStory
            ← addresses ─ Ticket
            ← verifies  ─ Test

Ticket
  ├─ targets  → Module/File/Symbol
  └─ modifies → Module/File/Symbol

Decision
  └─ governs → Epic/Feature/UserStory/Module/File/Symbol

Unknown / Idea / Risk-like planning artifacts
  └─ relates to the layer they constrain
```

### Semantics

- **Epic** — substantial objective or workstream.
- **Feature** — stable product/system capability. This is the key bridge between intent and implementation and should survive implementation restructuring.
- **UserStory** — observable behavior or stakeholder outcome. Optional; only create when behavior/actor semantics are meaningful.
- **Ticket** — executable implementation work.
- **Code entities** — actual implementation.
- **Test** — evidence that behavior works.

Technical work may legitimately bypass UserStory:

```text
Epic → Feature → Ticket → Code
```

or, for purely internal work:

```text
Epic → Ticket → Code
```

Do not invent fake "As a developer..." stories.

## Canonical relations

Prefer existing generic predicates where they are semantically clear.

- Epic `contains` Feature
- Feature `contains` UserStory
- Ticket `addresses` UserStory
- Ticket `implements` Feature when no story is appropriate or when the ticket implements capability-level work
- Ticket `targets` / `modifies` code nodes
- Test `verifies` UserStory
- Test `verifies` Feature when testing capability-level behavior directly
- Decision `governs` relevant intent/code nodes
- `depends_on`, `blocks` remain generic dependency relations

Do not duplicate these relations as `featureId`, `epicId`, `linkedTicket`, etc.

## Feature entity

Add a durable `Feature` entity with only fields intrinsic to the feature, for example:

```ts
interface FeatureData extends BaseEntityData {
  acceptanceCriteria?: string[]
}
```

Do not put graph references into FeatureData.

Feature status remains ordinary EntityStatus.

## Derived coverage, never stored booleans

Completeness must be derived from graph state rather than stored as stale flags.

### UserStory coverage

A story may report:

- has parent Feature
- has implementation Ticket(s)
- implementation Tickets have code targets/modifications
- has verification Test(s)
- acceptance criteria present
- unresolved blockers/unknowns

Example:

```text
STORY-23
feature:        ✓
implementation: ✓
code grounding: ✓
verification:   ✗
criteria:       ✓
coverage: implementation-unverified
```

### Feature coverage

Feature coverage aggregates:

- Story coverage where stories exist
- direct implementing Tickets
- code grounding
- direct/indirect verification
- unresolved blockers
- whether meaningful behavior is represented

### Epic coverage

Epic coverage aggregates:

- Feature coverage
- direct technical Tickets not represented as Features
- unresolved work/blockers

## Generic coverage primitive

Introduce one graph-native operation:

```ts
coverage(entityId): CoverageReport
```

Conceptually:

```ts
type CoverageReport = {
  entityId: string
  entityType: string
  state:
    | 'complete'
    | 'unimplemented'
    | 'partially_implemented'
    | 'unverified'
    | 'blocked'
    | 'structurally_incomplete'

  satisfied: CoverageRequirement[]
  missing: CoverageRequirement[]
  blockers: string[]

  related: {
    epics?: string[]
    features?: string[]
    stories?: string[]
    tickets?: string[]
    code?: string[]
    tests?: string[]
  }
}
```

Coverage rules are deterministic graph logic where possible.

The LLM is not required to calculate whether a known edge exists.

## Epic creation and automatic semantic decomposition

Add a first-class `create_epic` operation.

Default behavior should be:

```text
create Epic
   ↓
semantic decomposition proposal
   ↓
Features
   ↓
User Stories where behavior warrants them
   ↓
coverage review
   ↓
interactive accept/edit/reject
   ↓
commit graph relations
```

Important: creation of the Epic itself is deterministic. Automatic decomposition is semantic and must not silently mutate the graph without an explicit accepted proposal unless configuration later opts into that behavior.

### Synthesis contract

Given an Epic, the planning actor asks:

> What stable Features and meaningful User Stories are required to cover this Epic sufficiently?

It should:

- preserve explicit Feature/Story descriptions already supplied;
- avoid duplicating existing graph entities;
- create Features for stable capabilities;
- create User Stories only for meaningful observable behavior;
- surface missing decisions/unknowns instead of hallucinating certainty;
- identify purely technical work that should remain Feature/Ticket-only.

## Product-intent planning actor

This should be a small bounded actor/workflow, not a second general actor framework.

Inputs:

- Epic/Feature description
- nearby product-intent graph
- existing relevant Decisions
- code graph only when grounding is useful

Outputs:

- proposed Features
- proposed UserStories
- relations
- uncovered aspects/questions

The actor should not create Tickets by default during Epic decomposition. Ticket decomposition belongs to planning/digest or an explicit "operationalize" action.

This preserves layers:

```text
Epic creation
→ intent/behavior model

Digest / planning
→ executable Tickets

Implementation
→ code targets

Verification
→ tests
```

## Modification request flow

A user request such as:

> Calendar events should optionally support attendees.

should resolve semantically first:

```text
request
  ↓
resolve Feature/UserStory
  ↓
coverage + impact traversal
  ↓
bounded affected subgraph:
  Feature
  Stories
  Tickets
  Code
  Tests
  Decisions
  ↓
LLM reasons only over relevant subgraph
  ↓
safe change/refactor plan
```

This is a primary acceptance goal, not a future side effect.

## Commands / tools

### Product-intent CRUD

- `create_epic`
- `get_epic`
- `list_epics`
- `create_feature`
- `update_feature`
- `get_feature`
- `list_features`
- `create_user_story`
- `update_user_story`
- `get_user_story`
- `list_user_stories`

Avoid a combinatorial explosion of special link tools. Prefer one constrained graph relation operation for product-intent entities if the existing generic graph tool is not safe enough.

### Semantic operations

- `decompose_epic` — propose Features/Stories
- `coverage` — deterministic coverage report
- `product_impact` — bounded intent→implementation→verification subgraph for a Feature/Story/Epic

`product_impact` should compose existing graph traversal/blast primitives rather than reimplement them.

## Projections

Replace the current story-only projection approach with coherent product views.

Suggested first version:

- `epics.md` — Epics with contained Features and high-level coverage
- `features.md` — Features with Stories, direct Tickets, status/coverage
- `user-stories.md` — behavioral specs with Feature, Tickets, Tests, criteria, coverage
- `kanban.md` — Tickets only
- existing `decisions.md`, `modules.md`

All relations remain graph-derived and bidirectional where editing is supported.

Do not make Markdown the canonical representation.

## UserStory branch migration

The current `feat/user-stories-first-class` work is useful but should not be merged as-is.

Keep:

- removal of `epicId` / `linkedTicket`
- story tools
- graph-native Story relations
- projection round-trip fixes
- story coverage tests
- MCP/CLI/REPL exposure work where still appropriate

Revise:

- Epic → Story direct relation becomes primarily Epic → Feature → Story
- Story coverage should use generic `coverage()`
- projections should include Features
- story tools should fit the broader product-intent API
- branch should be renamed/replaced by `feat/product-intent-graph` if convenient

## Implementation phases

### Phase 1 — Ontology normalization

1. Add Feature entity/data.
2. Keep UserStory graph-reference-free.
3. Define canonical relation semantics.
4. Add ontology tests for:
   - Epic → Feature
   - Feature → UserStory
   - Ticket → UserStory
   - Ticket → Feature
   - Test → UserStory/Feature
5. Ensure no duplicate foreign-key-like relationship fields remain.

Gate: graph model is coherent without any LLM feature.

### Phase 2 — Deterministic coverage engine

1. Implement `coverage(entityId)`.
2. Support Feature and UserStory first.
3. Add Epic aggregation.
4. Include code grounding from Ticket targets/modifies.
5. Include verification edges.
6. Include blockers/dependencies where available.
7. Add tests for complete, partial, unimplemented, unverified, and technical-no-story cases.

Gate: coverage is fully useful with manually created graph data.

### Phase 3 — First-class product-intent tools

1. Epic CRUD/list.
2. Feature CRUD/list.
3. Story CRUD/list.
4. Relation operations.
5. CLI/REPL/MCP exposure.
6. Update `doctor`/status/product mode where useful.

Gate: a human or coding agent can construct and inspect the full graph without LLM synthesis.

### Phase 4 — Projections

1. Add `features.md`.
2. Update `epics.md` hierarchy.
3. Update `user-stories.md`.
4. Make import/export relation reconciliation truly bidirectional.
5. Preserve manual status/accepted state appropriately.

Gate: projection round-trip tests pass without relation drift.

### Phase 5 — Epic decomposition actor

1. Add semantic proposal types.
2. Add `decompose_epic`.
3. Reuse shell-ui for interactive review.
4. Deduplicate against existing Feature/Story graph.
5. Allow:
   - accept all
   - accept individually
   - edit
   - reject
   - mark missing decision/unknown
6. Default Epic creation should offer/run decomposition according to UX/config, but not silently commit unreviewed semantic output.

Gate: representative Epics produce sensible Features/Stories without agile theater.

### Phase 6 — Product impact primitive

1. Resolve Epic/Feature/Story targets.
2. Traverse downward to Tickets/code/tests and sideways to Decisions/dependencies.
3. Return a compact bounded subgraph.
4. Reuse code blast analysis where appropriate.
5. Add tests proving irrelevant code is excluded.

Gate: a modification request can be grounded to a small precise graph region.

### Phase 7 — Integration with digest

Do not couple aiwf to aiwf-digest internally.

Instead define a clean mapping:

```text
Digest operational graph
→ Epic
→ Feature
→ UserStory
→ Ticket proposals
→ aiwf graph reconciliation
```

Digest may produce Features/Stories directly; aiwf coverage validates the imported result.

Gate: one real digest-generated plan imports with no semantic loss.

### Phase 8 — File-by-file KISS audit and real acceptance

Real acceptance scenarios:

1. Product feature:
   Epic → Features → Stories → Tickets → Code → Tests.
2. Pure technical refactor:
   Epic/Feature → Tickets → Code, no fake Stories.
3. Change request:
   resolve Feature/Story and produce bounded impact graph.
4. Missing verification:
   coverage immediately identifies it.
5. Code refactor:
   behavior nodes survive while implementation edges change.

Stop and review before adding more product-management concepts.

## Non-goals

- Scrum framework
- sprint management
- forced actor-story wording
- automatic ticket generation on every Epic creation
- storing computed coverage flags
- duplicating graph relations as entity fields
- generic requirements-management suite
- replacing digest
- replacing Semantic Studio

## Design invariant

Every meaningful artifact should be able to answer, through graph traversal:

1. **Why does this exist?**
2. **What behavior/capability does it serve?**
3. **What implements it?**
4. **What proves it works?**
5. **What would be affected if it changes?**

If a proposed entity/relation does not improve one of these answers, it probably does not belong in the core ontology.
