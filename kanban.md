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

- [ ] TKT-PACKAGING-001 Scaffold the three npm package surfaces
  - Summary: Define and scaffold publishable package boundaries for common/core, skill-mode support, and shell-mode support without resolving the remaining implementation gaps yet.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] TKT-CORE-003 Finish core/cli decoupling for packageable core/common
  - Summary: Remove remaining core imports from cli/lib config-store and isolate packageable common/core boundaries for npm publication.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- [ ] BUG-CODELET-BACKINGS-001 Restore missing runtime/script backings for toolkit codelets
  - Summary: Fix codelet manifests and runtime entry wiring so audit, route, guideline-audit, map-dependencies, and locate-trapped-logic resolve to real executable backings.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open

## Assessments

- No items

## In Progress

- [ ] BUG-HUB-SEARCH-UNREG Search codelet unregistered
  - Summary: The search codelet is not registered in ServiceHub, causing failures in programmatic calls.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] BUG-SYNC-NOTES-LOSS Sync notes tracking inconsistency
  - Summary: Notes count fluctuates in sync results due to derivation logic race conditions.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] BUG-ENFORCER-MTIME Enforcer uses placeholder mtime
  - Summary: isReportFresh uses 0 as latestChangeMs instead of actual file mtime from Git.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] BUG-PRESENTER-MISSING ShellPresenter missing formatters
  - Summary: Several registered codelets (dogfood, audit) lack explicit human-friendly presenters.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open
- [ ] BUG-REGISTRY-INIT-LEAN Incomplete registry initialization
  - Summary: registry-init.ts is missing several core toolkit codelets like route-task.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: open

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] TKT-ANALYSIS-002 Implement ai-workflow tool locate-trapped-logic ✅ 2026-05-07
  - Summary: A regex-driven heuristic that finds console.log and process.stdout.write inside the core/ directory.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] TKT-CORE-001 Extract core workflow logic from cli/lib to core/services ✅ 2026-05-07
  - Summary: Move sync, status, metrics, and orchestrator logic out of the CLI dispatcher and into the core services layer for multi-mode reuse.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-WORKFLOW-HYGIENE-001 Sanitize malformed synthetic workflow tickets before shell status resolution ✅ 2026-05-07
  - Summary: Archive or normalize malformed synthetic tickets like [object Object] early enough that shell status/search will not surface them as plausible targets.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: archived
- [ ] TKT-SKILL-001 Implement skill-awareness via environment and flags ✅ 2026-05-07
  - Summary: Add AI_WORKFLOW_CONTEXT=skill environment variable and --skill-mode flag to toggle headless behavior.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-AUDIT-MISSING-DIR Audit fails on missing metadata directory ✅ 2026-05-06
  - Summary: Audit should report missing .ai-workflow as a finding, not throw an error.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] TKT-FINAL-POLISH Final polish and wave 2 bugfixes ✅ 2026-05-07
  - Summary: Addressed setup performance, config loss, and 15+ bugs.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-ORCHESTRATOR-TIMEOUT Orchestrator default timeout ✅ 2026-05-06
  - Summary: Increased default timeout to 15m.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-CONT-001 Stop stale continuation state from hijacking fresh standalone requests ✅ 2026-05-06
  - Summary: Fresh standalone requests should not be replaced with canned continuation replies unless the prompt clearly refers back to prior work.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: archived
- [ ] BUG-SHELL-GATING-001 Tier 3 workflows bypass mutation gating ✅ 2026-05-04
  - Summary: Compiled workflows can mutate state without checking if exactly one ticket is In Progress.
  - State: archived
- [ ] BUG-SHELL-HELP-BUILTINS Shell help builtins ✅ 2026-05-06
  - Summary: Updated help to show registered codelets.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SUMMARY-NAME-001 Project summary missing name ✅ 2026-05-06
  - Summary: Summary codelet should include the project name from package.json.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-HUB-OVERWRITE Hub service silent overwrite ✅ 2026-05-06
  - Summary: Registering a service with an existing ID should trigger a warning or be blocked.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-PERF-001 Redundant heuristic planning in Tier 1 ✅ 2026-05-04
  - Summary: planShellRequest calls planShellRequestHeuristically even if Triage has already definitively matched a primitive.
  - State: archived
- [ ] BUG-PROMOTION-002 Promoted codelets lack automated parameterization ✅ 2026-05-04
  - Summary: Compiled flows often have hardcoded paths from the specific run. Promotion should attempt to extract these into arguments.
  - State: archived
- [ ] BUG-SHELL-HISTORY-BLUR Shell history leakage ✅ 2026-05-06
  - Summary: Multi-project shell usage can leak history between projects.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-UI-001 Aha! Recognition block is too verbose ✅ 2026-05-04
  - Summary: Refine the promotion advice UI to be more compact and professional.
  - State: archived
- [ ] BUG-HUB-EXEC-001 ServiceHub execute argument inconsistency ✅ 2026-05-06
  - Summary: execute() handles functions and objects differently, potentially losing arguments.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-ERROR-001 Triage failure causes shell hang ✅ 2026-05-04
  - Summary: If the triage classification fails (e.g. timeout), the shell should fail-safe to Tier 2 instead of hanging.
  - State: archived
- [ ] BUG-PROMOTION-005 Abstraction Auditor allows hyper-specific promotions ✅ 2026-05-04
  - Summary: Refine the auditor prompt to strictly reject one-off bug fix scripts as candidates for promotion.
  - State: archived
- [ ] BUG-SETUP-PERF-001 Setup command performance degradation ✅ 2026-05-06
  - Summary: ai-workflow setup takes 3-4 minutes to complete. Need to identify and eliminate bottlenecks.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-TRIAGE-001 Triage lacks history awareness for elliptical follow-ups ✅ 2026-05-04
  - Summary: Triage logic currently only looks at the current prompt. Short follow-ups like 'do it' or 'and that' will be misclassified because they lack standalone context.
  - State: archived
- [ ] BUG-COMPILER-003 Tier 3 sandbox allows unsafe imports ✅ 2026-05-04
  - Summary: Ensure the VM context strictly blocks access to dangerous modules like 'child_process' or 'fs' unless wrapped in SDK primitives.
  - State: archived
- [ ] BUG-PROMOTION-004 Promotion lacks pre-save syntax validation ✅ 2026-05-04
  - Summary: /promote should verify the JS is valid before writing to the staged-codelets directory.
  - State: archived
- [ ] BUG-SHELL-TRACE-001 Tier 3 traces are missing from shell trace flow ✅ 2026-05-04
  - Summary: Internal compiler events are not being piped into the shell's 'trace on' mechanism for observability.
  - State: archived
- [ ] BUG-COMPILER-001 Tier 3 missing Dry-Run support for plan-only mode ✅ 2026-05-04
  - Summary: Orchestrator workflows should respect the shell's plan mode and only execute read-only steps or simulate mutations.
  - State: archived
- [ ] BUG-CONFIG-OLLAMA-LOST Ollama configuration loss ✅ 2026-05-06
  - Summary: Global Ollama settings are not persisting or are being overwritten during setup/shell sessions.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-TRIAGE-003 Triage Cheap-LLM gate is a placeholder ✅ 2026-05-04
  - Summary: The triage module uses structural heuristics instead of a fast LLM classification call. This will miss complex intent that doesn't use 'if/then' keywords.
  - State: archived
- [ ] BUG-COMPILER-002 Tier 3 fails to propagate detailed compilation diagnostics ✅ 2026-05-04
  - Summary: Compilation errors (syntax, type mismatch) are swallowed into a generic 'Orchestrator failed' message.
  - State: archived
- [ ] BUG-PROMOTION-001 Codelet promotion overwrite risk ✅ 2026-05-04
  - Summary: The /promote command does not check for existing codelets, risking silent overwrites of stable tools.
  - State: archived
- [ ] BUG-PROMOTION-003 Promotion doesn't trigger codelet registry refresh ✅ 2026-05-04
  - Summary: After promoting a flow, the new codelet is not immediately visible to 'ai-workflow run' without a manual sync/refresh.
  - State: archived
- [ ] BUG-TRIAGE-002 Tier 1 primitive detection is overly strict ✅ 2026-05-04
  - Summary: Deterministic command detection should be more resilient to case variants, extra whitespace, and common shorthand.
  - State: archived
- [ ] BUG-HUB-CTX-STALE ServiceHub stale project context ✅ 2026-05-06
  - Summary: Hub context doesn't follow project root changes in long-running shell sessions.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-TERM-SIGINT-001 TerminalContext SIGINT handling ✅ 2026-05-06
  - Summary: Sub-prompts leave terminal in raw mode or broken state on SIGINT.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-DOGFOOD-JSON Dogfood codelet JSON compliance ✅ 2026-05-06
  - Summary: Dogfooding results should be returned as data, not printed to stdout.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-GATE-001 Remove In Progress ticket gating from shell admin and maintenance commands ✅ 2026-05-06
  - Summary: Keep workflow gating for real ticket/workflow mutations, but allow shell admin and maintenance commands to run without exactly one In Progress ticket.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: archived
- [ ] BUG-SYNC-PERF-001 Sync re-indexes unchanged files ✅ 2026-05-06
  - Summary: Sync should use mtime/sha1 to avoid redundant parsing of unchanged files.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-KNOWLEDGE-DRIFT Knowledge base drift ✅ 2026-05-06
  - Summary: Ensured knowledge changes trigger sync.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] TKT-SHELL-001 Polish shell interactive mode with shared terminal handle ✅ 2026-05-07
  - Summary: Ensure readline and terminal state are correctly shared between the shell and sub-prompts to prevent echo and exit bugs.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-NOAI-001 Enforce strict no-AI shell mode for non-primitive prompts ✅ 2026-05-06
  - Summary: Only exact explicit no-AI primitives should work. Broad natural-language requests must fail fast and point back to explicit commands.
  - Epic: EPC-SHELL-RECOVERY-01
  - Parent: EPC-SHELL-RECOVERY-01
  - State: archived
- [ ] TKT-SKILL-002 Refactor --no-ai to allow internal delegated reasoning ✅ 2026-05-07
  - Summary: Replace the total AI block with a mode that allows the tool to use its own models for task execution while suppression shell-level planning.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] BUG-SHELL-PLANNER-LOOP Shell planner crash ✅ 2026-05-06
  - Summary: Fixed undefined inputText reference.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] TKT-SELF-USE-001 Enforce max usage of the ai-workflow skill ✅ 2026-05-07
  - Summary: Ensure the agent leads with workflow tools (surface, status, sync) instead of raw grep/sed for discovery.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] TKT-ANALYSIS-001 Implement ai-workflow project map-dependencies ✅ 2026-05-07
  - Summary: A command that identifies imports/calls between cli/ and core/ to flag logic bleeding.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived
- [ ] TKT-CORE-002 Decouple llm-utils from shell-specific heuristics ✅ 2026-05-07
  - Summary: Ensure CompletionEngine and routing logic can be used independently of the interactive shell context.
  - Epic: EPC-SHELL-SKILL-01
  - Parent: EPC-SHELL-SKILL-01
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
