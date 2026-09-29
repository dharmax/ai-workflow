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

## Step 2 — add Feature and correct lifecycles

Files:

- src/graph/types.ts
- src/graph/ontology.ts

Add:

~~~ts
type EpicStatus =
  | 'draft'
  | 'planned'
  | 'active'
  | 'blocked'
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

Add durable Feature Semantika entity.

Epic uses EpicStatus.
Feature/UserStory use IntentStatus.

Ensure their ontology defaults do not silently inherit the generic base default of implemented.

Do not add new predicates.
Do not add graph-reference fields to Epic/Feature/UserStory.
Do not build a migration framework. If tests/real state expose legacy status values, add only the smallest explicit normalization needed.

### Tests

Prove:

- equivalent Feature is reused;
- equivalent Story is reused;
- new Epic/Feature/Story receive stable candidate IDs;
- proposal generation for a new Epic causes zero graph mutation;
- abort leaves graph unchanged;
- applying proposal twice is idempotent;
- blocking question prevents implicit apply;
- technical Epic may validly return zero Stories;
- candidate-ID collision with unrelated state fails clearly.

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
