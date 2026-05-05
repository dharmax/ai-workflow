# AI Workflow Skill

Use this skill when you want the shared `ai-workflow` toolkit to guide repo work instead of reconstructing workflow logic in the prompt.

Trigger this skill for:
- **Project Governance:** Managing Kanban, epics, stories, and tickets.
- **AI Orchestration:** Using the `shell` for multi-turn autonomous execution or `ask` for project-grounded questions.
- **Verification & Readiness:** Checking if a project is ready for beta, release, or handoff.
- **Specialized Refactoring:** Using codelets for Riot.js simplification, CSS refactoring, or dependency pruning.
- **Metrics & Efficiency:** Analyzing token usage, latency, and manual-time-saved stats.
- **Dynamic Extension:** Creating or modifying toolkit codelets on the fly.

## Resolve the CLI

Use the wrapper script:

```bash
export AI_WORKFLOW_HOME="${AI_WORKFLOW_HOME:-$HOME/.ai-workflow}"
export AIWF="$AI_WORKFLOW_HOME/skills/ai-workflow/scripts/ai_workflow.sh"
```

## Primary Surfaces

### 1. AI & Operator Control
- `ai-workflow shell [request...]`: Interactive or one-shot autonomous execution.
- `ai-workflow ask "question"`: Project-grounded Q&A (default to `--mode tool-dev` for safety).
- `ai-workflow onboard <brief>`: Kick off a new project or major feature from a brief.
- `ai-workflow ingest <file>`: Ingest external documentation or context into the workflow DB.

### 2. Project Management
- `ai-workflow sync`: Synchronize Kanban, epics, and code state.
- `ai-workflow kanban <move|next|archive>`: Manage ticket lifecycle.
- `ai-workflow project summary`: High-level project status and active work.
- `ai-workflow project ticket create|resolve|start`: Direct ticket manipulation.
- `ai-workflow project readiness --goal <type>`: Evaluate readiness blockers.

### 3. Verification & Maintenance
- `ai-workflow verify <workflow|guidelines>`: Ensure process compliance.
- `ai-workflow audit <architecture|workflow>`: Deep inspection of repo health.
- `ai-workflow doctor`: Check toolkit health and provider connectivity.
- `ai-workflow metrics`: View efficiency and usage reports.

### 4. Codelet System (Specialized Tools)
Run via `ai-workflow run <id> [args]`.
- `riot-simplify`: Simplify complex Riot.js components.
- `css-refactor`: Surgical CSS cleaning and nesting.
- `dependency-prune`: Identify and remove unused imports/deps.
- `import-cleanup`: Standardize and fix import paths.
- `api-extract`: Extract project API definitions for context.
- `test-heal`: Attempt to fix failing tests using AI.
- `context-pack`: Pack repository context for external LLM sessions.
- `forge codelet <name>`: Dynamically create a new specialized tool.

## Full Codelet Library
| ID | Summary |
|---|---|
| `api-extract` | Extract project API definitions. |
| `artifact-judge` | Judge the quality and completeness of a run artifact. |
| `audit` | Perform a workflow or architectural audit. |
| `codelet-observer` | Observe and report on codelet execution. |
| `component-extract` | Extract a UI component into a dedicated module. |
| `context-pack` | Pack repository context into a compact format. |
| `css-refactor` | Surgical CSS refactoring and cleanup. |
| `dependency-prune` | Identify and remove unused dependencies. |
| `docs-refresh` | Refresh project documentation from source. |
| `doctor` | Run toolkit health diagnostics. |
| `dogfood` | Run standard operator dogfooding scenarios. |
| `execute-ticket` | Execute a specific workflow ticket. |
| `execution-dry-run` | Dry-run a plan without mutating files. |
| `guideline-audit` | Audit the codebase against project guidelines. |
| `guidelines` | Manage and update project guidelines. |
| `import-cleanup` | Clean up and standardize imports. |
| `kanban-reconcile` | Reconcile the Kanban board with the workflow DB. |
| `kanban` | Manage the project Kanban board. |
| `programming-dogfood` | Run the multi-turn project-building dogfood harness. |
| `project-summary` | Generate a high-level project summary. |
| `refactor-ticket` | Perform a refactoring task driven by a ticket. |
| `review` | Run a code or architectural review. |
| `riot-simplify` | Simplify Riot.js components. |
| `route-diagnose` | Diagnose routing failures for tasks. |
| `route` | Explicitly route a task to a model/provider. |
| `sync` | Sync project state and projections. |
| `telegram-preview` | Generate a preview of a Telegram epic. |
| `test-heal` | Heally failing tests automatically. |
| `ticket-proving-run` | Run a proof-of-concept for a ticket. |
| `ticket` | Manage individual workflow tickets. |
| `tutorial` | Launch the interactive toolkit tutorial. |
| `verify` | Verify workflow or guideline compliance. |

## Guardrails
- Prefer `ask` before `shell`.
- Use `--mode tool-dev --evidence-root <project>` when operating from the toolkit repo against an external project.
- Do not run mutating actions without explicit user intent.
