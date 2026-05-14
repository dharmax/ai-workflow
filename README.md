# AI Workflow

This repository is the private workspace root for the `ai-workflow` package split. It coordinates four publishable packages:

- `aiwf-common-core`: shared workflow services, DB, codelets, routing, projections, and reusable runtime logic
- `aiwf-shell`: CLI entrypoints, runtime wrappers, init/install scripts, and terminal-facing tooling
- `aiwf-mcp`: MCP extension surface for external AI hosts
- `aiwf-skill`: optional instruction-only bridge assets

The workspace keeps canonical state in the workflow DB, projects readable status into `kanban.md` and `epics.md`, routes work through explicit commands, and treats verification as part of delivery rather than a postscript.

## Choose One Install Surface

You do not need to install everything.

- Install `aiwf-shell` when you want the CLI/operator surface only.
- Install `aiwf-mcp` when you want the primary coded host-extension surface.
- Install `aiwf-skill` only when you want optional host-specific instructions on top of the coded surfaces.
- Install multiple surfaces together when you need both local CLI work and external host integration.

The packages can live together, but they are intentionally separate installs.

Best distribution channel:

- npmjs for installing `aiwf-shell`, `aiwf-mcp`, or `aiwf-skill`
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
- MCP host bridge: `aiwf-mcp`

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

### MCP Extension

```bash
npm install -g aiwf-mcp
aiwf-mcp
```

This is the primary coded host-integration surface. Use it when a host should call durable tools instead of relying on prompt-only skills.

### Optional Skill Bridge

```bash
npm install -g aiwf-skill
aiwf-skill --project /abs/path/to/project --force
```

This installs instruction assets only. It is optional and should sit on top of `aiwf-shell` or `aiwf-mcp`, not replace them as the code-bearing surface.

### Both Together

```bash
npm install -g aiwf-shell aiwf-mcp aiwf-skill
ai-workflow --help
aiwf-mcp
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
