# 🏛️ AI-Workflow 2.0 (Causal Context & Engineering OS)

A Bun-first, deterministic Context Engine and Causal Engineering OS. AI-Workflow represents entire software systems—source code AST symbols, architectural decisions (ADRs), module boundaries, tickets, and lessons—in a unified semantic knowledge graph (`@dharmax/semantika`), exposed through **stdio MCP**, an **interactive dual-nature REPL shell**, and agent **skills**.

---

## ✨ Core Pillars

1. **AST+ Semantic Graph (Semantika)**: Everything passes through the graph. Code symbols, classes, files, modules, Kanban cards, and architectural decisions are typed entities connected by semantic predicates (`contains`, `implements`, `modifies`, `depends_on`).
2. **Deterministic-First Tooling (<5ms, 0 Tokens)**: 20+ zero-token domain facilities for atomic ticket leases, AST symbol search, surgical slicing, blast radius estimation, and block patching.
3. **Dual-Nature Interactive REPL**: Terminal shell with sub-5ms deterministic command fast-paths, tab auto-completion, dynamic cognitive mode switching (`/design`, `/dev`, `/triage`, `/product`), and grounded offline fallback.
4. **Frictionless Setup & Discovery**: Zero-config project onboarding (`aiwf init`), global CLI symlinking (`aiwf setup`), automated MCP host configuration (Antigravity IDE, Claude Code, Cursor), and comprehensive diagnostics (`aiwf doctor`).
5. **Bi-Directional Markdown Projections**: Obsidian Kanban (`kanban.md`), epics (`epics.md`), modules (`modules.md`), and ADRs (`decisions.md`) sync bi-directionally with SQLite with active lease preservation.
6. **JIT Codelet Compiler & Promotion**: Synthesizes isolated, tested ESM routines and promotes verified codelets into live tools callable by human operators and AI agents alike.

---

## 🚀 Installation & Setup

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
- Exports 30+ JSON tool schemas into `~/.gemini/antigravity-cli/mcp/ai-workflow/` for lazy loading.

### 2. Project Initialization (`aiwf init`)

Run inside any codebase to initialize AI-Workflow in seconds:

```bash
aiwf init
```

What `aiwf init` does:
- Creates `.ai-workflow/` structure (`state/`, `codelets/`, `config.json`).
- Indexes codebase AST symbols, functions, classes, and in-code notes (`TODO:`, `FIXME:`).
- Generates starter Obsidian projections (`kanban.md`, `epics.md`, `modules.md`, `decisions.md`).
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
  [OK] Graph / AST+ Semantic Graph: 1 tickets, 1 epics, 38 indexed files, 738 symbols
  [OK] Projections / Markdown Sync: All core projections present (kanban, epics, modules, decisions)
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
| `claim <id> [--agent <a>] [-m <m>]` | Atomically lease a ticket with time-to-live | `aiwf claim TKT-001 --agent alpha -m 45` |
| `release <id>` | Release an active ticket lease | `aiwf release TKT-001` |

### Intelligence & Code Navigation
| Command | Description | Example |
| :--- | :--- | :--- |
| `diff` | Show clean uncommitted git diff | `aiwf diff` |
| `symbol <name>` | Find symbol across codebase in AST+ semantic graph | `aiwf symbol WorkflowStore` |
| `slice <file> <symbol>` | Extract exact surgical code slice of a function or class | `aiwf slice src/graph/store.ts formatId` |
| `outline <file>` | Print AST symbol outline (functions, classes, interfaces) | `aiwf outline src/graph/ontology.ts` |
| `blast <target>` | Analyze blast radius, affected files, and recommended tests | `aiwf blast src/graph/store.ts` |
| `index` | Re-index codebase AST symbols and modules into graph | `aiwf index` |
| `patch <file> <s> <r>` | Apply deterministic AST block patch via block-patcher | `aiwf patch src/util.ts "oldCode" "newCode"` |

### Diagnostics & Configuration
| Command | Description | Example |
| :--- | :--- | :--- |
| `doctor` | Run comprehensive environment, graph, LLM, and MCP diagnostics | `aiwf doctor` |
| `audit` | Audit architecture health and graph integrity | `aiwf audit` |
| `metrics` | Show Kanban lane distribution and code churn hotspots | `aiwf metrics` |
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

- **Instant Fast-Paths (<5ms)**: `status`, `diff`, `next`, `claim <id>`, `release <id>`, `tickets`, `symbol <name>`, `slice <file> <sym>`, `outline <file>`, `blast <target>`, `index`, `doctor`, `audit`, `metrics`, `sync`.
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
- **`execute_shell_wish`**: Autonomous coding engine with auto-mode switching.
- **Tickets**: `create_ticket`, `claim_ticket`, `release_ticket`, `update_ticket_state`, `list_tickets`, `recommend_next_task`.
- **AST Graph**: `find_symbol`, `get_symbol_source`, `get_file_outline`, `analyze_blast_radius`, `estimate_token_budget`.
- **Compiler**: `compile_codelet`, `run_codelet`, `promote_codelet`, `apply_block_patch`.
- **Git & OS**: `get_git_status`, `get_git_diff`, `get_git_hotspots`, `generate_pr_summary`, `run_command`, `get_environment_info`.
- **Planning & Test**: `propose_decision`, `read_scratchpad`, `append_scratchpad_note`, `resolve_test_target`, `triage_test_failures`, `run_playwright`, `script_eval`.

---

## 📁 Repository Structure

```
ai-workflow/
├── src/
│   ├── graph/
│   │   ├── types.ts          # Semantic types, claims, lanes, and metrics
│   │   ├── ontology.ts       # Semantika entity descriptors & predicates
│   │   ├── store.ts          # WorkflowStore with SQLite persistence
│   │   ├── indexer.ts        # AST symbol extraction and module mapping
│   │   └── projections.ts    # Bi-directional Markdown/Kanban sync
│   ├── tools/
│   │   ├── registry.ts       # Type-safe ToolRegistry with Zod schemas
│   │   ├── tickets.ts        # Atomic leases, recommendations, transitions
│   │   ├── graph-queries.ts  # Symbol search, slicing, file outlines, blast radius
│   │   ├── git.ts            # Git porcelain status, diffs, hotspots
│   │   ├── os.ts             # Command execution, platform detection
│   │   ├── compiler.ts       # JIT codelet compiler, promotion, block-patcher
│   │   ├── test-runner.ts    # Target resolution, failure triage
│   │   ├── planning.ts       # ADR proposals, scratchpad ledger
│   │   ├── scripting.ts      # Direct Bun JavaScript eval
│   │   ├── bucket-router.ts  # Two-tier intent classification
│   │   └── index.ts          # Tools aggregator and initializer
│   ├── actor/
│   │   └── engine.ts         # WorkflowActor cognitive loop & mode switcher
│   ├── doctor.ts             # Comprehensive environment & subsystem diagnostics
│   ├── setup.ts              # Frictionless project init & global MCP configuration
│   ├── config.ts             # Configuration manager (.ai-workflow/config.json)
│   ├── mcp.ts                # Stdio MCP server & JSON schema generator
│   ├── shell.ts              # Terminal REPL with <5ms fast-paths & completer
│   └── cli.ts                # Unified CLI entrypoint
├── tests/
│   ├── graph.test.ts         # Graph persistence, relations, leases, sync
│   ├── tools.test.ts         # Tool execution, prioritization, negative checks
│   ├── compiler.test.ts      # Codelet compilation, promotion, block-patching
│   ├── actor.test.ts         # Mode switching, ReAct loop, pubsub telemetry
│   ├── mcp.test.ts           # MCP tool listing, tool calls, error handling
│   ├── shell.test.ts         # Shell fast-paths, mode switching, completer
│   └── setup.test.ts         # Project initialization, doctor, configuration
└── skills/
    └── ai-workflow/
        ├── SKILL.md          # Skill descriptor and tool reference for agents
        └── AGENTS.md         # Operational guidelines and mode specs
```

---

## 🧪 Testing

All unit tests validate state mutations, boundary conditions, and negative failure paths with zero mock theater:

```bash
bun test
```

Static type verification:

```bash
bun x tsc --noEmit
```

---

## 📜 License

MIT License. Designed and built with the Google DeepMind Antigravity Protocol.
