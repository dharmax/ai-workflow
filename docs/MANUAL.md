<!-- Responsibility: Provide the complete public installation, usage, configuration, capability-status, and troubleshooting reference.
Scope: Live workflow state and ticket-local implementation detail belong in the workflow DB and projections, not in this manual. -->
# ai-workflow Manual

## What It Is

`ai-workflow` is the repo-local operating layer for workflow, tickets, kanban, epics, codelets, provider routing, guarded execution, shell-based planning, and MCP-hosted extension tools.

The canonical operational state lives in the workflow DB inside the shared core. Files such as `kanban.md` and `epics.md` are controlled projections of that DB, not the source of truth.

This Markdown file is the canonical manual. `docs/manual.html` is generated from this file by code and is committed for human browsing and static consumption.

Shell, MCP, and host guidance should treat this manual as a first-class operational reference for commands, patterns, and configuration, but they must still prioritize live workflow state, ticket state, `AGENTS.md`, `execution-protocol.md`, `project-guidelines.md`, and `knowledge.md`.

## Mental Model

- Use `ai-workflow` first for project status, ticket lookup, projections, and guideline extraction; fall back to raw shell search/read only when the workflow tool cannot answer.
- Prefer MCP tools for graph search, ticket lifecycle, codelet list/show/search/run, and project-codelet management before falling back to shell commands.
- Prefer the cheapest capable model route when the tool can use it; if it is unavailable, say so instead of silently widening the fallback.
- Treat shell mode as a planning and orchestration surface, not as permission to skip workflow discipline.
- Treat the workflow DB as canonical state, and treat projections as readable outputs that must stay reconciled.
- Treat `Todo` as the canonical projected kanban lane spelling; legacy `ToDo`, `TODO`, and `To-do` inputs normalize to it.
- Use `lean-ctx` whenever compact context matters.
- If `ai-workflow` fails, stop, identify root cause, and either fix it or report the blocker before continuing.

## Installation And Setup

### Requirements

- Bun 1.3.14 or newer
- Git
- A Git repository for meaningful mutation tracking and workspace-honesty checks
- Optional provider credentials or a reachable Ollama instance for AI-planned operations

Deterministic sync, status, audit, projection, extraction, and many planning paths do not require an AI provider.

### Recommended Complete Install

The complete GitHub install surface exposes `ai-workflow`, `aiwf-mcp`, and `aiwf-skill`:

```bash
bun add -g github:dharmax/ai-workflow
ai-workflow --help
```

The split packages `aiwf-shell`, `aiwf-mcp`, `aiwf-skill`, and `aiwf-common-core` are configured as independent packages. Install them from npm only when they are available in your configured registry.

### Source Checkout

```bash
git clone https://github.com/dharmax/ai-workflow.git
cd ai-workflow
bun install
bun run build
bun aiwf-shell/cli/ai-workflow.ts --help
```

### Repo Bootstrap

- Initialize workflow files and runtime helpers in the current repo:

```bash
ai-workflow init --target .
```

- Install supported host bridges:

```bash
ai-workflow install --project . --host all
```

Supported host values are `gemini`, `codex`, `claude`, and `all`. The install command configures coded MCP launch settings where the host supports them and adds instruction bridges where applicable.

- Initialize from a brief while installing:

```bash
ai-workflow init --target . --brief ./project-brief.md
```

- Refresh the DB and projections:

```bash
ai-workflow sync --write-projections
```

### First-Day Checks

- Check local tooling and providers:

```bash
ai-workflow doctor
```

- See the current operating mode:

```bash
ai-workflow mode status --json
```

- Show current project summary:

```bash
ai-workflow project summary --json
```

- Confirm the managed-project protocol and host bridges:

```bash
ai-workflow audit workflow --json
ai-workflow dogfood --surface workflow,init,mcp --profile bootstrap --json
```

## Core Workflow

### Standard Operator Loop

1. Sync the project when you need fresh graph state.
2. Read the active ticket or current status through `ai-workflow`.
3. Use shell mode or direct commands to plan and execute.
4. Verify with targeted tests first, then broader gates when risk is higher.
5. Refresh projections and close the ticket truthfully.

### Canonical Workflow Commands

- Sync:

```bash
ai-workflow sync --write-projections
```

- Read the active state:

```bash
ai-workflow project summary
ai-workflow project status project
ai-workflow project search routing
```

- Extract ticket-specific context:

```bash
ai-workflow extract ticket TKT-001
ai-workflow extract guidelines --ticket TKT-001
```

- Run shell mode:

```bash
ai-workflow shell
ai-workflow shell "what are we working on right now?"
ai-workflow shell "extract ticket TKT-001"
```

- Verify operator surfaces:

```bash
bun run workflow:dogfood -- --profile full --json
bun run workflow:audit -- --json
```

## Shell And Host Surfaces

### Surface Model

- `aiwf-common-core` owns workflow truth, graph state, projections, routing, and governance checks.
- `aiwf-shell` is the interactive CLI/operator surface.
- `aiwf-mcp` is the primary coded extension surface for external AI hosts.
- `aiwf-skill` is optional instruction-only glue for hosts that still want local skill text.

## Shell Mode

### What Shell Mode Does

- Reads live workflow state before acting.
- Chooses between shell-local replies, heuristic planning, and AI planning.
- Uses the live model-fit matrix and current provider discovery for planner selection.
- Enforces mutation discipline around ticket state and shell mode.
- The canonical operator-visible work-mode model is defined in [docs/shell-work-mode-model.md](./shell-work-mode-model.md).

### High-Value Shell Patterns

- Ask for current work:

```bash
ai-workflow shell "what are we working on right now?"
```

- Ask for ticket context:

```bash
ai-workflow shell "explain TKT-DOCS-001 with related files"
```

- Preview a plan without execution:

```bash
ai-workflow shell "sweep bugs" --plan-only
```

- Force heuristic-only planning:

```bash
ai-workflow shell "doctor" --no-ai
```

- Allow immediate execution confirmation prompts:

```bash
ai-workflow shell "execute TKT-001" --yes
```

### Shell Operating Rules

- If the request is only about shell usage or capabilities, shell may answer directly.
- If the request depends on project state, shell should discover state before answering.
- Mutating shell work must be blocked until the board has exactly one ticket in `In Progress`.
- State-changing actions that already have a dedicated CLI command should use that command surface instead of improvised shell behavior.
- Shell guidance should use this manual for commands, patterns, and configuration, but it must not override live DB state.

### Shell Examples

- Current-work read:

```bash
ai-workflow shell "tell me what we're working on and which files matter"
```

- Readiness path:

```bash
ai-workflow shell "is this ready for beta testing?"
ai-workflow shell "make it ready"
```

- Guidance extraction:

```bash
ai-workflow shell "extract guidelines for TKT-DOCS-001"
```

- Provider diagnostics:

```bash
ai-workflow shell "doctor"
ai-workflow shell "show provider status"
```

## Capability Status

This section is the public capability contract as of June 4, 2026. Treat live `doctor`, `dogfood`, audit, provider, and project-state output as more authoritative than this dated summary.

### Works Reliably

- DB-backed sync, ticket lifecycle, project summary, status lookup, projections, and guideline extraction
- deterministic and heuristic shell replies for workflow/status questions
- shared coding/review/debug planning across shell, `ask`, and MCP
- plan-only inspection, route diagnostics, mutation gates, and verification plans
- ticket gating for mutating shell work
- machine-readable project audit rules and workflow audit
- MCP tools for summary, sync, graph search, plugin status, ticket lifecycle, ticket/guideline extraction, codelet registry/run, project-codelet management, status, routing, planning, graph export, and projection writes
- bootstrap/full dogfood surfaces and packed-install smoke paths

### Semi-Works

- Shell target resolution is useful but can rank broad or weak file/symbol targets for arbitrary or underspecified prompts.
- Autonomous complex code generation depends heavily on provider/model quality. Weak model output is rejected or degraded honestly, but the resulting plan may still require a stronger coding host.
- Local-model smart codelets work, but latency, timeout, and schema-retry behavior can make them slow.
- `ai-workflow tool benchmark --suite shell-trust` is provider-bound, but it emits per-case progress, has a 120-second default suite deadline, and reports incomplete/timed-out cases explicitly.
- Full-profile dogfood can inherit provider-bound delay. Bootstrap-profile dogfood is the bounded deterministic gate when full provider exercise is not required.
- Guideline enforcement selects active guardrails, injects them into shared planning/codelet contexts, validates typed outputs, and runs audit rules. It does not yet automatically prove every narrative guideline against every changed file.
- Shell, `ask`, and MCP share core planning contracts, but each host controls how consistently it invokes the tools and follows returned constraints.
- Workspace honesty is strongest in Git repositories. In non-Git workspaces freshness enforcement is advisory.

### Does Not Work Yet, But Is Planned

- Fully deterministic, high-quality autonomous implementation for arbitrary complex coding requests
- Guaranteed compliance by third-party hosts that ignore MCP results or instruction-only skill guidance
- Automatic semantic proof that README and full documentation describe every public behavior change; current enforcement requires the files and maintenance rule, while review/audit must still judge content quality
- Universal changed-file pass/fail proof for every selected narrative guideline before mutation
- Perfect graph target ranking for arbitrary natural-language code questions

## Shell Intelligence And Enforcement

### Intelligence Model

The shell is a workflow-aware planner and operator surface, not a general unrestricted coding agent.

It combines:

1. deterministic command and status handling for known workflow requests
2. heuristic planning for recognizable operator intents
3. routed AI planning when a suitable provider is available
4. shared DB-backed coding workflow plans for coding, review, and debugging requests
5. explicit degraded responses when provider/model output is unavailable or fails validation

The shell reads live workflow state, active tickets, provider state, codelets, and selected guardrails before planning. `--no-ai` forces deterministic/heuristic behavior. `--plan-only` prevents execution and is the preferred way to inspect a proposed action graph.

### Mutation Enforcement

- Mutating shell work requires exactly one ticket in `In Progress`.
- Dedicated state-changing commands should be used instead of improvised shell actions.
- Shared coding plans expose whether mutation is allowed and what ticket/verification contract applies.
- Typed smart-codelet outputs are schema-checked and may be rejected or replaced by an explicitly degraded result.

This is meaningful enforcement, but it is not a sandbox. Direct filesystem commands, a third-party host, or a human can still bypass the shell. Workflow audit and workspace-honesty checks detect some bypasses after the fact.

## Plugin And Managed-Project Enforcement

### MCP Integration

`aiwf-mcp` is the strongest plugin-style surface because it exposes coded tools backed by the shared workflow core. Its planning tools return active guardrails, mutation gates, route diagnostics, recommended work tickets, and verification plans.

The MCP server currently exposes:

- project_summary
- sync_project
- search_project
- plugin_status
- list_tickets
- create_ticket
- update_ticket_lifecycle
- extract_ticket
- extract_guidelines
- plan_work_tickets
- plan_coding_workflow
- project_status
- route_task
- knowledge_graph
- write_projections
- list_codelets
- get_codelet
- search_codelets
- run_codelet
- forge_project_codelet
- upsert_project_codelet
- remove_project_codelet

Mutating MCP tools dry-run unless `apply: true`. `run_codelet` refuses mutating codelets unless `allowMutation: true`, the manifest declares `canMutate: true`, and required flags such as `args.apply === true` are present.

MCP makes the constraints inspectable and reusable, but the host remains responsible for calling the tools and honoring their results.

### Optional Skill Bridge

`aiwf-skill` installs host-local instructions. It improves discovery and operating discipline but has no coded enforcement authority by itself. Use it on top of `aiwf-shell` or `aiwf-mcp`.

### Managed-Project Rules

`ai-workflow init` installs `AGENTS.md`, `execution-protocol.md`, `project-guidelines.md`, `enforcement.md`, workflow runtime helpers, and the audit workflow. The audit engine executes fenced `ai-workflow-audit` rules, including required patterns, forbidden patterns/imports, and responsibility-header rules.

Rules are strongest when they are:

- implemented as deterministic core gates
- represented as narrow machine-readable audit rules
- verified by entrypoint and degraded-path tests

Narrative guidance that has not been promoted to a coded gate or audit rule remains advisory.

## Command Reference

### Setup And Bootstrap

- `ai-workflow setup [--project <path>] [--host <gemini|codex|claude|all>]`
- `ai-workflow init [--target <path>] [--brief <file>] [--all] [--force] [--dry-run] [--no-sync]`
- `ai-workflow install [--project <path>] [--host <gemini|codex|claude|all>]`
- `ai-workflow onboard <brief-file> [--json]`

### Core Diagnostics And Status

- `ai-workflow doctor [--json] [--refresh-models]`
- `ai-workflow version [--json]`
- `ai-workflow --version`
- `ai-workflow metrics [--json]`

### Shell And Question Surfaces

- `ai-workflow shell [request...] [--yes] [--plan-only] [--no-ai] [--json]`
- `ai-workflow ask [request...] [--mode <default|tool-dev>] [--root <path>] [--evidence-root <path>] [--json]`
- `ai-workflow consult`

### Workflow DB And Projection Surfaces

- `ai-workflow sync [--write-projections] [--json]`
- `ai-workflow project summary [--json]`
- `ai-workflow project status <selector> [--type <type>] [--json]`
- `ai-workflow project status related <selector> [--type <type>] [--json]`
- `ai-workflow project status types`
- `ai-workflow project search <text> [--json]`
- `ai-workflow project readiness --goal <goal-type> --question <text> [--mode <default|tool-dev>] [--root <path>] [--evidence-root <path>] [--json]`
- `ai-workflow project epic <list|show|search> [...]`
- `ai-workflow project story <list|search> [...]`
- `ai-workflow project codelet <list|show|search> [...]`
- `ai-workflow project ticket plan --goal <text> --parent <ticket-id> --artifact <path> [--file <path>] [--mode <mode>] [--apply] [--json]`
- `ai-workflow project ticket plan <validate|matrix|approve|verify> [...]`
- `ai-workflow project ticket create --id <id> --title <title> [--lane <lane>] [--epic <epic-id>] [--summary <text>] [--json]`
- `ai-workflow project ticket <start|resolve|close|reopen> <ticket-id> [...]`
- `ai-workflow project assessment <list|show|run> [...]`
- `ai-workflow project enrich-guidelines [--force] [--json]`
- `ai-workflow project note add --type <NOTE|TODO|FIXME|HACK|BUG|RISK> --body <text> [--file <path>] [--line <n>] [--symbol <name>] [--json]`
- `ai-workflow project note resolve <note-id> [--reason <text>] [--json]`
- `ai-workflow project review-candidates [--json]`

### Extraction And Verification

- `ai-workflow extract ticket <id> [options]`
- `ai-workflow extract guidelines [options]`
- `ai-workflow verify <workflow|guidelines> [options]`
- `ai-workflow audit <architecture|workflow> [--json]`
- `ai-workflow dogfood [--surface <id[,id...]>] [--profile <bootstrap|full>] [--json]`
- `ai-workflow programming-dogfood [--target <path>] [--force] [--json]`
- `ai-workflow reprofile [--json]`
- `ai-workflow route <task-class> [--json]`

### Codelets And Dynamic Behavior

- `ai-workflow list [--json]`
- `ai-workflow info <codelet>`
- `ai-workflow run <codelet> [args]`
- `ai-workflow add <codelet> <file>`
- `ai-workflow update <codelet> <file>`
- `ai-workflow remove <codelet>`
- `ai-workflow forge codelet <name>`

### Provider And Runtime Configuration

- `ai-workflow provider connect <provider-id>`
- `ai-workflow provider setup [--global]`
- `ai-workflow provider quota refresh [provider-id|all] [--global] [--json]`
- `ai-workflow provider refresh [models|all] [--global] [--json]`
- `ai-workflow set-provider-key <provider-id> [--global]`
- `ai-workflow set-ollama-hw [options]`

### Mode, Config, And Observation

- `ai-workflow mode set <default|tool-dev> [--global]`
- `ai-workflow mode status [--json]`
- `ai-workflow config get [key]`
- `ai-workflow config set <key> <value>`
- `ai-workflow config unset <key> [--global]`
- `ai-workflow config clear [--global]`
- `ai-workflow knowledge update-remote [--url <remote-url>] [--json]`
- `ai-workflow tool observe [--complaint <text>] [--json]`
- `ai-workflow tool refine [issue-id] [--json]`
- `ai-workflow tool benchmark <prompt> [--json]`
- `ai-workflow tool benchmark --suite shell-trust [--timeout-ms <n>] [--total-timeout-ms <n>] [--json]`
- `ai-workflow tool dogfood-harness [--json]`
- `ai-workflow tool finalize [--json]`

### Special Surfaces

- `ai-workflow ingest <file> [--json]`
- `ai-workflow kanban <new|move|next|archive|migrate> [...]`
- `ai-workflow telegram preview [--json]`
- `ai-workflow web tutorial [--port <n>] [--host <host>] [--json]`
- `ai-workflow mcp serve`

## Configuration Reference

### Config File Model

- Project config path: `.ai-workflow/config.json`
- Global config path: `~/.ai-workflow/config.json`
- Project config overrides global config where both define the same key
- `ai-workflow config set` accepts dot-path keys and JSON-like values

### Top-Level Keys

#### `mode`

- Meaning: default operating mode for the current scope
- Allowed values: `default`, `tool-dev`
- Typical command:

```bash
ai-workflow mode set tool-dev
```

#### `providers`

- Meaning: provider-specific connection, quota, model, and routing hints
- Shape: object keyed by provider id

#### `routing`

- Meaning: advanced routing-policy overrides merged into discovered routing policy
- Use only when the default route policy is wrong for your environment

### Remote Provider Keys

These keys apply to configured remote providers such as `openai`, `anthropic`, and `google`.

#### `providers.<provider>.apiKey`

- Meaning: API key used for completions and discovery
- Typical command:

```bash
ai-workflow config set providers.openai.apiKey sk-...
```

#### `providers.<provider>.baseUrl`

- Meaning: alternate API base URL
- Use when targeting a compatible gateway or proxy

#### `providers.<provider>.enabled`

- Meaning: explicit provider enable or disable switch
- Default behavior: enabled unless set to `false`

#### `providers.<provider>.quota.freeUsdRemaining`

- Meaning: remaining free quota in USD
- Used by routing when `quotaStrategy` prefers free remote usage

#### `providers.<provider>.quota.monthlyFreeUsd`

- Meaning: monthly free quota budget in USD

#### `providers.<provider>.quota.resetAt`

- Meaning: quota reset date in `YYYY-MM-DD`

#### `providers.<provider>.paidAllowed`

- Meaning: whether routing may continue onto paid usage after free quota is exhausted
- Default behavior: `true`

#### `providers.<provider>.models`

- Meaning: configured model registry overrides or supplements builtin knowledge
- Use when a provider exposes custom or newly available model ids

### Session Provider Keys

#### `providers.session.token`

- Meaning: browser-login session token for the session provider surface

### Ollama Keys

#### `providers.ollama.enabled`

- Meaning: explicit Ollama enable or disable switch
- Default behavior: enabled unless set to `false`

#### `providers.ollama.host`

- Meaning: primary Ollama host URL
- Example:

```bash
ai-workflow config set providers.ollama.host http://127.0.0.1:11434
```

#### `providers.ollama.endpoints`

- Meaning: additional Ollama hosts to merge into discovery
- Shape: JSON array of URLs

#### `providers.ollama.models`

- Meaning: configured model registry fallback when live probing is unavailable

#### `providers.ollama.hardwareClass`

- Meaning: coarse local hardware hint
- Allowed values: `tiny`, `small`, `medium`, `large`
- Used by shell planner selection and default local size limits

#### `providers.ollama.maxModelSizeB`

- Meaning: maximum local model size in billions of parameters for non-shell-planning routing

#### `providers.ollama.plannerModel`

- Meaning: explicit shell planner override model id
- Important: manual override only, not the normal default routing path

#### `providers.ollama.plannerMaxQuality`

- Meaning: quality cap for shell planner selection
- Typical values: `low`, `medium`, `high`

### Routing Keys

#### `routing.preferLocalFor`

- Meaning: array of task classes or capabilities that should prefer local models
- Example values: `["shell-planning", "data", "summarization"]`

#### `routing.quotaStrategy`

- Meaning: remote quota policy
- Current meaningful value: `prefer-free-remote`

#### `routing.contextCompression`

- Meaning: context compression policy override
- Normal value: `lean-ctx`

#### `routing.minimumQuality`

- Meaning: per-task minimum quality overrides
- Shape: object keyed by task class

#### `routing.capabilityMapping`

- Meaning: per-task capability remapping
- Shape: object keyed by task class
- Use only for advanced routing correction

## Usage Examples And Patterns

### Read The Current State

```bash
ai-workflow project summary
ai-workflow project status project
ai-workflow project status related TKT-DOCS-001
```

### Create A Ticket

```bash
ai-workflow project ticket create \
  --id TKT-123 \
  --title "Document the shell planner" \
  --lane "Todo" \
  --epic EPIC-DOCS-001 \
  --summary "Add a clear operator-facing planner section."
```

### Extract Guidance For A Ticket

```bash
ai-workflow extract guidelines --ticket TKT-DOCS-001
```

### Route A Task Before Spending Tokens

```bash
ai-workflow route shell-planning --json
ai-workflow route review --json
```

### Use Tool-Dev Mode

```bash
ai-workflow mode set tool-dev
ai-workflow ask "is this project ready?" --mode tool-dev --evidence-root /path/to/project --json
```

### Refresh Provider Discovery

```bash
ai-workflow doctor --refresh-models
ai-workflow provider refresh models --json
```

### Configure Ollama Hardware

```bash
ai-workflow set-ollama-hw --hardware-class medium --max-model-size-b 14
```

### Run Verification

```bash
node --test tests/*.test.mjs
bun run workflow:dogfood -- --profile full --json
bun run workflow:audit -- --json
```

## Install Surfaces

Choose one explicitly:

- composite GitHub package for the complete CLI, MCP launcher, and skill installer
- `aiwf-shell` for the CLI/operator surface
- `aiwf-mcp` for the primary coded host-extension surface
- `aiwf-skill` for the optional instruction-only bridge surface
- multiple split packages only when you need those surfaces together

### Composite GitHub Package

```bash
bun add -g github:dharmax/ai-workflow
ai-workflow --help
```

This is the recommended complete install. It does not depend on the split packages being published in your configured npm registry.

### Shell Only

```bash
bun add -g aiwf-shell
ai-workflow --help
```

Use this only when `aiwf-shell` is available in your configured npm registry.

### MCP Extension

```bash
bun add -g aiwf-mcp
aiwf-mcp
```

Use this when a host should call durable tools instead of relying on a skill alone.
Use this only when `aiwf-mcp` is available in your configured npm registry.

### Optional Skill Bridge

```bash
bun add -g aiwf-skill
aiwf-skill --project /abs/path/to/project --force
```

Use this only when `aiwf-skill` is available in your configured npm registry.

### Both Together

```bash
bun add -g aiwf-shell aiwf-mcp aiwf-skill
ai-workflow --help
aiwf-mcp
aiwf-skill --project /abs/path/to/project --force
```

## Troubleshooting And Failure Modes

### `ai-workflow sync` Reports Zero Indexed Files

- First check whether the project snapshot is unchanged and the DB already has state.
- Use `ai-workflow project summary --json` to confirm real DB contents before assuming the graph is empty.
- If both sync and summary are empty, investigate ignore rules, path resolution, or DB initialization.

### Shell Answers Feel Weak

- Run `ai-workflow doctor --refresh-models`
- Check `ai-workflow route shell-planning --json`
- Check `ai-workflow config get providers`
- Check whether the active ticket and `kanban.md` are truthful
- Re-run sync if the graph is stale

### Shell-Trust Benchmark Takes Too Long

- The benchmark is provider-bound, emits per-case progress to stderr, and stops at a 120-second suite deadline by default.
- Check `ai-workflow doctor` and `ai-workflow route shell-planning --json` before retrying.
- Use `--timeout-ms` to cap each shell case and `--total-timeout-ms` to override the suite deadline.
- An incomplete or timed-out benchmark exits nonzero and reports the remaining case IDs; do not report it as passing.

### Provider Looks Configured But Unavailable

- Run `ai-workflow doctor`
- Check host reachability for Ollama
- Check `apiKey`, `enabled`, quota values, and `paidAllowed` for remote providers
- For malformed config files, read the doctor warning and fix the JSON first

### Dogfood Or Audit Fails

- Re-run `bun run workflow:dogfood -- --profile full --json`
- Re-run `bun run workflow:audit -- --json`
- If full-profile dogfood stalls on provider-bound checks, run bootstrap-profile dogfood for the deterministic gate and report the full profile as incomplete.
- If dogfood is stale, regenerate it instead of editing the report manually
- If the manual HTML is stale, run the manual generator instead of editing HTML manually

## Manual Maintenance

- Canonical source: `docs/MANUAL.md`
- Generated output: `docs/manual.html`
- Generator script: `bun run generate-docs`
- Do not hand-edit `docs/manual.html`
- Keep the project README and full documentation current whenever public behavior, installation, commands, configuration, limitations, or planned capability changes.
- Update the dated capability-status section when a capability moves between planned, semi-working, and reliable.
- Managed projects receive the same documentation-freshness rule through the installed guidance templates and machine-readable audit baseline.
