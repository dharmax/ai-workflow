# AI Workflow Project

`ai-workflow` is a workflow operating layer for AI agents. Its job is to keep execution aligned with the real user wish, persist canonical state in the workflow DB, and make success depend on both delivered outcomes and truthful reporting.

Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.

Prefer the cheapest capable model route when the tool can use it; if it is unavailable, say so instead of silently widening the fallback.

The current reliability direction is strict by design:

- success means trying to satisfy the real user wish, not a narrower substitute task
- closure depends on evidence, not confident prose
- reports must be true, not misleading, and should explain gaps in a way that helps the operator decide what to do next
- unresolved wish-vs-done gaps must produce a concrete recovery plan, such as more implementation, stronger-model retry, web research, trial-and-error, or explicit user clarification
- the workflow DB is canonical, while `kanban.md` and `epics.md` are projections that must stay reconciled

Before calling work done on operator-facing changes, run:

- `ai-workflow sync --write-projections --json`
- `ai-workflow dogfood --surface workflow,shell,provider,init --json`
- `ai-workflow audit workflow --json`
