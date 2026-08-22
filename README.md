<!-- Responsibility: Explain what ai-workflow is, its modular Bun-first architecture, installation, and complete CLI & MCP command reference.
Scope: Core developer guide and operational contract. -->
# AI-Workflow: Bun-First Causal Engineering OS & Project Visibility Engine

`ai-workflow` (`aiwf`) is a high-speed, deterministic, repo-local operating system for software development and AI-assisted engineering. 

Built with **Bun** and powered by the `@dharmax/*` modular ecosystem, it replaces bloated heuristics with an AST-grounded **SQLite Causal Graph**, bi-directional **Git Markdown projections**, **knapsack context budgeting**, **revertable ADR decisions**, **blast radius analysis**, **machine-enforced guideline auditing**, and a full **Model Context Protocol (MCP)** host bridge.

---

## ⚡ Key Highlights

* **Ultra-Lean Engine (< 1,500 Lines)**: Fast, deterministic, zero synthetic bloat.
* **Powered by Sibling Packages**:
  * [`@dharmax/codebase-parser`](https://github.com/dharmax/codebase-parser): AST symbols, module dependencies, and code note discovery across 15+ languages.
  * [`@dharmax/context-manager`](https://github.com/dharmax/context-manager): Heuristic knapsack context packing and token budgeting.
  * [`@dharmax/text-compiler`](https://github.com/dharmax/text-compiler): Natural language routine synthesis into executable state machines.
  * [`@dharmax/llm-utils`](https://github.com/dharmax/llm-utils): Native Ollama / cloud LLM conversation, Zod structured JSON schemas, and routing.
  * [`@dharmax/block-patcher`](https://github.com/dharmax/block-patcher): Deterministic search/replace AST patching.
* **2-Way Git Markdown Ledgers**: SQLite state automatically projects to [kanban.md](kanban.md) (Obsidian Kanban compatible), [epics.md](epics.md), [decisions.md](decisions.md), and [modules.md](modules.md).
* **ADR Decision Ledger with Rollbacks**: Versioned Architectural Decision Records that reconcile and cancel dependent tickets upon rollback.
* **Real-Time Telemetry & Context Metrics**: Live tracking of token savings, compression ratios (>65%), and sub-millisecond query latencies.
* **12-Tool MCP Host Surface**: Exposes context packing, project health, guideline auditing, ADR lifecycle, and codelet JIT compilation to Claude, Gemini, and Codex.

---

## 📦 Installation & Setup

### Requirements
* [Bun](https://bun.sh) (>= 1.3.14)
* Git
* Optional: Local or remote [Ollama](https://ollama.com) instance (e.g. `http://lotus:11434`) for local AI-planned routines.

### Global Install
```bash
bun add -g github:dharmax/ai-workflow
aiwf --help
```

### Local Development
```bash
git clone git@github.com:dharmax/ai-workflow.git
cd ai-workflow
bun install
bun test
```

---

## 🚀 CLI Commands Reference

| Command | Description |
|---|---|
| `aiwf sync` | Index codebase AST symbols & notes, reconcile Markdown projections & guidelines. |
| `aiwf status` / `view` | Display the ANSI TUI project health, completion bars, and bug badges (`🔴`). |
| `aiwf audit` | Audit codebase against machine-enforced policies and guidelines in `enforcement.md`. |
| `aiwf metrics` | Display live context compression ratios, token savings, and execution latencies. |
| `aiwf impact <file\|symbol>` | Perform blast radius analysis, downstream caller tracing, and test recommendations. |
| `aiwf digest [hours]` | Output daily standup digest (completed tickets, active ADRs, bug counts). |
| `aiwf next` | Recommend the next high-leverage task based on dependencies and priorities. |
| `aiwf doctor [--fix]` | Run repository health diagnostics; optionally auto-create tickets for unlinked `TODO`/`FIXME`/`BUG` notes. |
| `aiwf decision <propose\|accept\|revert\|list>` | Manage versioned Architectural Decision Records (ADRs) with ticket rollback. |
| `aiwf ui [port]` | Launch the zero-dependency local web graph & health dashboard (default: `3456`). |
| `aiwf shell` | Launch interactive multi-mode REPL (`/design`, `/product`, `/dev`, `/triage`). |
| `aiwf run <wish>` | Synthesize and execute a deterministic JavaScript routine via text compiler. |
| `aiwf mcp` | Start Model Context Protocol (MCP) server over `stdio`. |

---

## 🔌 Model Context Protocol (MCP) Tools

When configured in host agents (Gemini, Claude Desktop, Antigravity, Cursor, etc.), `ai-workflow` exposes 12 high-leverage tools:

1. **`get_ticket_context`**: Fetch knapsack-packed bounded context (ticket + epic + AST symbols + active guidelines + past lessons + test command).
2. **`get_project_overview`**: Structured module health, completion levels, bug indicators, and Kanban lanes.
3. **`audit_guidelines`**: Audit changed files against machine-enforced policies before claiming closure.
4. **`get_telemetry_metrics`**: Retrieve token savings, compression ratios, and operation latency stats.
5. **`update_ticket_state`**: Move tickets across Kanban lanes, record execution outputs, and log failure lessons.
6. **`compile_codelet`**: Synthesize tested, reusable JavaScript routines from natural language wishes.
7. **`list_codelets`**: List all compiled routines in `.codelets/`.
8. **`search_codelets`**: Find codelets by keyword, tag, or title.
9. **`run_codelet`**: Execute compiled routines with input parameters.
10. **`propose_decision`**: Propose new Architectural Decision Records (ADRs) linked to modules.
11. **`revert_decision`**: Revert ADRs, automatically block/cancel dependent tickets, and log reason.
12. **`get_blast_radius`**: Dependency impact analysis on files or AST symbols.
13. **`search_knowledge`**: Hybrid entity, decision, and in-code note search.

---

## 🧪 Testing & Verification

```bash
bun test
```

Includes 100% passing test suites across core store, ADR rollbacks, bounded context packing, 2-way sync, MCP protocol E2E, rule moderation & ReDoS protection, and metrics telemetry:

```
tests/engine.test.ts:      7 passed
tests/mcp-e2e.test.ts:     5 passed
tests/moderation.test.ts:  4 passed
tests/metrics.test.ts:     3 passed

Total: 19 passed, 0 failed (~180ms)
```

---

## 📄 License
MIT © Dharmax
