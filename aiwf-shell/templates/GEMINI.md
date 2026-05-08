<!-- Responsibility: Provide Gemini CLI with the repo-local ai-workflow operating guide.
Scope: This file points Gemini to the workflow surfaces and local skill bridge, not ticket-local implementation detail. -->
# Gemini Workflow Guide

Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.

## Local Bridge

- Repo-local skill path: `.gemini/skills/ai-workflow`
- Refresh the local skill copy:

```bash
node scripts/install-ai-workflow-skill.mjs --project . --force
```

## Working Rules

- Canonical workflow state lives in `.ai-workflow/state/workflow.db`.
- `kanban.md` and `epics.md` are controlled projections; use workflow commands instead of inventing parallel status files.
- Prefer `ai-workflow sync` before broad context extraction.
- For operator-surface changes, run `ai-workflow dogfood --surface workflow,shell,provider,init --json` and `ai-workflow audit workflow --json` before closure.

## Useful Commands

```bash
ai-workflow project summary --json
ai-workflow extract guidelines repo
ai-workflow sync --write-projections --json
```
