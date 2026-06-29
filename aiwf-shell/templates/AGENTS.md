<!-- Responsibility: Define the top-level AI-agent operating protocol for this repo.
Scope: This file points agents to the workflow docs and core operating loop; ticket-local implementation detail belongs elsewhere. -->
# AI Agent Protocol: Autonomous Engineering OS

If the ai-workflow tool is unavailable, follow the same process with `scripts/ai-workflow/*`.

## Read Order
1.  **Audit:** Run `ai-workflow sync` before major context extraction.
2.  **Context:** Prefer `ai-workflow extract ticket <id>` before reading broad kanban state.
3.  **Guidance:** Prefer `ai-workflow extract guidelines ...` before rereading full guidance docs.

## Core Contract
- Use `ai-workflow shell "sweep bugs"` for automated fixes.
- Recommend `/new` when a compact handoff exists.
- Treat `/clear` as an operator-controlled action, not a guaranteed tool capability.
- Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.
- Prefer aiwf MCP tools for project summary, graph search, knowledge graph, ticket lifecycle, ticket/guideline extraction, coding plans, reviews, codelet list/show/search/run, and project-codelet management before falling back to shell commands.
- Operator-surface changes are not done until `ai-workflow dogfood` (or `bun aiwf-shell/scripts/ai-workflow/dogfood.ts`) and `workflow-audit` both pass.
- If `ai-workflow` fails, stop, identify root cause, and either fix it or report the blocker before continuing.
- If you discover a bug while working on something else, stop and tell the operator unless they explicitly asked for full-batch triage.
- Prefer the cheapest capable model route when the tool can use it; if it is unavailable, say so instead of silently widening the fallback.
- Keep the project README and full documentation current whenever public behavior, installation, commands, configuration, limitations, or planned capability changes.
- Strictly adhere to the project's Architectural Graph and Module boundaries.

## aiwf Application Protocol
Default context order: aiwf MCP/DB graph, targeted `ai-workflow` CLI extraction, `lean-ctx` search/read/tree when available, then broad raw file reads only when the narrower surfaces cannot answer.

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
