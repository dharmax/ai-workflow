---
name: ai-workflow
description: Governs the AI agent workflow lifecycle using ai-workflow (aiwf) tools. Use when checking project status, inspecting tickets, managing claims, calculating blast radius, auditing guidelines, running codelets, or extracting bounded ticket contexts.
---

# 🏛️ AI-Workflow 2.0 Skill: Causal Context & Engineering OS

AI-Workflow provides high-efficiency deterministic tools and a causal AST+ Context Graph for pair programming and autonomous coding.

## 🚀 The Zero-Token Discovery Protocol (Always Follow This Order)

1. **State Restoration**: Run `aiwf status` or invoke `recommend_next_task` / `list_tickets` to check current sprint state.
2. **Lease Before Edit**: Always lease your target ticket before modifying code using `claim_ticket`. Never mutate unleased code.
3. **Surgical Slicing**:
   - Use `find_symbol` and `get_symbol_source` to extract 30-50 line functions without dumping entire files.
   - Run `analyze_blast_radius` before editing to identify affected dependents and recommended tests.
   - Run `estimate_token_budget` to avoid context window blowouts.
4. **Deterministic Patching**:
   - Use `apply_block_patch` for surgical code modifications.
   - Use `compile_codelet` and `promote_codelet` for new reusable functions.
5. **Pair-Test Verification**:
   - Resolve paired test file via `resolve_test_target`.
   - Run verification tests via `triage_test_failures`.
6. **Synchronize Ledgers**:
   - Move completed tickets to `Done` via `update_ticket_state`.
   - Run `aiwf sync` to ensure Markdown projections mirror the SQLite Graph.

---

## 🛠️ Capability Tools Catalog

### 1. Tickets & Kanban (`ticket.*`)
- `recommend_next_task`: Algorithmic task selector (Active Lease -> P0/P1 Bugs -> Todo).
- `claim_ticket`: Atomically lease a ticket with TTL (`ticketId`, `agentId`, `durationMinutes`).
- `release_ticket`: Release an active lease.
- `create_ticket`: Create a ticket with lane and priority.
- `update_ticket_state`: Move ticket across Kanban lanes (`Todo`, `In Progress`, `Done`, `Blocked`).
- `list_tickets`: Filter tickets by lane.

### 2. AST+ Graph & Codebase (`graph.*`)
- `find_symbol`: Find symbols by name across the codebase.
- `get_symbol_source`: Surgical code slice around symbol definition.
- `get_file_outline`: High-density signature outline of a file.
- `analyze_blast_radius`: Dependency and impact analysis for a file or module.
- `estimate_token_budget`: Token cost estimation and context risk rating.

### 3. Compiler & JIT Codelets (`compiler.*`)
- `compile_codelet`: Synthesize pure ESM function with verification test harness.
- `run_codelet`: Execute stored codelet with arguments.
- `promote_codelet`: Promote verified codelet into live registry as a custom tool.
- `apply_block_patch`: Deterministic AST replacement via `@dharmax/block-patcher`.

### 4. Git Operations (`git.*`)
- `get_git_status`: Porcelain status parser (staged, modified, untracked).
- `get_git_diff`: Uncommitted working tree diff.
- `create_snapshot_checkpoint`: Non-destructive `.patch` backup in `.ai-workflow/snapshots/`.
- `get_git_hotspots`: Top code churn files over N days.
- `generate_pr_summary`: PR description grounded in tickets and ADRs.

### 5. OS & Execution (`os.*` & `script.*`)
- `run_command`: Bounded command execution with timeout.
- `get_environment_info`: Probes runtime, platform, package manager, and git.
- `get_project_root`: Resolves project root.
- `script_eval`: Direct JavaScript evaluation in Bun context.

### 6. Planning & Architecture (`planning.*`)
- `propose_decision`: Record Architectural Decision Record (ADR).
- `read_scratchpad`: Read shared agent scratchpad.
- `append_scratchpad_note`: Append timestamped note.

### 7. Autonomous Execution
- `execute_shell_wish`: Natural language instruction executed by cognitive actor with auto-mode switching.
