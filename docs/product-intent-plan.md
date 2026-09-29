# Product Intent Graph — Implementation Plan

Architectural truth: product-intent-graph.md

This plan intentionally uses two implementation tickets. Do not explode the work into many speculative subtasks.

~~~text
AIWF-PRODUCT-GRAPH
        |
        | hard gate: deterministic model + coverage + impact + projections green
        v
AIWF-EPIC-DECOMPOSITION
~~~

The first ticket establishes a fully useful deterministic graph even with manually entered data.
The second adds semantic default Epic decomposition.

---

# Ticket 1 — AIWF-PRODUCT-GRAPH

## Objective

Complete the deterministic product-intent substrate:

~~~text
Epic --targets--> Feature --contains--> UserStory
  ^                   ^                     ^
  | implements        | implements          | addresses
Ticket ---------------+---------------------+
  |
  +--targets/modifies--> Code

Test --verifies--> Feature/UserStory
~~~

and provide deterministic CRUD/query, coverage, product impact, projections, and CLI/REPL/MCP surfaces.

No LLM work in this ticket.

## Step 1 — normalize the existing partial branch

Start from current feat/user-stories-first-class.

Before adding Feature:

1. inspect the current diff against master;
2. retain useful graph-native Story work;
3. remove/replace assumptions contradicted by the authoritative design;
4. do not preserve code merely because it already exists on the branch.

Specifically eliminate as canonical behavior:

- Epic contains UserStory;
- Story-local epicId / linkedTicket;
- stored Story implemented / verified flags if introduced anywhere;
- duplicated editable relationship ownership across projections.

### Gate

The branch has one clear intended relation model before Feature code is added.

## Step 2 — add Feature and ProductIntentStatus

Files:

- src/graph/types.ts
- src/graph/ontology.ts

Add the smallest types:

~~~ts
type ProductIntentStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'deprecated'

interface FeatureData extends BaseEntityData {
  acceptanceCriteria?: string[]
}
~~~

Add durable Feature Semantika entity.

Do not add new predicates.
Do not add graph-reference fields to Epic/Feature/UserStory.
Product tools enforce ProductIntentStatus for Epic/Feature/UserStory even if BaseEntityData remains broader.

### Tests

Prove:

- Feature persists/reloads;
- Feature local IDs work;
- Epic targets Feature;
- Epic targets UserStory;
- Feature contains UserStory;
- Ticket implements Feature;
- Ticket addresses UserStory;
- Test verifies Feature/Story.

### Gate

Ontology supports the full causal chain without LLMs or projections.

## Step 3 — consolidate product-intent tools

Preferred file:

- src/tools/product.ts

Migrate/remove src/tools/stories.ts unless keeping it is demonstrably simpler.

Register thin deterministic tools:

- create_epic / get_epic / list_epics / update_epic
- create_feature / get_feature / list_features / update_feature
- create_user_story / get_user_story / list_user_stories / update_user_story

Add a small constrained relation operation rather than many relation-specific tools.

Conceptually:

~~~ts
link_product_intent({
  sourceId,
  predicate:
    | 'targets'
    | 'contains'
    | 'implements'
    | 'addresses'
    | 'verifies'
    | 'governs'
    | 'depends_on'
    | 'blocks',
  targetId
})
~~~

Validate allowed source/target type combinations before mutation.
Provide matching unlink semantics.

Do not expose arbitrary graph predicates through this tool.
Do not create manager/service classes around CRUD.

### Gate

A human/agent can construct the complete intent graph deterministically through registered tools.

## Step 4 — implement one coverage engine

New file:

- src/product/coverage.ts

Export one main function:

~~~ts
getCoverage(store, entityId)
~~~

Do not implement coverage independently inside Epic/Feature/Story tools.

### Required UserStory cases

Tests must prove exact state transitions:

1. accepted Story, no Feature -> structurally_incomplete;
2. Feature linked, no criteria -> structurally_incomplete;
3. Feature + criteria, no Ticket -> unimplemented;
4. addressing Ticket, no code edge -> partially_implemented;
5. grounded Ticket, no Test -> unverified;
6. grounded Ticket + verifying Test -> complete;
7. active blocker -> blocked.

Coverage does not require every related Ticket to target code. It requires at least one grounded implementation path.

### Required Feature cases

1. Feature with no Stories and no Tickets -> unimplemented, not structural failure;
2. direct implementing grounded Ticket, no Test -> unverified;
3. direct implementing grounded Ticket + direct verifying Test -> complete;
4. contained accepted Stories contribute;
5. all accepted Stories verified can satisfy Feature verification;
6. draft/proposed Story does not make an accepted Feature fail merely because it is incomplete.

### Required Epic cases

1. technical Epic with grounded implementing Ticket can be valid without Features/Stories;
2. Epic targeting Feature with no Epic Ticket linked to that Feature reports missing causal coverage;
3. Epic Ticket implementing both Epic and Feature satisfies that path;
4. Epic targeting Story requires an Epic Ticket addressing that Story;
5. blocker dominates state.

### Implementation discipline

Return satisfied facts and missing links, not just one state string.
Do not compute percentages.
Do not cache coverage.
Do not use an LLM.

### Gate

Coverage tests operate entirely against in-memory Semantika and explain exactly why an entity is incomplete.

## Step 5 — implement deterministic product impact

New file:

- src/product/impact.ts

Export:

~~~ts
getProductImpact(store, entityId)
~~~

Support Epic, Feature, UserStory.

Return a bounded semantic result containing:

- intent nodes;
- relevant Tickets;
- direct code targets/modifications;
- verifying Tests;
- governing Decisions;
- direct dependencies/blockers.

Do not call an LLM.
Do not implement another BFS framework if WorkflowStore.traverse plus a few typed queries suffice.
Do not run AST blast automatically.

Code targets returned here are inputs to existing analyze_blast_radius.

### Negative tests

- unrelated Feature/Ticket/code does not appear;
- sibling Story under the same Feature is excluded when starting from one Story unless directly relevant;
- traversal does not escape into arbitrary graph neighborhoods;
- duplicate predicates do not duplicate result entities.

### Gate

A known Feature/Story yields a compact exact intent→work→code/evidence neighborhood.

## Step 6 — integrate coverage/impact into tools

Add:

- get_product_coverage
- get_product_impact

Thin wrappers only.

Story/Feature/Epic detail tools may include coverage by calling the same engine.

No duplicate coverage logic.

### MCP gate

Existing MCP registry exposes all new product tools automatically.
Update MCP tests to assert presence and one real call.

## Step 7 — fix product projections deliberately

File:

- src/graph/projections.ts

Add:

- features.md

Update:

- epics.md
- user-stories.md

### Editable relation ownership

Exactly one projection owns each editable relation:

~~~text
epics.md
  owns Epic --targets--> Feature/UserStory

features.md
  owns Feature --contains--> UserStory

user-stories.md
  owns Story intrinsic text/criteria only

Ticket and Test relations
  display read-only initially
  mutate through tools/graph operations
~~~

Coverage is generated/read-only.

When an owned relation is removed from its projection, sync removes that graph edge.
When a read-only displayed relation is removed from Markdown, sync must not destroy canonical graph state.

### Round-trip tests

Prove:

1. export -> import with no edits is idempotent;
2. adding an owned relation creates exactly one edge;
3. removing it removes exactly that edge;
4. repeated sync does not duplicate relations;
5. coverage text does not become stored state;
6. Ticket/Test links survive unrelated projection edits;
7. empty Story/Feature sets still produce stable projection files.

### Gate

Projection round-trip is reliable before semantic Epic generation is added.

## Step 8 — CLI / shell / doctor / README surfaces

Update:

- src/cli.ts
- src/shell.ts
- src/doctor.ts
- README.md

Keep surfaces small.

Suggested read/query commands:

~~~text
aiwf epics
aiwf epic <id>
aiwf features
aiwf feature <id>
aiwf stories [all|unimplemented|unverified]
aiwf story <id>
aiwf coverage <id>
aiwf impact <id>
~~~

Creation may remain through tools until Ticket 2 adds the proper default Epic-add UX.
Do not create a large nested command parser in Ticket 1.

Doctor counts Epic/Feature/Story and verifies all core projection files exist.

## Step 9 — deterministic full qualification

Run:

~~~bash
bun run typecheck
bun test
~~~

Then perform a file-by-file KISS review.

Reject:

- parallel Story and Feature implementations of the same logic;
- coverage code copied into tools/projections;
- generic repository/manager layers around Semantika;
- new graph/predicate abstractions that merely wrap store.relate;
- stored coverage;
- brittle projection parsing without round-trip tests.

## Ticket 1 acceptance scenario

Construct:

~~~text
EPIC-CALENDAR
  targets FEAT-EVENT-CREATE
  targets STORY-ATTENDEES

FEAT-EVENT-CREATE
  contains STORY-CREATE
  contains STORY-ATTENDEES

TKT-CONTRACT
  implements EPIC-CALENDAR
  implements FEAT-EVENT-CREATE
  addresses STORY-ATTENDEES
  modifies Symbol: CalendarCreateInput

TEST-ATTENDEES
  verifies STORY-ATTENDEES

ADR-CALENDAR
  governs FEAT-EVENT-CREATE
~~~

Assert:

- Story coverage is complete when criteria/code/Test exist;
- Epic causal coverage sees Ticket→Story/Feature;
- impact(STORY-ATTENDEES) includes exact Ticket/code/Test/Decision context;
- unrelated contact-search nodes are excluded.

This is the core proof of the future fast modification workflow.

---

# Ticket 2 — AIWF-EPIC-DECOMPOSITION

## Hard prerequisite

Ticket 1 is accepted with deterministic tests green.

Do not combine semantic decomposition debugging with graph-model debugging.

## Objective

Make normal human-facing Epic creation automatically propose/reuse appropriate Features and meaningful UserStories, then commit only reviewed/accepted structure.

No Tickets are generated by this feature.

## Step 1 — define proposal types and schema

Use src/product/decompose.ts and, only if useful, a narrow src/product/types.ts.

Keep the proposal small:

~~~ts
interface EpicStructureProposal {
  epicId: string

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

Exact fields may be reduced, never expanded into a planning framework.

The model never chooses canonical graph IDs. Host code assigns/reserves IDs after semantic validation.

## Step 2 — collect bounded existing product context

Before the model call, collect relevant existing:

- Features;
- Stories;
- accepted Decisions only when directly relevant.

Prefer existing Semantika/graph search.
Do not add embeddings.
Do not inspect source code unless the Epic explicitly references code and current graph context resolves it cheaply.

The goal is duplicate avoidance and continuity.

## Step 3 — one bounded semantic proposal call

Use existing aiwf LLM gateway / Asker / model routing.

Do not use an autonomous tool-calling ReAct loop for proposal generation.

Prompt requirements:

1. Feature means stable capability, not task grouping.
2. Reuse equivalent Feature/Story.
3. Create Stories only for meaningful observable behavior.
4. Technical work may produce no Stories.
5. Do not create Tickets.
6. Do not invent implementation details.
7. Surface ambiguity as questions.
8. Do not erase unknowns by guessing.
9. Cover the Epic sufficiently without story explosion.
10. Output only the validated schema.

Validate with Zod.

One repair attempt for malformed structure is acceptable only if an existing utility supports it simply.
Do not build a generic repair framework.

## Step 4 — reserve IDs after validation

For each create item, host assigns one ID before returning proposal:

~~~text
FEAT-...
STORY-...
~~~

The same proposal object must be safe to apply twice.
Do not regenerate IDs inside apply.

## Step 5 — deterministic apply owner

New file:

- src/product/apply.ts

Implement:

~~~ts
applyEpicStructure(store, proposal)
~~~

Before first mutation validate:

- Epic exists;
- every reused Feature/Story exists and has correct type;
- every Story Feature exists or is part of this proposal;
- reserved new IDs do not collide with another entity;
- no blocking unanswered proposal question is silently ignored.

Apply:

~~~text
Epic --targets--> each accepted Feature
Epic --targets--> each accepted/reused Story introduced/changed by this Epic
Feature --contains--> each accepted Story
~~~

No Ticket creation.

Repeated apply must not duplicate entities or predicates.

Do not build a transaction framework. Prevalidate fully, apply in dependency order, and make reruns idempotent.

## Step 6 — tools

Expose:

- propose_epic_structure
- apply_epic_structure

They remain separate.

create_epic remains deterministic and does not secretly invoke the model.

## Step 7 — interactive default Epic flow

Use @dharmax/shell-ui.

Normal interactive behavior:

~~~text
user adds Epic
  ↓
create Epic / identify Epic draft
  ↓
propose structure
  ↓
show:
  reuse/create Features
  reuse/create Stories
  questions
  ↓
accept all / inspect / reject individual / edit / abort
  ↓
apply accepted proposal
  ↓
show coverage
~~~

Provide --no-decompose for intentional manual/technical Epic creation.

Do not invent a custom terminal UI toolkit.

For non-TTY/MCP callers, return proposal data; caller explicitly invokes apply.

## Step 8 — natural-language actor behavior

Update PRODUCT-mode guidance narrowly.

When a user asks to add/create/plan an Epic:

1. create/identify the Epic;
2. propose Feature/Story structure;
3. do not generate fake Stories;
4. obtain review/approval where host interaction permits;
5. apply;
6. show coverage gaps.

Do not make WorkflowActor itself responsible for decomposition logic.

## Step 9 — deterministic decomposition tests

Use injected/fake semantic responses.

Prove:

- equivalent Feature is reused;
- equivalent Story is reused;
- new Feature receives one stable reserved ID;
- applying proposal twice is idempotent;
- blocking question prevents implicit apply;
- technical Epic may return zero Stories;
- proposal generation causes zero graph mutation.

## Step 10 — focused live-model qualification

Run a small transparent live set.

### Case A — product capability

Epic: Add attendee support to calendar event creation.

Existing graph contains Calendar event creation Feature and basic event creation Story.

Expected:

- reuse Feature;
- create/reuse attendee Story;
- no duplicate Calendar Feature;
- no Tickets invented.

### Case B — technical refactor

Epic: Remove the obsolete legacy persistence adapter without changing behavior.

Expected:

- zero fake UserStories is acceptable;
- may target an existing Feature if relevant;
- no invented user-facing capability.

### Case C — ambiguous requirement

Use an Epic that omits one material behavioral choice.

Expected:

- explicit question/unknown;
- no invented certainty.

### Case D — broad but healthy Epic

Expected:

- small coherent Feature set;
- enough Stories for behavioral coverage;
- no story explosion.

Record raw proposals.
Do not retry until a pleasing result appears and call that success.

## Step 11 — real product acceptance

Use one real ai-workflow Epic candidate.

After applying accepted structure, ask a realistic modification question and prove coverage + impact produce enough bounded context for a coding actor to proceed without repository-wide search.

That is the product acceptance test.

## Step 12 — full gate and KISS audit

Run:

~~~bash
bun run typecheck
bun test
~~~

Review every changed method.

Reject:

- second actor framework;
- automatic Ticket generation;
- generic workflow/state-machine code;
- model calls inside low-level CRUD;
- duplicate-detection framework beyond current graph/search;
- semantic output mutating graph before review;
- hidden technical Story generation to satisfy tests.

---

# Deferred work

Do not implement in these tickets:

- aiwf-digest integration;
- refactoring mutation primitives;
- Unknown/Risk entity system;
- Semantic Studio integration.

After both tickets pass, aiwf-digest can emit/map Epic, Feature, UserStory, and Ticket proposals, and aiwf can validate the imported result with the same deterministic coverage engine.
