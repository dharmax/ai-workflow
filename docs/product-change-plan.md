# Product Intent Change — AIWF Implementation Plan

Design authority: `docs/product-change.md`

This is an **AIWF development flow**. Track and execute it in AIWF itself.

## Ticket — AIWF-PRODUCT-CHANGE

### Objective

Extend the existing Causal Change Engine to Product Intent mutations without creating a second product model, CRUD implementation, or change subsystem.

### Read first

1. `AGENTS.md`
2. `docs/product-intent-graph.md`
3. `docs/product-intent-plan.md`
4. `docs/causal-change-engine.md`
5. `docs/product-change.md`
6. `src/change/types.ts`
7. `src/change/engine.ts`
8. `src/tools/change.ts`
9. `src/tools/product.ts`
10. `src/tools/tickets.ts`
11. `src/product/apply.ts`
12. `src/product/decompose.ts`
13. `src/product/coverage.ts`
14. `src/product/impact.ts`

Then use AIWF graph/symbol tools for narrow context.

### Step 1 — normalize one Product Intent mutation owner

Inspect the current product/ticket tools and `applyEpicStructure`.

Extract only the smallest deterministic helpers needed so existing tools and the Change Engine share:

- create/update/delete entity mechanics;
- canonical relation validation/link/unlink;
- lifecycle/delete validation.

Do not add Manager/Repository/Service layers.

Gate: no duplicate Product Intent rules are introduced.

### Step 2 — extend Causal Change preview/apply

Add:

```text
product_create
product_update
product_delete
product_link
product_unlink
```

Requirements:

- coherent requests may contain several mutations;
- preview has zero graph side effects;
- all mutations are validated before first apply write;
- exact IDs only; ambiguity blocks;
- delete preview exposes dependents;
- stale fingerprint rejects before mutation;
- verification uses existing Coverage/Impact as appropriate;
- no persisted plan.

Keep existing code-change behavior unchanged.

### Step 3 — converge existing write paths

Route accepted Epic decomposition/application through the same mutation owner where practical.

Preserve current public product tools and MCP/CLI behavior unless simplification clearly removes duplication without compatibility damage.

### Deterministic tests

Cover:

- create/update Epic, Feature, UserStory and Ticket;
- link/unlink every allowed Product Intent relation;
- invalid relation rejection;
- lifecycle retirement/deprecation;
- explicit physical delete validation and dependents;
- multi-mutation preview;
- zero mutation during preview;
- stale preview rejection;
- no partial mutation after prevalidation failure;
- Coverage/Impact after apply;
- existing Epic decomposition/application;
- all existing Causal Change code-change tests.

### Acceptance gate

Run:

```bash
bun run typecheck
bun test
```

Then:

1. inspect full diff;
2. method-by-method am-i-allowed/KISS audit;
3. manually exercise one Product Intent preview/apply on a disposable/test AIWF project;
4. verify existing code-change preview/apply still works.

Reject the implementation if it introduces:

- a second Product Intent model;
- a second change engine;
- duplicate lifecycle/relation rules;
- generic mutation-framework abstractions;
- LLM interpretation inside deterministic mutation code;
- Semantika-specific mechanics leaking into public Product Intent contracts.

### Completion

When genuinely green:

- mark `AIWF-PRODUCT-CHANGE` done in AIWF;
- sync AIWF projections;
- update AIWF handoff/status with verified facts;
- publish/push the AIWF package version/commit required by consumers.

Only then is the cross-repo capability gate satisfied for `aiwf-digest`.

## Explicit non-scope

Do not implement:

- digest;
- Consuela integration;
- semantic-registry/skill-manager adoption;
- new capability-discovery architecture;
- natural-language `enhance/simplify` semantics.

Those have their own project/design flows.
