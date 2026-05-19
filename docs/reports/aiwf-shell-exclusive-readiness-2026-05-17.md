# AIWF Shell-Exclusive Readiness Report - 2026-05-18

## Verdict

AIWF now reaches the final DOD slice for shell-exclusive readiness in this repo.

Ready now:
- Broad coding/debug/review/fix prompts normalize through one shared coding workflow across shell, ask, and MCP/plugin surfaces.
- Shell plan-only mode emits the normalized workflow plan, selected program, guardrails, work-ticket recommendations, mutation gate, and verification plan without running codelets, tests, writes, or live AI completion calls.
- Ask returns the same normalized request shape, selected codelets, work-ticket recommendations, mutation gate, and verification contract.
- MCP exposes `plan_coding_workflow` and `plan_work_tickets` as dry-run-by-default facade-backed tools.
- Mutation remains ticket-gated: coding writes require a ticket, verification plan, and `execute-ticket --apply`.
- Work tickets are DB-persisted with parent, file, artifact, codelet, guardrail, acceptance, and verification graph links.
- Local Ollama auto-assessment has visible progress, per-stage timeouts, a total sync budget, and degraded diagnostics instead of silent hangs.
- The full CLI suite, package builds, dogfood, workflow audit, and final sync gates pass for this slice.

Remaining non-DOD caveat:
- Repo-wide `npm run typecheck` still has broad pre-existing typing debt, but the DOD gates for this shell/operator slice pass.

## Implemented Evidence

- Added `planWorkTickets` in `aiwf-common-core/core/services/work-ticket-planner.ts`.
- Added `planCodingWorkflow` in `aiwf-common-core/core/services/coding-workflow.ts`.
- Exposed both planners through `createWorkflowCoreFacade()`.
- Added CLI command:
  `ai-workflow project ticket plan --goal <text> --parent <ticket-id> --artifact <path> [--apply] [--json]`
- Added MCP tools:
  `plan_work_tickets`
  `plan_coding_workflow`
- Routed shell coding prompts through the shared workflow planner before codelet selection.
- Routed ask coding prompts through the same shared workflow planner instead of status-query or codelet-registry fallback paths.
- Generated and applied linked DOD tickets:
  `TKT-AIWF-DOD-001` through `TKT-AIWF-DOD-005`.
- Fixed prior CLI blockers:
  smart-codelet provider fallback now keeps routed fallback candidates after operator override;
  route JSON redaction always redacts credential-shaped fields.
- Added assessment total timeout budgeting on top of per-stage timeout/progress diagnostics.

## Verification Run

- `node ./node_modules/tsx/dist/cli.mjs --test tests/workflow-db.test.ts --test-name-pattern "planCodingWorkflow|planWorkTickets"`
  - Passed. The runner executed the full workflow DB suite: 40 passed.
- `node ./node_modules/tsx/dist/cli.mjs --test tests/ai-workflow-cli.test.ts --test-name-pattern "shell and ask coding prompts|smart codelet runner falls back|route --json redacts"`
  - Passed. The runner executed the full CLI suite: 46 passed.
- `npm run build --workspace aiwf-common-core`
  - Passed.
- `npm run build --workspace aiwf-shell`
  - Passed.
- `npm run build --workspace aiwf-mcp`
  - Passed.
- `timeout 35s ai-workflow sync --json`
  - Passed. Auto-assessment completed with bounded progress and total budget diagnostics.

## Final Gate Commands

Run after the final mutation record:
- `ai-workflow dogfood --surface shell,workflow,provider,init --profile bootstrap --json`
  - Passed with `status: pass`, workspace honesty `pass`, and zero suspicious files.
- `ai-workflow audit workflow --json`
  - Passed with zero failures and zero findings.
- `AI_WORKFLOW_SKIP_AUTO_ASSESSMENT=1 ai-workflow sync --json`
  - Passed with protocol `ok: true` and zero violations.

## Exclusive-Use Boundary

AIWF is ready as the primary coding surface for this repo when the operator stays inside the guarded loop:
sync, ticket/guideline extraction, work-ticket planning, read-only codelet planning, `execute-ticket --apply`, verification, dogfood, audit, and final sync.

Fallback is still appropriate for unrelated repo-wide TypeScript cleanup until that separate debt is ticketed and closed.
