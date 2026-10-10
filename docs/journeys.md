# AIWF Actor Journeys

These journeys are the product acceptance source for AIWF itself. They describe observable developer outcomes, not implementation mechanisms.

**Development rule:** a product change should name the journey that gives it meaning. Pure technical maintenance may explicitly bypass product-story ceremony. Component tests prove mechanisms; at least one realistic journey must prove material product behavior.

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

## J6 — Operate AIWF from the human shell

### J6.1 — Set up a supported workspace

A developer inspects `aiwf setup --check`, applies `aiwf setup`, then reads `aiwf doctor`. Setup distinguishes missing runtimes, required host changes, absent hosts and failures. Repetition reports already satisfied files without rewriting registrations. Doctor distinguishes local reachability, configured cloud credentials and runtime construction failures.

### J6.2 — Understand configuration inheritance

A maintainer sets global model X, sets project model Y, then resets the project model. Effective configuration returns to X while the project file contains no copied global value. Config inspection displays the effective value and source without credentials. Malformed configuration is actionable rather than silently overwritten.

### J6.3 — Choose only missing human input

In the interactive shell, `claim` offers eligible tickets and `move TKT-42` asks only for its lane. Complete commands execute immediately. Cancelling selection or setup review changes no domain state. Entity inspection uses structured views when available; plain mode has a compact text equivalent.

### J6.4 — Use the same work truth from every adapter

Shell and CLI ticket flow share argument handling and registry mutations. Artifact delegation retains the canonical parser/operation and returns grounded completion, needs-input or blocked results. MCP sees the same graph and leases; shell convenience introduces no hidden state.
