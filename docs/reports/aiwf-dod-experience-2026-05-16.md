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
- Ran `ai-workflow extract guidelines coding architecture enforcement --json` before adding shell/plugin enforcement logic.
- Ran `ai-workflow shell --no-ai "enforce the coding and architecture guidelines for shell and plugin surfaces" --plan-only --json` to verify shell routing without execution.
- Ran `ai-workflow run guideline-enforcer ... --provider ollama --model qwen2.5-coder:7b-instruct-q4_K_M --json` to dogfood guideline enforcement through Lotus.
- Ran `ai-workflow run generate-code ... --file tests/shell.test.ts --provider ollama --model qwen2.5-coder:7b-instruct-q4_K_M --json` to dogfood coding-plan generation through Lotus.

## Fixes Made

- Fixed `kanban archive` so the documented CLI command dispatches into core and archives old Done tickets through `KanbanManager.archiveDoneTickets`.
- Fixed router scoring so shell-planning excludes non-generative embedding models and honors the configured Ollama planner model.
- Added graph-indexed `debug-code` and `assess-code` smart codelets with typed input/output schemas, graph-backed context policy, read-only evidence policy, grader ids, retry limits, and `canMutate: false`.
- Fixed capture-mode TypeScript codelet execution so `ai-workflow run` uses the `tsx` subprocess path instead of native Node strip-only imports.
- Fixed `CoreLLM` runtime use of `ExecutionMode`; it was imported as a type but used as a value.
- Fixed smart-runner codelet id propagation so `ai-workflow run debug-code` executes `debug-code`, not the default `codelet-observer`.
- Hardened smart-runner JSON parsing for fenced JSON and JSON embedded in surrounding prose.
- Added smart-runner diagnostics for actual attempts, validation retries/errors, latency, and token usage.
- Added `generate-code` and `guideline-enforcer` smart codelets with typed contracts, guardrail-aware context policy, grader ids, retries, and read-only mutation policy.
- Injected selected active guardrails into smart-codelet context packs and prompts so shell/plugin/codelet outputs can be checked against project coding and architecture rules.
- Routed natural-language coding prompts to `generate-code` and guideline/GoE/plugin enforcement prompts to `guideline-enforcer`.
- Fixed `shell --plan-only` so it does not execute safe auto-codelets through either the normal path or fast path.
- Hardened code-generation grading so hallucinated file targets are rejected unless marked `new:<path>` or `unknown:<reason>`.
- Added deterministic degraded fallbacks for guideline enforcement and code generation. They do not pretend the LLM succeeded; they return a contract-valid checklist/plan with `degraded: true`.

## Live Results

- `doctor`: Ollama is available at `http://lotus:11434` with 10 models and planner model `qwen2.5-coder:7b-instruct-q4_K_M`.
- `route shell-planning --prefer-local`: selected `ollama/qwen2.5-coder:7b-instruct-q4_K_M`; the earlier embedding-model selection is covered by regression tests.
- `project codelet search debug`: returns `debug-code` with typed output fields including `suspected_root_causes` and `verification_steps`.
- `project codelet search assess`: returns `assess-code` with typed output fields including `goe_gaps` and `graph_gaps`.
- `run debug-code`: succeeded through Ollama and returned the correct codelet id and schema after two attempts.
- `run assess-code`: succeeded through Ollama in one attempt with diagnostics: `latencyMs=268243`, `promptTokens=206`, `completionTokens=415`, `totalTokens=621`.
- `shell --no-ai ... --plan-only`: returned a pending `guideline-enforcer` plan with `executed=[]`; this verifies inspection mode no longer performs side effects.
- `run guideline-enforcer`: completed through Ollama after two invalid LLM attempts. AIWF returned a degraded guardrail checklist from active guardrails with `latencyMs=601577`, provider `ollama`, model `qwen2.5-coder:7b-instruct-q4_K_M`.
- `run generate-code --file tests/shell.test.ts`: completed through Ollama after two invalid LLM attempts. AIWF returned a degraded patch-plan scaffold grounded to `tests/shell.test.ts` with `latencyMs=601565`.

## Faults Found By Dogfooding

- The project-local Ollama config was wrong despite Lotus being reachable. AIWF now points at Lotus, but this proved provider diagnosis must be part of every operator gate.
- The documented `kanban archive` command was broken. This directly violated the project protocol because stale Done tickets blocked `sync`.
- `route shell-planning` could recommend `nomic-embed-text`, an embedding model, for generative planning. That is now blocked for non-embedding task classes.
- `ai-workflow run <smart-codelet>` had multiple real blockers: native TS import failure, erased runtime enum import, wrong codelet id propagation, and fenced JSON parsing failure.
- Lotus Ollama is reachable and usable. Latency is expected on the available hardware, so it is not treated as a correctness failure by itself. The product fault was missing timeout/degraded-path handling and weak validation around slow local generation.
- Live guideline/code-generation outputs from `qwen2.5-coder:7b-instruct-q4_K_M` were often below contract. AIWF now rejects those outputs and falls back honestly, but this proves model-output quality still needs stronger step prompts or smaller context packs.
- `shell --plan-only` executed safe codelets before this pass. That was a serious operator-surface bug because plan-only must never mutate or perform expensive execution.
- `ai-workflow project note add ... --json` unexpectedly entered a long assessment path instead of returning quickly. I stopped it after several minutes; note-taking should be deterministic or explicitly report that it is invoking AI.
- The graph-backed context is useful for discovery, registry verification, active guardrail selection, and file-grounded degraded plans. It is still not rich enough to make the local model consistently produce high-quality code plans without deterministic scaffolding.
- GoE enforcement improved from advisory to executable: active guardrails are selected, injected, routed through `guideline-enforcer`, and checked by a grader. It is still partial because pass/fail status is not automatically proven against every changed file.

## Gains

- AIWF is now able to discover debug and assessment capabilities from the DB-backed codelet registry.
- AIWF can execute typed smart codelets through local Ollama and report retries, latency, and token usage.
- AIWF can maintain kanban projection hygiene through the documented archive command.
- AIWF routing now treats local Ollama as a real first-class provider and avoids embedding-only models for planning.
- Regressions cover the exact failure classes found while using AIWF itself.
- AIWF can now route shell natural language for code generation, debugging, assessment, and guideline enforcement to typed codelets instead of generic shallow status answers.
- AIWF now enforces coding and architecture guardrails in codelet prompts and validates guideline/code-generation results before accepting them.
- AIWF now catches hallucinated code target files and turns weak code-generation output into an honest degraded plan rather than accepting bogus file paths.

## Remaining DOD Gaps

- Not all active kanban tickets are resolved. Current `project summary` still reports active tickets including `BUG-PLANNER-001`, `BUG-SYNC-001`, `TKT-SHELL-002`, `TKT-CORE-004`, `TKT-GOE-001`, `TKT-PROJECTIONS-001`, `TKT-DOCS-001`, and `TKT-GRAPH-001`.
- AIWF can now debug/review/assess through codelets, but it is not yet "better than Claude Code." The most honest next milestone is quality grading: require evidence-backed findings and fail shallow outputs.
- The graph DB is richer than before, but it is still not the complete coding substrate the user wants. It needs better code-symbol-to-ticket-to-test traversal and fewer noisy target matches.
- AIWF can now generate guardrail-aware coding plans, but it does not yet reliably write high-quality complex patches autonomously from local-model output. Safe mutation still belongs in ticket execution paths.
- Local-model operation needs context budgeting and timeout policy. Slow Lotus responses should be tolerated, but a single smart step should not silently hang without progress/degraded diagnostics.

## Recommended Next Moves

- Implement a grader for `debug-code-v1` and `assess-code-v1` that rejects shallow evidence and unsupported claims.
- Add latency/timeout budgets to smart-codelet contracts and surface timeout/degraded-path diagnostics.
- Link `debug-code`, `assess-code`, `execute-ticket`, and `refactor-ticket` into the canonical program planner so natural-language "debug/review/write code" requests select these capabilities automatically.
- Expand graph ingestion to connect tickets, files, symbols, tests, codelets, and guardrails as first-class traversal edges.
- Resolve or split the remaining broad kanban tickets instead of closing them falsely.
- Promote `guideline-enforcer` into shell/plugin/MCP preflight gates so coding and architecture rules are enforced before operator-surface changes are considered done.
- Add a true mutating `write-code` workflow step that uses `generate-code` for planning, `execute-ticket` for writes, graph evidence for target selection, and tests/audit for closure.
