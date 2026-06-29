---
name: "ai-workflow"
description: "Use when the user wants project status, ticket context, graph-backed code review/debug/refactor, code-change planning, beta or release readiness, shipping blockers, current work, or token-efficient guarded aiwf use against a repo. Prefer this for requests like 'is this ready for beta?', 'what blockers remain?', 'review this with project context', 'plan this code change', and 'use the workflow tools safely'."
---

# AI Workflow Skill

Use this skill as a mandatory operating protocol over the coded `ai-workflow` surfaces. The skill is instruction-only: it improves host behavior, but enforcement lives in `aiwf-mcp`, `aiwf-shell`, workflow audit rules, and coded mutation guards.

Trigger this skill for:
- project status, current-work, readiness, handoff, or blocker checks
- ticket context extraction, ticket planning, and ticket lifecycle work
- graph-backed code search, dependency discovery, code review, debugging, or refactoring
- code-change planning that needs workflow guardrails before file edits
- artifact, report, or evidence validation
- codelet discovery, inspection, or execution
- token-efficient aiwf use before broad file reads or model-backed planning
- guarded use of the workflow toolkit against a real repo
- requests to use workflow tools safely or with low risk

This skill is designed for low-risk operation:
- start with MCP `plugin_status` or `capability_catalog` when available
- default to read-only MCP/CLI queries before shell execution
- use `--mode tool-dev --evidence-root <project>` when operating from the toolkit repo against an external project
- only use mutating shell, ticket, or codelet flows when the user explicitly asks for execution
- report unavailable MCP or CLI tools instead of silently widening to raw host search

## Resolve The Surface

Prefer the MCP surface when the host can use it. Use the local wrapper only when the host needs a shell-facing bridge.

Default context order: aiwf MCP/DB graph, targeted `ai-workflow` CLI extraction, host-native compressed search/read tools such as `lean-ctx` when available, then broad raw file reads only when the narrower surfaces cannot answer.

| Situation | First aiwf surface | Fallback / constraint |
| --- | --- | --- |
| Capability or status check | MCP `plugin_status`, `capability_catalog`, `project_summary`, or `project_status` | CLI `ai-workflow project summary --json`; report unavailable tools instead of guessing. |
| Unknown target, file, feature, or symbol | MCP `search_project`, knowledge_graph, and `find_dependencies` | `ai-workflow project search`; only then use host search/read tools. |
| Ticket work | MCP `list_tickets`, `extract_ticket`, `extract_guidelines`, and `plan_work_tickets` | CLI `ai-workflow extract ticket <id>` and `ai-workflow extract guidelines ...`; mutating ticket lifecycle calls require explicit intent. |
| Code change plan | MCP `plan_coding_workflow` or `plan_code_change` with relevant files/artifacts | Edit files directly using returned guardrails unless a mutating aiwf tool is intentionally selected. |
| Review, debug, or refactor | MCP `analyze_code`, `review_code`, `debug_issue`, `refactor_code`, route diagnostics, and extracted guardrails | Run targeted tests and workflow audit gates before closure. |
| Evidence or reports | MCP `search_artifacts` and `judge_artifacts` | Use local artifact reads only after indexed evidence cannot answer. |
| Codelets | MCP `list_codelets`, `search_codelets`, `get_codelet`, and gated `run_codelet` | Do not execute mutating codelets unless `allowMutation: true` and required apply flags are explicit. |
| Model spend | Route before spend: use deterministic DB/MCP/CLI answers before provider-backed shell planning | Prefer the cheapest capable model route; widen only when risk justifies it and report degraded routes. |
| Mutation | Explicit gated path only: user intent, one active `In Progress` ticket when required, `apply: true`, `allowMutation: true`, and coded tools such as `execute_ticket` or `sweep_bugs` | Never treat narrative guidance or dry-run output as permission to mutate. |

## Required MCP-First Loop

1. Call `plugin_status` or `capability_catalog` first when MCP is available.
2. Use `project_summary` or `project_status` for project state.
3. Use `search_project`, knowledge_graph, and `find_dependencies` before raw host search/read.
4. Use `list_tickets`, `extract_ticket`, `extract_guidelines`, and `plan_work_tickets` for ticket work.
5. Use `plan_coding_workflow`, `plan_code_change`, `analyze_code`, `review_code`, `debug_issue`, and `refactor_code` for code work.
6. Use `route_task` before model-backed planning or broad shell orchestration when the route is unclear.
7. Use `search_artifacts` and `judge_artifacts` for evidence, reports, and readiness claims.
8. Use `list_codelets`, `search_codelets`, `get_codelet`, and gated `run_codelet` for codelet work.
9. Use `execute_ticket`, `sweep_bugs`, ticket lifecycle tools, `apply: true`, and `allowMutation: true` only through explicit mutation gates.
10. If an MCP or targeted CLI surface is unavailable, say which surface is unavailable before falling back.

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
"$AIWF" ask --mode tool-dev --evidence-root /abs/path/to/project "use the workflow surfaces to summarize project status, active tickets, blockers, evidence, and next actions"
```

Readiness only:

```bash
"$AIWF" ask --mode tool-dev --evidence-root /abs/path/to/project "is this project ready for release or handoff? include evidence and blockers"
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

- Prefer MCP before CLI, and prefer `ask` before `shell`.
- Prefer `--mode tool-dev --evidence-root <project>` when the toolkit lives outside the target repo.
- Do not invent readiness logic in the prompt when the toolkit can answer it directly.
- Do not run mutating actions without explicit user intent.
- Treat mutating aiwf/codelet flows as gated: require explicit user intent, one active `In Progress` ticket when required, `apply: true` where applicable, and codelet mutation flags such as `allowMutation: true`.
