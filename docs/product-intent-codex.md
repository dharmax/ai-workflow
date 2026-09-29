# Codex + AIWF Execution Handoff — Product Intent Graph

Authoritative documents:

1. docs/product-intent-graph.md
2. docs/product-intent-plan.md

This file is execution discipline only. Do not reinterpret the architecture from scratch.

## Repository and branch

Repository:

- dharmax/ai-workflow

Current development branch:

- feat/user-stories-first-class

That branch contains useful partial UserStory work but is not merge-ready.

Do not merge it until the deterministic Ticket 1 gate is green.

## Work graph

Exactly two implementation tickets:

~~~text
AIWF-PRODUCT-GRAPH
        |
        | HARD GATE
        v
AIWF-EPIC-DECOMPOSITION
~~~

Do not turn numbered steps into many speculative tickets.

Per AGENTS.md, claim the active AIWF ticket before code mutation.

---

# Ticket 1 — AIWF-PRODUCT-GRAPH

## Goal

Implement the deterministic Product Intent Graph and make it fully useful without an LLM.

Frozen canonical relations:

~~~text
Epic     --targets----> Feature
Epic     --targets----> UserStory
Epic     --contains---> Ticket

Feature  --contains---> UserStory

Ticket   --implements-> Feature
Ticket   --addresses--> UserStory
Ticket   --targets/modifies--> Module/File/Symbol

Test     --verifies---> Feature/UserStory
Decision --governs----> Epic/Feature/UserStory
~~~

Never reintroduce Ticket implements Epic.

## Read first

Read only:

1. AGENTS.md
2. docs/product-intent-graph.md
3. docs/product-intent-plan.md
4. src/graph/types.ts
5. src/graph/ontology.ts
6. src/graph/store.ts
7. src/graph/projections.ts
8. src/tools/registry.ts
9. src/tools/index.ts
10. src/tools/stories.ts
11. tests/stories.test.ts
12. tests/graph.test.ts
13. tests/tools.test.ts
14. tests/mcp.test.ts
15. tests/shell.test.ts

Then use narrow symbol/graph search only for directly referenced helpers.

Do not rediscover unrelated scheduler/compiler/knowledgebase/model-radar architecture.

## Before changing code

1. inspect master...feat/user-stories-first-class;
2. create or reuse AIWF-PRODUCT-GRAPH;
3. claim it;
4. record the frozen canonical relations above;
5. verify branch working state.

Do not write more architecture documents.

## Execution order

### A. Normalize current Story work

Keep:

- graph-native Story entity;
- Ticket addresses Story;
- Test verifies Story;
- useful Story CRUD/query;
- projection round-trip tests/patterns.

Remove/replace:

- Epic contains Story;
- epicId / linkedTicket;
- Story-local implementation booleans;
- relation ownership duplicated across projections.

Run focused tests/typecheck before proceeding.

### B. Add Feature + lifecycles

Touch only the smallest necessary files.

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
~~~

Add Feature entity with intrinsic acceptanceCriteria only.

Ensure Epic/Feature/UserStory do not default to generic implemented status.

No new predicates.

### C. Consolidate product tools

Prefer one file:

- src/tools/product.ts

Move/remove stories.ts if product.ts becomes the clear owner.

CRUD/query:

- Epic
- Feature
- UserStory

Add one constrained link and one constrained unlink operation.

Allowed combinations are exactly the canonical relation table in the design.

Reject any other combination.

Do not add domain managers, repositories, or a generic relation framework.

### D. Coverage

Create:

- src/product/coverage.ts

One owner only.

Coverage is structural/causal evidence, not semantic completeness.

Return:

- complete derived boolean;
- exact gaps;
- exact related IDs.

No percentages.
No cache.
No LLM.
No persisted coverage.

Required gap kinds include:

- missing_parent
- missing_acceptance_contract
- missing_work
- missing_code_grounding
- missing_verification
- missing_target_path
- blocked

Epic target-path logic uses:

~~~text
Epic --contains--> Ticket --implements--> Feature

or

Epic --contains--> Ticket --addresses--> Story
Feature --contains--> Story
~~~

### E. Product impact

Create:

- src/product/impact.ts

Implement the exact start-node scope rules in the design.

Do not use unrestricted traversal.
Do not include sibling Stories when starting from a Story.
Do not include completed/cancelled historical Epics in Feature/Story impact by default.
Do not run AST blast automatically.
Return code anchors for the existing blast subsystem.

### F. Product projections

Modify:

- src/graph/projections.ts

Add:

- features.md

Editable ownership is frozen:

~~~text
epics.md
  owns Epic targets Feature/UserStory
  owns Epic contains Ticket only if Ticket membership is projected there

features.md
  owns Feature contains UserStory

user-stories.md
  owns Story intrinsic fields only

Ticket/Test semantic links
  read-only in product projections unless their existing canonical projection owns them
~~~

Important: if epics.md does not already have a safe Ticket-membership editable grammar, keep Epic contains Ticket tool-owned/read-only rather than inventing fragile parsing.

One relation must have one editable projection owner.

Coverage display is export-only.

Round-trip tests must cover add/remove/idempotence.

### G. Small surfaces

Update narrowly:

- CLI
- shell
- doctor
- README
- MCP tests

Read/query commands only are sufficient in Ticket 1:

~~~text
epics
epic <id>
features
feature <id>
stories
story <id>
coverage <id>
impact <id>
~~~

Do not implement semantic Epic-add yet.

## Ticket 1 acceptance fixture

Use one compact calendar graph and one unrelated contact graph.

Required calendar chain:

~~~text
EPIC-CALENDAR
  targets FEAT-EVENT-CREATE
  targets STORY-ATTENDEES
  contains TKT-CONTRACT

FEAT-EVENT-CREATE
  contains STORY-CREATE
  contains STORY-ATTENDEES

TKT-CONTRACT
  implements FEAT-EVENT-CREATE
  addresses STORY-ATTENDEES
  modifies CalendarCreateInput

TEST-ATTENDEES
  verifies STORY-ATTENDEES

ADR-CALENDAR
  governs FEAT-EVENT-CREATE
~~~

Prove:

- missing gaps are exact;
- fully connected Story has complete=true;
- Epic target path is detected through contained Ticket;
- impact(STORY-ATTENDEES) contains Feature/Ticket/code/Test/Decision;
- unrelated contact nodes stay out.

## Ticket 1 full gate

Run:

~~~bash
bun run typecheck
bun test
~~~

Then inspect every changed method for KISS.

Reject the implementation if it contains:

- second graph abstraction;
- duplicate coverage logic;
- arbitrary traversal;
- stored coverage;
- status/coverage conflation;
- fake Story ceremony;
- Feature ownership by Epic;
- Ticket implements Epic;
- projection regex complexity without focused round-trip tests.

## Ticket 1 stop conditions

Stop and report rather than improvise architecture if:

- Semantika prevents one frozen canonical relation;
- old durable graph data actually requires a nontrivial migration;
- coverage requires semantic judgment rather than graph facts;
- product impact requires another traversal/index subsystem;
- projection single-ownership cannot be achieved without breaking a demonstrated workflow.

Report the concrete blocker and smallest proposed deviation.

Do not start Ticket 2 until Ticket 1 is accepted.

---

# Ticket 2 — AIWF-EPIC-DECOMPOSITION

## Goal

New Epic UX should normally produce/reuse the appropriate stable Features and meaningful Stories before persisting the Epic.

No Tickets are generated.

## Start with a fresh context if practical

Read:

1. AGENTS.md
2. docs/product-intent-graph.md
3. docs/product-intent-plan.md
4. final src/tools/product.ts
5. final src/product/coverage.ts
6. final src/product/impact.ts
7. src/actor/engine.ts
8. src/config.ts
9. package.json
10. existing shell-ui usage in src/shell.ts
11. only the smallest relevant llm-utils API definitions

Do not rediscover the rest of aiwf.

## Frozen architecture

~~~text
Epic draft or existing Epic
        |
        v
current bounded Product Intent Graph
        |
        v
proposeEpicStructure()
        |
        | ZERO graph mutation
        v
EpicStructureProposal
        |
        v
human/caller review
        |
        v
applyEpicStructure()
        |
        v
Semantika graph
~~~

Semantic proposal and deterministic apply must remain separate.

## Execution order

### A. Proposal schema

Create:

- src/product/decompose.ts

Optional src/product/types.ts only if clearly cleaner.

Proposal contains:

- Epic candidate/existing reference;
- Feature create/reuse items;
- Story create/reuse items;
- questions.

Do not create a planning DSL.

### B. Context input

Send the current non-deprecated Product Intent Graph:

- Features;
- Stories;
- concise accepted Decisions;
- active/planned Epics when useful.

This is deliberately whole product metadata for the healthy aiwf chunk.

Do not add fuzzy retrieval, embeddings, RAG, or source-code corpus context.

If even this bounded metadata exceeds safe model context, fail clearly and ask for scope cleanup.

### C. Semantic call

Use existing Asker/model routing.

One bounded structured call.
No ReAct tool loop.
No graph mutation.

Prompt must enforce:

- Feature = durable capability;
- reuse existing IDs when equivalent;
- Stories only for real observable behavior;
- technical Epic may have zero Stories;
- no Tickets;
- no implementation invention;
- ambiguity becomes questions;
- no story explosion.

Validate with Zod.

At most one small structural repair attempt if existing utilities make that trivial.

### D. Candidate IDs

Model never invents IDs.

After valid semantic output, host assigns stable candidate IDs to create items.

No reservation subsystem.
No graph write.

Proposal owns those IDs permanently for retry/idempotence.

### E. Apply

Create:

- src/product/apply.ts

Prevalidate everything before first mutation.

Then apply:

1. Epic;
2. Features;
3. Stories;
4. Epic targets Features;
5. Epic targets Stories specifically introduced/changed by this Epic;
6. Feature contains Stories.

No Tickets.

Retrying the same proposal must not duplicate anything.

A candidate-ID collision with unrelated state must fail clearly, not silently mint a new ID.

### F. Tools

Expose:

- propose_epic_structure
- apply_epic_structure

Keep create_epic deterministic.

### G. Interactive Epic-add

Use @dharmax/shell-ui directly.

Normal new-Epic flow:

~~~text
collect draft
→ propose (graph unchanged)
→ display reuse/create Features/Stories + questions
→ accept/reject/edit/abort
→ apply
→ show structural coverage
~~~

Abort leaves graph unchanged.

--no-decompose directly creates a manual/technical Epic.

Do not create another UI framework.

For MCP/non-TTY, proposal and apply remain separate calls.

### H. PRODUCT mode

Only teach WorkflowActor to orchestrate the product tools.

Do not put decomposition business logic inside WorkflowActor.

## Deterministic tests

Inject semantic output and prove:

- Feature reuse;
- Story reuse;
- new candidate IDs assigned once;
- zero mutation during proposal;
- abort/no-apply leaves graph unchanged;
- apply twice is idempotent;
- blocking question prevents implicit apply;
- technical Epic with zero Stories is valid;
- unrelated ID collision fails.

## Focused live-model acceptance

Run first-attempt outputs for:

1. attendee support on existing Calendar Feature;
2. pure technical legacy-adapter refactor;
3. deliberately ambiguous Epic;
4. broad but healthy multi-capability Epic.

Do not retry until output looks good.

Inspect semantics, not just JSON validity.

## Real acceptance

Use one real ai-workflow Epic.

After accepted apply, run coverage + impact on a Feature/Story and verify the result is sufficient to begin a realistic modification without broad repository archaeology.

## Full gate

~~~bash
bun run typecheck
bun test
~~~

Then file-by-file KISS review.

Reject:

- second actor framework;
- state machine/workflow framework;
- semantic graph mutation during proposal;
- LLM inside CRUD;
- retrieval subsystem;
- automatic Ticket generation;
- generated technical Stories used as ceremony.

## Final Codex report

Maximum about 20 lines:

- files changed;
- canonical relations;
- deterministic tests;
- full test/typecheck result;
- live-model cases/result (Ticket 2);
- any deviation;
- exact remaining risk;
- commit SHA.

Update project handoff/AIWF ticket only with verified facts.
