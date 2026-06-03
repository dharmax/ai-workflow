# Responsibility: Preserve completed kanban history once work leaves the live board.
# Scope: Archive-only history belongs here; live ticket state stays in kanban.md.
# Kanban Archive

Move completed tickets here once they no longer belong on the live `Done` lane.
Keep the original checked task card and its `✅ YYYY-MM-DD` date.
Group archived work by month or release when that improves scanning.

## 2026-03

## 2026-05

- [ ] BUG-CODELET-BACKINGS-001 Restore missing runtime/script backings for toolkit codelets ✅ 2026-05-08
  - Summary: Fix codelet manifests and runtime entry wiring so audit, route, guideline-audit, map-dependencies, and locate-trapped-logic resolve to real executable backings.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived

- [ ] BUG-OVERLAY-01 Restore global overlay handling for non-dialog modals after the app-shell refactor. ✅ 2026-05-08
  - State: archived

- [ ] TKT-CORE-003 Finish core/cli decoupling for packageable core/common ✅ 2026-05-08
  - Summary: Remove remaining core imports from cli/lib config-store and isolate packageable common/core boundaries for npm publication.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived

- [ ] TKT-PACKAGING-001 Scaffold the three npm package surfaces ✅ 2026-05-08
  - Summary: Define and scaffold publishable package boundaries for common/core, skill-mode support, and shell-mode support without resolving the remaining implementation gaps yet.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived

- [ ] TKT-EPIC-PROBE probe ✅ 2026-05-07
  - Epic: EPC-PROBE
  - Parent: EPC-PROBE
  - State: archived

- [ ] TKT-SPLIT-001 Package split epic placeholder ✅ 2026-05-07
  - Summary: Seed epic state for package split migration.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived

- [ ] BUG-ROUTER-001 Honor local-provider and unpaid-route constraints in router decisions ✅ 2026-05-15
  - Summary: Prevent router/model-fit output from recommending cloud-backed or unpaid routes when local-first or quota constraints should block them, and add regression coverage.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] BUG-PLANNER-001 Make planner timeout and null-failure paths explicit and honest ✅ 2026-05-19
  - Summary: Replace silent null or timeout planner failures with explicit degraded-path reporting, operator-visible errors, and regression coverage across shell and host flows.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] TKT-AIWF-DOD-001 Shared work-ticket planner and graph links ✅ 2026-05-19
  - Summary: Add the deterministic planner API, CLI/MCP entry points, and DB graph links that connect generated work tickets to files, artifacts, codelets, guardrails, and parent work.
  - Epic: TKT-SHELL-002
  - Parent: TKT-SHELL-002
  - State: archived

- [ ] TKT-AIWF-DOD-002 Shell-exclusive coding workflow from natural language to ticket-gated execution ✅ 2026-05-19
  - Summary: Route broad coding prompts through sync, ticket extraction, guideline extraction, codelet planning, execute-ticket apply gates, verification, and reporting.
  - Epic: TKT-SHELL-002
  - Parent: TKT-SHELL-002
  - State: archived

- [ ] TKT-AIWF-DOD-003 Best-use enforcement across shell, ask, MCP, and codelets ✅ 2026-05-19
  - Summary: Normalize coding/review/debug requests across surfaces so they share context extraction, selected programs, guardrails, work-ticket recommendations, and mutation gates.
  - Epic: TKT-SHELL-002
  - Parent: TKT-SHELL-002
  - State: archived

- [ ] TKT-AIWF-DOD-004 Planner and codelet timeout progress and degraded-path reliability ✅ 2026-05-19
  - Summary: Make slow local provider and planner paths emit progress events, finite timeout diagnostics, retry metadata, and explicit degraded-path reasons.
  - Epic: TKT-SHELL-002
  - Parent: TKT-SHELL-002
  - State: archived

- [ ] TKT-AIWF-DOD-005 Live dogfood benchmark and exclusive-use readiness report ✅ 2026-05-19
  - Summary: Run the final shell/workflow/provider dogfood, workflow audit, workspace honesty checks, and publish an evidence-backed readiness report with explicit fallback gaps.
  - Epic: TKT-SHELL-002
  - Parent: TKT-SHELL-002
  - State: archived

- [ ] BUG-SYNC-001 Investigate and prevent sync index corruption regressions ✅ 2026-05-21
  - Summary: Reproduce and fix the observed sync corruption case where symbol count collapsed unexpectedly, and add regression coverage before relying on sync as canonical workflow state.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] TKT-CORE-004 Introduce an abstractized core workflow facade for consumers ✅ 2026-05-21
  - Summary: Expose stable core handlers for DB control, projections, routing, status, governance, codelets, documentation retrieval, and graph export so shell, MCP, skill, and future consumers depend on one truth-preserving facade instead of scattered internals.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] TKT-DOCS-001 Rewrite README, manual, and tutorial for full operational truth ✅ 2026-05-21
  - Summary: Make the human and AI guidance surfaces accurately describe the real architecture, core ownership, commands, workflows, routing policy, limits, and recommended operating loops so both humans and agents can use ai-workflow correctly.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] TKT-GOE-001 Operationalize GoE and close enforcement gaps ✅ 2026-05-21
  - Summary: Turn the current GoE policy notes into runtime behavior with durable plan/problem/governance state, and close the gap between selected guardrails and hard enforcement where quality or risk requires it.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] TKT-GRAPH-001 Expand the canonical capability graph and entity density ✅ 2026-05-21
  - Summary: Add capability-native graph coverage in the DB, increase entity/predicate ingestion and backfill from existing artifacts, and evaluate or adopt @dharmax/semantika where it materially improves graph authoring, traversal, and query power.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

- [ ] TKT-PROJECTIONS-001 Put bidirectional textual projections fully under core control ✅ 2026-05-21
  - Summary: Make aiwf-common-core own forward and reverse handling of kanban, epics, and related textual projections so DB state, projections, reconciliation, and search/index coherence live behind one core boundary.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

## 2026-06

- [ ] TKT-WORK-BEBEC146-001 Plan and guard the requested work ✅ 2026-06-03
  - Summary: Extract the active ticket and guidelines, identify the bounded working set, and produce the verification plan before mutation.
  - Epic: TKT-REL-002
  - Parent: TKT-REL-002
  - State: archived

- [ ] TKT-WORK-BEBEC146-002 Execute the bounded implementation ✅ 2026-06-03
  - Summary: Apply only the scoped change through ticket-gated execution and keep generated code grounded in linked files.
  - Epic: TKT-REL-002
  - Parent: TKT-REL-002
  - State: archived

- [ ] TKT-WORK-BEBEC146-003 Verify and report readiness ✅ 2026-06-03
  - Summary: Run targeted verification, guideline enforcement, and final audit evidence before closure.
  - Epic: TKT-REL-002
  - Parent: TKT-REL-002
  - State: archived

- [ ] TKT-REL-001 Restore workflow truth and projection hygiene ✅ 2026-06-03
  - Summary: Make sync, mutation provenance, kanban archive state, assessments, candidates, and projections agree before any new readiness claim. Acceptance: sync protocol is clean or all remaining violations are active tickets; old Done cards leave live kanban; stale failed assessments cannot masquerade as active work.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-003 Add hook-based guardrail enforcement for shell and plugin modes ✅ 2026-06-03
  - Summary: Create shared hook points before plan, before codelet, before mutation, after verification, and before closure; route shell, ask, MCP/plugin, and codelets through them so guardrails can block or alter execution instead of remaining passive prompt text.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-004 Upgrade DB graph retrieval with Semantika adapter ✅ 2026-06-03
  - Summary: Keep SQLite as canonical mutable truth and add or improve a Semantika SQLite adapter for derived semantic graph query, provenance-preserving sync, hybrid lexical/graph/semantic retrieval, and measurable retrieval-quality tests.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-005 Make Ollama and LLM economy reliable under flaky local hardware ✅ 2026-06-03
  - Summary: Classify provider health, tune local retries and timeouts, emit progress, avoid repeated known-bad routes, preserve cheapest-capable routing, and escalate only when diagnosed; metrics must include attempts, latency, tokens, failure class, and fallback reason.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-006 Raise code generation and ticket execution quality ✅ 2026-06-03
  - Summary: Keep generate-code read-only but improve patch intent; upgrade execute-ticket beyond brittle search/replace with structured or AST-aware patches, file creation, external-agent adapters, working-set validation, and end-to-end project-building dogfood.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-007 Guarantee shell ask and MCP plugin parity ✅ 2026-06-03
  - Summary: Define one normalized request contract and prove equivalent selected program, GoE state, guardrails, context, mutation gate, route, and verification plan for shell, ask, and MCP/plugin prompts.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-008 Benchmark AIWF against Gemini CLI and external agents ✅ 2026-06-03
  - Summary: Create a repeatable task corpus comparing AIWF direct, AIWF-governed external-agent execution, and Gemini CLI direct on correctness, scope control, verification, speed, token/cost, recovery, and state honesty.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived

- [ ] TKT-REL-009 Publish final reliability readiness report and gates ✅ 2026-06-03
  - Summary: Close only after every reported weakness has proof: clean sync, dogfood for shell/workflow/provider/init/MCP/GoE, workflow audit, package builds, targeted and parity tests, benchmark report, and zero unresolved limitations from the honest report.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: archived
