# AI-Workflow 2.0 — Artifact-First Engineering

AIWF is a Bun-first engineering system built on a durable semantic project graph. Humans and coding agents delegate **Tickets and Product Intent artifacts** to AIWF; AIWF performs bounded investigation, preparation, safe implementation, testing, repair, acceptance verification, and evidence recording. Product meaning is preserved above implementation as Goals, Concepts, actor Flows, narrative Stories and enabling Features. Exact graph/code/change/test primitives remain available for deliberate drill-down.

The graph is backed by `@dharmax/semantika` and exposed through CLI/shell, stdio MCP, and the installed AIWF skill.

SkillManager lookups use a fresh manager for the requested project root. Automatic discovery reads only that project's `skills/<id>/skill.json` and `SKILL.md` layout; additional source repositories require explicit `extraSources` configuration in the bridge API. Sibling checkouts and host-specific global directories are not discovered. An absent project skills directory is optional; sync and runtime failures are reported to the caller.

---

## Start here: delegate artifact work

```bash
aiwf investigate TICKET-ID
aiwf prepare TICKET-ID --critic auto
aiwf resolve TICKET-ID --completeness production --critic auto
aiwf process epic EPIC-ID --completeness production --depth 1 --max-artifacts 24
aiwf completeness get FEATURE-ID
aiwf completeness set FEATURE-ID production
aiwf metrics --operation resolve_ticket --ticket TICKET-ID --since 7d
```

The same commands work in the shell. Explicit instructions such as `please resolve ticket TICKET-ID` delegate directly to the artifact operation. MCP exposes `investigate_ticket`, `prepare_ticket`, `resolve_ticket`, `process_epic`, `process_feature`, and `process_story`, with consistent completeness/depth/maxArtifacts/critic options.

Resolution investigates, leases, prepares, applies safe edits, runs tests, repairs within a bound, and verifies authored acceptance plus material Aspects. Inspect `needs_input` or `blocked` and retry after addressing the precise cause. Dirty target edits require explicit `allowDirtyTargets` authorization (CLI: repeated `--allow-dirty-target path`). AIWF does not automatically commit engineering work.

Completeness overrides are temporary. Remember a target explicitly with `completeness set`; use `clear` to remove it. Processing reuses stable capabilities and produces useful next-layer work; its result reports remaining work and depth/breadth stops without treating artifact count as completeness.

**Verified evidence and limits:** final dogfooding completed the artifact-operations program truthfully after earlier broad runs exposed timeout/step-limit and verifier-quality failures. In a controlled reconstructed historical relation-validation task, the same local model/task failed under the ordinary tool workflow but succeeded through one high-level `resolve_ticket` delegation with the exact requested one-line fix and unchanged tests. This validates the delegation mechanism; it is not a claim that arbitrary software work is universally autonomous. Exact graph/source/change/test primitives remain available for drill-down and real blockers.

## Architecture in one minute

1. **Product development starts from actor journeys.** Actor reality and Ideas refine into Goals, Concepts, Flows and narrative UserStories; durable Features enable those Stories. Capabilities and tests are derived from journeys, not substituted for them. Pure technical maintenance may remain direct Ticket work.
2. **Artifact operations are the normal engineering interface.** `Ticket.investigate()`, `Ticket.prepare()`, `Ticket.resolve()`, and `Epic/Feature/UserStory.process()` own the engineering lifecycle.
3. **Primitives are the hands underneath.** Exact source/symbol intelligence, graph traversal, safe preview/apply mutation, tests, Git, and Product Intent primitives remain directly callable.
4. **Truth is evidence-backed.** Completion requires authored acceptance plus material Aspect verification. Ambiguity returns `needs_input`; a real execution/evidence blocker returns `blocked`.
5. **Cognition is bounded.** Deterministic evidence comes first; System-1/cheap local classification selects capabilities; reasoning models handle semantic judgment; a tool-using Actor is reserved for work that actually requires tools. Natural-language Actor runs begin with at most three functions selected through `@dharmax/semantic-registry`, may add at most two missing functions through targeted semantic recovery, and refuse an oversized serialized tool catalog before any provider call. A semantic miss never expands to the global function registry.
6. **Tests are graph evidence, but journeys are the product acceptance boundary.** Test files are durable `TestNode` artifacts; graph edges connect tests to source and authored Product Intent. Component tests localize mechanics, while product changes require a realistic actor-journey acceptance path.
7. **Durable state is project state, not chat state.** Operations are re-entrant over the repository + semantic graph. There are no opaque continuation sessions or a second workflow database.

For Product Intent semantics, read `docs/top-level-product-intent.md` and `docs/product-intent-graph.md`; for actor journeys, read `docs/use-story-catalog.md`; for artifact semantics, read `docs/artifact-operations.md`; for semantic reconciliation, read `docs/digest.md`; for agent usage, read `skills/ai-workflow/SKILL.md`.


### Model runtime configuration

AIWF delegates ordinary natural-language model selection to llm-utils. The shell supplies the workload task class and local/cloud preference; persisted llm-utils model advice chooses the model. An explicit shell/model override remains authoritative. `model` is the legacy/default fallback when no applicable advice exists.

Common controls are explicit, while provider-specific knobs remain provider-native:

```json
{
  "model": "qwen2.5-coder:7b",
  "ollamaContextWindow": 32768,
  "llmOutputTokens": 4096,
  "modelRoutes": {
    "design": "openrouter/deepseek/deepseek-chat",
    "critic": "google/gemini-2.5-pro"
  },
  "providerOptions": {
    "ollama": {
      "top_k": 40,
      "top_p": 0.9,
      "repeat_penalty": 1.1,
      "seed": 42
    }
  }
}
```

For Ollama, `ollamaContextWindow` maps to `num_ctx`, `llmOutputTokens` maps to `num_predict`, and `providerOptions.ollama` is passed through to Ollama's native `options`. Typed controls win over conflicting raw provider values.


---

## Installation & Setup

### 1. Global Setup (Frictionless)

To make `aiwf` accessible globally in your terminal and configure MCP in your IDEs:

```bash
# In the ai-workflow directory:
aiwf setup
```

This single command:
- Symlinks the executable into `~/.local/bin/aiwf` with executable permissions.
- Configures the MCP server in **Antigravity IDE** (`~/.config/Antigravity IDE/User/mcp_config.json`).
- Configures the MCP server in **Antigravity CLI** (`~/.gemini/config/mcp_config.json`).
- Exports MCP tool schemas into `~/.gemini/antigravity-cli/mcp/ai-workflow/` for lazy loading.

### 2. Project Initialization (`aiwf init`)

Run inside any codebase to initialize AI-Workflow in seconds:

```bash
aiwf init
```

What `aiwf init` does:
- Creates `.ai-workflow/` structure (`state/`, `codelets/`, `config.json`).
- Indexes codebase AST symbols, functions, classes, in-code notes (`TODO:`, `FIXME:`), and test artifacts with verification edges to imported source files.
- Generates starter Obsidian projections (`kanban.md`, `epics.md`, `features.md`, `user-stories.md`, `modules.md`, `decisions.md`).
- Prepares the AST+ SQLite store (`.ai-workflow/state/graph.db`).

### 3. Verify Health (`aiwf doctor`)

Verify that the runtime, git tree, database, projections, leases, LLM, and MCP integrations are healthy:

```bash
aiwf doctor
```

```
🩺 AI-Workflow 2.0 Doctor Report
Project Root: /home/dharmax/work/ai-workflow
Overall Health: HEALTHY ✅

  [OK] Runtime / Bun Engine: Bun v1.3.14 active
  [OK] VCS / Git Status: Branch: master (Clean)
  [OK] Graph / AST+ Semantic Graph: 7 tickets, 1 epics, 119 indexed files, 5180 symbols
  [OK] Projections / Markdown Sync: All core projections present (kanban, epics, features, user stories, modules, decisions)
  [OK] Tickets / Lease & Flow Health: 0 active lease(s)
  [OK] Cognitive / LLM Host (Ollama): Unavailable (http://localhost:11434 not reached)
  [OK] MCP / IDE/CLI Integration: Registered in Antigravity MCP hosts
```

---

## Command Line Interface (CLI)

Outside of the shell, all capabilities are directly accessible:

```bash
aiwf <command> [options]
```

### Core Workflow Commands
| Command | Description | Example |
| :--- | :--- | :--- |
| `status` | Show git branch, clean/dirty state, active ticket leases | `aiwf status` |
| `sync` | Bi-directionally reconcile SQLite Graph with Markdown projections | `aiwf sync` |
| `next [agentId]` | Algorithmic task selector (Active Lease $\to$ P1 Bugs $\to$ Todo) | `aiwf next` |
| `tickets [lane]` | List Kanban tickets (Backlog, Todo, In Progress, Done, Blocked) | `aiwf tickets Todo` |
| `epics [status]` | List epics in the Product Intent Graph | `aiwf epics` |
| `epic <id>` | Show an Epic with targeted Product Intent and contained tickets | `aiwf epic EPIC-001` |
| `epic-create "<title>"` | Create Epic with semantic decomposition and proposal review | `aiwf epic-create "Calendar invites"` |
| `features [status]` | List features in the Product Intent Graph | `aiwf features` |
| `feature <id>` | Show a Feature with enabled Stories, tickets, and tests | `aiwf feature FEAT-001` |
| `stories [status]` | List user stories in the Product Intent Graph | `aiwf stories` |
| `story <id>` | Show/open a narrative Story with Flow, enabling Features, work and evidence | `aiwf story STORY-001` |
| `coverage <id>` | Show structural and causal coverage for an Epic, Feature, or Story | `aiwf coverage STORY-001` |
| `impact <id>` | Show bounded product impact and code anchors | `aiwf impact FEAT-001` |
| `claim <id> [--agent <a>] [-m <m>]` | Atomically lease a ticket with time-to-live | `aiwf claim TKT-001 --agent alpha -m 45` |
| `release <id>` | Release an active ticket lease | `aiwf release TKT-001` |
| `done <id>` | Mark ticket as Done, release lease, and sync Kanban | `aiwf done TKT-001` |
| `move <id> <lane>` | Move ticket to specific lane | `aiwf move TKT-001 "In Progress"` |

### Intelligence & Code Navigation
| Command | Description | Example |
| :--- | :--- | :--- |
| `diff` | Show clean uncommitted git diff | `aiwf diff` |
| `symbol <name>` | Find symbol across codebase in AST+ semantic graph (exact, regex, kind) | `aiwf symbol WorkflowStore -e` |
| `graph [query]` | Query graph entities, traverse edges, or filter semantic predicates | `aiwf graph --from src/graph/indexer.ts --depth 2` |
| `callers <symbol>` | Find all callers and call sites invoking a symbol | `aiwf callers getOutgoing` |
| `deps <fileOrModule>`| List static module imports and dependencies | `aiwf deps src/tools/index.ts` |
| `slice <file> <sym>` | Extract exact surgical code slice of a function or class | `aiwf slice src/graph/store.ts formatId` |
| `outline <file>` | Print source-ordered AST symbol outline (functions, classes, interfaces) | `aiwf outline src/graph/ontology.ts` |
| `blast <target>` | Analyze blast radius, affected files, and recommended tests | `aiwf blast src/graph/store.ts` |
| `debug <target>` | Low-level diagnostic drill-down for a code target/error; not an artifact-resolution lifecycle | `aiwf debug src/graph/indexer.ts:280` |
| `index` | Re-index codebase AST symbols and modules into graph | `aiwf index` |
| `patch <file> <s> <r>` | Apply deterministic AST block patch via block-patcher | `aiwf patch src/util.ts "oldCode" "newCode"` |
| `scaffold <file> [desc]` | Scaffold typed source file paired with unit test harness | `aiwf scaffold src/service/auth.ts "JWT auth"` |
| `kb <subcommand>` | Search, show, or sync content-addressable knowledgebase items | `aiwf kb search "service adapter"` |

### Diagnostics & Configuration
| Command | Description | Example |
| :--- | :--- | :--- |
| `doctor` | Run comprehensive environment, graph, LLM, and MCP diagnostics | `aiwf doctor` |
| `audit` | Audit architecture health and graph integrity | `aiwf audit` |
| `metrics` | Query persisted artifact-operation performance aggregates | `aiwf metrics` |
| `config [get\|set]` | Inspect or update settings in `.ai-workflow/config.json` | `aiwf config set defaultLeaseMinutes 60` |

### Shell & Cognitive Execution
| Command | Description | Example |
| :--- | :--- | :--- |
| `shell` | Launch interactive dual-nature Terminal REPL | `aiwf shell` (or just `aiwf`) |
| `eval "<code>"` | Evaluate short TypeScript/JS code against live store | `aiwf eval 'return 21 * 2'` |
| `exec "<wish>"` | Execute one-off autonomous coding task via Cognitive Actor | `aiwf exec "explain store.ts architecture"` |
| `mcp` | Start stdio MCP server for AGY, Claude Code, Cursor | `aiwf mcp` |

---

## Interactive Terminal REPL

Run `aiwf` or `aiwf shell` to enter the interactive console:

```
aiwf [DEV] > help
```

- **Deterministic fast paths**: `status`, `diff`, `next`, `claim <id>`, `release <id>`, `tickets`, `symbol <name>`, `slice <file> <sym>`, `outline <file>`, `blast <target>`, `index`, `doctor`, `audit`, `metrics`, `sync`.
- **Tab Auto-Completion**: Press `<Tab>` to cycle through all commands.
- **On-the-fly JavaScript Execution**: Type `eval <js-code>` to run queries against `store`, `sp`, `registry`, or `ctx` directly.
- **Dynamic Cognitive Modes**:
  - `/design` - Switches to Architecture, ADRs, and boundary analysis.
  - `/dev` - Switches to code authoring, patching, and codelet compilation.
  - `/triage` - Switches to failure diagnosis and log distillation.
  - `/product` - Switches to Epics, User Stories, and sprint backlog grooming.
- **Structured Views**: `ticket`, `epic`, `feature`, `story`, and `aspect` open generic shell-ui Views on an interactive TTY; `edit <id>` enters edit mode. Saves return through AIWF's canonical mutation tools and then sync projections.
- **Execution Trace**: `trace show` prints the last Actor run; `trace open` or **Alt+O** opens a scrollable floating view. Enter/Escape closes it and preserves any unfinished input. `trace on/off/compact` changes live verbosity. Traces include discovery, available tools, calls/results, elapsed time and termination; failures and thrown errors remain inspectable. The latest run is saved to `.ai-workflow/state/last-shell-trace.txt` and can be inspected after restarting the shell. Trace inspection never invokes the LLM. See [trace behavior and verification](docs/shell-trace.md).
- **Semantic Cognitive Fallback**: Natural-language input is classified into structured multi-key intent; `@dharmax/semantic-registry` selects at most three initial functions before the bounded Actor runs, with at most two targeted semantic recoveries. Discovery failure never expands to the full registry. `trace on` shows the exact discovered function surface.

---

## Model Context Protocol (MCP) Integration

AI-Workflow exposes an explicit stable public workflow/drill-down surface via stdio MCP. Internal CRUD, scripting, compiler, and other implementation primitives remain in AIWF's internal registry and can be selected semantically for AIWF's own Actor without being advertised to every MCP host.

### Host Configuration

#### Antigravity IDE (`~/.config/Antigravity IDE/User/mcp_config.json`)
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "bun",
      "args": ["/home/dharmax/work/ai-workflow/src/cli.ts", "mcp"],
      "instructions": "Delegate Ticket work with resolve_ticket first. Use investigate_ticket/prepare_ticket for evidence or preparation, and process_epic/process_feature/process_story for accepted intent. Use primitives only for deliberate drill-down or a concrete blocker."
    }
  }
}
```

#### Claude Desktop (`~/.config/Claude/claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "bun",
      "args": ["/home/dharmax/work/ai-workflow/src/cli.ts", "mcp"]
    }
  }
}
```

### Exposed MCP Tools
- **Artifact workflow — preferred:** `investigate_ticket`, `prepare_ticket`, `resolve_ticket`, `process_epic`, `process_feature`, `process_story`.
- **Ticket flow:** create/list/recommend/claim/release/state operations needed to coordinate work.
- **Product/Aspect read surfaces:** list/read coverage, impact, applicable aspects and aspect assessment.
- **Artifact policy:** completeness target query/set.
- **Grounded drill-down:** selected graph/source/reference/blast, safe change, test, git and knowledge tools.
- **`execute_shell_wish`:** free-form cognitive entrypoint; AIWF performs semantic tool discovery internally before its Actor runs.

The internal ToolRegistry is intentionally larger than the MCP surface. Adding an internal tool does not make it public automatically; public MCP names are declared in `src/tools/surface.ts`. Setup also removes stale exported schema files when this surface shrinks.

---

## Documentation map

| Document | Authority |
| --- | --- |
| `README.md` | Human entry point: what AIWF is and how to start |
| `skills/ai-workflow/SKILL.md` | Operational instructions for external coding agents |
| `skills/ai-workflow/AGENTS.md` | Compact invariant/discipline sheet |
| `docs/artifact-operations.md` | Artifact lifecycle, completeness, depth, Critic and interaction semantics |
| `docs/product-intent-graph.md` | Product/work intent model, relations, coverage and impact |
| `docs/aspects.md` | Cross-cutting intent and Aspect evidence |
| `docs/causal-change-engine.md` | Safe preview/apply mutation for code and Product Intent |
| `docs/performance-metrics.md` | Correlated operation/cognition measurement |
| `docs/product-change.md` | Product Intent mutation through the safe change path |
| `docs/debugging-design.md` | Draft design for bug intake, root-cause investigation, remediation handoff, and optional fixing |

Current behavior is defined by the implemented design docs, live schemas/help, and repository state. Draft design documents describe intended future behavior explicitly.

---

## Testing

All unit tests validate state mutations, boundary conditions, and negative failure paths with zero mock theater:

```bash
bun test
```

Static type verification:

```bash
bun x tsc --noEmit
```

---

## License

MIT License. Designed and built with the Google DeepMind Antigravity Protocol.
