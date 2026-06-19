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

## Useful Commands

```bash
ai-workflow project summary --json
ai-workflow extract guidelines repo
ai-workflow sync --write-projections --json
```
