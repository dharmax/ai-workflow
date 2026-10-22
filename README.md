# AI-Workflow (AIWF)

**AI-assisted software engineering that keeps product intent, implementation and proof connected.**

**The goal**  create and keep the codebase and design tight, production quality, and using  20%-90% less tokens and achieving that in 40%-90% less time. 

## What it does

AIWF connects work that is otherwise fragmented across chats, repositories, plans, issue boards, coding agents and test reports.

It helps developers and coding agents take a product idea, requirement, defect or engineering need through understanding, definition, implementation and WORTHWHILE verification. It brings product knowledge, code intelligence, work management and execution into one durable workflow governed by [Dharmax-way](docs/definitions/dharmax-way.md) and
 Its [Prime Directive](docs/definitions/prime-directive.md) that make sure technical debt don't creep in and work is never based on assumptions and KISS.   


##How it does it 

A knowledge graph connects everything with semantic accuracy: user-stories, features, aspects and requirements, work-tickets, tests, code artifacts, decisions, and more . It knows all the connections and thus makes finding artifacts, doing impact-analysis, refactoring etc. in sometimes zero tokens and milliseconds. 

Issue tracking - from the top-level Product Charter, to epics, down to bugs and todos - all in, tightly integrated. The AI checks for conflicts and investigate dependencies and plan implementation and applies it.

It works either as a plugin/mcp/skill to your favorite AI Coding Agent as well as a standalone shell, with sophisticated UI.

It uses @dharmax/llm-utils, to abstractize and optimize the AI economics, where both System-1 and LLMs are being used for maximum efficiency and accuracy.  

> **Status:** Active development. This README describes the intended product as well as useful existing entry points; the complete workflow is **not yet implemented or accepted**. For actual current scope and evidence, see the [active checkpoint](plans/AIWF-V1-ACTIVE-CHECKPOINT.md).


## Features

- **Product understanding:** Work from a developer-approved Product charter, discover or propose Features, cross-cutting Aspects and complete User/Actor Stories; surface material conflict or drift for a developer decision.
- **Engineering intelligence:** Find the relevant code, architecture, dependencies, existing capabilities, applicable Rules, tests and past decisions without repeatedly loading the entire repository into an LLM.
- **Useful work management:** Propose and reconcile real Epics and Tickets, with priorities, dependencies, state and acceptance obligations—without inventing work to populate a hierarchy.
- **Engineering execution:** Investigate, prepare only what's missing, choose existing tools or justified new capabilities, make guarded changes, run tests and correct observed failures.
- **Verification and continuity:** Independently establish current results, retain grounded evidence, report real blockers and allow another developer or agent to resume from durable project state.
- **Skills and knowledge:** skill-registry and skill-management modules let AIWF use skills that can be imported or generated on the fly! Skills can combine both knowledge and executable code.  

## Dharmax-way: from intent to working software

For product functionality, the normal path is:

```text
Product charter + developer intent
    ↓ discover/revise relevant Feature, Aspect, Epic and complete Story
Developer reviews and approves the actual User/Actor Story (US)
    ↓
Generate and review the genuine US acceptance test *first*
    ↓ run at work start; establish the actual baseline (normally expected red)
A resolution Ticket owns making that test pass
    ↓
When useful, connect multi-component work with a separate full-flow skeleton test
    ↓ one coding Ticket per temporary internal implementation stub
Replace the stubs; implement the real behavior under the Prime Directive
    ↓
The unchanged genuine US test passes without unfinished placeholders
    ↓
Independent current verification and traceable evidence
```

The skeleton test proves that a path is connected; **it does not prove the US is satisfied**. Small changes need no ceremonial skeleton. Already-working behavior may pass at baseline—AIWF must never manufacture a historical red/green cycle.

The process is iterative rather than a compulsory set of documents. New evidence can send work back to a definition, assumption or design. Justified technical maintenance can use a direct Ticket without fabricating a Story.

## The connected project model

AIWF keeps authored product/work records and their relationships in a [Project Graph](docs/definitions/project-graph.md), backed by [Semantika](https://github.com/dharmax/semantika). The repository is authoritative for source files and Git history. Markdown projections are views, **not** competing live state.

| Concept | Meaning |
| --- | --- |
| **Product charter** | The mandatory, developer-approved purpose, actors, scope, non-goals and boundaries against which downstream product definitions are reviewed. |
| **Feature** | Specific product functionality/capability. |
| **Aspect** | Reusable, cross-cutting expectations (e.g. Persistency or Access Control) applicable to multiple capabilities or Stories. |
| **User/Actor Story (US)** | A concrete episode of use: Actor, Intent, Initial State, Action and complete Expected Result. The source of genuine acceptance tests. |
| **Epic / Ticket** | Delivery grouping / bounded engineering work. Kanban and scheduling are useful views, not additional work databases. |
| **Test / evidence** | An executable check / what was actually observed and verified. A Done lane or AI narration is not proof. |

These are related concepts, **not a rigid one-of-each hierarchy**. Exact definitions, Story fields and still-open decisions live in the [canonical glossary](docs/definitions/README.md).

## Interfaces and architecture

AIWF offers a **CLI and interactive shell**, a deliberately scoped **MCP interface and project skill** for external coding agents, and a **Workspace** for human-oriented inspection/editing. Workspace UX remains under development and is not yet accepted as the final experience.

AIWF composes existing owners rather than creating parallel stacks: Semantika for project graph/state, `semantic-registry` for capability discovery, `skill-manager` for skill lifecycle, `llm-utils` for Actor/model concerns, and established source/change tools for exact operations. LLMs perform meaningful interpretation and necessary synthesis; deterministic work stays deterministic.

Agents should delegate an existing Ticket to AIWF's resolution operation rather than recreate its investigation, mutation and proof lifecycle by hand. See [Operations](docs/operations.md) and the [AIWF skill](skills/ai-workflow/SKILL.md) for the actual public surface and its limits.

## Getting started

AIWF is currently a **private Bun project** developed alongside sibling repositories using local `file:../...` dependencies; it is not yet a standalone public npm installation.

From the AIWF checkout in that workspace:

```bash
bun install
bun run setup
aiwf doctor
```

Ensure `~/.local/bin` is on your `PATH`. Initialize another repository and inspect its available commands:

```bash
cd /path/to/project
aiwf init
aiwf doctor
aiwf help
```

Examples of currently available Ticket operations:

```bash
aiwf status
aiwf next
aiwf investigate TICKET-ID
aiwf prepare TICKET-ID --critic auto
aiwf resolve TICKET-ID --completeness production --critic auto
```

Use the installed command's `--help` for exact options. `init` creates local project state; it **does not invent or approve a Product charter**.

## Principles

1. **Developer authority.** AI can discover and propose; it cannot silently approve product meaning or dismiss material charter warnings.
2. **Investigate before inventing.** Reuse canonical definitions, code, tools and work identities.
3. **Smallest correct engineering.** One appropriate owner and path; no shadow graph, registry, model router or change engine.
4. **Story-driven acceptance.** Actual public behavior and applicable policies matter more than internal test counts.
5. **Truthful progress.** Keep proposed, skipped, expected-red, genuinely passing, blocked, stale and independently verified outcomes distinct.
6. **Durable continuity.** Retain useful project context and evidence outside any single agent conversation.

## Development and documentation

```bash
bun run check:definitions
bun test
bun run typecheck
bun run pack
```

The definitions check validates documentation structure, not product semantics. Some browser tests need Playwright Chromium (`bunx playwright install chromium`); opt-in live tests require their configured environment. A green component suite alone is not independent product acceptance.

When working **on AIWF itself**, begin with [AGENTS.md](AGENTS.md) and the [active checkpoint](plans/AIWF-V1-ACTIVE-CHECKPOINT.md); consult only the relevant canonical definitions. Do not treat proposed capabilities or historical evidence as shipped behavior.

Further reading: [Definitions](docs/definitions/README.md) · [Dharmax-way design](plans/AIWF-DHARMAX-WAY-DESIGN.md) · [Staged plan](plans/AIWF-DHARMAX-WAY-PLAN.md) · [Architecture](docs/architecture.md) · [Actor journeys](docs/journeys.md) · [Operations](docs/operations.md) · [Documentation index](docs/README.md).

## License

MIT.
