---
kanban-plugin: board
---

# Kanban Board

## Backlog

- No items

## Todo

- [ ] **TKT-ROLLBACK-01**: Implement State Flow Rollback Journal
  - Summary: Implement memory rollback and compensation handlers per ADR-012.

## In Progress

- No items

## Done

- [x] **TKT-TRUST-005**: Repair MCP ticket-context utility
- [x] **TKT-UI-002**: Enriched Web Dashboard (Kanban, Epics, Graph, Web Shell)
  - Summary: Built interactive dark-mode dashboard with Kanban lane shifting, Epic tree, blast radius visualizer, and slide-up Web Shell console.
- [x] **TKT-9D54**: Unified Capability Registry across MCP, CLI, Shell & Skill+MCP Pair
- [x] **TKT-TRUST-004**: Require structured evidence reports
  - Summary: SQLite run artifacts record execution output, test pass/fail results, and failure lessons.
- [x] **TKT-TRUST-003**: Make readiness metrics block closure
  - Summary: Evidence-gated test runs and status lifecycle enforcement active across CLI, MCP, and UI.
- [x] **TKT-TRUST-002**: Add claim ledger and false-readiness audit
  - Summary: Atomic ticket leasing and subagent claim ledger implemented in SQLite and verified.
- [x] **TKT-PLUGIN-BUN-001**: Expose full agent plugin surface and migrate ai-workflow to Bun
  - Summary: Complete pure Bun-native migration. 21 MCP tools, CLI, and Riot.js web dashboard exposed and fully operational.
- [x] **TKT-TRUST-001**: Restore AIWF trust and evidence-gated closure
  - Summary: Full trust loop restored with unmocked test runner and real-time causal graph sync.
- [x] **TKT-METRICS-001**: Implement Context & Performance Telemetry Metrics
  - Summary: MetricsCollector implemented and tested with token compression tracking and latency telemetry.
- [x] **TKT-SHELL-001**: Interactive Shell Hardening & Comprehensive Test Suite
  - Summary: Refactored executeCommand with all CLI subcommands, argument handling, title preservation, and 5 unit tests in shell.test.ts.
- [x] **TKT-TEAM-001**: Lightweight Atomic Ticket Leasing & Subagent Claim Awareness
  - Summary: Implemented claimTicket, releaseTicket, isTicketClaimed, getActiveClaims in SQLite and integrated into recommendNextTask and MCP tools.

## Blocked

- No items

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
