# AIWF Trust Rebuild Plan

## Status

- Active ticket: `TKT-TRUST-001 Restore AIWF trust and evidence-gated closure`
- Parent epic: `EPC-AIWF-TRUST-001`
- Priority: trust repair before new feature claims
- Rule: no readiness, DOD, or closure claim is valid unless backed by machine-readable evidence and current live gates

## Problem Statement

AIWF has accumulated optimistic reports and archived tickets that imply reliability which live evidence does not support. Current metrics show degraded real traffic, low token-usage coverage, and failures that should have blocked readiness claims. The repair is not another capability plan; it is a closure-control system that prevents false claims and makes utility measurable.

## Work Tickets

### `TKT-TRUST-001` Restore AIWF trust and evidence-gated closure

Owns the rollout and keeps the board honest.

Acceptance:
- The board has exactly one active trust-rebuild ticket while trust gates are being implemented.
- Historical readiness reports are treated as claims to verify, not proof.
- The final status response lists passed gates, failed gates, and gates not run.

Verification:
- `ai-workflow project summary --json`
- `ai-workflow audit workflow --json`
- `ai-workflow sync --write-projections --json`

### `TKT-TRUST-002` Add claim ledger and false-readiness audit

Implement deterministic extraction of readiness and completion claims from reports and closure outputs.

Implementation:
- Add a claim-ledger service under `aiwf-common-core/core/services`.
- Scan docs and generated reports for claim phrases: `ready`, `readiness`, `DOD`, `done`, `closed`, `verified`, `passed`, `all checks passed`, and `ready for closure`.
- Normalize each claim into:
  - `id`
  - `sourcePath`
  - `line`
  - `claimText`
  - `claimType`
  - `requiredEvidence`
  - `observedEvidence`
  - `status`: `verified`, `unverified`, `stale`, `contradicted`, or `not_applicable`
  - `blockingReason`
- Treat command-looking claims as unverified unless the command appears in a recorded run artifact, test run, or accepted verification reference.
- Add workflow-audit findings for unverified, stale, or contradicted readiness claims.

Acceptance:
- `docs/reports/aiwf-reliability-readiness-2026-06-03.md` is flagged unless its claimed gates have current recorded evidence.
- A report can describe historical work, but cannot be treated as current readiness proof without current evidence.
- The audit output names the exact file, line, claim, and missing evidence.

Tests:
- Unit fixture with true historical prose that does not block.
- Unit fixture with false `Ready for closure` claim that blocks.
- Regression fixture using the existing reliability report.

### `TKT-TRUST-003` Make readiness metrics block closure

Wire live metrics into readiness and release checks.

Implementation:
- Extend `evaluateReadiness` to include metrics windows from `store.getMetricsSummary()`.
- Add blockers when:
  - real-traffic quality/help score is below threshold
  - real-traffic success rate is below threshold
  - fallback attempts or wasted latency exceed threshold
  - token-usage coverage is below threshold
  - latest session is mock-only and no recent real traffic exists
- Return these in readiness output:
  - `metrics.realTraffic`
  - `metrics.mockTraffic`
  - `metrics.quality`
  - `metrics.tokenUsage`
  - `metrics.diagnostics`
  - `metrics.blockers`
- Add release-check integration so `release:check` cannot pass on degraded metrics unless explicitly running in a documented local-development bypass mode.

Default thresholds:
- Real-traffic quality/help score must be at least 70.
- Real-traffic success rate must be at least 80%.
- Token-usage coverage must be at least 80% for provider-backed work.
- Mock-only latest evidence cannot prove release readiness.

Acceptance:
- Current degraded metrics block readiness.
- Mock-only traffic produces `blocked`, not `ready`.
- Passing deterministic gates do not hide failed real traffic.

Tests:
- Readiness blocks on current-style degraded real traffic.
- Readiness blocks on mock-only latest session.
- Readiness passes metrics only when real success, quality, and token coverage meet thresholds.

### `TKT-TRUST-004` Require structured evidence reports

Replace freeform readiness claims with machine-checkable report payloads.

Implementation:
- Define a structured report schema:
  - `reportId`
  - `generatedAt`
  - `ticketIds`
  - `claims[]`
  - `commands[]`
  - `artifacts[]`
  - `gates[]`
  - `overallStatus`
  - `blockingReasons[]`
- Require every claim to reference an evidence id.
- Add a report writer for readiness and trust-rebuild reports.
- Update docs to state that prose summaries are secondary; structured claim evidence is canonical.
- Add a presenter that renders the structured report in human-readable Markdown without losing machine fields.

Acceptance:
- A readiness report with unreferenced claims fails audit.
- A final report distinguishes `passed`, `failed`, `not_run`, and `not_applicable`.
- The generated Markdown includes a machine-readable fenced block or adjacent JSON artifact.

Tests:
- Schema validation passes for a complete report.
- Schema validation fails for an unreferenced claim.
- Markdown rendering preserves all claim ids and gate statuses.

### `TKT-TRUST-005` Repair MCP ticket-context utility

Make MCP useful for actual repair design, not just workflow state.

Implementation:
- Add a shared ticket-context assembler used by `extract_ticket`, `project_status`, and MCP coding tools.
- Extend `extract_ticket` with:
  - `links.files`
  - `links.tests`
  - `links.artifacts`
  - `links.codelets`
  - `links.guardrails`
  - `links.verificationCommands`
  - `workingSet.confidence`
  - `workingSet.fallbackStage`
  - `diagnostics.evidenceGaps`
- Link run artifacts back to tickets using artifact `ticketId`.
- Expand `search_artifacts` beyond the latest run artifact.
- Fix `plan_code_change` and `plan_coding_workflow` so discovered files, tests, artifacts, and status hits populate planned work tickets.
- Improve search tokenization for snake_case and multi-tool queries.
- Penalize generated, hidden, cache, and project metadata files when ranking primary implementation working sets.

Acceptance:
- `extract_ticket` returns files, tests, artifacts, guardrails, codelets, verification commands, confidence, and evidence gaps in one call.
- `plan_code_change` for this MCP-context problem returns concrete target files and tests, not empty generic tickets.
- Search for `extract_ticket search_artifacts project_status` finds MCP/server and core service targets.

Tests:
- MCP surface test for enriched `extract_ticket`.
- Workflow DB test for run-artifact-to-ticket linkage.
- Search regression for snake_case and multi-term tool queries.
- Working-set ranking regression that keeps cache/generated artifacts out of primary slots.

## Hard Gates

These gates must pass before any future AIWF reliability or release claim:

- `bun test --timeout=30000 --max-concurrency=1 tests/workflow-db.test.ts tests/mcp-surface.test.ts tests/cli.test.ts`
- `bun run build`
- `bun run workflow:dogfood -- --json`
- `bun run workflow:audit -- --json`
- `ai-workflow project readiness --goal release --question "Is AIWF ready to claim reliability?" --json`

Closure is blocked if any gate is not run, fails, or produces unverified evidence.

## Reporting Rules

- Never summarize a gate as passed unless the command was run in the current evidence window.
- Never use mock-only traffic as release proof.
- Never close a ticket with missing acceptance evidence.
- Always list unrun gates separately from failed gates.
- Always report live metrics when discussing readiness.

## Initial Known Blockers

- Live real-traffic quality/help score has been degraded.
- Token-usage coverage has been too low for provider-backed conclusions.
- Historical reports include readiness language that must be revalidated.
- The current MCP/ticket context path exposes scattered evidence and weak search/ranking.

## Implementation Order

1. `TKT-TRUST-002`: make false readiness claims visible and blocking.
2. `TKT-TRUST-003`: make live metrics block readiness.
3. `TKT-TRUST-004`: make future reports structured and auditable.
4. `TKT-TRUST-005`: repair MCP utility after the trust gates can judge it.
5. `TKT-TRUST-001`: close only after all child tickets have evidence and all hard gates pass.
