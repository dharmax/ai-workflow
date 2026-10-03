# AI-Workflow 2.0 — Artifact-First Engineering

AIWF is a Bun-first engineering system built on a durable semantic project graph. Humans and coding agents delegate **Tickets and Product Intent artifacts** to AIWF; AIWF performs bounded investigation, preparation, safe implementation, testing, repair, acceptance verification, and evidence recording. Exact graph/code/change/test primitives remain available for deliberate drill-down.

The graph is backed by `@dharmax/semantika` and exposed through CLI/shell, stdio MCP, and the installed AIWF skill.

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

**Verified limits:** controlled arithmetic resolution passed with the configured local model. Broad program Tickets reached timeout/step limits and required explicit fallback review. Program Epic processing with a reviewed existing-layer proposal and independent auto Critic created no ceremonial artifacts. These are measured capabilities, not a claim that every arbitrary task resolves autonomously. Exact symbol/graph/refactor/test primitives remain available for drill-down and actual blockers.

## Architecture in one minute

1. **Artifact operations are the normal interface.** `Ticket.investigate()`, `Ticket.prepare()`, `Ticket.resolve()`, and `Epic/Feature/UserStory.process()` own the engineering lifecycle.
2. **Primitives are the hands underneath.** Exact source/symbol intelligence, graph traversal, safe preview/apply mutation, tests, Git, and Product Intent primitives remain directly callable.
3. **Truth is evidence-backed.** Completion requires authored acceptance plus material Aspect verification. Ambiguity returns `needs_input`; a real execution/evidence blocker returns `blocked`.
4. **Cognition is bounded.** Deterministic evidence comes first; System-1 may rank optional candidates; reasoning models handle semantic judgment; a tool-using Actor is reserved for work that actually requires tools.
5. **Durable state is project state, not chat state.** Operations are re-entrant over the repository + semantic graph. There are no opaque continuation sessions or a second workflow database.

For semantics, read `docs/artifact-operations.md`; for agent usage, read `skills/ai-workflow/SKILL.md`.

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
- Indexes codebase AST symbols, functions, classes, and in-code notes (`TODO:`, `FIXME:`).
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
  [OK] Cognitive / LLM Host (Ollama): Offline grounded mode active (http://localhost:11434 not reached)
  [OK] MCP / IDE/CLI Integration: Registered in Antigravity MCP hosts
```

---

## 💻 Command Line Interface (CLI)

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
| `epic <id>` | Show an Epic with targeted features/stories and contained tickets | `aiwf epic EPIC-001` |
| `epic-create "<title>"` | Create Epic with semantic decomposition and proposal review | `aiwf epic-create "Calendar invites"` |
| `features [status]` | List features in the Product Intent Graph | `aiwf features` |
| `feature <id>` | Show a Feature with containing stories, tickets, and tests | `aiwf feature FEAT-001` |
| `stories [status]` | List user stories in the Product Intent Graph | `aiwf stories` |
| `story <id>` | Show a user story with feature, tickets, tests, and criteria | `aiwf story STORY-001` |
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

## 🐚 Interactive Terminal REPL

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
- **Cognitive Fallback**: Any natural language sentence is evaluated by the bounded cognitive actor with live grounded observations.

---

## 🔌 Model Context Protocol (MCP) Integration

AI-Workflow exposes all capabilities via a native stdio Model Context Protocol (MCP) server.

### Host Configuration

#### Antigravity IDE (`~/.config/Antigravity IDE/User/mcp_config.json`)
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "bun",
      "args": ["/home/dharmax/work/ai-workflow/src/cli.ts", "mcp"],
      "instructions": "ai-workflow Causal Engineering OS: Use get_ticket_context before working on tickets; use get_project_overview for module health & bug counts; use audit_guidelines before claiming task completion; use propose_decision / revert_decision for architectural records; use compile_codelet / run_codelet for synthesized routines."
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
- **Artifact operations — preferred:** `investigate_ticket`, `prepare_ticket`, `resolve_ticket`, `process_epic`, `process_feature`, `process_story`.
- **Artifact policy:** completeness target/query operations and consistent completeness/depth/maxArtifacts/critic controls.
- **`execute_shell_wish`**: Autonomous coding engine with auto-mode switching.
- **Product Intent Graph**: `create_epic`, `get_epic`, `list_epics`, `update_epic`, `create_feature`, `get_feature`, `list_features`, `update_feature`, `create_user_story`, `get_user_story`, `list_user_stories`, `update_user_story`, `link_product`, `unlink_product`, `get_product_coverage`, `get_product_impact`. Canonical relations: Epic `targets` Feature/Story, Feature `contains` Story, Epic `contains` Ticket, Ticket `implements` Feature, Ticket `addresses` Story, Test `verifies` Feature/Story, Decision `governs` Epic/Feature/Story.
- **AST Graph**: `find_symbol`, `get_symbol_source`, `get_file_outline`, `analyze_blast_radius`, `estimate_token_budget`.
- **Compiler**: `compile_codelet`, `run_codelet`, `promote_codelet`, `apply_block_patch`.
- **Git & OS**: `get_git_status`, `get_git_diff`, `get_git_hotspots`, `generate_pr_summary`, `run_command`, `get_environment_info`.
- **Planning & Test**: `propose_decision`, `read_scratchpad`, `append_scratchpad_note`, `resolve_test_target`, `triage_test_failures`, `run_playwright`, `script_eval`.

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
| `docs/artifact-operations-plan.md` | Completed implementation program; historical rationale and acceptance record |

Do not treat the historical program plan as current work. Current behavior is defined by the implemented design docs, live schemas/help, and repository state.

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
