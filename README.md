# AI-Workflow (AIWF)

**Better software with AI: less time, fewer tokens, and less avoidable technical debt.**

AIWF is an AI-assisted engineering system that connects product intent, project knowledge, code, work and proof. It helps developers and coding agents produce **tight, production-quality software** through grounded reasoning, efficient execution and worthwhile verification—not just generate code or manage tasks.

**The ambition:** reduce LLM token use by **20–90%** and elapsed engineering time by **40–90%** on comparable tasks, without sacrificing correctness or maintainability. These are **targets to measure, not achieved benchmarks or guarantees**; results will depend on the task, project and comparison baseline.

Use AIWF through an external coding agent (MCP, project skill or supported plugin integration), or directly through its CLI, interactive shell and developing graphical Workspace. Its [approved Product Charter](docs/product-charter.md) anchors product intent; engineering is governed by [Dharmax-way](docs/definitions/dharmax-way.md) and its [Prime Directive](docs/definitions/prime-directive.md).

> **Status:** Active development. This README describes the product direction alongside usable existing entry points; the complete workflow is **not yet implemented or accepted**. The [active checkpoint](plans/AIWF-V1-ACTIVE-CHECKPOINT.md) records actual scope, priorities, blockers and evidence.

## Why AIWF?

Conventional AI coding sessions repeatedly rediscover the same project, pull large amounts of source into context, lose decisions between sessions, and can confuse plausible implementation with verified correctness. Product definitions, issues, code and tests often live in disconnected places.

AIWF instead keeps them related in a durable, semantically connected [Project Graph](docs/definitions/project-graph.md). It links the Product charter, Features, Aspects, User/Actor Stories, Epics, Tickets, tests, source artifacts, decisions and evidence. Grounded relationships support targeted discovery, dependency and impact analysis, refactoring and continuity. The graph does not pretend to know links that have not been established.

**An indexed graph or source query can sometimes answer in milliseconds and use zero LLM tokens.** AI reasoning is then spent on what actually calls for it, rather than repeatedly reconstructing known facts.

## What it provides

- **Product understanding:** Begin with a developer-approved [Product charter](docs/definitions/product.md). Discover, propose and revise product functionality ([Features](docs/definitions/feature.md)), reusable cross-cutting expectations ([Aspects](docs/definitions/aspect.md)) and complete [User/Actor Stories](docs/definitions/user-story.md). Surface material conflict or drift for the developer to answer.
- **Integrated work management:** Connect the charter and Stories to meaningful [Epics and Tickets](docs/definitions/ticket.md), including Bugs and direct technical work. Track priority, dependencies, state and acceptance obligations. Kanban and schedule/dependency views represent the same work, not separate issue stores.
- **Engineering intelligence:** Find relevant code, architecture, dependencies, tests, applicable Rules, capabilities and previous decisions with bounded, evidence-backed investigation rather than indiscriminate repository reads.
- **Efficient AI:** Combine deterministic operations, advisory System-1 and appropriately selected LLM reasoning. [llm-utils](https://github.com/dharmax/llm-utils) owns model/Actor concerns; AIWF uses relevant context and capabilities to reduce unnecessary calls, tokens and elapsed time.
- **Extensible skills:** Discover and use reusable skills that may combine knowledge with executable code. The intended lifecycle supports importing, composing and generating justified missing skills through the existing [semantic-registry](https://github.com/dharmax/semantic-registry) and [skill-manager](https://github.com/dharmax/skill-manager), rather than proliferating ad-hoc tools.
- **Engineering execution:** Investigate, prepare only what's necessary, reuse good existing capabilities or create justified missing ones, make guarded source changes, test and repair. The smallest correct implementation wins.
- **Worthwhile verification:** Prove the material result against approved behavior and applicable constraints, using tests and independent current evidence appropriate to the work—not an impressive test count, a green internal skeleton, or an agent's assertion of success.

**Example:** When asked to implement a save operation, AIWF should find the existing Feature, relevant Persistency Aspect, Stories and code first. It identifies missing obligations, obtains review of product decisions, derives a real acceptance test, and resolves only the necessary work. A subsequent session can follow the same identities and evidence rather than start over.

## Dharmax-way: from intent to working software

AIWF follows [Dharmax-way](docs/definitions/dharmax-way.md), a test-first engineering method. The [Prime Directive](docs/definitions/prime-directive.md) requires the simplest **correct** design and code throughout the touched scope, down to individual methods and statements. It resists unnecessary abstractions, duplication, assumption-driven implementation and accumulating avoidable technical debt.

For new product functionality, the normal path is:

```text
Developer intent + approved Product charter
    ↓ find/revise relevant Feature, Aspect, Epic and complete Story
Developer reviews and approves the effective User/Actor Story (US)
    ↓ generate/review the genuine US acceptance test first
Run the actual baseline when work begins (normally expected red)
    ↓ resolution Ticket owns satisfying that test
For multi-component work, optionally prove a separate full-flow skeleton
    ↓ one coding Ticket per temporary internal implementation stub
Replace placeholders and implement real behavior under the Prime Directive
    ↓ the same genuine US test passes without unfinished internal stubs
Independent current verification → truthful completion and durable evidence
```

The skeleton test proves that a path is connected; **it does not establish US acceptance**. Small changes need no ceremonial skeleton. Existing behavior may already pass at baseline; failure, success and verification history must never be fabricated. The process can loop back when evidence changes the understanding of a requirement or implementation.

An existing Bug normally belongs to the behavior it breaks. Justified technical maintenance may use a direct Ticket without inventing a product Story.

## One connected project, not a rigid hierarchy

The [Project Graph](docs/definitions/project-graph.md), backed by [Semantika](https://github.com/dharmax/semantika), is authoritative for AIWF-authored project records and their relationships; the repository owns actual source files and Git history. Markdown projections are readable views, not competing live databases.

A **Feature** is concrete functionality. An **Aspect** defines shared expectations across relevant functionality. A **US** describes an actor's actual episode and expected outcome; it drives genuine acceptance tests. An **Epic** groups delivery, while a **Ticket** defines bounded engineering work. These concepts inform one another; AIWF does not require one of each for every task.

See the [canonical definitions](docs/definitions/README.md) for exact meanings and field sets, and [architecture](docs/architecture.md) for ownership and current/target boundaries.

## Interfaces and ecosystem

AIWF is usable directly and as an engineering capability for other coding agents:

- **MCP / project skill / agent integration:** Delegate high-level investigation and Ticket resolution, with deliberate access to lower-level capabilities when useful. See the [AIWF skill](skills/ai-workflow/SKILL.md).
- **CLI and interactive shell:** Operate work, navigate project knowledge, inspect code, invoke capabilities and diagnose the environment. See [Operations](docs/operations.md).
- **Graphical Workspace:** Human-facing product/work inspection, editing and review. The intended sophisticated UX remains under development; the current Workspace is not the accepted final experience.

AIWF composes existing ecosystem owners rather than duplicating them: [Semantika](https://github.com/dharmax/semantika) for graph/state, [semantic-registry](https://github.com/dharmax/semantic-registry) for capability discovery, [skill-manager](https://github.com/dharmax/skill-manager) for skills and [llm-utils](https://github.com/dharmax/llm-utils) for AI runtime/model concerns. Exact source and change operations retain their established owners. This division supports performance, composability and maintainability.

## Getting started

AIWF is currently a **private Bun project** developed alongside its sibling repositories using local `file:../...` dependencies; it is not yet a standalone public npm installation.

From the AIWF checkout in that workspace:

```bash
bun install
bun run setup
aiwf doctor
```

Ensure `~/.local/bin` is on your `PATH`. Initialize another repository:

```bash
cd /path/to/project
aiwf init
aiwf doctor
aiwf help
```

Some currently available work commands:

```bash
aiwf status
aiwf next
aiwf investigate TICKET-ID
aiwf prepare TICKET-ID --critic auto
aiwf resolve TICKET-ID --completeness production --critic auto
```

Consult the installed command's `--help` for exact options. `init` creates local project state; it **does not invent or approve a Product charter**. Current supported public operations and release limitations are described in [Operations](docs/operations.md) and the [active checkpoint](plans/AIWF-V1-ACTIVE-CHECKPOINT.md).

## Development and verification

```bash
bun run check:definitions
bun test
bun run typecheck
bun run pack
```

The definitions check validates documentation structure, **not** product semantics. Some browser tests require Playwright Chromium (`bunx playwright install chromium`); opt-in live tests require the corresponding configured environment. Passing component tests alone does not prove an end-to-end engineering outcome.

AI coding agents working **on AIWF itself** should begin with [AGENTS.md](AGENTS.md), consult the relevant canonical definitions and follow the authorized [active checkpoint](plans/AIWF-V1-ACTIVE-CHECKPOINT.md). Plans and historical evidence are not claims about shipped functionality.

Further reading: [Definitions](docs/definitions/README.md) · [Governing design](plans/AIWF-DHARMAX-WAY-DESIGN.md) · [Staged plan](plans/AIWF-DHARMAX-WAY-PLAN.md) · [Actor journeys](docs/journeys.md) · [Documentation index](docs/README.md).

## License

MIT.
