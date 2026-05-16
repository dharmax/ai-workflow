# AIWF DOD Experience Report - 2026-05-16

## Scope

This pass used `ai-workflow` as the primary control surface for sync, provider diagnosis, routing verification, codelet registry checks, kanban projection/archive handling, live smart-codelet execution, and final gates.

## AIWF Work Performed

- Ran `ai-workflow sync --json` before work. It exposed stale workflow records and stale dogfood state.
- Ran `ai-workflow doctor --json`. It showed Ollama was configured to `127.0.0.1:11434` even though the reachable host was `http://lotus:11434`.
- Reconfigured project and global Ollama routing with `ai-workflow set-ollama-hw ... --host http://lotus:11434 --planner-model qwen2.5-coder:7b-instruct-q4_K_M`.
- Ran `ai-workflow kanban archive --json` after fixing the documented archive command dispatch path.
- Ran `ai-workflow project codelet search debug --json` and `ai-workflow project codelet search assess --json` to verify graph-indexed coding capability discovery.
- Ran `ai-workflow route shell-planning --json --prefer-local` to verify the route selects Lotus Ollama `qwen2.5-coder:7b-instruct-q4_K_M` and no longer recommends `nomic-embed-text`.
- Ran `ai-workflow run debug-code ... --json` through Lotus Ollama. It executed the requested typed codelet after fixing runner dispatch and parsing bugs.
- Ran `ai-workflow run assess-code ... --json` through Lotus Ollama. It returned a typed assessment with diagnostics, including latency and token usage.

## Fixes Made

- Fixed `kanban archive` so the documented CLI command dispatches into core and archives old Done tickets through `KanbanManager.archiveDoneTickets`.
- Fixed router scoring so shell-planning excludes non-generative embedding models and honors the configured Ollama planner model.
- Added graph-indexed `debug-code` and `assess-code` smart codelets with typed input/output schemas, graph-backed context policy, read-only evidence policy, grader ids, retry limits, and `canMutate: false`.
- Fixed capture-mode TypeScript codelet execution so `ai-workflow run` uses the `tsx` subprocess path instead of native Node strip-only imports.
- Fixed `CoreLLM` runtime use of `ExecutionMode`; it was imported as a type but used as a value.
- Fixed smart-runner codelet id propagation so `ai-workflow run debug-code` executes `debug-code`, not the default `codelet-observer`.
- Hardened smart-runner JSON parsing for fenced JSON and JSON embedded in surrounding prose.
- Added smart-runner diagnostics for actual attempts, validation retries/errors, latency, and token usage.

## Live Results

- `doctor`: Ollama is available at `http://lotus:11434` with 10 models and planner model `qwen2.5-coder:7b-instruct-q4_K_M`.
- `route shell-planning --prefer-local`: selected `ollama/qwen2.5-coder:7b-instruct-q4_K_M`; the earlier embedding-model selection is covered by regression tests.
- `project codelet search debug`: returns `debug-code` with typed output fields including `suspected_root_causes` and `verification_steps`.
- `project codelet search assess`: returns `assess-code` with typed output fields including `goe_gaps` and `graph_gaps`.
- `run debug-code`: succeeded through Ollama and returned the correct codelet id and schema after two attempts.
- `run assess-code`: succeeded through Ollama in one attempt with diagnostics: `latencyMs=268243`, `promptTokens=206`, `completionTokens=415`, `totalTokens=621`.

## Faults Found By Dogfooding

- The project-local Ollama config was wrong despite Lotus being reachable. AIWF now points at Lotus, but this proved provider diagnosis must be part of every operator gate.
- The documented `kanban archive` command was broken. This directly violated the project protocol because stale Done tickets blocked `sync`.
- `route shell-planning` could recommend `nomic-embed-text`, an embedding model, for generative planning. That is now blocked for non-embedding task classes.
- `ai-workflow run <smart-codelet>` had multiple real blockers: native TS import failure, erased runtime enum import, wrong codelet id propagation, and fenced JSON parsing failure.
- Local Ollama smart-codelet latency is still poor. A successful `assess-code` pass took 268 seconds for 621 tokens.
- The graph-backed context is useful for discovery and registry verification, but the live debug/assess content quality remains shallow unless the prompt includes very explicit evidence. The codelet output schemas enforce shape, not truth quality.
- GoE enforcement is still partial. The gates detect stale dogfood and workflow freshness, but they do not yet enforce deeper quality requirements such as evidence sufficiency, local-model latency budgets, or "no shallow assessment" grading.

## Gains

- AIWF is now able to discover debug and assessment capabilities from the DB-backed codelet registry.
- AIWF can execute typed smart codelets through local Ollama and report retries, latency, and token usage.
- AIWF can maintain kanban projection hygiene through the documented archive command.
- AIWF routing now treats local Ollama as a real first-class provider and avoids embedding-only models for planning.
- Regressions cover the exact failure classes found while using AIWF itself.

## Remaining DOD Gaps

- Not all active kanban tickets are resolved. Current `project summary` still reports active tickets including `BUG-PLANNER-001`, `BUG-SYNC-001`, `TKT-SHELL-002`, `TKT-CORE-004`, `TKT-GOE-001`, `TKT-PROJECTIONS-001`, `TKT-DOCS-001`, and `TKT-GRAPH-001`.
- AIWF can now debug/review/assess through codelets, but it is not yet "better than Claude Code." The most honest next milestone is quality grading: require evidence-backed findings and fail shallow outputs.
- The graph DB is richer than before, but it is still not the complete coding substrate the user wants. It needs better code-symbol-to-ticket-to-test traversal and fewer noisy target matches.
- Local-model latency needs a budgeted context pack, timeout policy, and possibly smaller step prompts.

## Recommended Next Moves

- Implement a grader for `debug-code-v1` and `assess-code-v1` that rejects shallow evidence and unsupported claims.
- Add latency/timeout budgets to smart-codelet contracts and surface timeout/degraded-path diagnostics.
- Link `debug-code`, `assess-code`, `execute-ticket`, and `refactor-ticket` into the canonical program planner so natural-language "debug/review/write code" requests select these capabilities automatically.
- Expand graph ingestion to connect tickets, files, symbols, tests, codelets, and guardrails as first-class traversal edges.
- Resolve or split the remaining broad kanban tickets instead of closing them falsely.
