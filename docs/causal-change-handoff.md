# Causal Change Engine — Agy / AIWF Handoff

Use this as the implementation prompt.

---

You are implementing the next ai-workflow phase on branch:

```text
feat/causal-change-engine
```

The architecture and plan are already decided. Do **not** redesign them casually.

Read first, in this order:

1. `AGENTS.md`
2. `docs/causal-change-engine.md`
3. `docs/causal-change-plan.md`
4. `src/setup.ts`
5. `src/doctor.ts`
6. `src/graph/indexer.ts`
7. `src/product/impact.ts`
8. `src/tools/product.ts`
9. `src/tools/tickets.ts`
10. `src/tools/bucket-router.ts`
11. `src/tools/index.ts`
12. `src/shell.ts`
13. `package.json`

Then use aiwf graph/symbol tools for narrow additional context. Do not rediscover unrelated scheduler/compiler/knowledgebase architecture.

## Mission

Implement exactly the current scope:

```text
AIWF-CHANGE-FOUNDATION
        ↓ HARD GATE
AIWF-NATIVE-CODE-CHANGE
```

Do **not** implement `AIWF-PRODUCT-CHANGE` yet. It is documented only to constrain the design so today's code does not need to be rewritten tomorrow.

## AIWF workflow

Before mutation:

1. run `aiwf status`.
2. inspect `master...feat/causal-change-engine`.
3. ensure tickets `AIWF-CHANGE-FOUNDATION` and `AIWF-NATIVE-CODE-CHANGE` exist; create them if absent.
4. claim `AIWF-CHANGE-FOUNDATION`.
5. work only Ticket 1 until its full gate is green.

When Ticket 1 is genuinely green:

1. mark it Done and release it.
2. claim `AIWF-NATIVE-CODE-CHANGE`.
3. implement Ticket 2.
4. run its complete acceptance gate.

If any documented stop condition occurs, stop and report it. Do not invent replacement architecture to force progress.

## Non-negotiable architecture

- TypeScript 7 native LSP owns exact JS/TS semantics and native edits.
- Semantika owns persistent causal/product knowledge.
- `codebase-parser` remains cheap indexing, not semantic correctness.
- `block-patcher` is not the semantic refactoring engine.
- aiwf owns orchestration, Product Impact, preview/fingerprint, graph continuity, safe application, and verification.
- no second exact code graph.
- no home-grown rename/reference/import rewrite engine.
- no custom LSP framing; use a mature minimal JSON-RPC library.
- no generic language-backend framework.
- no persisted ChangePlan.
- no TS6 fallback.
- no automatic git commits.
- no unsupported extract/inline/move-symbol implementation merely to match old IDE features.

## TypeScript setup requirement

TypeScript 7 is now runtime infrastructure:

- move `typescript@^7` to runtime dependencies.
- `aiwf setup` must ensure a compatible host/user TypeScript 7 is usable, provisioning it at Bun user/global scope if required.
- never alter a project's pinned TypeScript version as setup side effect.
- setup, doctor, and LSP client must share one resolver.
- `aiwf doctor` reports selected executable/version/LSP readiness.
- runtime prefers compatible project TS7 → aiwf packaged TS7 → compatible host TS7.

Verify actual TS7 LSP capabilities at runtime. The current native server is known to expose exact rename, references/definitions, file-rename edits, call hierarchy, diagnostics and bounded source/code actions, but **capability-probe rather than assuming richer refactors**.

## Quality bar

This subsystem should be small.

Every class/function should look proportionate to its responsibility. If an ordinary operation requires a complex hierarchy, abstraction registry, or broad framework, treat that as a design smell and simplify before proceeding.

Prefer mature existing solutions over new machinery. Before implementing any low-level semantic/refactoring mechanism, verify TypeScript itself does not already provide it.

## Required gates

Ticket 1:

```bash
bun run typecheck
bun test
```

Then method-by-method KISS review.

Only then Ticket 2.

Ticket 2:

```bash
bun run typecheck
bun test
```

Then:

- inspect full diff.
- method-by-method KISS review.
- run at least two real native changes on ai-workflow itself in a disposable/resettable worktree.
- verify no leaked LSP processes.
- verify no unrelated formatting churn.

Never report a test/gate as passing unless actually executed.

## Final report

Keep it concise, factual, and under roughly 25 lines:

- commits / files changed
- TS7 executable and version actually used
- observed LSP capabilities relied upon
- Ticket 1 gate
- Ticket 2 gate
- live acceptance cases
- unsupported native refactors actually observed
- deviations from the design, if any
- exact remaining risk

Also update the project handoff / aiwf tickets with verified facts only.
