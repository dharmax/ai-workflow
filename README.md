# AI-Workflow 2.0

**AIWF is the AI-assisted engineering workflow and software implementing Dharmax-way.** It connects approved product intent, US-driven tests, justified Tickets, source work and verification through the project's semantic graph.

AIWF is Bun-first and backed by `@dharmax/semantika`. Its normal interface supports high-level engineering and Ticket operations; exact graph, source, change, test, Git, and knowledge primitives remain available for deliberate drill-down.

## Governing design and current status

**Current v1 delivery focus:** [active Iteration 2–3 checkpoint](plans/AIWF-V1-ACTIVE-CHECKPOINT.md). Iteration 1 engineering work is complete; live provider and independent acceptance remain to be qualified. The target is native Feature and Bug delivery in the same external Ledger repository, then public release—not another infrastructure iteration.

**Dharmax-way** is the governing test-first method. Read the [canonical definitions](docs/definitions/README.md), [canonical design](plans/AIWF-DHARMAX-WAY-DESIGN.md) and [staged implementation plan](plans/AIWF-DHARMAX-WAY-PLAN.md) before changing product/workflow semantics. [Documentation index](docs/README.md) distinguishes current code, target Stories and historical evidence. The full plan is **not yet implemented**. Before S6, the [S5 Product Operability postcondition](plans/AIWF-S5-POSTCONDITION-DESIGN.md) must pass its [PC0–PC5 acceptance plan](plans/AIWF-S5-POSTCONDITION-PLAN.md); publishing these documents is not acceptance. Execute only one approved checkpoint at a time; existing Gate 5 remains Blocked until its actual canonical release criteria succeed. Earlier plans are preserved in [docs/archive/plans](docs/archive/plans/README.md).

## The idea

A Ticket is not merely a task description. AIWF can connect it upward to the product reason for the work and downward to the code and proof that implement it:

```text
Developer-approved product intent → complete User/Actor Story (Features / Aspects)
                               → genuine executable US test (first)
                               → actual baseline; normally expected red for missing behavior
                               → resolution Ticket for making the US test pass
                               → optional separate full-flow skeleton test (multi-component)
                               → one coding Ticket per temporary internal stub
                               → replacement/other justified coding work under the Prime Directive
                               → same genuine US test green + independent current proof
```

This is the **target workflow**, not a claim that current `processIntent` or UI already implements it. A skeleton pass proves wiring, never US acceptance. A Feature defines functionality; an Aspect contributes shared cross-cutting expectations; an Epic organizes delivery. Pure technical maintenance can start at a justified direct Ticket without inventing a US.

The graph is durable project state. Markdown projections and chat transcripts are not the source of truth.

## Start here

For the current Product → reviewed work → executable Story-test journey and typed Bug workflow, see [Iteration 1 evidence and executable replay](docs/iteration1-2026-10-19.md). It records passing public paths and remaining release gates; it does not claim S6 or complete PC5 acceptance. Use `aiwf ticket --help`, `aiwf bug --help`, `aiwf product --help`, `aiwf story-test --help` and `aiwf config --help` for scoped syntax.

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
8. **Stories define acceptance.** Tests emulate complete approved User/Actor Stories through public interfaces; isolated unit tests are exceptional for genuinely complex mechanisms. Counts and graph links do not prove product behavior.
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

AIWF is currently developed as part of the Dharmax sibling-repository workspace: its package manifest still uses local `file:../...` dependencies and is marked private. Do not treat it as an independently installable npm package yet.

From the AIWF checkout in that workspace:

```bash
bun install
bun run setup
```

`setup` provisions the required TypeScript runtimes, installs the `aiwf` command under `~/.local/bin`, configures detected supported coding-agent hosts for MCP, and synchronizes the AIWF skill. Ensure `~/.local/bin` is on `$PATH`, then verify the installation with:

```bash
aiwf doctor
```

To initialize a repository:

```bash
cd /path/to/project
aiwf init
aiwf doctor
```

`init` creates the `.ai-workflow/` state/configuration area, indexes source/test structure into the semantic graph, and creates human-readable projections. `doctor` verifies the runtime, Git state, graph, projections, leases, model configuration and MCP integration. Re-running `setup` is the supported way to refresh the global CLI/MCP/skill wiring.

## Interfaces

### CLI and shell

Run `aiwf help` for the current command surface. Important groups are:

- artifact work: `investigate`, `prepare`, `resolve`, `process`;
- work navigation: `status`, `next`, `tickets`, `epics`, `features`, `stories`;
- code intelligence: `symbol`, `graph`, `callers`, `deps`, `slice`, `outline`, `blast`, `debug`;
- safe engineering: `patch`, `scaffold`, tests and change preview/apply through the registry;
- diagnostics: `doctor`, `audit`, `metrics`;
- cognition: `exec`, model configuration, traces and project knowledge/skills.

The interactive shell adds structured views, semantic natural-language execution and inspectable execution traces. Complete commands execute immediately; missing interactive identifiers can be facilitated. Config supports explicit project/global overrides and reset, and `aiwf setup --check` inspects without writes or prompts. See [operational commands](docs/operations.md#13-shell-configuration-and-setup).

### Workspace

Run `aiwf workspace` (or `bun src/cli.ts workspace`) and open the printed local URL. An optional port is supported: `aiwf workspace 4317`. Ctrl+C closes the session.

Search canonical product and work definitions; create or edit Features, Aspects and complete Stories. Choose a Feature in the Story form, or add/remove links under **Manage relationships**. **Review changes** shows the diff; **Accept and save** commits through the same reviewed Product operation used by CLI/MCP. Cancel/reject writes nothing. A conflicting editor keeps your unsaved text and refuses overwriting; copy that text before reloading canonical data.

**Review proposal** accepts a Product change request or an S2 preview copied from CLI/MCP. Edit Feature/Aspect/Story fields directly, or expand **Edit complete proposal request** for relationships, removals and other supported mutations. Update review after editing. Proposals are local to the browser session until accepted; this stage does not generate or execute implementation work.

Keyboard: Ctrl/⌘ K searches, Ctrl/⌘ S prepares review, Escape cancels review. Acceptance approves definitions, not implementation or Story satisfaction. The Workspace uses the canonical DB; existing Markdown synchronization remains supported until S8.

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

The Workspace Story tests run real Chromium. After installing dependencies, run `bunx playwright install chromium` once (and install Playwright's OS browser prerequisites if needed). Run them with `bun test tests/dharmax-s3.test.ts`; no model credentials are required.

Use focused tests first while developing, then the repository gates. Opt-in live acceptance tests are reserved for journeys that genuinely require the configured model/runtime.

A green component suite is not proof of a product journey. Conversely, a model's confident final narration is not proof that a tool, skill, test or acceptance step actually ran.

## Documentation

The governing files are [Dharmax-way design](plans/AIWF-DHARMAX-WAY-DESIGN.md) and [staged plan](plans/AIWF-DHARMAX-WAY-PLAN.md). The [documentation index](docs/README.md) links the existing [Architecture](docs/architecture.md), complete target [Actor Stories](docs/journeys.md), [Operations](docs/operations.md), preserved [historical briefs](docs/archive/plans/README.md), and dated evidence. Historical reports are not competing active plans.

## License

MIT.
