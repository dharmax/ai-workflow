<!-- Responsibility: Explain what ai-workflow is, its modular Bun-first architecture, universal installation across all AI CLIs/clients, complete CLI reference, and full MCP tool catalog.
Scope: Authoritative developer manual and AI agent operating contract. -->
# AI-Workflow: Bun-First Causal Engineering OS & Project Visibility Engine

`ai-workflow` (`aiwf`) is a high-speed, deterministic, repo-local operating system for software engineering and autonomous AI development.

Built with **Bun** and powered by the `@dharmax/*` modular ecosystem, it replaces fragile prompt heuristics with an AST-grounded **SQLite Causal Graph**, bi-directional **Git Markdown projections**, **knapsack context budgeting**, **revertable ADR decisions**, **blast radius impact analysis**, **machine-enforced guideline auditing**, and a universal **Model Context Protocol (MCP)** host bridge.

---

## ⚡ Key Highlights

* **Ultra-Lean Engine (< 1,500 Lines)**: Fast, deterministic, and free of synthetic runtime bloat.
* **Powered by Modular Sibling Packages**:
  * [`@dharmax/semantika`](https://github.com/dharmax/semantika): High-performance semantic causal graph, dynamic ontologies, and SQLite triple store.
  * [`@dharmax/codebase-parser`](https://github.com/dharmax/codebase-parser): AST symbols, module dependencies, and code note discovery across 15+ languages.
  * [`@dharmax/context-manager`](https://github.com/dharmax/context-manager): Knapsack context packing and deterministic token budgeting.
  * [`@dharmax/text-compiler`](https://github.com/dharmax/text-compiler): Natural language routine synthesis into executable state machines.
  * [`@dharmax/llm-utils`](https://github.com/dharmax/llm-utils): Native Ollama / cloud LLM conversation, Zod structured JSON schemas, and routing.
  * [`@dharmax/block-patcher`](https://github.com/dharmax/block-patcher): Deterministic AST search/replace patching.
* **2-Way Git Markdown Ledgers**: SQLite state automatically projects to [kanban.md](kanban.md) (Obsidian Kanban compatible), [epics.md](epics.md), [decisions.md](decisions.md), and [modules.md](modules.md).
* **ADR Decision Ledger with Rollbacks**: Versioned Architectural Decision Records that reconcile and cancel dependent tickets upon rollback.
* **Real-Time Telemetry & Context Metrics**: Live tracking of token savings, compression ratios (>65%), and sub-millisecond query latencies.
* **13-Tool MCP Host Surface**: Exposes context packing, project health, guideline auditing, ADR lifecycle, blast radius, and codelet JIT compilation to Claude, Gemini, Antigravity, Cursor, and Codex.

---

## 🧭 How It Works: The 3-Step Lifecycle

Think of `aiwf` like `git` or `docker`: you install the CLI once on your machine, then use it inside any project folder.

```
┌────────────────────────────────────────────────────────┐
│ 1. ONE-TIME MACHINE INSTALL                            │
│    Clone repo & link CLI to PATH (`~/.local/bin/aiwf`) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. DAILY PROJECT DEVELOPMENT                           │
│    `cd ~/any-project`                                  │
│    `aiwf sync`   ──► Indexes AST & creates kanban.md   │
│    `aiwf status` ──► Displays ANSI project dashboard   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. AI AGENT MCP CONNECTION                             │
│    Configure Claude / Cursor / Gemini to run `aiwf-mcp`│
│    AI reads context, checks blast radius & audits rules │
└────────────────────────────────────────────────────────┘
```

---

## 📦 Step 1: One-Time Machine Installation

### Prerequisites
* [Bun](https://bun.sh) (>= 1.3.14)
* [Git](https://git-scm.com)

### Install the CLI Globally
Clone the engine repository once onto your machine and run setup:
```bash
git clone git@github.com:dharmax/ai-workflow.git ~/work/ai-workflow
cd ~/work/ai-workflow
bun install
bun run setup
```

The `bun run setup` (or `aiwf setup`) command automatically links two executables into your `~/.local/bin` and `~/.bun/bin` paths:
1. **`aiwf`** (or `ai-workflow`): The CLI you run in your terminal for daily work.
2. **`aiwf-mcp`**: The background stdio server binary launched automatically by AI clients.

---

## 🛠️ Step 2: Using `aiwf` in Any Project

Once installed, you can navigate to **any project directory** on your machine and run:

```bash
# 1. Navigate to your project
cd ~/my-project

# 2. Initialize AST symbol indexing and Git markdown ledgers (kanban.md, epics.md)
aiwf sync

# 3. View the project health dashboard and Kanban state
aiwf status

# 4. Check recommended next high-priority task
aiwf next

# 5. Launch the local graph and web dashboard
aiwf ui
```

---

## 🤖 Step 3: Connect Your AI Clients (Claude, Cursor, Gemini)

Configure your preferred AI editor to use the `aiwf-mcp` server. Your AI client will automatically launch `aiwf-mcp` in the background when inspecting projects.

#### 🤖 Claude Code CLI (`claude`)
```bash
claude mcp add ai-workflow aiwf-mcp
```

---

#### 🖥️ Claude Desktop
Add to your Claude Desktop configuration file:
* **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Linux**: `~/.config/Claude/claude_desktop_config.json`
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "aiwf-mcp"
    }
  }
}
```

---

#### 🔮 Gemini CLI & Antigravity
Add the MCP server to `~/.gemini/settings.json`:
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "aiwf-mcp"
    }
  }
}
```
*For repo-local skills, point to `.gemini/skills/ai-workflow`.*

---

#### 🖱️ Cursor IDE
Add to `.cursor/mcp.json` in your project root, or under **Cursor Settings > Features > MCP**:
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "aiwf-mcp"
    }
  }
}
```

---

#### 🌊 Windsurf (Codeium)
Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "aiwf-mcp"
    }
  }
}
```

---

#### 🛠️ Roo Code / Cline (VS Code)
Add to your `cline_mcp_settings.json`:
```json
{
  "mcpServers": {
    "ai-workflow": {
      "command": "aiwf-mcp"
    }
  }
}
```

---

#### 📋 Quick Config Exporter
To view or export these configuration snippets directly from your terminal:
```bash
aiwf setup          # Prints visual interactive configuration guide
aiwf setup --json   # Outputs raw JSON dictionary for scripting
```

---

## 🚀 Complete CLI Reference (For Humans)

```bash
aiwf <command> [arguments] [options]
```

| Command | Arguments / Flags | Description |
|---|---|---|
| `aiwf setup` | `[--link \| --claude \| --cursor \| --gemini \| --windsurf \| --json]` | Link global CLI binaries & print/export AI client MCP configurations. |
| `aiwf sync` | *(none)* | Index current directory codebase AST symbols & notes, reconcile Markdown projections & guidelines. |
| `aiwf status` / `view` | *(none)* | Render ANSI TUI project health, completion bars, and bug badges (`🔴`). |
| `aiwf audit` | *(none)* | Validate codebase against machine-enforced policies and guidelines in `enforcement.md`. |
| `aiwf metrics` | *(none)* | Display live context compression ratios, token savings, and execution latencies. |
| `aiwf impact` | `<file \| symbol>` | Run blast radius analysis, downstream caller tracing, and test recommendations. |
| `aiwf next` | *(none)* | Recommend the next high-leverage task based on dependencies and priorities. |
| `aiwf doctor` | `[--fix]` | Run repository health diagnostics; optionally auto-create tickets for unlinked `TODO`/`FIXME` notes. |
| `aiwf digest` | `[hours]` *(default: 24)* | Output daily standup digest (completed tickets, active ADRs, bug counts). |
| `aiwf decision` | `<list \| propose \| accept \| revert>` | Manage versioned Architectural Decision Records (ADRs) with ticket rollback. |
| `aiwf ui` | `[port]` *(default: 3456)* | Launch the zero-dependency local web graph & health dashboard. |
| `aiwf shell` | *(none)* | Launch interactive multi-mode REPL (`/design`, `/product`, `/dev`, `/triage`). |
| `aiwf run` | `<wish>` | Synthesize and execute a deterministic JavaScript routine via text compiler. |
| `aiwf mcp` | *(none)* | Start Model Context Protocol (MCP) server over `stdio`. |

---

## 🔌 Model Context Protocol (MCP) Tools (For AI Agents)

When configured in host agents, `ai-workflow` exposes 13 high-leverage tools:

| # | Tool Name | Description & Parameters |
|---|---|---|
| 1 | **`get_ticket_context`** | Fetch knapsack-packed bounded context (ticket + epic + AST symbols + active guidelines + past lessons + test command).<br>• `ticketId` *(string)*: Target ticket ID (e.g. `TKT-UI-001`)<br>• `maxTokens` *(number, optional)*: Hard token limit<br>• `format` *(xml \| markdown \| json, optional)* |
| 2 | **`get_project_overview`** | Fetch complete module health, completion levels, bug indicators, and Kanban lanes. |
| 3 | **`audit_guidelines`** | Audit changed files against machine-enforced policies and design guidelines before claiming closure.<br>• `targetFiles` *(string[], optional)* |
| 4 | **`get_telemetry_metrics`** | Retrieve context compression ratios, token savings, and operation latency stats. |
| 5 | **`update_ticket_state`** | Move tickets across Kanban lanes, record execution outputs, and log failure lessons.<br>• `ticketId` *(string)*<br>• `lane` *('Backlog' \| 'Todo' \| 'In Progress' \| 'Done' \| 'Blocked')*<br>• `status` *('planned' \| 'partial' \| 'implemented' \| 'verified', optional)*<br>• `lesson` *(object, optional)* |
| 6 | **`compile_codelet`** | Synthesize and compile a natural language wish into a tested, reusable JavaScript routine.<br>• `wish` *(string)*<br>• `compound` *(number, optional)*<br>• `tags` *(string[], optional)* |
| 7 | **`list_codelets`** | List all compiled routines and codelets in `.codelets/`. |
| 8 | **`search_codelets`** | Search compiled routines by keyword, tag, or title.<br>• `query` *(string)* |
| 9 | **`run_codelet`** | Execute a compiled routine by name or titleHash with input arguments.<br>• `nameOrHash` *(string)*<br>• `args` *(object, optional)* |
| 10 | **`propose_decision`** | Propose a new Architectural Decision Record (ADR) and link affected modules or epics.<br>• `id` *(string)*<br>• `title` *(string)*<br>• `body` *(string)*<br>• `impactedModules` *(string[], optional)*<br>• `epicId` *(string, optional)* |
| 11 | **`revert_decision`** | Revert an ADR, automatically block/cancel dependent tickets, and log the reason.<br>• `id` *(string)*<br>• `reason` *(string)* |
| 12 | **`get_blast_radius`** | Analyze dependency blast radius and affected tickets for a target file or symbol.<br>• `target` *(string)*: File path or AST symbol name |
| 13 | **`search_knowledge`** | Hybrid search across entities, epics, decisions, and in-code notes.<br>• `query` *(string)* |

---

## 🧠 AI Agent Operating Protocol

When working inside a repository managed by `ai-workflow`, AI agents follow the **MCP-First Execution Loop**:

```
[Start Session / Ticket]
        │
        ▼
1. Fetch Project State ───► MCP: get_project_overview() / CLI: aiwf status
        │
        ▼
2. Get Packed Context  ───► MCP: get_ticket_context(ticketId)
        │                   (Provides AST symbols, active ADRs, past failure lessons)
        ▼
3. Check Impact        ───► MCP: get_blast_radius(targetFile)
        │
        ▼
4. Implement Changes   ───► Edit source files directly
        │
        ▼
5. Audit & Verify      ───► MCP: audit_guidelines() + bun test
        │
        ▼
6. Close Ticket        ───► MCP: update_ticket_state(ticketId, lane="Done", status="verified")
```

---

## 🏛️ Architecture & Project Structure

```
ai-workflow/
├── src/
│   ├── cli.ts           # Main CLI entrypoint & setup wizard (aiwf, ai-workflow)
│   ├── mcp.ts           # Model Context Protocol (MCP) server (aiwf-mcp)
│   ├── store.ts         # SQLite Causal Graph & Semantika triple store
│   ├── indexer.ts       # Codebase parser & AST symbol extraction
│   ├── sync.ts          # Bidirectional 2-Way Git Markdown reconciliation
│   ├── context.ts       # Knapsack context packing & token budgeting
│   ├── compiler.ts      # JIT text-compiler & codelet routine manager
│   ├── decisions.ts     # Versioned ADR manager with ticket rollback
│   ├── guidelines.ts    # Machine policy enforcement & regex moderation
│   ├── impact.ts        # Blast radius analysis & task recommender
│   ├── metrics.ts       # Real-time telemetry & compression metrics
│   ├── shell.ts         # Multi-mode interactive REPL (/design, /product, /dev, /triage)
│   ├── ui.ts            # ANSI TUI dashboard & web graph server
│   └── types.ts         # TypeScript data contracts & schema definitions
├── tests/
│   ├── engine.test.ts   # Core store, ADR rollbacks, context, sync & setup tests
│   ├── mcp-e2e.test.ts  # End-to-end MCP tool execution tests
│   ├── moderation.test.ts # ReDoS and rule moderation test suite
│   └── metrics.test.ts  # Telemetry collection & token compression tests
├── kanban.md            # Git-tracked Kanban board projection
├── epics.md             # Git-tracked Epics ledger projection
├── decisions.md         # Git-tracked Architectural Decision Records (ADRs)
├── modules.md           # Git-tracked Module completion matrix
└── enforcement.md       # Machine-enforced coding & architecture rules
```

---

## 🧪 Testing & Verification

Run the comprehensive test suite with Bun:

```bash
bun test
```

All 20 test suites pass deterministically in under 300ms:

```
tests/engine.test.ts:      8 passed
tests/mcp-e2e.test.ts:     5 passed
tests/moderation.test.ts:  4 passed
tests/metrics.test.ts:     3 passed

Total: 20 passed, 0 failed (~300ms)
```

---

## 📄 License
MIT © Dharmax
