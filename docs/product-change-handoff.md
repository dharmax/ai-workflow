# AIWF-PRODUCT-CHANGE handoff

Status: implemented and verified in `ai-workflow` on 2026-10-02.

The existing `preview_change` and `apply_change` tools now accept one `product_change` request with `product_create`, `product_update`, `product_delete`, `product_link`, and `product_unlink` mutations. Product rules live in `src/product/mutation.ts` and are shared by the deterministic product tools, ticket create/state tools, and Epic structure application. No semantic mutation verbs or Feature/UserStory priority fields were added.

Acceptance evidence:

- `bun run typecheck`: passed with zero errors.
- `bun test`: 117 passed, 0 failed across 20 files. The complete TS7/TS6 code-change suites passed outside the sandbox; their language-server subprocesses hung inside it.
- Disposable AIWF project, public `preview_change` and `apply_change`: preview reported unblocked and left the graph empty; apply verified and persisted an Epic targeting a Feature.
- Existing code-change preview/apply: 13 TS7/TS6 engine and bridge tests passed, including rename, file rename, extraction, movement, inline refactor, and stale fingerprint rejection.
- Product tests cover all canonical relation shapes, create/update across four entity types, lifecycle status validation, explicit unlink before delete, dependents, stale fingerprints, zero-write preview, public tool schema, Coverage, Impact, and existing Epic decomposition.

The product preview fingerprint includes the current touched entity fields and incoming/outgoing relations. A stale preview is rejected before a Product Intent write. Validation of the entire ordered mutation set runs before the first write. Storage failures after that point retain the existing store behavior; no general rollback framework was introduced.

This repository's package is private (`package.json` has `private: true`), so there is no package publish step. The repository commit is the consumer integration artifact.
