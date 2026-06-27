---
name: "ai-workflow"
description: "Use when the user wants project status, ticket context, graph-backed code review/debug/refactor, code-change planning, beta or release readiness, shipping blockers, current work, or token-efficient guarded aiwf use against a repo. Prefer this for requests like 'is this ready for beta?', 'what blockers remain?', 'review this with project context', 'plan this code change', and 'use the workflow tools safely'."
---

# AI Workflow Skill

Use this skill as a thin instruction layer over the coded `ai-workflow` surfaces. The real capability lives in `aiwf-shell`, `aiwf-mcp`, and `aiwf-common-core`, not in the skill text itself.

Trigger this skill for:
- game beta release preparation
- project or game status checks
- beta, release, or handoff readiness questions
- blocker discovery and blocker-driven execution planning
- ticket context extraction before implementation
- project code changes that need graph-backed guardrails
- graph-backed code review, debugging, or refactoring
- token-efficient aiwf use before broad file reads or model-backed planning
- guarded use of the workflow toolkit against a real repo
- requests to use workflow tools safely or with low risk

This skill is designed for low-risk operation:
- default to read-only questions through `ask`
- use `--mode tool-dev --evidence-root <project>` when operating from the toolkit repo against an external project
- only use mutating shell flows when the user explicitly asks for them
- treat readiness, status, and current-work checks as safe by default

## Resolve The Surface

Prefer the MCP surface when the host can use it. Use the local wrapper only when the host needs a shell-facing bridge.

Default context order: aiwf MCP/DB graph, targeted `ai-workflow` CLI extraction, host-native compressed search/read tools such as `lean-ctx` when available, then broad raw file reads only when the narrower surfaces cannot answer.

| Situation | First aiwf surface | Fallback / constraint |
| --- | --- | --- |
| Capability or status check | MCP `plugin_status`, `project_summary`, or capability catalog | CLI `ai-workflow project summary --json`; report unavailable tools instead of guessing. |
| Unknown target, file, feature, or symbol | MCP `search_project` and `knowledge_graph` | `ai-workflow project search`; only then use host search/read tools. |
| Ticket work | MCP `extract_ticket` plus `extract_guidelines` | CLI `ai-workflow extract ticket <id>` and `ai-workflow extract guidelines ...`. |
| Code change plan | MCP `plan_coding_workflow` with relevant files/artifacts | Edit files directly using returned guardrails unless a mutating aiwf tool is intentionally selected. |
| Review, debug, or refactor | MCP `review_code`, debug/refactor tools, route diagnostics, and extracted guardrails | Run targeted tests and workflow audit gates before closure. |
| Model spend | Route before spend: use deterministic DB/MCP/CLI answers before provider-backed shell planning | Prefer the cheapest capable model route; widen only when risk justifies it and report degraded routes. |
| Mutation | Explicit gated path only: user intent, one active `In Progress` ticket when required, `apply: true`, and `allowMutation: true` for mutating codelets | Never treat narrative guidance or dry-run output as permission to mutate. |

## Resolve the CLI

Use the wrapper script:

```bash
export AI_WORKFLOW_HOME="${AI_WORKFLOW_HOME:-$HOME/.ai-workflow}"
export AIWF="$AI_WORKFLOW_HOME/skills/ai-workflow/scripts/ai_workflow.sh"
```

The wrapper will use the toolkit root recorded at install time first. If that is unavailable, it can fall back to `ai-workflow` from `PATH`.

## Safe default workflow

For a real project:

```bash
"$AIWF" ask --mode tool-dev --evidence-root /abs/path/to/project "what's the project status? how ready is it for beta test?"
```

Readiness only:

```bash
"$AIWF" ask --mode tool-dev --evidence-root /abs/path/to/project "Is this project ready for beta testing?"
```

Current work:

```bash
"$AIWF" ask --mode tool-dev --evidence-root /abs/path/to/project "What are we working on right now?"
```

## Mutating workflow

Only use these when the user clearly wants execution:

```bash
"$AIWF" shell --no-ai
```

Then ask concrete follow-ups such as:

```text
is this project ready for beta testing?
can you resolve those blockers?
fix BUG-OVERLAY-01
```

## Guardrails

- Prefer `ask` before `shell`.
- Prefer `--mode tool-dev --evidence-root <project>` when the toolkit lives outside the target repo.
- Do not invent readiness logic in the prompt when the toolkit can answer it directly.
- Do not run mutating actions without explicit user intent.
- Treat mutating aiwf/codelet flows as gated: require explicit user intent, one active `In Progress` ticket when required, `apply: true` where applicable, and codelet mutation flags such as `allowMutation: true`.
