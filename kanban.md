---
kanban-plugin: board
---

# Kanban

_Generated from the workflow DB. Edit through `ai-workflow project ...` or `ai-workflow sync`._
_Core lanes are fixed. Rare lanes only render when they contain cards. `Archived` history lives in `kanban-archive.md`._

## Deep Backlog

- No items

## Backlog

- No items

## ToDo
<!-- canonical alias: ## Todo -->

- [ ] TKT-CORE-004 Introduce an abstractized core workflow facade for consumers
  - Summary: Expose stable core handlers for DB control, projections, routing, status, governance, codelets, documentation retrieval, and graph export so shell, MCP, skill, and future consumers depend on one truth-preserving facade instead of scattered internals.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] TKT-GOE-001 Operationalize GoE and close enforcement gaps
  - Summary: Turn the current GoE policy notes into runtime behavior with durable plan/problem/governance state, and close the gap between selected guardrails and hard enforcement where quality or risk requires it.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] TKT-PROJECTIONS-001 Put bidirectional textual projections fully under core control
  - Summary: Make aiwf-common-core own forward and reverse handling of kanban, epics, and related textual projections so DB state, projections, reconciliation, and search/index coherence live behind one core boundary.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] TKT-DOCS-001 Rewrite README, manual, and tutorial for full operational truth
  - Summary: Make the human and AI guidance surfaces accurately describe the real architecture, core ownership, commands, workflows, routing policy, limits, and recommended operating loops so both humans and agents can use ai-workflow correctly.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] TKT-GRAPH-001 Expand the canonical capability graph and entity density
  - Summary: Add capability-native graph coverage in the DB, increase entity/predicate ingestion and backfill from existing artifacts, and evaluate or adopt @dharmax/semantika where it materially improves graph authoring, traversal, and query power.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open

## Bugs P1

- [ ] BUG-PLANNER-001 Make planner timeout and null-failure paths explicit and honest
  - Summary: Replace silent null or timeout planner failures with explicit degraded-path reporting, operator-visible errors, and regression coverage across shell and host flows.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] BUG-SYNC-001 Investigate and prevent sync index corruption regressions
  - Summary: Reproduce and fix the observed sync corruption case where symbol count collapsed unexpectedly, and add regression coverage before relying on sync as canonical workflow state.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open

## Bugs P2/P3

- No items

## Assessments

- [ ] 2742bd153ad22dcebaad669f6c5eacf71bda74a7 Assessment: health on project:ai-workflow
  - Summary: Status: pending. Plan: Available
  - State: pending

## In Progress

- [ ] TKT-SHELL-002 Reground shell, MCP, and skill behavior on DB-backed capability truth
  - Summary: Replace overlapping surface heuristics with core-backed capability state, richer degradation reporting, and honest execution/planning behavior across shell, MCP, and optional skill surfaces.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] BUG-ROUTER-001 Honor local-provider and unpaid-route constraints in router decisions ✅ 2026-05-15
  - Summary: Prevent router/model-fit output from recommending cloud-backed or unpaid routes when local-first or quota constraints should block them, and add regression coverage.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
