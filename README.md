<!-- Responsibility: Explain what ai-workflow is, how to install it, and the shortest reliable path to useful operation.
Scope: Detailed commands, configuration, capability limits, and maintenance policy belong in docs/MANUAL.md. -->
# AI Workflow

`ai-workflow` is a repo-local operating layer for AI-assisted engineering. It keeps workflow state in a SQLite database, projects readable kanban and epic files, gives agents ticket-scoped context and guidelines, routes model work, and exposes guarded shell and MCP surfaces.

The workspace publishes four install surfaces:

- `ai-workflow`: composite GitHub package containing the CLI, MCP launcher, and optional skill installer
- `aiwf-shell`: CLI and operator tooling
- `aiwf-mcp`: coded MCP host integration
- `aiwf-skill`: optional instruction-only host bridge

**Full documentation:** [docs/MANUAL.md](docs/MANUAL.md)

The manual includes the complete command reference, configuration, operating model, troubleshooting, and an honest capability-status table covering what works, what semi-works, and what is planned.

## Requirements

- Node.js 22 or newer
- Git
- A Git repository for meaningful mutation tracking and workspace-honesty checks
- Optional: provider credentials or a reachable Ollama instance for AI-planned operations

Deterministic status, sync, audit, projection, and many planning paths work without an AI provider.

## Install

### Recommended Complete Install

Install the composite package directly from GitHub:

```bash
npm install -g github:dharmax/ai-workflow
ai-workflow --help
```

Initialize workflow files in an existing project and install host bridges:

```bash
cd /abs/path/to/project
ai-workflow init --target .
ai-workflow install --project . --host all
ai-workflow doctor
ai-workflow sync --write-projections
```

`init` installs the managed-project workflow files and runtime helpers. `install --host all` configures the supported Gemini, Codex, and Claude bridges, including the MCP launch configuration where applicable.

### Split Packages

Install only the surfaces you need when the corresponding packages are available in your configured npm registry:

```bash
npm install -g aiwf-shell
npm install -g aiwf-mcp
npm install -g aiwf-skill
```

- Use `aiwf-shell` for `ai-workflow` CLI commands.
- Use `aiwf-mcp` for a coded host integration backed by the shared workflow core.
- Use `aiwf-skill` only as instruction glue on top of the coded tooling; it is not an enforcement boundary by itself.

### Source Checkout

```bash
git clone https://github.com/dharmax/ai-workflow.git
cd ai-workflow
npm install
npm run build
node cli/ai-workflow.mjs --help
```

## First Useful Run

```bash
ai-workflow doctor
ai-workflow sync --write-projections
ai-workflow project summary
ai-workflow extract guidelines --changed
ai-workflow shell "what are we working on right now?"
```

For a specific ticket:

```bash
ai-workflow project ticket start TKT-123
ai-workflow extract ticket TKT-123
ai-workflow extract guidelines --ticket TKT-123
ai-workflow shell "plan the work for TKT-123" --plan-only
```

Before closing operator-surface work:

```bash
ai-workflow dogfood --surface shell,workflow,provider,init,mcp,goe --json
ai-workflow audit workflow --json
ai-workflow sync --write-projections --json
```

## How Smart Is The Shell?

The shell is workflow-aware rather than a general replacement for a coding agent.

It is strong at:

- deterministic project status, ticket lookup, guideline extraction, and workflow-aware planning
- selecting shared coding/review/debug plans across shell, `ask`, and MCP
- exposing active guardrails, mutation gates, provider routes, and verification plans
- refusing mutating shell work unless exactly one ticket is in `In Progress`
- honest plan-only and degraded responses when a provider or model output is insufficient

It semi-works at:

- resolving the best files and symbols for arbitrary or underspecified coding requests
- autonomous complex patch generation, especially through smaller local models
- proving every selected guideline against every changed file before mutation

Use `ai-workflow shell --no-ai` for deterministic or heuristic behavior, and use `--plan-only` to inspect a plan without execution. See [Shell Intelligence And Enforcement](docs/MANUAL.md#shell-intelligence-and-enforcement) for the full boundary.

## How Strong Is Plugin Enforcement?

The strongest host integration is `aiwf-mcp`, because it exposes DB-backed coded tools and shared planning contracts. Managed projects also receive machine-readable audit rules through `enforcement.md`.

Enforcement is not absolute:

- MCP tools can return guardrails, mutation gates, and verification requirements, but the host still decides whether to call them.
- The optional skill bridge is instruction-only and cannot force a host to comply.
- Audit rules enforce patterns and architecture constraints that are expressible by the audit engine; narrative guidance remains advisory unless promoted into a coded gate or `ai-workflow-audit` rule.

See [Plugin And Managed-Project Enforcement](docs/MANUAL.md#plugin-and-managed-project-enforcement).

## Core Operating Rules

- Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.
- Prefer the cheapest capable model route when the tool can use it; if it is unavailable, say so instead of silently widening the fallback.
- Treat `.ai-workflow/state/workflow.db` as canonical workflow state; `kanban.md` and `epics.md` are controlled projections.
- Keep the project README and full documentation current whenever public behavior, installation, commands, configuration, limitations, or planned capability changes.

## Workspace Layout

- `aiwf-common-core`: shared workflow services, DB, codelets, routing, and projections
- `aiwf-shell`: CLI, shell mode, runtime wrappers, init/install scripts, and templates
- `aiwf-mcp`: MCP tools backed by the shared core
- `aiwf-skill`: optional instruction-only bridge assets
- `docs/MANUAL.md`: canonical full documentation
- `docs/manual.html`: generated HTML manual

## Development And Release Checks

```bash
npm test
npm run build
npm run generate-docs
npm run workflow:dogfood -- --json
npm run workflow:audit -- --json
npm run release:check
```

Do not hand-edit `docs/manual.html`; regenerate it from `docs/MANUAL.md`.
