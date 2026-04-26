---
kanban-plugin: board
---

# Kanban

_Generated from the workflow DB. Edit through `ai-workflow project ...` or `ai-workflow sync`._
_Core lanes are fixed. Rare lanes only render when they contain cards. `Archived` history lives in `kanban-archive.md`._

## Deep Backlog

- [ ] TKT-SHELL-PHASE2-003 Phase 2: lock shell trust with benchmarks and provenance
  - Summary: After Phase 1 passes, make the shell measurable and auditable: define a fixed benchmark corpus for realistic operator prompts, require dogfood and workflow-audit before operator-surface changes ship, and record per-turn provenance for model choice, fallback, and execution path. Exit criteria: repeatable benchmark pass rates, stale report prevention, and reviewable evidence for local-vs-escalated routing. Primary touch points: runtime/scripts/ai-workflow/dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/shell-benchmark.mjs, core/services/operator-brain.mjs, @dharmax/llm-utils.
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: open

## Backlog

- No items

## ToDo
<!-- canonical alias: ## Todo -->

- [ ] TKT-SHELL-PHASE1-004 Phase 1: stabilize shell routing and status after dogfood fix
  - Summary: After the dogfood blocker is fixed, harden local-first routing, explicit local-unavailable reporting, and grounded status/explainer output across repeated shell use. This is the regression layer that keeps the fix from drifting back into shallow status reads. Exit criteria: repeated dogfood stays green, project status prompts remain grounded, and explicit fallback states are visible in no-ai and normal runs. Primary touch points: cli/lib/shell.mjs, core/services/router.mjs, core/services/providers.mjs, core/services/status.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs.
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- [ ] BUG-CODELET-ASK-001 Make tool-dev ask answer codelet-registry questions from workflow state
  - Summary: The tool-dev ask path should answer codelet-registry and refactor-codelet coverage questions directly from the synced workflow DB/registry instead of returning a vague investigation response. Exit criteria: ai-workflow ask --mode tool-dev can state whether a refactor execution codelet exists, cite the matching codelets, and surface registry-backed evidence without manual grep.
  - State: open

## Assessments

- [ ] 838bedb679c0747daf0b0b08d660994a125cf11c Assessment: health on project:ai-workflow
  - Summary: Status: failed. Plan: Available
  - State: failed

## In Progress

- No items

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] BUG-SHELL-DOGFOOD-001 Fix shell planning and explainer dogfood failures ✅ 2026-04-26
  - Summary: Dogfood shows the shell collapsing a planning prompt into a status lookup and failing the grounded explainer rubric. The failure surface needs non-interactive progress output, a more comprehensive answer shape, and clearer routing for repo-explainer prompts. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs. Exit criteria: ai-planning-read and ai-explainer-read both pass in fresh dogfood runs.
  - State: archived
- [ ] TKT-SHELL-PHASE1-001 Phase 1: make shell honest and workflow state stable ✅ 2026-04-26
  - Summary: Fix the trust substrate first: keep local-first routing honest, stop silent fallback when Ollama is configured but unavailable, retire stale auto-assessments instead of spamming the board, and keep project summary/kanban aligned with current health. Primary touch points: cli/lib/shell.mjs, core/services/router.mjs, core/services/providers.mjs, core/services/assessment.mjs, core/services/sync.mjs, core/services/projections.mjs, core/db/sqlite-store.mjs. Exit criteria: one truthful project summary path, no new stale assessment noise, and clear failure reporting when local execution is unavailable.
  - State: archived
- [ ] TKT-SHELL-PLAN-001 Publish the two-phase shell reliability plan ✅ 2026-04-26
  - Summary: Define the shell reliability roadmap in two phases: Phase 1 stabilizes honest local-first routing and workflow truth; Phase 2 raises shell behavior to operator-grade trust with benchmarked prompts, provenance, and audit gates. Primary touch points: cli/lib/shell.mjs, core/services/router.mjs, core/services/providers.mjs, core/services/assessment.mjs, core/services/sync.mjs, core/services/projections.mjs, runtime/scripts/ai-workflow/*, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/operator-brain.mjs, core/services/context-packer.mjs, @dharmax/llm-utils.
  - State: archived
- [ ] TKT-SHELL-PHASE2-001 Phase 2: make shell operator-grade and auditable ✅ 2026-04-26
  - Summary: Build the trust layer after Phase 1 is stable: create a fixed benchmark suite for human-style project prompts, require dogfood and workflow-audit before operator-surface changes ship, and expose per-turn provenance so model choice and execution path are reviewable. Primary touch points: runtime/scripts/ai-workflow/programming-dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/operator-brain.mjs, core/services/context-packer.mjs, @dharmax/llm-utils. Exit criteria: repeatable benchmark results, audit-grade traces, and explicit local-versus-escalated routing evidence.
  - State: archived
- [ ] TKT-SHELL-PHASE2-002 Phase 2: lock shell trust with benchmarks and provenance ✅ 2026-04-26
  - Summary: After Phase 1 passes, make the shell measurable and auditable: define a fixed benchmark corpus for realistic operator prompts, require dogfood and workflow-audit before operator-surface changes ship, and record per-turn provenance for model choice, fallback, and execution path. Exit criteria: repeatable benchmark pass rates, stale report prevention, and reviewable evidence for local-vs-escalated routing. Primary touch points: runtime/scripts/ai-workflow/dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/shell-benchmark.mjs, core/services/operator-brain.mjs, @dharmax/llm-utils.
  - State: archived
- [ ] TKT-SHELL-PLAN-002 Rebuild the shell trust plan around dogfood failures ✅ 2026-04-26
  - Summary: Supersedes the earlier broad shell-plan draft. The plan must be anchored to the live failure mode: shell still fails planning/explainer dogfood prompts, and only after that should we extend to benchmark and audit hardening. Phase 1 must restore correct answer shape and routing; Phase 2 must lock it with repeatable benchmarks and provenance. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs, core/services/router.mjs, core/services/providers.mjs, runtime/scripts/ai-workflow/dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/shell-benchmark.mjs, @dharmax/llm-utils.
  - State: archived
- [ ] TKT-SHELL-PHASE1-002 Phase 1: make shell pass planning and explainer dogfood ✅ 2026-04-26
  - Summary: Fix the exact failure that is blocking trust today: the shell must stop collapsing planning prompts into status reads, produce the expected progress/output shape in non-interactive runs, and answer repo-explainer prompts with grounded detail. Exit criteria: fresh dogfood runs pass ai-planning-read and ai-explainer-read. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs, core/services/router.mjs, core/services/providers.mjs.
  - State: archived
- [ ] TKT-SHELL-PHASE1-003 Phase 1: make shell pass planning and explainer dogfood ✅ 2026-04-26
  - Summary: Fix the exact failure that is blocking trust today: the shell must stop collapsing planning prompts into status reads, produce the expected progress/output shape in non-interactive runs, and answer repo-explainer prompts with grounded detail. Exit criteria: fresh dogfood runs pass ai-planning-read and ai-explainer-read. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs, core/services/router.mjs, core/services/providers.mjs.
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: archived
- [ ] TEST-TICKET-EPIC-CHECK temp ✅ 2026-04-26
  - Summary: temp
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
