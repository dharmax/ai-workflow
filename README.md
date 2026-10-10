# AI-Workflow 2.0

**AIWF is an artifact-first engineering system for humans and coding agents.** It keeps product intent, engineering work, source evidence, tests, decisions, and verification in one durable semantic project graph, then uses that graph to investigate and resolve work without reconstructing the project from chat history or repeatedly scanning the repository.

AIWF is Bun-first and backed by `@dharmax/semantika`. Its normal interface is high-level artifact delegation; exact graph, source, change, test, Git, and knowledge primitives remain available for deliberate drill-down.

## The idea

A Ticket is not merely a task description. AIWF can connect it upward to the product reason for the work and downward to the code and proof that implement it:

```text
Goal / Concepts
      ↓
     Flow
      ↓
 User Story
      ↓
   Feature
      ↓
    Ticket
      ↓
source / tests / evidence
```

Pure technical work may start directly at a Ticket. AIWF does not manufacture product ceremony where none is useful.

The graph is durable project state. Markdown projections and chat transcripts are not the source of truth.

## Start here

Inside an AIWF project:

```bash
aiwf investigate TICKET-ID
aiwf prepare TICKET-ID --critic auto
aiwf resolve TICKET-ID --completeness production --critic auto

aiwf process epic EPIC-ID --completeness production --depth 1 --max-artifacts 24
aiwf status
aiwf next
aiwf doctor
```

The same workflow is available through the interactive shell and the public MCP surface.

A normal resolution is deliberately boring:

```text
investigate
   ↓
prepare only what is missing
   ↓
make the smallest justified change
   ↓
run relevant tests
   ↓
bounded repair if needed
   ↓
independent acceptance verification
   ↓
record reusable evidence
```

AIWF returns truthfully: complete, needs input, or blocked. It does not call a task complete merely because an agent produced code.

## Core laws

1. **The graph is authoritative.** Repository + semantic graph are durable state; Markdown is projection/UI.
2. **Product work starts from actor reality.** Goals, Flows and Stories explain why Features and Tickets exist. Technical maintenance can remain technical.
3. **Investigate before inventing.** Reuse existing intent, capabilities, symbols, tests and decisions before creating new ones.
4. **Narrow before reasoning.** Deterministic graph/source evidence and semantic discovery reduce context before expensive model work.
5. **One execution stack.** AIWF composes shared ecosystem packages rather than growing parallel registries, routers, persistence layers or execution engines.
6. **Deterministic work stays deterministic.** LLMs handle semantic judgment and synthesis; exact graph, language, mutation and verification machinery handles exact work.
7. **Generated source is only a candidate.** Source synthesis is grounded in investigated evidence, becomes an ordinary safe change, and is accepted only by real verification.
8. **Tests are evidence; journeys are acceptance.** Unit tests prove mechanisms. Product behavior requires realistic actor-journey proof.
9. **Failure must remain visible.** Missing evidence, tool failure, skill failure and verification failure must not quietly become absence or success.
10. **Keep it small.** Prefer deletion and composition over new abstractions. No process theater.

## Architecture at a glance

AIWF has three conceptual layers:

- **Intent and work graph** — Goals, Concepts, Flows, Stories, Features, Tickets, Decisions, Aspects and evidence.
- **Engineering operations** — investigate, prepare, resolve, process, safe change, test, verify, metrics and projections.
- **Cognitive/runtime layer** — bounded semantic capability discovery, System-1 hints, configured model routing, Actor execution, project skills and grounded source synthesis.

`@dharmax/semantic-registry` selects executable capabilities semantically. `@dharmax/skill-manager` owns skill discovery, activation and execution. AIWF composes them. Project skills are discovered from the project's `skills/` tree; additional skill sources must be configured explicitly. There is no sibling-checkout or host-specific global-directory magic.

The Actor starts from a deliberately small capability surface. Semantic misses do not expand to the global registry. Model/provider routing belongs to `llm-utils`, not to ad-hoc AIWF logic.

For source changes, AIWF uses exact deterministic mutation whenever possible. When real synthesis is needed, `Ticket.resolve()` supplies a bounded investigated dossier to the synthesizer; the generated source is then wrapped in an ordinary change such as `replace_symbol` and sent through the same change and verification machinery as any other edit.

See [Architecture](docs/architecture.md) for the complete model.

## Install and initialize

From the AIWF repository:

```bash
aiwf setup
```

Inside a project:

```bash
aiwf init
aiwf doctor
```

`init` creates the `.ai-workflow/` state/configuration area, indexes source/test structure into the semantic graph, and creates human-readable projections. `doctor` checks the runtime, Git state, graph, projections, leases, model configuration and MCP integration.

## Interfaces

### CLI and shell

Run `aiwf help` for the current command surface. Important groups are:

- artifact work: `investigate`, `prepare`, `resolve`, `process`;
- work navigation: `status`, `next`, `tickets`, `epics`, `features`, `stories`;
- code intelligence: `symbol`, `graph`, `callers`, `deps`, `slice`, `outline`, `blast`, `debug`;
- safe engineering: `patch`, `scaffold`, tests and change preview/apply through the registry;
- diagnostics: `doctor`, `audit`, `metrics`;
- cognition: `exec`, model configuration, traces and project knowledge/skills.

The interactive shell adds structured views, semantic natural-language execution and inspectable execution traces.

### MCP

The public MCP surface is intentionally smaller than AIWF's internal registry. External coding agents should delegate artifact work first—especially `resolve_ticket`—and use primitive tools only for deliberate investigation or a concrete blocker.

Internal capabilities do not become public merely because they exist.

### Skills

`skills/ai-workflow/SKILL.md` is the operational contract for external coding agents using AIWF. It should be read before manually reproducing AIWF's workflow.

## Verification

```bash
bun test
bun run typecheck
bun run pack
```

Use focused tests first while developing, then the repository gates. Opt-in live acceptance tests are reserved for journeys that genuinely require the configured model/runtime.

A green component suite is not proof of a product journey. Conversely, a model's confident final narration is not proof that a tool, skill, test or acceptance step actually ran.

## Documentation

There are intentionally only three durable design documents:

- [Architecture](docs/architecture.md) — boundaries, graph model, cognition, change, synthesis and verification.
- [Actor journeys](docs/journeys.md) — the product behavior AIWF itself is expected to satisfy.
- [Operations](docs/operations.md) — practical use, investigation, debugging, traces, metrics and failure handling.

Historical audits, implementation plans and experiment reports belong in Git/AIWF evidence, not in the permanent documentation surface.

## License

MIT.
