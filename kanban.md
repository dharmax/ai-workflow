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

- No items

## Bugs P1

- No items

## Bugs P2/P3

- [ ] BUG-TOOL-OBSERVE-ROOT-001 Resolve tool observe default root for global installs
  - State: open

## In Progress

- [ ] TKT-AUTO-DEFINE-INITIAL-PROJECT-G-MOEH8YKD Define Initial Project Goal
  - State: open

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] TKT-LLM-UTILS-001 llm-utils: Scaffolding and Core API definition ✅ 2026-04-24
  - Summary: Initialize the packages/llm-utils directory, setup package.json for ESM/TS, and define core interfaces: Asker, LLMSession, TaskType, and ProviderConfig.
  - State: archived
- [ ] TKT-LLM-UTILS-003 llm-utils: Prompt and Context Management ✅ 2026-04-24
  - Summary: Port manifest-based templating and guideline block retrieval. Implement PromptManager with comment stripping and placeholder injection.
  - State: archived
- [ ] TKT-LLM-UTILS-005 ai-workflow: Integrate llm-utils package ✅ 2026-04-24
  - Summary: Refactor core services in ai-workflow to depend on the new llm-utils package, removing redundant local logic.
  - State: archived
- [ ] TKT-BIDIRECTIONAL-SYNC Ensure MD file edits sync correctly with DB using timestamp diffing ✅ 2026-04-22
  - Summary: Ensure that when the md files - e.g. kanban - are manually edited, what is edited is synced properly with the DB and not run over. Timestamp-based diff triggering should ensure sync between files to db. Ask the user via the new multi-choice module to solve sync confusions.
  - State: archived
- [ ] TKT-EXTRACT-001 Extract Human2JS Package ✅ 2026-04-24
  - Summary: Extract the English->JS compilation engine from operator-brain and js-orchestrator into a standalone package. DoD: Constructor takes ContextManager, Toolkit, and Cache; getFunction(text) returns an executable async function; verified by porting ai-workflow to use it.
  - State: archived
- [ ] TKT-SHELL-JS-001 Implement JS-based orchestration driver ✅ 2026-04-23
  - State: archived
- [ ] TKT-EXTRACT-002 Implement Generic goe-governance Package ✅ 2026-04-24
  - Summary: Define a generic, multi-expert debate protocol (not limited to a triad). DoD: Package manages expert registration, round-robin or state-machine based debate turns, and final auditor approval; zero internal dependencies on ai-workflow core.
  - State: archived
- [ ] TKT-EXTRACT-003 Extract shell-proc-utils for internal stability ✅ 2026-04-24
  - Summary: Consolidate the fragmented child_process.spawn wrappers into a robust, promise-based utility. DoD: Support real-time streaming, JSON auto-detection, and reliable timeout/signal handling; used consistently across ai-workflow.
  - State: archived
- [ ] TKT-PLAN-PERSISTENCE Implement DB storage for architectural plans and epics references ✅ 2026-04-22
  - Summary: When planning, the plan must be kept somewhere - both in md files and in the db with references in the epics and wherever relevant, or else plans disappear. Store the full plan on a special folder called 'design'.
  - State: archived
- [ ] TKT-AUTO-CREATE-STRING-UTILS-MODU-MO9WY7CS Create string-utils module with capitalizeFirstLetter function ✅ 2026-04-22
  - State: archived
- [ ] TKT-LLM-UTILS-002 llm-utils: Router and Dynamic Task Mapping ✅ 2026-04-24
  - Summary: Port logic from router.mjs and model-fit.mjs. Implement Asker.ask() and the dynamic LLM-based model-to-task scoring on startup.
  - State: archived
- [ ] TKT-LLM-UTILS-004 llm-utils: Session Continuity and Condensation ✅ 2026-04-24
  - Summary: Implement LLMSession class with managed context, history tracking, and high-density memory condensation logic.
  - State: archived
- [ ] TKT-MANUAL-SYNC-TEST This ticket was added manually in the markdown file. ✅ 2026-04-22
  - State: archived
- [ ] FIX-REFACTOR-BREAKAGE Fix package extraction regressions ✅ 2026-04-25
  - Summary: Repair root causes introduced by extracting modules/services into external packages.
  - State: archived
- [ ] TKT-DOGFOOD-001 Reproduce and fix shell/metrics issues + Smart Programming Dogfood Harness ✅ 2026-04-23
  - State: archived
- [ ] TKT-EXTRACT-004 Extract block-patcher Utility ✅ 2026-04-24
  - Summary: Extract the SEARCH/REPLACE block protocol into a standalone package. DoD: Full test coverage for exact and fuzzy matching; verified by replacing core/lib/patch.mjs.
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
