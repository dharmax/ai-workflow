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

- [ ] BUG-WORKFLOW-HYGIENE-001 Sanitize malformed synthetic workflow tickets before shell status resolution
  - Summary: Archive or normalize malformed synthetic tickets like [object Object] early enough that shell status/search will not surface them as plausible targets.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: open
- [ ] BUG-SHELL-CONT-001 Stop stale continuation state from hijacking fresh standalone requests
  - Summary: Fresh standalone requests should not be replaced with canned continuation replies unless the prompt clearly refers back to prior work.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: open
- [ ] BUG-SHELL-NOAI-001 Enforce strict no-AI shell mode for non-primitive prompts
  - Summary: Only exact explicit no-AI primitives should work. Broad natural-language requests must fail fast and point back to explicit commands.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: open
- [ ] BUG-SHELL-GATE-001 Remove In Progress ticket gating from shell admin and maintenance commands
  - Summary: Keep workflow gating for real ticket/workflow mutations, but allow shell admin and maintenance commands to run without exactly one In Progress ticket.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: open
- [ ] TKT-TS-FIX-001 Fix cli/lib/config-store.ts types
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- No items

## Assessments

- No items

## In Progress

- [ ] BUG-SHELL-ROUTE-001 Restore shell planner fallback when Ollama is unavailable but AI is routeable
  - Summary: Keep lotus/Ollama local-first, but warn and fall back to a routeable remote planner instead of claiming no AI is configured.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: open

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] BUG-SHELL-PERF-001 Redundant heuristic planning in Tier 1 ✅ 2026-05-04
  - Summary: planShellRequest calls planShellRequestHeuristically even if Triage has already definitively matched a primitive.
  - State: archived
- [ ] BUG-SHELL-ERROR-001 Triage failure causes shell hang ✅ 2026-05-04
  - Summary: If the triage classification fails (e.g. timeout), the shell should fail-safe to Tier 2 instead of hanging.
  - State: archived
- [ ] BUG-SHELL-UI-001 Aha! Recognition block is too verbose ✅ 2026-05-04
  - Summary: Refine the promotion advice UI to be more compact and professional.
  - State: archived
- [ ] BUG-SHELL-GATING-001 Tier 3 workflows bypass mutation gating ✅ 2026-05-04
  - Summary: Compiled workflows can mutate state without checking if exactly one ticket is In Progress.
  - State: archived
- [ ] BUG-SHELL-TRACE-001 Tier 3 traces are missing from shell trace flow ✅ 2026-05-04
  - Summary: Internal compiler events are not being piped into the shell's 'trace on' mechanism for observability.
  - State: archived
- [ ] BUG-PROMOTION-005 Abstraction Auditor allows hyper-specific promotions ✅ 2026-05-04
  - Summary: Refine the auditor prompt to strictly reject one-off bug fix scripts as candidates for promotion.
  - State: archived
- [ ] BUG-PROMOTION-004 Promotion lacks pre-save syntax validation ✅ 2026-05-04
  - Summary: /promote should verify the JS is valid before writing to the staged-codelets directory.
  - State: archived
- [ ] BUG-PROMOTION-003 Promotion doesn't trigger codelet registry refresh ✅ 2026-05-04
  - Summary: After promoting a flow, the new codelet is not immediately visible to 'ai-workflow run' without a manual sync/refresh.
  - State: archived
- [ ] BUG-PROMOTION-002 Promoted codelets lack automated parameterization ✅ 2026-05-04
  - Summary: Compiled flows often have hardcoded paths from the specific run. Promotion should attempt to extract these into arguments.
  - State: archived
- [ ] BUG-PROMOTION-001 Codelet promotion overwrite risk ✅ 2026-05-04
  - Summary: The /promote command does not check for existing codelets, risking silent overwrites of stable tools.
  - State: archived
- [ ] BUG-COMPILER-003 Tier 3 sandbox allows unsafe imports ✅ 2026-05-04
  - Summary: Ensure the VM context strictly blocks access to dangerous modules like 'child_process' or 'fs' unless wrapped in SDK primitives.
  - State: archived
- [ ] BUG-COMPILER-002 Tier 3 fails to propagate detailed compilation diagnostics ✅ 2026-05-04
  - Summary: Compilation errors (syntax, type mismatch) are swallowed into a generic 'Orchestrator failed' message.
  - State: archived
- [ ] BUG-COMPILER-001 Tier 3 missing Dry-Run support for plan-only mode ✅ 2026-05-04
  - Summary: Orchestrator workflows should respect the shell's plan mode and only execute read-only steps or simulate mutations.
  - State: archived
- [ ] BUG-TRIAGE-003 Triage Cheap-LLM gate is a placeholder ✅ 2026-05-04
  - Summary: The triage module uses structural heuristics instead of a fast LLM classification call. This will miss complex intent that doesn't use 'if/then' keywords.
  - State: archived
- [ ] BUG-TRIAGE-002 Tier 1 primitive detection is overly strict ✅ 2026-05-04
  - Summary: Deterministic command detection should be more resilient to case variants, extra whitespace, and common shorthand.
  - State: archived
- [ ] BUG-TRIAGE-001 Triage lacks history awareness for elliptical follow-ups ✅ 2026-05-04
  - Summary: Triage logic currently only looks at the current prompt. Short follow-ups like 'do it' or 'and that' will be misclassified because they lack standalone context.
  - State: archived
- [ ] TKT-AUTO-AUDIT-FOR-SIBLING-PACKAG-MOMUUARL Audit for sibling-package duplication and misuse ✅ 2026-05-01
  - State: archived
- [ ] TKT-AUTO-CLOSEOUT-001 Record dependency closeout mutation ✅ 2026-05-01
  - Summary: Capture the final dependency manifest cleanup so workflow honesty records match the repo state.
  - State: archived
- [ ] TKT-PKG-DEDUPE-001 Replace duplicated sibling-package logic with thin integrations ✅ 2026-05-01
  - Summary: Audit and remove repo-local reimplementations of sibling package capabilities, prioritizing @dharmax/text-compiler, @dharmax/llm-utils, @dharmax/shell-proc-utils, and related helper surfaces so ai-workflow uses shared packages instead of drifted duplicates.
  - State: archived
- [ ] TKT-SHELL-PHASE2-003 Phase 2: lock shell trust with benchmarks and provenance ✅ 2026-04-26
  - Summary: After Phase 1 passes, make the shell measurable and auditable: define a fixed benchmark corpus for realistic operator prompts, require dogfood and workflow-audit before operator-surface changes ship, and record per-turn provenance for model choice, fallback, and execution path. Exit criteria: repeatable benchmark pass rates, stale report prevention, and reviewable evidence for local-vs-escalated routing. Primary touch points: runtime/scripts/ai-workflow/dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/shell-benchmark.js, core/services/operator-brain.js, @dharmax/llm-utils.
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: archived
- [ ] BUG-CODELET-ASK-001 Make tool-dev ask answer codelet-registry questions from workflow state ✅ 2026-04-26
  - Summary: The tool-dev ask path should answer codelet-registry and refactor-codelet coverage questions directly from the synced workflow DB/registry instead of returning a vague investigation response. Exit criteria: ai-workflow ask --mode tool-dev can state whether a refactor execution codelet exists, cite the matching codelets, and surface registry-backed evidence without manual grep.
  - State: archived
- [ ] TKT-TS-TEXT-COMPILER-001 Reintegrate text-compiler through a TS-first boundary ✅ 2026-05-01
  - Summary: Replace AnnotatedStateMachine-centric duplication with the upgraded @dharmax/text-compiler compiler API, and introduce a coherent TypeScript integration boundary for workflow compilation/execution.
  - State: archived
- [ ] BUG-SHELL-DOGFOOD-001 Fix shell planning and explainer dogfood failures ✅ 2026-04-26
  - Summary: Dogfood shows the shell collapsing a planning prompt into a status lookup and failing the grounded explainer rubric. The failure surface needs non-interactive progress output, a more comprehensive answer shape, and clearer routing for repo-explainer prompts. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs. Exit criteria: ai-planning-read and ai-explainer-read both pass in fresh dogfood runs.
  - State: archived
- [ ] TKT-AUTO-DEFINE-INITIAL-PROJECT-G-MOG5RDZO Define Initial Project Goal ✅ 2026-05-01
  - State: archived
- [ ] TKT-REPO-TIGHTEN-001 Tighten repo operations, docs, and Gemini bridge ✅ 2026-05-01
  - Summary: Make ai-workflow honest, compact, and operational by wiring the shared parser, pruning stale docs, fixing local Gemini skill availability, and revalidating workflow surfaces.
  - State: archived
- [ ] TKT-SHELL-PLAN-001 Publish the two-phase shell reliability plan ✅ 2026-04-26
  - Summary: Define the shell reliability roadmap in two phases: Phase 1 stabilizes honest local-first routing and workflow truth; Phase 2 raises shell behavior to operator-grade trust with benchmarked prompts, provenance, and audit gates. Primary touch points: cli/lib/shell.mjs, core/services/router.mjs, core/services/providers.mjs, core/services/assessment.mjs, core/services/sync.mjs, core/services/projections.mjs, runtime/scripts/ai-workflow/*, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/operator-brain.mjs, core/services/context-packer.mjs, @dharmax/llm-utils.
  - State: archived
- [ ] TKT-SHELL-PHASE1-001 Phase 1: make shell honest and workflow state stable ✅ 2026-04-26
  - Summary: Fix the trust substrate first: keep local-first routing honest, stop silent fallback when Ollama is configured but unavailable, retire stale auto-assessments instead of spamming the board, and keep project summary/kanban aligned with current health. Primary touch points: cli/lib/shell.mjs, core/services/router.mjs, core/services/providers.mjs, core/services/assessment.mjs, core/services/sync.mjs, core/services/projections.mjs, core/db/sqlite-store.mjs. Exit criteria: one truthful project summary path, no new stale assessment noise, and clear failure reporting when local execution is unavailable.
  - State: archived
- [ ] TKT-SHELL-PHASE1-004 Phase 1: stabilize shell routing and status after dogfood fix ✅ 2026-04-26
  - Summary: After the dogfood blocker is fixed, harden local-first routing, explicit local-unavailable reporting, and grounded status/explainer output across repeated shell use. This is the regression layer that keeps the fix from drifting back into shallow status reads. Exit criteria: repeated dogfood stays green, project status prompts remain grounded, and explicit fallback states are visible in no-ai and normal runs. Primary touch points: cli/lib/shell.mjs, core/services/router.mjs, core/services/providers.mjs, core/services/status.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs.
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: archived
- [ ] TKT-SHELL-PHASE2-001 Phase 2: make shell operator-grade and auditable ✅ 2026-04-26
  - Summary: Build the trust layer after Phase 1 is stable: create a fixed benchmark suite for human-style project prompts, require dogfood and workflow-audit before operator-surface changes ship, and expose per-turn provenance so model choice and execution path are reviewable. Primary touch points: runtime/scripts/ai-workflow/programming-dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/operator-brain.js, core/services/context-packer.js, @dharmax/llm-utils. Exit criteria: repeatable benchmark results, audit-grade traces, and explicit local-versus-escalated routing evidence.
  - State: archived
- [ ] TKT-SHELL-PHASE2-002 Phase 2: lock shell trust with benchmarks and provenance ✅ 2026-04-26
  - Summary: After Phase 1 passes, make the shell measurable and auditable: define a fixed benchmark corpus for realistic operator prompts, require dogfood and workflow-audit before operator-surface changes ship, and record per-turn provenance for model choice, fallback, and execution path. Exit criteria: repeatable benchmark pass rates, stale report prevention, and reviewable evidence for local-vs-escalated routing. Primary touch points: runtime/scripts/ai-workflow/dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.mjs, core/services/shell-benchmark.js, core/services/operator-brain.js, @dharmax/llm-utils.
  - State: archived
- [ ] TKT-SHELL-PHASE1-003 Phase 1: make shell pass planning and explainer dogfood ✅ 2026-04-26
  - Summary: Fix the exact failure that is blocking trust today: the shell must stop collapsing planning prompts into status reads, produce the expected progress/output shape in non-interactive runs, and answer repo-explainer prompts with grounded detail. Exit criteria: fresh dogfood runs pass ai-planning-read and ai-explainer-read. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs, core/services/router.mjs, core/services/providers.mjs.
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: archived
- [ ] TKT-SHELL-PLAN-002 Rebuild the shell trust plan around dogfood failures ✅ 2026-04-26
  - Summary: Supersedes the earlier broad shell-plan draft. The plan must be anchored to the live failure mode: shell still fails planning/explainer dogfood prompts, and only after that should we extend to benchmark and audit hardening. Phase 1 must restore correct answer shape and routing; Phase 2 must lock it with repeatable benchmarks and provenance. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs, core/services/router.mjs, core/services/providers.mjs, runtime/scripts/ai-workflow/dogfood.mjs, runtime/scripts/ai-workflow/lib/workflow-audit-report.mjs, core/services/shell-transcript-verification.mjs, core/services/artifact-verification.js, core/services/shell-benchmark.js, @dharmax/llm-utils.
  - State: archived
- [ ] TEST-TICKET-EPIC-CHECK temp ✅ 2026-04-26
  - Summary: temp
  - Epic: EPIC-001
  - Parent: EPIC-001
  - State: archived
- [ ] TKT-SHELL-PHASE1-002 Phase 1: make shell pass planning and explainer dogfood ✅ 2026-04-26
  - Summary: Fix the exact failure that is blocking trust today: the shell must stop collapsing planning prompts into status reads, produce the expected progress/output shape in non-interactive runs, and answer repo-explainer prompts with grounded detail. Exit criteria: fresh dogfood runs pass ai-planning-read and ai-explainer-read. Primary touch points: cli/lib/shell.mjs, core/services/operator-brain.mjs, core/services/shell-retrieval.mjs, core/services/context-packer.mjs, core/services/router.mjs, core/services/providers.mjs.
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
