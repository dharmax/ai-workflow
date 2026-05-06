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

- [ ] TKT-ANALYSIS-002 Implement ai-workflow tool locate-trapped-logic
  - Summary: A regex-driven heuristic that finds console.log and process.stdout.write inside the core/ directory.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-ANALYSIS-001 Implement ai-workflow project map-dependencies
  - Summary: A command that identifies imports/calls between cli/ and core/ to flag logic bleeding.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-SHELL-001 Polish shell interactive mode with shared terminal handle
  - Summary: Ensure readline and terminal state are correctly shared between the shell and sub-prompts to prevent echo and exit bugs.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-SKILL-002 Refactor --no-ai to allow internal delegated reasoning
  - Summary: Replace the total AI block with a mode that allows the tool to use its own models for task execution while suppression shell-level planning.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-SKILL-001 Implement skill-awareness via environment and flags
  - Summary: Add AI_WORKFLOW_CONTEXT=skill environment variable and --skill-mode flag to toggle headless behavior.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-CORE-002 Decouple llm-utils from shell-specific heuristics
  - Summary: Ensure CompletionEngine and routing logic can be used independently of the interactive shell context.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-CORE-001 Extract core workflow logic from cli/lib to core/services
  - Summary: Move sync, status, metrics, and orchestrator logic out of the CLI dispatcher and into the core services layer for multi-mode reuse.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
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

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
