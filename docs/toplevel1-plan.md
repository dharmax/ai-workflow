# Toplevel1 integrated design and plan

Status: design authority for the `toplevel1` branch. Planning only.

This branch combines two related corrections:

1. **Product meaning must exist above Features/Tickets.**
2. **The Actor must retain basic compositional competence below specialized semantic tools.**

They share one principle: preserve meaning and let intelligence operate over small, truthful primitives. They must not be fused into one subsystem.

## 1. Two layers, one product philosophy

### Product semantic layer

```text
actor reality / observations / motivations
                  │
                Idea
                  │ inspires
                  ▼
                Goal
                  │ inspires
                  ▼
              Concept
                  │ governs
                  ▼
                Flow ──serves──> Goal
                  │ contains
                  ▼
             UserStory
                  ▲
                  │ enables
               Feature
                  ▲
                  │ implements
               Ticket
                  │
              Code / Tests
```

This layer explains **why work exists and what actor journey it serves**.

### Execution layer

```text
user request
   │
   ├─ tiny dependable basic substrate
   │
   └─ small specialized semantic capabilities
             │
         bounded discovery
             │
      observations / actions
             │
          LLM reasoning
             │
        grounded outcome
```

This layer explains **how the Actor can obtain evidence and act without requiring every request to have a predesigned tool**.

The layers meet only through existing tool/artifact contracts. Product Intent does not create a second planner; the execution substrate does not become a second semantic graph.

## 2. Governing development rule

Product work starts from actor journeys.

A journey may be short, but it must identify the actor/circumstance, intention, progression through the product, and observable end state. Capabilities, architecture and tests derive from it.

Pure technical maintenance may remain direct Ticket work.

For this branch the primary journeys are:

- **J1.1** add a new product feature from upstream intent;
- **J2.1** ask what to work on next;
- **J2.3** catch product drift while implementing;
- **J2.4** compose an unfamiliar project question from basic operations;
- **J3.1** resolve an ordinary feature Ticket;
- **J4.1** treat a primary-flow regression with product-level severity;
- **J5.1** share the same semantic product truth through MCP;
- **J6.1** keep pure technical work lightweight.

## 3. Product Intent design

Only three new durable semantic concepts are justified now:

- **Goal** — meaningful outcome;
- **Concept** — durable product idea/philosophy/mental model;
- **Flow** — coherent actor journey serving Goal(s).

`Idea`, `UserStory`, `Feature`, `Epic`, `Ticket`, `Decision` and `Aspect` remain existing concepts with clarified roles.

Canonical new relations:

```text
Idea    --inspires--> Goal | Concept | Flow
Goal    --inspires--> Concept
Flow    --serves----> Goal
Concept --governs---> Flow | UserStory | Feature | Epic | Ticket
Flow    --contains--> UserStory
Feature --enables---> UserStory
Epic    --targets----> accepted Product Intent
```

`Feature --contains--> UserStory` is legacy compatibility, not new authoring semantics.

The graph remains many-to-many. No mandatory seven-level artifact ceremony.

## 4. Derived judgment, not stored pseudo-truth

AIWF may reason about:

- relevance to Goals/Flows/Stories;
- severity as damage to actor journeys/outcomes;
- priority as an actionable decision informed by severity, relevance, urgency, dependencies and effort;
- redundancy, missing journey branches and product drift.

Do not persist opaque model-generated relevance/severity scores. Persist explicit accepted artifacts/relations/priority decisions only.

## 5. KISS correction to the current branch

The current branch already contains a broad first implementation of the top-level model. Treat it as **provisional**, not accepted implementation.

Before adding more code, audit the diff against the journeys above and shrink it.

Core likely-needed implementation:

- `Goal`, `Concept`, `Flow` DCR entities;
- minimal predicates/validation;
- Product mutation support;
- Story-first authoring (`Flow contains Story`, `Feature enables Story`);
- minimal Product read/create/update/link surfaces;
- bounded upstream Product Intent context for Product processing/Ticket investigation;
- story-level acceptance tests.

Changes that must earn their place from a journey before being retained:

- Aspect inheritance changes;
- completeness-policy changes;
- broad coverage/impact semantics;
- projection rewrites;
- public MCP expansion;
- any migration machinery beyond reading legacy `Feature contains Story`.

If removing one of those changes preserves the journeys, remove it. The expected final code delta should be modest.

## 6. Execution-substrate design

TKT-8D3F / J2.4 is a generic foundation and should be completed before relying on increasingly sophisticated Product reasoning.

The preferred shape is:

```text
always available:
  discover_tools
  + smallest safe basic executor (likely run_command after contract audit)

initial semantic discovery:
  0..small specialized tools

later:
  bounded discover_tools additions
```

Do not expose the full registry. Do not permanently expose `script_eval` while it can access the global registry. Do not make codelet compilation/execution baseline unless live journeys require it.

First make the chosen substrate truthful for cancellation, timeout, failure, output/truncation and isolation; only then expose it by default.

## 7. Implementation order

### Phase A — establish a clean integrated baseline

1. Master is merged into `toplevel1`; do not create another feature branch.
2. Run focused/full tests and typecheck to establish whether the merged branch is mechanically healthy.
3. Audit the current top-level Product Intent diff and classify each changed file as:
   - required by a named journey;
   - compatibility-only;
   - speculative/overreach.
4. Remove speculative changes before building further.

No feature is considered complete in Phase A.

### Phase B — finish J2.4 execution foundation

Follow `docs/fix-plan-1.md`:

1. execution-contract audit;
2. harden smallest basic primitive(s);
3. expose baseline surface independently of semantic discovery;
4. give minimal environment guidance;
5. fix complete observable trace;
6. deterministic protocol tests;
7. exact live actor-story acceptance and persisted proof.

Do not redesign Product Intent in this phase.

### Phase C — establish minimal top-level Product Intent

From J1.1/J1.2/J1.3:

1. keep/add only the minimal Goal/Concept/Flow ontology and relations;
2. make new Stories narrative and Flow-owned;
3. author Feature `enables` Story;
4. allow technical work to bypass fake product ceremony;
5. reuse existing Product mutation/critic/store contracts.

Acceptance is one real new-feature journey through proposal/review/apply, not merely entity unit tests.

### Phase D — let existing intelligence look upward

From J2.3/J3.1/J4.1:

1. Product processing and Ticket investigation receive relevant Story/Flow/Goal/Concept context;
2. implementation/review can flag Concept or Story conflicts;
3. severity/relevance/priority recommendations cite graph evidence;
4. missing branches/orphan capabilities are suggestions, never silent mutations.

Keep context bounded to the relevant semantic neighborhood.

### Phase E — product-aware recommendation and external-agent parity

From J2.1/J5.1:

1. deterministic board/lease/blocker selection remains authoritative for actionable candidates;
2. semantic product significance may rank/explain only the bounded candidate set where useful;
3. shell and MCP observe the same Product Intent truth;
4. no hidden conversation-only requirements.

### Phase F — dogfood and acceptance

Model AIWF itself with its own Goals, Concepts, Flows and Stories.

Mandatory live journeys include J1.1, J2.1, J2.4, J3.1, J4.1 and J5.1. A green component suite without these representative paths is insufficient.

## 8. Stop conditions

Stop and simplify if implementation introduces:

- a second product/requirements database;
- a ProductDesignManager/planner/orchestration engine;
- query-specific semantic handlers;
- persisted AI relevance/severity scores;
- full-registry fallback;
- mandatory artifact hierarchy for technical work;
- broad cross-cutting rewrites not required by a named journey.

The desired result is a large conceptual improvement with a small mechanical footprint.
