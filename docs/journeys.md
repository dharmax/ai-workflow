# AIWF Actor Journeys

These are public product/actor acceptance scenarios, not a list of internal methods. The governing definitions are in [Dharmax-way design](../plans/AIWF-DHARMAX-WAY-DESIGN.md); implement in the order of the [staged plan](../plans/AIWF-DHARMAX-WAY-PLAN.md).

**Status:** DW-01–DW-09 below are target Stories for the staged redesign; they are **not claims of current implementation**. A Story title alone is not a Story. Each scenario includes actor intent, initial state, action and expected observable result. Confirm the developer-approved specification before making its test authoritative. The earlier J-series catalog is retained below for reconciliation, not a competing set of implementation instructions.

## Dharmax-way target User/Actor Stories

### DW-01 — Define a Feature
- **Actor / intent:** Developer wants Avatar Filters to become a clearly defined product capability with priority and applicable Aspects.
- **Initial state:** AIWF project opens in Workspace; Feature is absent (or an existing matching Feature is visible).
- **Action:** Developer creates or revises the Feature, reviews its definition, priority and Aspect links, accepts and reloads.
- **Expected result:** One canonical Feature with exactly the approved definition and relationships persists; no AI proposal is implicitly accepted or duplicated.

### DW-02 — Review and edit a complete Story
- **Actor / intent:** Developer wants `Save filtered avatar` to describe real user behavior, not merely a label.
- **Initial state:** AIWF displays an AI-proposed Story, not yet accepted, associated with Avatar Filters.
- **Action:** Developer edits Actor, Intent, Initial State, Action, Expected Observable Result and material failure/bounds; accepts and reopens it.
- **Expected result:** The exact edited scenario persists as accepted. Rejecting or abandoning a proposal leaves canonical product intent unchanged. Ambiguous migrated legacy Stories remain visible as needing review, never silently completed.

### DW-03 — Derive work without inventing the product
- **Actor / intent:** Developer wants engineering work and tests for an accepted Feature.
- **Initial state:** Avatar Filters and its complete Stories have been reviewed; some related entities may already exist.
- **Action:** Developer requests proposed decomposition, edits/approves relevant Epic, Tickets, relations and corresponding Story test specifications; repeats the request after revising intent.
- **Expected result:** Coherent minimal canonical work, reused stable identities, materialized runnable Story tests skipped only where implementation has not started. No duplicate Features/Stories, fabricated acceptance criteria or hidden AI acceptance. A rejected proposal has no side effects.

### DW-04 — Implement a Story test-first
- **Actor / intent:** Coding agent wants to implement the developer-approved Save Story and prove it works.
- **Initial state:** Corresponding runnable public-interface Story test exists and is skipped because work has not started; unrelated Story remains in backlog.
- **Action:** Start the Ticket, activate the relevant test, observe expected missing-behavior failure, implement through guarded changes, rerun the same Story.
- **Expected result:** Red is attributable to missing behavior, implementation makes the real UI/API Story green, relevant Aspect obligations hold, unrelated backlog test remains skipped. Infrastructure/provider failure never masquerades as expected red or green.

### DW-05 — Change one authoritative Aspect
- **Actor / intent:** Developer changes the shared Persistency policy and needs to understand its consequences.
- **Initial state:** Persistency applies to multiple known entities; some have current Story evidence and unrelated entities are present.
- **Action:** Edit the single Aspect definition; inspect graph-grounded affected paths and approve any required updates.
- **Expected result:** One authoritative policy revision; correct directly/indirectly affected Stories, source and tests are identified with traceable paths; uncertain impact is marked unknown. Unrelated entities and historical completed Tickets are not indiscriminately rewritten/reopened; affected current proof is not falsely reused.

### DW-06 — Fix existing product behavior
- **Actor / intent:** Developer reports that an accepted Story behaves incorrectly.
- **Initial state:** Existing Feature/Story and reproducible failing public behavior are present.
- **Action:** Edit the existing definition if needed; reproduce failure with its Story test; resolve the bounded correction and rerun it.
- **Expected result:** Corrected observable behavior and current evidence under the same canonical product identities, without cloning the old Feature/Story or changing unrelated behavior.

### DW-07 — Resolve already-implemented work efficiently
- **Actor / intent:** Maintainer wants independent acceptance of an implemented narrow prerequisite using available evidence.
- **Initial state:** Semantika prerequisite is In Progress, implementation and valid checks are available, Gate 5 still depends on it.
- **Action:** Invoke the current public Ticket resolution path with explicit evidence and a verified working provider when semantic verification genuinely requires one.
- **Expected result:** It verifies and completes independently or reports the actual unmet criterion; no redundant FileNode touring, unbounded context retransmission, false Done, implicit dependency enlargement or provider-error-as-Story-failure. Leases are released on failure.

### DW-08 — Export and restore a project
- **Actor / intent:** Developer wants to move an AIWF project without dependence on live Markdown projection files.
- **Initial state:** Canonical project has Features, Stories, Aspects, relationships and relevant execution evidence.
- **Action:** Export explicitly, validate/preview restore into a fresh root, restore and operate through UI/CLI/MCP.
- **Expected result:** Stable identities and approved definitions/relations survive. External source/test references are revalidated, stale execution isn't falsely current, failed import is all-or-nothing, and normal operation needs no auto Markdown sync.

### DW-09 — Refuse unsafe or untrue completion
- **Actor / intent:** Developer needs AIWF to protect the project and report failures accurately.
- **Initial state:** Independent scenarios have an unapproved proposal, stale edit, unauthorized secondary file, missing mandatory Rule, failed Story, inconsistent persistence or unavailable provider.
- **Action:** Attempt corresponding public proposal acceptance, guarded work or Ticket completion.
- **Expected result:** Each prohibited operation safely refuses with specific cause; no partial canonical success, lost unrelated work, false accepted Story or Done/verified Ticket. Previously demonstrated PD-01, dirty-target, concurrent admission and rollback regressions remain effective.

## Existing J-series journey catalog (historical/current; reconcile with DW Stories rather than duplicating active definitions)

## J1 — Turn product intent into grounded work

### J1.1 Add a new product feature

A developer describes desired behavior naturally. AIWF finds the relevant Goals, Concepts, Flows, Stories and Features before proposing anything new. It asks only material unresolved questions, proposes the smallest coherent intent change, records what the developer accepts, and creates or reuses only genuinely missing work.

### J1.2 Extend without duplication

When requested behavior resembles an existing Feature, AIWF discovers the existing capability and the Stories it enables. It proposes an extension or new relationship where appropriate rather than creating a duplicate capability.

### J1.3 Reject unsupported capability

When a proposed capability has no credible product purpose, AIWF explains the missing Goal/Flow/Story connection and offers to develop the upstream intent or keep the proposal as an Idea. It does not silently manufacture Features and Tickets.

## J2 — Work from product meaning

### J2.1 Recommend the next work

AIWF selects actionable candidates from deterministic board, lease and blocker facts, then uses bounded product significance where useful to rank or explain them. It returns a concise grounded recommendation without a long Actor loop.

### J2.2 Resume existing work

When work is already leased or in progress, AIWF recognizes it and its product context. It recommends continuing unless there is a concrete blocker or stronger priority reason. The developer does not repeat repository archaeology.

### J2.3 Detect product drift during implementation

While resolving a Ticket, AIWF sees the relevant Story/Flow/Goal and governing Concepts/Decisions/Aspects. If the locally obvious implementation conflicts with them, it flags the conflict before mutation and either chooses an aligned implementation or asks for the required product decision.

### J2.4 Solve an unfamiliar compound project goal

A developer asks a compound question not covered by one predeclared capability. AIWF understands the whole outcome, gathers current evidence, uses ordinary capabilities/discovery and deterministic computation where useful, observes results, replans when a tactic fails, and returns a grounded answer or concrete blocker.

The developer does not need a query-specific command for words such as “second”, “least”, “rank” or “critical path”.

### J2.5 Understand the cognitive runtime

A developer can inspect the effective local/cloud cognitive resources, task routes and observed runtime behavior without exposing credentials. They can change high-level routing preferences through existing configuration. Later runs can report which route/model/provider actually executed. Configuration alone is never presented as proof of reachability or quality.

## J3 — Own engineering work to verified completion

### J3.1 Resolve an ordinary Ticket

An external coding agent delegates an accepted Ticket. AIWF investigates real code/test/product evidence, prepares only missing detail, makes the smallest safe change, runs relevant tests, performs bounded repair when justified, independently verifies acceptance and material intent, and records reusable evidence.

The external agent should not reproduce this choreography manually.

### J3.2 Recover without wandering

When implementation fails a relevant test, AIWF preserves the failure, chooses the smallest useful diagnostic step, performs bounded repair and reruns required evidence. If it cannot justify repair within bounds, it stops with the concrete unresolved problem.

### J3.3 Reuse valid proof

When a previously verified Ticket is resolved again and its acceptance contract, relevant source, tests and obligations are unchanged, AIWF reuses the proof. Material change invalidates stale proof and triggers real verification.

### J3.4 Synthesize grounded source

When resolution has established the required behavior and an exact source target, AIWF builds a small provenance-bearing synthesis context from the investigated dossier. A backend-neutral synthesizer produces candidate source only. AIWF converts it to an ordinary safe mutation and verifies the real project.

No exact target means no synthesis. Deterministic mutations bypass generation. Generated tests may help but cannot certify their own oracle.

## J4 — Let product meaning guide diagnosis

### J4.1 Treat a primary-flow regression as severe

A small implementation defect that breaks an ordinary primary actor journey is recognized as severe because of its product effect, not its line count. AIWF explains the connection without conflating severity with priority.

### J4.2 Notice a missing journey branch

If a Flow has an important failure/recovery branch with no Story or evidence, AIWF identifies the gap and proposes a concise addition. It does not silently expand scope.

### J4.3 Notice orphan implementation

AIWF distinguishes legitimate technical infrastructure from unexplained product capability. A significant Feature/Ticket with no credible product linkage is challenged rather than assumed relevant.

## J5 — Share one semantic truth

### J5.1 External agent delegates instead of reconstructing context

Through MCP, an external coding agent sees and uses the same product/work truth available in the shell. AIWF performs the canonical artifact operation and returns complete, needs-input or blocked truthfully; no hidden chat context is required.

### J5.2 Product philosophy changes

When a Concept or durable product decision changes, AIWF can identify materially affected downstream intent and work, explain conflicts with provenance, and propose changes. It does not bulk-rewrite downstream artifacts merely because an upstream concept changed.

## J6 — Keep technical work lightweight

### J6.1 Pure refactoring needs no fake story

A maintainer can resolve a technical Ticket using architecture, Decision and Aspect evidence without manufacturing Goal/Flow/Story artifacts. The work still requires a concrete engineering acceptance contract.

## Acceptance discipline

The most important live regression boundaries are:

- J1.1 through real product-intent proposal/review/apply;
- J2.1 through the real shell/NL path against deterministic selection;
- J2.4 through the configured Actor with bounded discovery and recovery;
- J3.1/J3.4 through real `Ticket.resolve()`, including grounded synthesis and a deterministic-change control;
- J3.2 through a real failing implementation and bounded repair;
- J4.1 through a defect connected to a primary Flow/Goal;
- J5.1 through the public MCP surface.

Mocked classifier/model/tool decisions are useful mechanism tests, not sufficient journey proof.

## J7 — Operate AIWF from the human shell

### J7.1 — Set up a supported workspace

A developer inspects `aiwf setup --check`, applies `aiwf setup`, then reads `aiwf doctor`. Setup distinguishes missing runtimes, required host changes, absent hosts and failures. Repetition reports already satisfied files without rewriting registrations. Doctor distinguishes local reachability, configured cloud credentials and runtime construction failures.

### J7.2 — Understand configuration inheritance

A maintainer sets global model X, sets project model Y, then resets the project model. Effective configuration returns to X while the project file contains no copied global value. Config inspection displays the effective value and source without credentials. Malformed configuration is actionable rather than silently overwritten.

### J7.3 — Choose only missing human input

In the interactive shell, `claim` offers eligible tickets and `move TKT-42` asks only for its lane. Complete commands execute immediately. Cancelling selection or setup review changes no domain state. Entity inspection uses structured views when available; plain mode has a compact text equivalent.

### J7.4 — Use the same work truth from every adapter

Shell and CLI ticket flow share argument handling and registry mutations. Artifact delegation retains the canonical parser/operation and returns grounded completion, needs-input or blocked results. MCP sees the same graph and leases; shell convenience introduces no hidden state.
