# Phase 4 — Product Integration

## Objective

Expose digest consistently through CLI, REPL, MCP and agent skill surfaces without duplicating business logic.

## Canonical operation

All surfaces call the same digest service.

Do not put reconciliation logic in CLI handlers, MCP adapters or prompts.

## CLI

Minimum:

```bash
aiwf digest <path>
aiwf digest <path> --apply
```

Default should be preview unless later product evidence strongly favors direct apply.

Useful output:

- files scanned / reused / changed;
- candidate count;
- concise creates/updates/relations/retires;
- conflicts/unresolved code targets;
- whether apply occurred.

## REPL

Add deterministic routing for explicit `digest ...` syntax.

Natural-language requests such as “digest the refactor design folder” may invoke the same tool through the actor; they do not get a separate implementation.

## MCP

Expose one tool such as `digest_project_material` with:

- path
- optional scope
- apply boolean

Return structured ChangeSet/result data rather than prose-only output.

## Skill

Update the ai-workflow skill so coding agents know when to use digest:

- when handed a planning/design folder;
- before implementing a substantial pre-written refactor plan;
- when planning artifacts changed and project work must be reconciled.

Agents should preview before apply unless the user explicitly requests mutation.

## Gate

The same fixture produces the same ChangeSet through direct service, CLI and MCP.
