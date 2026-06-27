<!-- Responsibility: Provide Gemini CLI with the repo-local ai-workflow operating guide.
Scope: This file points Gemini to the workflow surfaces and local skill bridge, not ticket-local implementation detail. -->
# Gemini Workflow Guide

Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.

## Local Bridge

- Repo-local skill path: `.gemini/skills/ai-workflow`
- Primary coded host surface: `aiwf-mcp`
- Refresh the local skill copy:

```bash
bun run install:gemini-skill
```

## Working Rules

- Canonical workflow state lives in `.ai-workflow/state/workflow.db`.
- `kanban.md` and `epics.md` are controlled projections; use workflow commands instead of inventing parallel status files.
- Prefer `ai-workflow sync` before broad context extraction.
- For operator-surface changes, run `bun run workflow:dogfood -- --surface workflow,shell,provider,init --json` and `bun run workflow:audit -- --json` before closure.

## aiwf Application Protocol

| Situation | First aiwf surface | Fallback / constraint |
| --- | --- | --- |
| Capability or status check | MCP `plugin_status`, `project_summary`, or capability catalog | CLI `ai-workflow project summary --json`; report unavailable tools instead of guessing. |
| Unknown target, file, feature, or symbol | MCP `search_project` and `knowledge_graph` | `ai-workflow project search`; only then use host search/read tools. |
| Ticket work | MCP `extract_ticket` plus `extract_guidelines` | CLI `ai-workflow extract ticket <id>` and `ai-workflow extract guidelines ...`. |
| Code change plan | MCP `plan_coding_workflow` with relevant files/artifacts | Edit files directly using returned guardrails unless a mutating aiwf tool is intentionally selected. |
| Review, debug, or refactor | MCP `review_code`, debug/refactor tools, route diagnostics, and extracted guardrails | Run targeted tests and workflow audit gates before closure. |
| Model spend | Route before spend: use deterministic DB/MCP/CLI answers before provider-backed shell planning | Prefer the cheapest capable model route; widen only when risk justifies it and report degraded routes. |
| Mutation | Explicit gated path only: user intent, one active `In Progress` ticket when required, `apply: true`, and `allowMutation: true` for mutating codelets | Never treat narrative guidance or dry-run output as permission to mutate. |

## Useful Commands

```bash
ai-workflow project summary --json
ai-workflow extract guidelines repo
ai-workflow sync --write-projections --json
```
