---
name: ai-workflow
description: Governs the AI agent workflow lifecycle using ai-workflow (aiwf) tools. Use when checking project status, inspecting tickets, managing claims, calculating blast radius, auditing guidelines, running codelets, or extracting bounded ticket contexts.
---

# 🏛️ AI-Workflow (aiwf) Operating Protocol

Use this skill whenever working in an `ai-workflow`-enabled codebase. It pairs with the `ai-workflow` MCP server (`aiwf-mcp`) and CLI (`aiwf`).

---

## 🚀 I. Read Order & Core Lifecycle Loop

When starting or advancing work in this project, follow this exact sequence:

1. **Workspace Orientation**:
   - Call `get_project_root` and `get_environment_info` (or CLI `aiwf root` and `aiwf env`) to determine repo root, active runtime, and package manager.
2. **Project Health & Epic Progress**:
   - Call `get_project_overview` and `get_epic_progress` (or CLI `aiwf status` and `aiwf burndown`) to check module matrix, epic burndown, and open bugs.
3. **Next Task Recommendation**:
   - Call `recommend_next_task` (or CLI `aiwf next`) to identify the highest leverage pending task.
4. **Atomic Ticket Lease**:
   - Before editing files for a ticket, call `claim_ticket(ticketId, agentId, durationMinutes)` (or CLI `aiwf claim <ticketId>`) to prevent multi-agent collision.
5. **Bounded Context & AST Slices**:
   - Call `get_ticket_context(ticketId, maxTokens=2000)` (or CLI `aiwf context <ticketId> --budget 2000`) to fetch high-density context.
   - Use `get_file_outline(file)` or `get_symbol_source(file, symbol)` (CLI `aiwf outline <file>` / `aiwf slice <file> <symbol>`) to inspect only targeted signatures or function code.
   - Use `estimate_token_budget(files)` (CLI `aiwf token-count [files...]`) to prevent context window blowouts.
6. **Pre-Flight Blast Radius Gate & Snapshot**:
   - Call `check_blast_gate(target)` (or CLI `aiwf gate <target>`) before modifying shared core files.
   - Call `create_snapshot_checkpoint(label)` (CLI `aiwf snapshot [label]`) to save a non-destructive patch backup before experimental refactors.
   - Use `resolve_test_command(file)` (or CLI `aiwf test-target <file>`) to resolve the paired test file.
7. **Implementation & Test Triage**:
   - Edit the codebase and run verification tests.
   - If tests fail, call `triage_test_failures()` (CLI `aiwf triage`) to get a compact failure summary without token waste.
8. **Pre-Closure Diff Review, PR Summary & Lesson Recording**:
   - Call `get_ticket_diff()` (or CLI `aiwf diff`) to self-review uncommitted changes.
   - Call `record_ticket_lesson(ticketId, lesson)` (CLI `aiwf lesson <ticketId> <text>`) to persist bug lessons into future ticket context packs.
   - Call `generate_pr_summary(ticketId)` (CLI `aiwf pr-summary <ticketId>`) to format conventional commit and PR notes.
   - Call `update_ticket_state(ticketId, lane="Done", status="verified")` (or CLI `aiwf done <ticketId>`).
   - Call `release_ticket(ticketId)` to release the lease.

---

## 🛠️ II. MCP Tools vs. CLI Command Matrix

All capabilities are unified across MCP and CLI:

| Task / Intent | MCP Tool (Primary) | CLI Command (Fallback) |
| :--- | :--- | :--- |
| **Find Real Root** | `get_project_root` | `aiwf root [dir]` |
| **Runtime & Toolchain Info**| `get_environment_info` | `aiwf env` |
| **Git Working Tree State** | `get_git_status` | `aiwf git-status` |
| **Project Health & Matrix** | `get_project_overview` | `aiwf status` / `aiwf project summary` |
| **Epic Burndown Progress** | `get_epic_progress` | `aiwf burndown` |
| **Sync AST & Markdown** | `sync_project` | `aiwf sync` |
| **Extract Bounded Context** | `get_ticket_context` | `aiwf context <ticketId> [--budget N]` |
| **File Outline / Signatures**| `get_file_outline` | `aiwf outline <file>` |
| **Surgical Symbol Slice** | `get_symbol_source` | `aiwf slice <file> <symbol>` |
| **Token Budget Estimator** | `estimate_token_budget` | `aiwf token-count [files...]` |
| **Safe Working Tree Snapshot**| `create_snapshot_checkpoint` | `aiwf snapshot [label]` |
| **Deep Ticket Inspection** | `get_ticket_deep_view` | `aiwf ticket inspect <ticketId>` |
| **List Tickets** | `list_tickets` | `aiwf ticket list [lane]` |
| **Move Ticket State** | `update_ticket_state` | `aiwf ticket move <id> <lane> [status]` |
| **Start / Done Ticket** | `start_ticket` / `done_ticket` | `aiwf start <id>` / `aiwf done <id>` |
| **Claim / Release Ticket** | `claim_ticket` / `release_ticket` | `aiwf claim <id>` / `aiwf release <id>` |
| **Recommend Next Task** | `recommend_next_task` | `aiwf next` |
| **Pre-Flight Safety Gate** | `check_blast_gate` | `aiwf gate <target>` |
| **Resolve Test Target** | `resolve_test_command` | `aiwf test-target <file>` |
| **Triage Test Failures** | `triage_test_failures` | `aiwf triage [command]` |
| **Persist Bug Lesson** | `record_ticket_lesson` | `aiwf lesson <ticketId> <text...>` |
| **Conventional PR Summary** | `generate_pr_summary` | `aiwf pr-summary [ticketId]` |
| **Recent Churn Hotspots** | `get_project_hotspots` | `aiwf hotspots [days]` |
| **Review Working Diff** | `get_ticket_diff` | `aiwf diff [target]` |
| **Drop / Read Scratchpad** | `drop_agent_note` / `read_scratchpad` | `aiwf note <text>` / `aiwf notes` |
| **Lint Causal Graph** | `lint_workflow_graph` | `aiwf lint-graph` |
| **Feature Blast Radius** | `analyze_feature_blast_radius` | `aiwf feature-impact <wish...>` |
| **Search Knowledge & Notes**| `search_knowledge` | `aiwf search <query>` |
| **AST Symbol Lookup** | `find_symbol` | `aiwf symbol <name>` |
| **Audit Guidelines** | `audit_guidelines` | `aiwf audit [files...]` |
| **Telemetry & Savings** | `get_telemetry_metrics` | `aiwf metrics` |
| **Manage Decisions (ADR)** | `propose_decision`, `revert_decision` | `aiwf decision <list|propose|accept|revert>` |
| **Codelets & Routines** | `list_codelets`, `run_codelet` | `aiwf codelet <list|run|compile|sweep>` |
| **1-Shot Debt Sweep** | `sweep_bugs` | `aiwf sweep [--fix]` |
| **Doctor Diagnostics** | `doctor_diagnose` | `aiwf doctor [--fix]` |

---

## 📜 III. Guardrails & Best Practices

1. **Root Awareness**: `aiwf` automatically resolves the real workspace root from any subdirectory.
2. **Never Edit Files Without Verification**: Use `resolve_test_command` to find the exact test runner and execute it before marking any ticket Done.
3. **Token Economy**: Prefer `get_ticket_context`, `get_file_outline`, and `get_symbol_source` over reading whole multi-hundred-line files.
4. **Safe Mutations**: Use `create_snapshot_checkpoint` before executing risky multi-file refactorings.
