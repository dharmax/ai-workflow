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

## Todo

- [ ] TKT-TRUST-005 Repair MCP ticket-context utility
  - Summary: Make extract_ticket and plan_code_change return concrete linked files, tests, artifacts, guardrails, verification commands, confidence, and evidence gaps instead of scattered or generic context.
  - Epic: EPC-AIWF-TRUST-001
  - Parent: EPC-AIWF-TRUST-001
  - State: open
- [ ] TKT-TRUST-004 Require structured evidence reports
  - Summary: Replace freeform readiness reports with structured claim/evidence/command/status records and update docs so unrun or unproven gates are always explicit.
  - Epic: EPC-AIWF-TRUST-001
  - Parent: EPC-AIWF-TRUST-001
  - State: open
- [ ] TKT-TRUST-003 Make readiness metrics block closure
  - Summary: Feed real-vs-mock success, quality/help score, fallback count, wasted latency, and token-usage coverage into project readiness and release checks, with hard blockers for degraded real traffic.
  - Epic: EPC-AIWF-TRUST-001
  - Parent: EPC-AIWF-TRUST-001
  - State: open
- [ ] TKT-TRUST-002 Add claim ledger and false-readiness audit
  - Summary: Extract readiness/DOD/verified claims from reports and final outputs, bind each claim to command evidence, and fail workflow-audit when claims are missing, stale, mock-only, or contradicted.
  - Epic: EPC-AIWF-TRUST-001
  - Parent: EPC-AIWF-TRUST-001
  - State: open
- [ ] TKT-PLUGIN-BUN-001 Expose full agent plugin surface and migrate ai-workflow to Bun
  - Summary: Make Bun canonical and expose full MCP agent/plugin surface for project search, ticket lifecycle, codelets, and readiness status.
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- No items

## Assessments

- No items

## In Progress

- [ ] TKT-TRUST-001 Restore AIWF trust and evidence-gated closure
  - Summary: Make AIWF block false readiness claims with claim-ledger auditing, metrics-backed readiness gates, structured evidence reports, and MCP ticket-context repairs before any further feature claims.
  - Epic: EPC-AIWF-TRUST-001
  - Parent: EPC-AIWF-TRUST-001
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
