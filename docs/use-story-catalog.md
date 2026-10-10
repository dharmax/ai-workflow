# AIWF Actor Journeys

**Status:** product acceptance source for AIWF development.

These are narrative journeys, not capability statements. Lower-level requirements and tests are derived from them.

## Hard development rule

No product development begins from a capability alone. Every product change must name the actor journey that gives it meaning, or explicitly classify the work as purely technical maintenance.

At least one acceptance test for a product change must exercise the real journey boundary used by the actor. Component/unit tests explain mechanisms; they do not prove the journey.

---

# Epic J1 — Developer turns product intent into grounded work

### J1.1 — Add a new product feature

A developer has an idea for a new product behavior and describes it naturally in AIWF. AIWF first looks for the Goal, Concepts, existing Flows, Stories and Features that make the idea meaningful. It points out relevant existing intent, asks only material unresolved questions, and proposes the smallest coherent Flow/Story/Feature changes. The developer accepts or revises the proposal. AIWF records the accepted Product Intent and produces/reuses executable Tickets, ending with a sensible next work item.

### J1.2 — Extend an existing capability without duplicating it

A developer asks to add behavior that resembles an existing Feature. AIWF finds the existing capability and the Stories it already enables, determines whether the new behavior belongs in an existing or new Flow/Story, and proposes an extension rather than a duplicate Feature. After acceptance, the graph has one durable capability with the new semantic relationships and only the genuinely missing work.

### J1.3 — Reject a feature with no demonstrated product purpose

A developer proposes a capability because it seems useful. AIWF cannot connect it credibly to any Goal, Flow or Story and explains the missing justification. It offers either to develop the upstream journey or keep the proposal as an Idea. No Feature/Tickets are silently created until the product meaning is accepted.

---

# Epic J2 — Developer performs daily work from product meaning

### J2.1 — Ask what to work on next

A developer opens the shell and asks, “what’s the next recommended ticket?” AIWF selects actionable candidates using deterministic board/lease/blocker facts, considers the Goal/Flow significance of the small candidate set where useful, and returns one recommendation with a concise rationale. It does not enter a long Actor loop, invent unavailable tools, or disagree with the deterministic selection without explicit semantic evidence.

### J2.2 — Resume work already in progress

A developer returns to a repository with an active lease or in-progress Ticket. AIWF recognizes the existing work, shows why it matters in its Story/Flow context, and recommends continuing it unless a concrete blocker or higher-priority condition makes that unreasonable. The developer can continue without reconstructing prior repository archaeology.

### J2.3 — Discover product drift while implementing

A developer asks AIWF to resolve a Ticket. During investigation AIWF sees the linked Feature/Story plus upstream Flow, Goal and governing Concepts. The locally obvious implementation conflicts with a product Concept or would violate the Story’s journey. AIWF flags the conflict before applying the change and either chooses an aligned implementation or requests the product decision needed to proceed.

### J2.4 — Solve an unfamiliar compound project goal without a predeclared workflow

A developer asks a compound question about the current project that is not covered by one named capability—for example, to determine the project's goal, critical path and missing work from several kinds of evidence. AIWF understands the requested outcome, gathers the needed evidence through ordinary capabilities/discovery, and may use ephemeral deterministic composition when the task is naturally a small program rather than a long sequence of LLM-mediated tool calls. Cheap System-1 assessment may advise that composition is likely useful, but the Actor remains free to ignore it or recover from wrong advice. Current-project claims are grounded in observed evidence; deterministic helper output is derived evidence. If one tactic fails, AIWF replans rather than surrendering. The developer does not need a query-specific command, predeclared workflow, or production logic coupled to words such as “second”, “least”, “rank”, or “critical path”.

### J2.5 — Configure an understandable cognitive runtime

A developer notices that sophisticated requests are slow, expensive or weak. From AIWF's interactive configuration surface they can inspect which cognitive resources are actually available—local models, OpenRouter/cloud access, effective task routes and relevant observed/recommended speed/cost/quality information—without exposing credentials. They adjust high-level routing preferences such as the default, fast and reasoning routes and supported speed/cost preferences, validate reachability, and save through AIWF's existing configuration system. On later runs AIWF can explain which route/model/provider was actually used. A configured credential or model name is never treated as proof of successful inference or quality.

---

# Epic J3 — AIWF owns engineering work to verified completion

### J3.1 — Resolve an ordinary feature Ticket

A coding agent hands AIWF a Ticket derived from an accepted Story. AIWF investigates the real code/test graph, prepares only missing execution detail, implements the smallest safe change, runs the relevant tests, independently verifies the Ticket criteria and material product intent, and finishes with a verified Ticket plus reusable evidence. The external agent does not reproduce AIWF’s internal workflow manually.

### J3.2 — Recover from a failed implementation without wandering

AIWF implements a Ticket and a relevant test fails. It preserves the failure evidence, identifies the smallest useful diagnostic step, performs bounded repair, and reruns the required evidence. If repair cannot be justified within bounds, it stops with the concrete unresolved problem rather than consuming arbitrary Actor steps.

### J3.3 — Reuse still-valid proof

A developer asks AIWF to resolve a previously verified Ticket again. AIWF sees that the acceptance contract, relevant source, tests and semantic obligations are unchanged, reuses the existing proof, and completes quickly without another implementation/review cycle. If any material input changed, it invalidates the old proof and resumes real verification.

### J3.4 — Turn grounded implementation intent into verified source

A Ticket resolver or coding Actor has established a concrete implementation outcome and an exact existing source target, or a bounded destination for one new source artifact. AIWF builds a small provenance-bearing synthesis context from the Ticket/Product/Decision/Aspect graph plus exact language evidence from TypeScript/LSP. That context identifies the behavior required, the source being changed, relevant reusable implementation, material caller/dependency contracts and the proof expected. One backend-neutral generative source boundary produces a candidate. AIWF performs cheap candidate sanity checks, converts the candidate into an ordinary concrete change such as replace_symbol or create_file, applies it only through the existing Causal Change Engine, and verifies the real project. If verification fails, AIWF preserves the concrete failure, refreshes only the relevant graph/LSP neighborhood and performs bounded repair through the same synthesis boundary. Generated tests may help candidate sanity but never certify their own behavioral oracle. If the requested mutation is deterministic, AIWF uses the mature deterministic language/change primitive instead of generative synthesis. The external agent never has to gather repository context, manufacture replacement source or reproduce this internal choreography.

---

# Epic J4 — Product meaning guides diagnosis and priority

### J4.1 — Daily workflow regression is treated as severe

A developer performs an ordinary shell action that should be trivial and it fails. AIWF records the defect and traces which Story/Flow/Goal is broken. Even if the defective function is small, AIWF explains that severity is high because a primary daily journey is unusable, and recommends priority accordingly without pretending severity and priority are the same thing.

### J4.2 — AIWF notices a missing journey branch

While reviewing a feature, AIWF sees that the happy-path Story is represented but an important failure/recovery branch required by the Flow has no Story or evidence. It explains the gap and offers a concise Story addition. The developer may accept, revise or reject it; AIWF does not silently expand scope.

### J4.3 — AIWF notices orphan implementation

While reviewing Product Intent, AIWF finds a Feature or significant Ticket that has no credible Story/Flow/Goal linkage. It distinguishes legitimate technical infrastructure from unexplained product capability. For the latter it asks for product meaning or proposes the missing upstream linkage instead of assuming the artifact is relevant.

---

# Epic J5 — Human and external agents share one semantic product truth

### J5.1 — External coding agent delegates rather than reconstructs context

An external coding agent receives a Ticket and calls AIWF through MCP. AIWF returns/uses the same Goal/Concept/Flow/Story context available in the shell, performs the canonical artifact operation, and returns complete/needs_input/blocked truthfully. The external agent does not need a separate requirements document or hidden conversation state.

### J5.2 — Human changes product philosophy and downstream work is challenged

A product owner accepts a new or revised Concept. Later AIWF reviews affected Flows, Stories, Features and active work and points out material conflicts or obsolete assumptions. It proposes changes with provenance; it does not bulk-rewrite downstream intent merely because the Concept changed.

---

# Epic J6 — Technical work stays lightweight

### J6.1 — Pure refactoring does not require fake product stories

A maintainer needs to remove an obsolete persistence adapter with no change to observable product behavior. They create or receive a technical Ticket directly. AIWF resolves it using architecture/Decision/Aspect evidence without manufacturing Goal/Flow/Story artifacts merely to satisfy a hierarchy. The work still has a verifiable engineering acceptance contract.

---

## Acceptance-suite implications

The first mandatory live journey regressions are:

1. **J2.1** through the real shell/NL path, compared with deterministic `next`.
2. **J2.4** through the real local Actor and the shared compound-prompt gate in `docs/advanced-actor-plan.md`, including simple-vs-compound controls, wrong/unavailable System-1, bounded discovery, compiler failure, cancellation and the exact live regression.
3. **J1.1** through real Product Intent proposal/review/apply boundaries.
4. **J3.1/J3.4** through real `resolve_ticket` lifecycle boundaries, including a graph/LSP-grounded generative source change through the canonical backend-neutral synthesis boundary and a deterministic-change control that bypasses synthesis.
5. **J3.2** through a real failing implementation followed by bounded repair that refreshes relevant evidence and reuses the same synthesis boundary.
6. **J4.1** using a defect connected to a primary Flow/Goal.
7. **J5.1** through the public MCP surface.

Mocked classifier/model/tool selections may support lower-level tests but cannot be the sole proof for these journeys.
