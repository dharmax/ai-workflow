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

- [ ] TKT-REL-002 Implement real GoE runtime and mutation gates
  - Summary: Turn GoE policy into persisted runtime: suggester, critic, auditor/escalator, terminal verdict records, evidence refs, protected-work blocking, and visible problem/ticket handoff for unresolved governance outcomes.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-003 Add hook-based guardrail enforcement for shell and plugin modes
  - Summary: Create shared hook points before plan, before codelet, before mutation, after verification, and before closure; route shell, ask, MCP/plugin, and codelets through them so guardrails can block or alter execution instead of remaining passive prompt text.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-004 Upgrade DB graph retrieval with Semantika adapter
  - Summary: Keep SQLite as canonical mutable truth and add or improve a Semantika SQLite adapter for derived semantic graph query, provenance-preserving sync, hybrid lexical/graph/semantic retrieval, and measurable retrieval-quality tests.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-005 Make Ollama and LLM economy reliable under flaky local hardware
  - Summary: Classify provider health, tune local retries and timeouts, emit progress, avoid repeated known-bad routes, preserve cheapest-capable routing, and escalate only when diagnosed; metrics must include attempts, latency, tokens, failure class, and fallback reason.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-006 Raise code generation and ticket execution quality
  - Summary: Keep generate-code read-only but improve patch intent; upgrade execute-ticket beyond brittle search/replace with structured or AST-aware patches, file creation, external-agent adapters, working-set validation, and end-to-end project-building dogfood.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-007 Guarantee shell ask and MCP plugin parity
  - Summary: Define one normalized request contract and prove equivalent selected program, GoE state, guardrails, context, mutation gate, route, and verification plan for shell, ask, and MCP/plugin prompts.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-008 Benchmark AIWF against Gemini CLI and external agents
  - Summary: Create a repeatable task corpus comparing AIWF direct, AIWF-governed external-agent execution, and Gemini CLI direct on correctness, scope control, verification, speed, token/cost, recovery, and state honesty.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open
- [ ] TKT-REL-009 Publish final reliability readiness report and gates
  - Summary: Close only after every reported weakness has proof: clean sync, dogfood for shell/workflow/provider/init/MCP/GoE, workflow audit, package builds, targeted and parity tests, benchmark report, and zero unresolved limitations from the honest report.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- No items

## Assessments

- No items

## In Progress

- [ ] TKT-REL-001 Restore workflow truth and projection hygiene
  - Summary: Make sync, mutation provenance, kanban archive state, assessments, candidates, and projections agree before any new readiness claim. Acceptance: sync protocol is clean or all remaining violations are active tickets; old Done cards leave live kanban; stale failed assessments cannot masquerade as active work.
  - Epic: EPC-AIWF-RELIABILITY-001
  - Parent: EPC-AIWF-RELIABILITY-001
  - Planning: approved (approved), acceptance 0/4 verified
  - State: open

## Human Inspection

- No items

## Suggestions

- No items

## Done

- No items

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
