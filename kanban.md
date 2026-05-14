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

- [ ] TKT-GRAPH-001 Expand the canonical capability graph and entity density
  - Summary: Add capability-native graph coverage in the DB, increase entity/predicate ingestion and backfill from existing artifacts, and evaluate or adopt @dharmax/semantika where it materially improves graph authoring, traversal, and query power.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] TKT-SHELL-002 Reground shell, MCP, and skill behavior on DB-backed capability truth
  - Summary: Replace overlapping surface heuristics with core-backed capability state, richer degradation reporting, and honest execution/planning behavior across shell, MCP, and optional skill surfaces.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open
- [ ] TKT-DOCS-001 Rewrite README, manual, and tutorial for full operational truth
  - Summary: Make the human and AI guidance surfaces accurately describe the real architecture, core ownership, commands, workflows, routing policy, limits, and recommended operating loops so both humans and agents can use ai-workflow correctly.
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
- [ ] TKT-CORE-004 Introduce an abstractized core workflow facade for consumers
  - Summary: Expose stable core handlers for DB control, projections, routing, status, governance, codelets, documentation retrieval, and graph export so shell, MCP, skill, and future consumers depend on one truth-preserving facade instead of scattered internals.
  - Epic: EPC-CAPABILITY-CORE-001
  - Parent: EPC-CAPABILITY-CORE-001
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- No items

## Assessments

- No items

## In Progress

- No items

## Human Inspection

- No items

## Suggestions

- No items

## Done

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

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
