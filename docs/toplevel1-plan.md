# Toplevel1 integrated design and plan

Status: design authority for the `toplevel1` branch. Planning only.

This branch combines two corrections that share one philosophy but must remain separate mechanisms:

1. **Preserve product meaning above implementation work.**
2. **Preserve basic Actor competence below specialized semantic discovery.**

The common rule is simple:

> Keep meaning explicit, keep primitives small and truthful, and let intelligence compose over them.

No new subsystem is justified unless a concrete actor journey proves the existing graph/tool contracts insufficient.

---

## 1. Product model

### Semantic refinement

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

This is a semantic graph, not a mandatory hierarchy.

A Flow may serve several Goals. A Story may need several Features. A Feature may enable many Stories. A Concept may govern many downstream scopes.

### Epic remains orthogonal

```text
Epic --targets--> Goal | Concept | Flow | UserStory | Feature
Epic --contains--> Ticket
```

Epic is temporary initiative/work scope. It does not own durable product meaning.

### Roles

- **Idea** — loose observations, motivations, circumstances, possibilities and undeveloped intent.
- **Goal** — meaningful outcome worth producing.
- **Concept** — durable product philosophy, mental model or design principle.
- **Flow** — coherent actor journey serving Goal(s).
- **UserStory** — concrete temporal episode inside a Flow.
- **Feature** — durable capability that enables one or more Stories.
- **Ticket** — executable engineering work.
- **Decision** — accepted concrete choice.
- **Aspect** — cross-cutting concern.

Canonical relation:

```text
Flow    --contains--> UserStory
Feature --enables---> UserStory
```

Legacy `Feature --contains--> UserStory` may be read for compatibility, but new Product Intent must not author it.

---

## 2. Development rule

Product development starts from **actor journeys**, not capability lists.

A journey can be short, but it should identify:

1. actor and circumstances;
2. intention or goal;
3. interaction/progression;
4. material branch/failure when relevant;
5. observable useful end state.

The actor may be human, coding agent, API client, scheduler, webhook, service or another system actor.

Capabilities, APIs, architecture, Tickets and tests derive from journeys.

Pure technical maintenance with no meaningful product journey may remain direct Ticket work. Do not manufacture ceremony.

Primary branch journeys:

- **J1.1** — add a new product feature from upstream intent;
- **J1.2** — extend an existing capability without duplicating it;
- **J1.3** — reject/park a capability with no demonstrated product purpose;
- **J2.1** — ask what to work on next;
- **J2.3** — detect product drift while implementing;
- **J2.4** — answer an unfamiliar project question by composing basic operations;
- **J3.1** — resolve an ordinary feature Ticket end-to-end;
- **J4.1** — assess a primary-flow regression at product severity;
- **J5.1** — expose the same semantic product truth through MCP;
- **J6.1** — keep pure technical work lightweight.

No implementation work in this branch should be justified only by a capability statement.

---

## 3. Actor execution model

The local Actor needs two capability layers:

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

### Basic substrate

A minimal set of primitives available from the first Actor step, independently of semantic classification.

The likely minimum is:

```text
discover_tools
+ one truthful general executor, probably run_command
```

This is a hypothesis to prove, not an API decision.

### Specialized capabilities

Semantic discovery remains responsible for efficient narrow domain capabilities: ticket, graph, product, testing, etc.

Discovery is therefore an optimization/specialization mechanism, not the gatekeeper for all useful execution.

### Hard constraints

- no full-registry fallback;
- no query-specific ordinal/ranking handlers;
- no second execution engine;
- no default `script_eval` while it can reach the global registry;
- no baseline codelet compilation/execution unless a real journey proves it necessary;
- public MCP remains a separate intentionally narrow boundary.

Detailed execution work is governed by `docs/fix-plan-1.md`.

---

## 4. Product reasoning

Once Product Intent exists, existing AIWF reasoning may look upward when relevant:

```text
Ticket
  -> Feature / UserStory
  -> Flow
  -> Goal
  + governing Concepts / Decisions / Aspects
```

This can support:

- relevance to product goals/journeys;
- severity as damage to actor outcomes;
- priority recommendations;
- product drift;
- missing journey branches;
- redundant/orphan capabilities.

These are derived judgments.

Do **not** persist opaque model-generated relevance/severity scores. Persist only explicit accepted artifacts, relations and priority decisions.

Keep semantic context bounded to the neighborhood actually relevant to the current artifact/work.

---

## 5. KISS audit of the current branch

The current top-level implementation is provisional. It was intentionally broad enough to explore the design, but the final solution should be smaller.

Before adding new implementation, classify every existing `toplevel1` code change as:

- **KEEP** — required by a named journey;
- **COMPAT** — only needed to read/preserve existing state;
- **REMOVE** — speculative, redundant, or not required by a journey.

The audit result should be a short table:

```text
file / change | journey | reason | KEEP / COMPAT / REMOVE
```

Likely core:

- `Goal`, `Concept`, `Flow` DCR entities;
- minimal predicates and validation;
- Product mutation/read support;
- Story-first authoring;
- bounded upstream Product Intent context;
- journey-level acceptance tests.

Changes that must specifically earn their place:

- Aspect inheritance rewrites;
- completeness-policy changes;
- broad coverage/impact changes;
- projection rewrites;
- public MCP expansion;
- migration machinery beyond reading legacy Feature→Story containment.

If a journey still works after removing one of these, remove it.

Expected result: **large conceptual gain, modest code delta**.

---

## 6. Implementation sequence

### Phase A — clean integrated baseline

1. `master` is already merged into `toplevel1`; do not create another feature branch.
2. Run focused tests, full `bun test`, and strict typecheck.
3. Produce the KEEP / COMPAT / REMOVE audit above.
4. Remove overreach.
5. Re-run focused/full tests and typecheck.

**Gate A:** mechanically healthy branch + minimal justified Product Intent delta.

No feature is considered accepted merely because Phase A is green.

### Phase B — J2.4 basic composition foundation

Follow `docs/fix-plan-1.md`:

1. audit the execution contract;
2. harden the smallest useful primitive set;
3. expose the substrate independently of semantic discovery;
4. give the Actor minimal environment guidance;
5. make complete tool composition observable;
6. run deterministic protocol tests;
7. run the exact live J2.4 acceptance journeys;
8. persist proof.

Do not redesign Product Intent in this phase.

**Gate B:** J2.4 succeeds live on the ordinary configured route without query-specific code.

### Phase C — minimal top-level Product Intent

Implement only what J1.1/J1.2/J1.3 require:

1. Goal / Concept / Flow ontology and relations;
2. narrative Stories contained by Flows;
3. Features enabling Stories;
4. technical work bypassing fake Product Intent ceremony;
5. reuse of existing store/mutation/Critic contracts;
6. legacy Feature→Story containment read compatibility only.

**Gate C:** one real new-feature journey succeeds through proposal → clarification/reuse → accepted Product Intent → derived work.

Entity unit tests are insufficient.

### Phase D — upward reasoning

For J2.3/J3.1/J4.1:

1. Product processing and Ticket investigation receive relevant upstream meaning;
2. implementation/review can detect Story/Concept conflicts;
3. severity/relevance/priority advice cites graph evidence;
4. missing/orphan intent is suggested, never silently persisted.

**Gate D:** real resolution/review catches a deliberate semantic conflict and explains it from graph evidence.

### Phase E — recommendation + external-agent parity

For J2.1/J5.1:

1. deterministic board/lease/blocker rules determine actionable candidates;
2. semantic product significance may help rank/explain the bounded set;
3. shell and MCP see the same Product Intent;
4. no hidden conversation-only requirements.

**Gate E:** shell and MCP reach consistent grounded conclusions over the same project state.

### Phase F — dogfood

Model AIWF itself using its own Goals, Concepts, Flows and narrative Stories.

Mandatory live journeys:

- J1.1;
- J2.1;
- J2.4;
- J3.1;
- J4.1;
- J5.1.

A green component suite without representative live journeys does not establish product correctness.

---

## 7. Verification model

Use two distinct test levels.

### Mechanism tests

Unit/integration tests prove:

- graph relations;
- mutation validation;
- tool isolation;
- cancellation/timeouts;
- trace truth;
- deterministic selection;
- compatibility behavior.

### Journey acceptance

Real configured-path tests prove:

- the actor understands and completes the intended journey;
- multiple components cooperate correctly;
- no hidden manual rescue is required;
- the final observable outcome is useful and truthful.

Mocked model decisions are mechanism evidence only.

Every real-use regression becomes a permanent journey acceptance case.

---

## 8. Stop conditions

Stop and simplify if implementation introduces:

- a second product/requirements database;
- ProductDesignManager / new planner / orchestration engine;
- query-specific semantic handlers;
- persisted AI relevance/severity scores;
- full-registry fallback;
- baseline access to global-registry eval;
- mandatory Goal/Flow/Story hierarchy for technical work;
- broad cross-cutting rewrites without a named journey;
- capability-level green tests presented as proof of a user journey.

The intended end state is not “more framework”. It is:

> **AIWF remembers why the product exists, understands the actor journeys work is meant to serve, and still has enough simple truthful execution power to investigate and act when no predesigned capability exactly matches the request.**
