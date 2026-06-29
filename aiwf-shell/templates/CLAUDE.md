<!-- Responsibility: Provide Claude Code with the repo-local ai-workflow operating guide.
Scope: This file points Claude to the workflow surfaces and local MCP bridge, not ticket-local implementation detail. -->
# Claude Workflow Guide

Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.

## Local Bridge

- Project MCP config: `.mcp.json`
- Primary coded host surface: `ai-workflow mcp serve`

## Working Rules

- Canonical workflow state lives in `.ai-workflow/state/workflow.db`.
- `kanban.md` and `epics.md` are controlled projections; use workflow commands instead of inventing parallel status files.
- Prefer `ai-workflow sync` before broad context extraction.
- For operator-surface changes, run `bun run workflow:dogfood -- --surface workflow,shell,provider,init --json` and `bun run workflow:audit -- --json` before closure.

## aiwf Application Protocol

| Situation | First aiwf surface | Fallback / constraint |
| --- | --- | --- |
| Capability or status check | MCP `plugin_status`, `project_summary`, or capability catalog | CLI `ai-workflow project summary --json`; report unavailable tools instead of guessing. |
| Unknown target, file, feature, or symbol | MCP `search_project` and knowledge_graph | `ai-workflow project search`; only then use host search/read tools. |
| Ticket work | MCP `extract_ticket` plus `extract_guidelines` | CLI `ai-workflow extract ticket <id>` and `ai-workflow extract guidelines ...`. |
| Code change plan | MCP `plan_coding_workflow` with relevant files/artifacts | Edit files directly using returned guardrails unless a mutating aiwf tool is intentionally selected. |
| Review, debug, or refactor | MCP `review_code`, debug/refactor tools, route diagnostics, and extracted guardrails | Run targeted tests and workflow audit gates before closure. |
| Model spend | Route before spend: use deterministic DB/MCP/CLI answers before provider-backed shell planning | Prefer the cheapest capable model route; widen only when risk justifies it and report degraded routes. |
| Mutation | Explicit gated path only: user intent, one active `In Progress` ticket when required, `apply: true`, and `allowMutation: true` for mutating codelets | Never treat narrative guidance or dry-run output as permission to mutate. |

## Required MCP-First Loop

1. Start with `plugin_status` or `capability_catalog` when MCP is available.
2. Use `project_summary` or `project_status` for project state.
3. Use `search_project`, knowledge_graph, and `find_dependencies` before raw host search/read.
4. Use `list_tickets`, `extract_ticket`, `extract_guidelines`, and `plan_work_tickets` for ticket work.
5. Use `plan_coding_workflow`, `plan_code_change`, `analyze_code`, `review_code`, `debug_issue`, and `refactor_code` for code work.
6. Use `route_task` before model-backed planning or broad shell orchestration when the route is unclear.
7. Use `search_artifacts` and `judge_artifacts` for evidence, reports, and readiness claims.
8. Use `list_codelets`, `search_codelets`, `get_codelet`, and gated `run_codelet` for codelet work.
9. Use `execute_ticket`, `sweep_bugs`, ticket lifecycle tools, `apply: true`, and `allowMutation: true` only through explicit mutation gates.
10. Report unavailable MCP or targeted CLI tools before falling back to host search/read.

## Useful Commands

```bash
ai-workflow project summary --json
ai-workflow extract guidelines repo
ai-workflow sync --write-projections --json
```
