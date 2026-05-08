# AI Workflow

This repository is the private workspace root for the `ai-workflow` package split. It coordinates three publishable packages:

- `aiwf-common-core`: shared workflow services, DB, codelets, routing, projections, and reusable runtime logic
- `aiwf-shell`: CLI entrypoints, runtime wrappers, init/install scripts, and terminal-facing tooling
- `aiwf-skill`: skill installer plus agent-facing skill assets

The workspace keeps canonical state in the workflow DB, projects readable status into `kanban.md` and `epics.md`, routes work through explicit commands, and treats verification as part of delivery rather than a postscript.

## Choose One Install Surface

You do not need to install everything.

- Install `aiwf-shell` when you want the CLI/operator surface only.
- Install `aiwf-skill` when you want the agent skill surface only.
- Install both when you want both surfaces on the same machine or in the same repo.

The packages can live together, but they are intentionally separate installs.

Best distribution channel:

- npmjs for installing `aiwf-shell` or `aiwf-skill`
- GitHub for source checkout and development

Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.

Prefer the cheapest capable model route when the tool can use it; if it is unavailable, say so instead of silently widening the fallback.

## Operating Surface

- Workspace role: private npm workspace coordinator, not a published package
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
npm run workflow:dogfood -- --surface workflow,shell,provider,init --json
npm run workflow:audit -- --json
```

## Package Install Matrix

### Shell Only

```bash
npm install -g aiwf-shell
ai-workflow --help
```

This installs the interactive CLI and operator tooling. It pulls `aiwf-common-core` as a dependency.

### Skill Only

```bash
npm install -g aiwf-skill
aiwf-skill --project /abs/path/to/project --force
```

This installs the skill assets without requiring the shell package as the user-facing entrypoint. It pulls `aiwf-shell` and `aiwf-common-core` transitively because the skill installer writes toolkit-root metadata and shared templates correctly.

### Both Together

```bash
npm install -g aiwf-shell aiwf-skill
ai-workflow --help
aiwf-skill --project /abs/path/to/project --force
```

## Local Gemini Skill

Install or refresh the repo-local Gemini skill with:

```bash
npm run install:gemini-skill
```

This keeps the Gemini-facing skill under `.gemini/skills/ai-workflow` instead of relying on accidental global state.

## Release Check

Before publishing packages, run:

```bash
npm run release:check
```
