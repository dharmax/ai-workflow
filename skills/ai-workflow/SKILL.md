---
name: ai-workflow
description: Governs the AI agent workflow lifecycle using ai-workflow (aiwf) tools. Use when checking project status, inspecting tickets, managing claims, calculating blast radius, auditing guidelines, running codelets, or extracting bounded ticket contexts.
---

# 🏛️ AI-Workflow 2.0 Skill: Causal Context & Engineering OS

AI-Workflow provides high-efficiency deterministic tools and a causal AST+ Context Graph for human pair programming and autonomous coding agents.

---

## 🚀 The Zero-Token Discovery Protocol (Always Follow This Order)

1. **Orientation & Health**:
   - Run `aiwf status` (or MCP `get_git_status` + `list_tickets`) to inspect working tree status and active leases.
   - Run `aiwf doctor` to verify graph database, projections, and MCP connectivity.
2. **Next Task Recommendation**:
   - Run `aiwf next` (or MCP `recommend_next_task`) to select the active sprint priority:
     `Active Agent Lease -> P0/P1 High-Priority Bugs -> Unleased Todo Tasks`.
3. **Lease Before Edit (Mandatory Safety)**:
   - Always lease the target ticket before touching code: `aiwf claim <ticketId>` (or MCP `claim_ticket`). Never mutate code without an active lease.
4. **Surgical Slicing & Blast Radius**:
   - Use `aiwf symbol <name>` (MCP `find_symbol`) to locate symbols.
   - Use `aiwf slice <file> <symbol>` (MCP `get_symbol_source`) to inspect 30-50 line function bodies without dumping full files.
   - Use `aiwf outline <file>` (MCP `get_file_outline`) to inspect file exports and signatures.
   - Use `aiwf blast <target>` (MCP `analyze_blast_radius`) before modifying shared files.
5. **Deterministic Patching**:
   - Use `aiwf patch <file> <target> <replacement>` (or MCP `apply_block_patch`) for surgical block replacement via `@dharmax/block-patcher`.
   - Use `compile_codelet` and `promote_codelet` for JIT synthesis and dynamic tool expansion.
6. **Pair-Test Verification**:
   - Resolve paired test target via MCP `resolve_test_target`.
   - Execute verification tests via MCP `triage_test_failures`.
7. **Synchronize Ledgers & Close Lease**:
   - Move completed ticket to `Done` via MCP `update_ticket_state(ticketId, lane="Done")`.
   - Release lease via `aiwf release <ticketId>` (or MCP `release_ticket`).
   - Run `aiwf sync` to ensure Obsidian Markdown projections (`kanban.md`, `epics.md`, `decisions.md`, `modules.md`) mirror the SQLite Graph.

---

## 🛠️ MCP Tools vs. CLI Commands Reference

All capabilities are unified across stdio MCP and the CLI:

| Capability / Action | CLI Command | MCP Tool |
| :--- | :--- | :--- |
| **Working Tree & Leases** | `aiwf status` | `get_git_status`, `list_tickets` |
| **System Diagnostics** | `aiwf doctor` | `get_environment_info` |
| **Next Task Recommendation** | `aiwf next [agentId]` | `recommend_next_task` |
| **List Kanban Tickets** | `aiwf tickets [lane]` | `list_tickets` |
| **Lease Ticket** | `aiwf claim <id> [--agent <a>]` | `claim_ticket` |
| **Release Lease** | `aiwf release <id>` | `release_ticket` |
| **Uncommitted Diff** | `aiwf diff` | `get_git_diff` |
| **Locate Symbol** | `aiwf symbol <name>` | `find_symbol` |
| **Surgical Code Slice** | `aiwf slice <file> <sym>` | `get_symbol_source` |
| **File Outline** | `aiwf outline <file>` | `get_file_outline` |
| **Blast Radius & Tests** | `aiwf blast <target>` | `analyze_blast_radius` |
| **Re-index AST Symbols** | `aiwf index` | `indexCodebase` (via setup) |
| **AST Block Patching** | `aiwf patch <file> <s> <r>` | `apply_block_patch` |
| **JIT Codelet Compiler** | *(via shell / MCP)* | `compile_codelet`, `run_codelet` |
| **Promote Codelet to Tool** | *(via shell / MCP)* | `promote_codelet` |
| **Test Target Resolution** | *(via shell / MCP)* | `resolve_test_target` |
| **Failure Triage** | *(via shell / MCP)* | `triage_test_failures` |
| **Playwright Testing** | *(via shell / MCP)* | `run_playwright` |
| **Architectural Decisions**| *(via shell / MCP)* | `propose_decision` |
| **Shared Scratchpad** | *(via shell / MCP)* | `read_scratchpad`, `append_scratchpad_note` |
| **Bun JS Scripting** | `aiwf eval <js>` | `script_eval` |
| **Autonomous Execution** | `aiwf exec "<wish>"` | `execute_shell_wish` |
| **Interactive REPL** | `aiwf shell` (or `aiwf`) | *(terminal REPL)* |
| **Setup & MCP Wiring** | `aiwf setup` / `aiwf init` | *(setup engine)* |

---

## 🔒 Safety & Concurrency Rules for Agents

- **Zero Hallucinated Parameters**: All tool calls must strictly conform to their Zod parameter schemas.
- **Claim Before Edit**: No agent may edit code for a ticket without an active lease recorded via `claim_ticket`.
- **Extreme KISS**: Implement the simplest solution first. Avoid monolithic components or complicated wrappers.
- **Verification Gate**: Every code modification must be verified by running the corresponding unit test suite via `resolve_test_target` and `triage_test_failures`.
- **Bidirectional Ledger Integrity**: Run `aiwf sync` after task completion to guarantee that Markdown files and the SQLite graph stay 100% in sync.
