# AI Workflow

`ai-workflow` is a repo-local operating layer for AI-assisted engineering. It keeps canonical state in the workflow DB, projects readable status into `kanban.md` and `epics.md`, routes work through explicit commands, and treats verification as part of delivery rather than a postscript.

Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.

Prefer the cheapest capable model route when the tool can use it; if it is unavailable, say so instead of silently widening the fallback.

## Operating Surface

- Canonical state: `.ai-workflow/state/workflow.db`
- Human-readable projections: `kanban.md`, `epics.md`, `MISSION.md`
- Core operator docs: `AGENTS.md`, `execution-protocol.md`, `project-guidelines.md`, `knowledge.md`
- Deep reference manual: `docs/MANUAL.md`
- Gemini bridge: `.gemini/GEMINI.md` and `.gemini/skills/ai-workflow`

## High-Value Commands

```bash
ai-workflow sync --write-projections --json
ai-workflow project summary --json
ai-workflow extract guidelines repo
ai-workflow dogfood --surface workflow,shell,provider,init --json
ai-workflow audit workflow --json
```

## Local Gemini Skill

Install or refresh the repo-local Gemini skill with:

```bash
node scripts/install-ai-workflow-skill.mjs --project . --force
```

This keeps the Gemini-facing skill under `.gemini/skills/ai-workflow` instead of relying on accidental global state.
