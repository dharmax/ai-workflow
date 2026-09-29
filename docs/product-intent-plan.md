# Product Intent Graph — Implementation Plan

Architectural truth: product-intent-graph.md

This plan has exactly two implementation tickets:

~~~text
AIWF-PRODUCT-GRAPH
        |
        | hard gate: deterministic model + coverage + impact + projections green
        v
AIWF-EPIC-DECOMPOSITION
~~~

Do not split numbered steps into many speculative AIWF tickets. One active ticket per coherent implementation slice is enough.

---

# Ticket 1 — AIWF-PRODUCT-GRAPH

## Objective

Build the deterministic substrate first:

~~~text
Epic --targets--> Feature --contains--> UserStory
  ^                   ^                     ^
  | contains          | implements          | addresses
Ticket ---------------+---------------------+
  |
  +--targets/modifies--> Code

Test --verifies--> Feature/UserStory
Decision --governs--> Epic/Feature/UserStory
~~~

Ticket 1 includes:

- ontology/lifecycle normalization;
- deterministic CRUD/query;
- exact product relation mutation;
- structural/causal coverage;
- bounded product impact;
- reliable projections;
- small CLI/REPL/MCP surfaces.

No model/LLM work belongs in Ticket 1.

## Step 1 — normalize the partial UserStory branch

Start from feat/user-stories-first-class.

Before adding Feature:

1. inspect the diff against master;
2. retain useful graph-native Story work;
3. remove assumptions contradicted by the design;
4. do not keep code merely because it already exists.

Remove/replace:

- Epic contains UserStory as canonical semantics;
- epicId / linkedTicket fields;
- any stored implemented/verified Story flags;
- duplicate editable ownership of one relation in multiple projections.

Keep:

- Ticket addresses Story;
- Test verifies Story;
- useful Story CRUD/query code;
- projection round-trip lessons/tests;
- MCP/CLI/REPL patterns.

Gate: one coherent relation model exists before Feature is introduced.

## Step 2 — add Feature and correct lifecycles

Files:

- src/graph/types.ts
- src/graph/ontology.ts
- focused graph tests

Add:

~~~ts
type EpicStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'completed'
  | 'cancelled'

type IntentStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'deprecated'

interface FeatureData extends BaseEntityData {
  acceptanceCriteria?: string[]
}
~~~

Add durable Feature entity.

Rules:

- Epic uses EpicStatus.
- Feature/UserStory use IntentStatus.
- Their defaults must not silently inherit generic implemented.
- no new predicates;
- no graph-reference IDs inside Epic/Feature/UserStory;
- no migration framework unless real persisted legacy data proves one is needed.

Tests prove:

- Feature persists/reloads;
- Feature local IDs work;
- lifecycle defaults are correct;
- Epic targets Feature;
- Epic targets Story;
- Feature contains Story;
- Ticket implements Feature;
- Ticket addresses Story;
- Test verifies Feature/Story.

Gate: full causal relation chain exists with no LLM and no projections.

## Step 3 — consolidate product tools

Preferred owner:

- src/tools/product.ts

Migrate Story tools there and remove src/tools/stories.ts if product.ts fully owns the domain.

Add thin deterministic CRUD/query tools:

- create_epic / get_epic / list_epics / update_epic
- create_feature / get_feature / list_features / update_feature
- create_user_story / get_user_story / list_user_stories / update_user_story

Add one constrained link operation and one constrained unlink operation.

They allow exactly:

~~~text
Epic      targets      Feature
Epic      targets      UserStory
Feature   contains     UserStory
Epic      contains     Ticket
Ticket    implements   Feature
Ticket    addresses    UserStory
Test      verifies     Feature
Test      verifies     UserStory
Decision  governs      Epic | Feature | UserStory
~~~

Reject all other source/predicate/target combinations in these product tools.

Do not expose arbitrary graph predicates here.
Existing graph mechanisms continue to own depends_on, blocks, targets/modifies code, etc.

Do not add manager/repository/service classes around Semantika.

Gate: human/agent can construct the complete product-intent graph deterministically.

## Step 4 — implement one structural coverage engine

New file:

- src/product/coverage.ts

Main function:

~~~ts
getCoverage(store, entityId)
~~~

Coverage means:

> For semantic entities already known to the graph, are the expected causal relations to work, code, and evidence present?

Coverage does not discover missing requirements or claim semantic completeness.

Return:

~~~ts
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
~~~

complete is derived only and never persisted.

### UserStory expectations

For an accepted Story report independent gaps for:

- no containing Feature -> missing_parent;
- no acceptance criteria -> missing_acceptance_contract;
- no addressing Ticket -> missing_work;
- addressing Ticket(s) but no targets/modifies code path -> missing_code_grounding;
- no verifying Test -> missing_verification;
- active blocker -> blocked.

Multiple gaps may coexist.

Draft/proposed Stories return facts but are not treated as project failures merely because implementation is absent.

### Feature expectations

A Feature may legitimately contain zero Stories.

Check:

- direct Ticket implements Feature;
- accepted contained Stories;
- their addressing Tickets;
- code grounding through relevant Tickets;
- direct Feature verification Tests;
- Story verification evidence;
- blockers.

No Stories is not a structural error.

### Epic expectations

A technical Epic may have zero Feature/Story targets.

If an Epic targets Feature F, at least one Ticket implementing that Epic must reach F either:

- directly: Ticket implements F; or
- behaviorally: Ticket addresses Story S and F contains S.

If an Epic targets Story S, at least one Ticket implementing the Epic must address S.

Missing such path -> missing_target_path.

### Discipline

- no percentage;
- no cache;
- no LLM;
- no copied coverage logic in tools/projections;
- no label implying “all requirements discovered.”

Tests must exercise each independent gap and a fully covered path.

Gate: in-memory Semantika tests explain exact missing causal edges.

## Step 5 — implement bounded product impact

New file:

- src/product/impact.ts

Main function:

~~~ts
getProductImpact(store, entityId)
~~~

Use explicit scope rules, not unrestricted traversal.

Starting from UserStory include:

- containing Feature(s);
- active/planned Epics directly targeting the Story;
- Tickets addressing the Story;
- direct code anchors of those Tickets;
- Tests verifying the Story;
- Decisions governing Story/Feature/code anchors;
- direct blockers/dependencies of returned work/intent nodes.

Do not include sibling Stories by default.

Starting from Feature include:

- contained accepted Stories;
- active/planned Epics targeting Feature;
- direct Feature-implementing Tickets;
- Tickets addressing contained accepted Stories;
- direct code anchors;
- direct Feature/Story verification Tests;
- governing Decisions;
- direct blockers/dependencies.

Starting from Epic include:

- targeted Features/Stories;
- Tickets contained by Epic;
- those Tickets' Feature/Story/code edges;
- relevant verification Tests and Decisions;
- direct blockers/dependencies.

Completed/cancelled historical Epics are excluded from Feature/Story impact by default.

Do not call an LLM.
Do not run analyze_blast_radius automatically.
Do not implement another graph engine.

Negative tests prove unrelated nodes and sibling Stories stay out.

Gate: Feature/Story modification context is compact and exact.

## Step 6 — expose coverage and impact

Register thin wrappers:

- get_product_coverage
- get_product_impact

Epic/Feature/Story detail tools may call the same coverage owner.

Update MCP tests:

- new tools are listed;
- at least one real coverage/impact call succeeds.

No duplicate business logic in MCP/tool layer.

## Step 7 — make projections single-owner and round-trip safe

File:

- src/graph/projections.ts

Add:

- features.md

Update:

- epics.md
- user-stories.md

Editable relation ownership is fixed:

~~~text
epics.md
  owns Epic --targets--> Feature/UserStory

features.md
  owns Feature --contains--> UserStory

user-stories.md
  owns Story intrinsic text/status/criteria/SLA only

Ticket/Test relations
  display read-only in product projections
  mutate through tools/graph state
~~~

Coverage output is generated/read-only.

Rules:

- removing an owned relation from its owner projection removes that graph edge;
- removing a displayed read-only relation from Markdown must not remove graph state;
- one relation must never be editable in two projections.

Round-trip tests prove:

1. export -> import unchanged is idempotent;
2. adding owned relation creates exactly one edge;
3. removing owned relation removes exactly one edge;
4. repeated sync never duplicates edges;
5. coverage text never becomes stored state;
6. Ticket/Test links survive unrelated projection edits;
7. empty Feature/Story sets still produce stable files.

Gate: projection sync is reliable before semantic decomposition exists.

## Step 8 — small product surfaces

Update narrowly:

- src/cli.ts
- src/shell.ts
- src/doctor.ts
- README.md
- related tests

Read/query commands:

~~~text
aiwf epics
aiwf epic <id>
aiwf features
aiwf feature <id>
aiwf stories
aiwf story <id>
aiwf coverage <id>
aiwf impact <id>
~~~

Do not build the semantic Epic-add flow in Ticket 1.

Doctor should count Epic/Feature/Story and verify features.md/user-stories.md among core projections.

## Step 9 — Ticket 1 acceptance fixture

Use one compact calendar fixture plus one unrelated contact-search subgraph:

~~~text
EPIC-CALENDAR
  targets FEAT-EVENT-CREATE
  targets STORY-ATTENDEES

FEAT-EVENT-CREATE
  contains STORY-CREATE
  contains STORY-ATTENDEES

EPIC-CALENDAR
  contains TKT-CONTRACT

TKT-CONTRACT
  implements FEAT-EVENT-CREATE
  addresses STORY-ATTENDEES
  modifies CalendarCreateInput

TEST-ATTENDEES
  verifies STORY-ATTENDEES

ADR-CALENDAR
  governs FEAT-EVENT-CREATE
~~~

Assert:

- exact Story coverage gaps/complete result;
- Epic contained-ticket target-path coverage;
- impact(STORY-ATTENDEES) includes expected Feature/Ticket/code/Test/Decision;
- unrelated contact-search nodes are excluded.

## Step 10 — Ticket 1 full gate

Run:

~~~bash
bun run typecheck
bun test
~~~

Then method-by-method KISS review.

Reject:

- duplicate coverage/relation logic;
- unnecessary wrappers/classes;
- Feature treated as Epic-owned;
- stored coverage;
- unrestricted graph traversal in impact;
- projection relation drift;
- fake UserStory ceremony.

Do not start Ticket 2 until this gate is accepted.

---

# Ticket 2 — AIWF-EPIC-DECOMPOSITION

## Objective

Make normal human-facing new-Epic creation, by default:

1. understand an Epic draft;
2. reuse/create stable Features;
3. reuse/create meaningful UserStories;
4. expose unresolved questions;
5. review interactively through shell-ui;
6. persist only the accepted structure.

No Tickets are generated.

Ticket 2 starts only after Ticket 1 is green.

## Step 1 — define a small proposal schema

New file:

- src/product/decompose.ts

Optional:

- src/product/types.ts only if public proposal types would otherwise clutter graph/types.ts.

Conceptual proposal:

~~~ts
interface EpicStructureProposal {
  epic: {
    id: string
    action: 'create' | 'existing'
    title: string
    body?: string
    status: EpicStatus
  }

  features: Array<{
    id: string
    action: 'reuse' | 'create'
    title: string
    body?: string
    acceptanceCriteria?: string[]
  }>

  stories: Array<{
    id: string
    action: 'reuse' | 'create'
    featureId: string
    title: string
    actor?: string
    story?: string
    context?: string
    acceptanceCriteria: string[]
  }>

  questions: Array<{
    id: string
    blocking: boolean
    text: string
  }>
}
~~~

For a new Epic, input is plain draft data. Proposal generation performs zero graph mutation.

The model never chooses final IDs.

## Step 2 — provide the bounded current Product Intent Graph

AIWF works on a healthy project chunk.

For the first implementation, pass the current non-deprecated product-intent graph to the model:

- Features;
- Stories;
- concise accepted Decisions;
- active/planned Epics only if useful for duplicate/overlap awareness.

Do not build fuzzy retrieval.
Do not add embeddings/vector search.
Do not send source code.

If this metadata itself cannot fit the configured semantic model with safe headroom, fail clearly and ask the user to narrow/clean the aiwf scope.

## Step 3 — one bounded semantic proposal call

Reuse existing aiwf Asker/model routing.

Do not use an autonomous ReAct loop.

Prompt contract:

1. Feature = stable capability, not task grouping.
2. Reuse equivalent Feature/Story by the provided existing entity ID.
3. Create Stories only for meaningful observable behavior.
4. Technical Epics may produce zero Stories.
5. Do not create Tickets.
6. Do not invent implementation details.
7. Surface ambiguity as questions.
8. Do not erase unknowns by guessing.
9. Cover the Epic sufficiently without story explosion.
10. Return only the required structured shape.

Validate with Zod.

At most one structural repair attempt is acceptable if an existing utility already supports it simply.
Do not build a generic repair framework.

## Step 4 — assign stable candidate IDs

After semantic output validates:

- reuse items retain provided existing IDs;
- new Epic/Feature/Story items receive one stable candidate ID in host code.

There is no reservation subsystem and no graph mutation.

The returned proposal is the stable unit later applied/retried.

## Step 5 — deterministic idempotent apply

New file:

- src/product/apply.ts

Main function:

~~~ts
applyEpicStructure(store, proposal)
~~~

Before first mutation validate:

- existing Epic references exist and have correct type;
- create Epic candidate ID is free or represents the same prior apply;
- reused Features/Stories exist and have correct type;
- every Story's Feature is existing or present in proposal;
- candidate IDs do not collide with unrelated entities;
- no blocking question is silently ignored.

Apply in dependency order:

~~~text
Epic
Features
Stories
Epic targets accepted Features
Epic targets Stories specifically introduced/changed by this Epic
Feature contains accepted Stories
~~~

No Tickets.

Repeated apply must not duplicate entities or edges.
Partial failure must be safe to retry.

Do not build a transaction framework solely for this.

## Step 6 — expose propose/apply tools

Register:

- propose_epic_structure
- apply_epic_structure

They remain separate.

create_epic remains deterministic and never invokes a model.

## Step 7 — interactive default new-Epic flow

Use @dharmax/shell-ui.

Normal path:

~~~text
Epic draft
  ↓
propose (graph unchanged)
  ↓
show Epic + reuse/create Features/Stories + questions
  ↓
accept / inspect / reject individual / edit / abort
  ↓
apply accepted proposal
  ↓
show structural coverage
~~~

Abort leaves graph unchanged.

Provide --no-decompose for manual/technical Epic creation; that path calls deterministic create_epic directly.

For MCP/non-TTY callers, proposal and apply remain separate explicit calls.

Do not create a UI framework.

## Step 8 — narrow PRODUCT-mode guidance

WorkflowActor may orchestrate product tools but must not own decomposition logic.

Update PRODUCT-mode prompt/guidance so an Epic request uses:

- proposal;
- review when interaction exists;
- apply;
- coverage.

No automatic Ticket generation.

## Step 9 — deterministic decomposition tests

Inject fake semantic output.

Prove:

- equivalent Feature reused;
- equivalent Story reused;
- candidate IDs assigned once;
- new-Epic proposal causes zero graph mutation;
- abort leaves graph unchanged;
- repeated apply is idempotent;
- blocking question prevents implicit apply;
- technical Epic may have zero Stories;
- ID collision with unrelated state fails clearly.

## Step 10 — focused live-model qualification

Run a transparent small set.

A. Product change:
Add attendee support to calendar event creation.
Expect reuse of existing Calendar Feature, sensible attendee Story, no duplicate Feature, no Ticket invention.

B. Technical refactor:
Remove obsolete legacy persistence adapter without changing behavior.
Expect zero fake Stories to be acceptable.

C. Ambiguous requirement:
Omit one material behavior choice.
Expect explicit blocking/nonblocking question, not invented certainty.

D. Broad but healthy Epic:
Expect a small coherent Feature set and enough behavioral Stories without story explosion.

Record raw first proposals.
Do not retry until a pleasing answer appears and call that success.

## Step 11 — real product acceptance

Use one real ai-workflow Epic candidate.

After accepted apply, use:

~~~text
coverage <feature/story>
impact <feature/story>
~~~

and verify the returned graph context is enough to begin a realistic modification without repository-wide archaeology.

That is the product proof.

## Step 12 — full gate

Run:

~~~bash
bun run typecheck
bun test
~~~

Then file-by-file KISS audit.

Reject:

- second actor framework;
- generic workflow/state-machine code;
- model calls inside CRUD;
- duplicate/retrieval subsystem;
- graph mutation during proposal generation;
- Ticket generation;
- technical Stories created only to satisfy structure/tests.

---

# Deferred

Do not implement in these tickets:

- aiwf-digest integration;
- refactoring mutation primitives;
- Unknown/Risk entity system;
- Semantic Studio integration.

After both tickets pass, aiwf-digest can emit/map Epic, Feature, UserStory, and Ticket proposals into the same graph, and the deterministic coverage engine can validate the resulting causal structure.
