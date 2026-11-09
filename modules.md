# Architecture & Modules

## Module Health

| Module | Completeness Target | Symbols | Outstanding Bugs 🔴 | Source BUG Notes | Linked Unfinished Tickets |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `root` | project default | 342 | 0 | 0 | None |
| `src/graph` | project default | 1376 | 0 | 0 | TKT-EXT-SURFACE-10, TKT-LIFECYCLE-STATE, TKT-GRAPH-ISSUE-6, TKT-LSP-MOVE-RECOVERY, TKT-DEBUGGER-ISOLATION, TKT-PROPORTIONAL-VERIFICATION, TKT-FILE-NODE-EVENTS |
| `src/tools` | project default | 3321 | 0 | 0 | AIWF-TICKET-RESOLUTION-FIRST-PROOF, TKT-EXT-SURFACE-10, TKT-PUBLIC-EDIT-DIRTY-AUTH, TKT-LIFECYCLE-STATE, TKT-GRAPH-ISSUE-6, TKT-DEBUGGER-ISOLATION |
| `src/actor` | project default | 0 | 0 | 0 | TKT-EXT-SURFACE-07, TKT-STRUCTURAL-RELOCATION-P1 |
| `src/mcp` | project default | 95 | 0 | 0 | TKT-LIFECYCLE-STATE |
| `src/shell` | project default | 587 | 0 | 0 | TKT-LIFECYCLE-STATE |
| `src/cli` | project default | 479 | 0 | 0 | TKT-EXT-SURFACE-10 |
| `src/index` | project default | 6 | 0 | 0 | None |
| `src/config` | project default | 0 | 0 | 0 | None |
| `src/doctor` | project default | 0 | 0 | 0 | None |
| `src/setup` | project default | 305 | 0 | 0 | None |
| `tests` | project default | 17540 | 0 | 0 | AIWF-TICKET-RESOLUTION-FIRST-PROOF, TKT-EXT-SURFACE-07, TKT-EXT-SURFACE-10, TKT-9Z2Z, TKT-REVIEWER-RELIABILITY, TKT-PUBLIC-EDIT-DIRTY-AUTH, TKT-CORE-LIFECYCLE-01, TKT-LIFECYCLE-STATE, TKT-SYNTHESIS-ELIGIBILITY, TKT-GRAPH-ISSUE-6, TKT-LSP-OPERATION-SCOPE, TKT-LSP-MOVE-RECOVERY, TKT-SEMANTIC-ARCH-S2, TKT-DEBUGGER-ISOLATION, TKT-PROPORTIONAL-VERIFICATION, TKT-XQDR, TKT-PREPARE-STORY-TEST, TKT-FILE-NODE-EVENTS |
| `skills` | project default | 13 | 0 | 0 | None |
| `src/terminal` | project default | 0 | 0 | 0 | None |
| `@external/@dharmax/block-patcher` | project default | 21 | 0 | 0 | None |
| `@external/@dharmax/codebase-parser` | project default | 49 | 0 | 0 | None |
| `@external/@dharmax/context-manager` | project default | 163 | 0 | 0 | None |
| `@external/@dharmax/llm-utils` | project default | 755 | 0 | 0 | None |
| `@external/@dharmax/pubsub` | project default | 22 | 0 | 0 | None |
| `@external/@dharmax/semantika` | project default | 265 | 0 | 0 | None |
| `@external/@dharmax/text-compiler` | project default | 1 | 0 | 0 | None |
| `@external/@dharmax/shell-ui` | project default | 390 | 0 | 0 | None |
| `src/kb` | project default | 124 | 0 | 0 | None |
| `docs` | project default | 1182 | 0 | 0 | None |
| `src/product` | project default | 2442 | 0 | 0 | TKT-EXT-SURFACE-10, TKT-PUBLIC-EDIT-DIRTY-AUTH, TKT-CORE-LIFECYCLE-01, TKT-LIFECYCLE-STATE |
| `src/change` | project default | 1156 | 0 | 0 | TKT-EXT-SURFACE-10, TKT-GRAPH-ISSUE-6, TKT-LSP-MOVE-RECOVERY |
| `src/typescript-runtime` | project default | 200 | 0 | 0 | None |
| `src/artifact-policy` | project default | 123 | 0 | 0 | None |
| `src/aspects` | project default | 43 | 0 | 0 | None |
| `src/ticket-operation-types` | project default | 450 | 0 | 0 | AIWF-TICKET-RESOLUTION-FIRST-PROOF, TKT-CORE-LIFECYCLE-01, TKT-LIFECYCLE-STATE, TKT-PROPORTIONAL-VERIFICATION |
| `src/artifact-critic` | project default | 0 | 0 | 0 | None |
| `src/performance-metrics` | project default | 410 | 0 | 0 | None |
| `src/artifact-command` | project default | 582 | 0 | 0 | None |
| `src/model-runtime` | project default | 0 | 0 | 0 | None |
| `src/version` | project default | 25 | 0 | 0 | None |
| `scripts` | project default | 512 | 0 | 0 | TKT-GRAPH-ISSUE-6 |
| `src/entity-view` | project default | 0 | 0 | 0 | None |
| `@external/@dharmax/semantic-registry` | project default | 32 | 0 | 0 | None |
| `src/verification-context` | project default | 0 | 0 | 0 | None |
| `src/shell-trace` | project default | 32 | 0 | 0 | None |
| `src/client-guidance` | project default | 4 | 0 | 0 | None |
| `@external/@dharmax/skill-manager` | project default | 164 | 0 | 0 | None |
| `src/synthesis` | project default | 0 | 0 | 0 | None |
| `plans` | project default | 274 | 0 | 0 | TKT-SEMANTIC-ARCH-S2 |
| `src/config-command` | project default | 36 | 0 | 0 | None |
| `src/setup-command` | project default | 18 | 0 | 0 | None |
| `src/ticket-command` | project default | 64 | 0 | 0 | TKT-LIFECYCLE-STATE |
| `src/model-command` | project default | 49 | 0 | 0 | TKT-XQDR |
| `src/actor-budget-policy` | project default | 0 | 0 | 0 | None |
| `src/ticket` | project default | 1146 | 0 | 0 | TKT-ACCEPTANCE-CONTEXT-LIMIT, TKT-REVIEWER-RELIABILITY, TKT-PUBLIC-EDIT-DIRTY-AUTH, TKT-CORE-LIFECYCLE-01, TKT-LIFECYCLE-STATE, TKT-SYNTHESIS-ELIGIBILITY, TKT-GRAPH-ISSUE-6, TKT-LSP-OPERATION-SCOPE, TKT-PROPORTIONAL-VERIFICATION, TKT-XQDR, TKT-PREPARE-STORY-TEST |
| `src/rules` | project default | 363 | 0 | 0 | None |
| `src/rule-command` | project default | 12 | 0 | 0 | None |
| `node_modules` | project default | 79 | 0 | 0 | None |
| `src/workspace` | project default | 250 | 0 | 0 | TKT-EXT-SURFACE-10 |
| `src/paid-inference` | project default | 54 | 0 | 0 | None |
| `src/helpers` | project default | 568 | 0 | 0 | TKT-EXT-SURFACE-07, TKT-SYNTHESIS-ELIGIBILITY, TKT-STRUCTURAL-RELOCATION-P1, TKT-SEMANTIC-ARCH-S1 |
| `src/ui` | project default | 690 | 0 | 0 | TKT-LIFECYCLE-STATE, TKT-STRUCTURAL-RELOCATION-P1 |
| `src/services` | project default | 1618 | 0 | 0 | TKT-EXT-SURFACE-10, TKT-9Z2Z, TKT-REVIEWER-RELIABILITY, TKT-CORE-LIFECYCLE-01, TKT-LIFECYCLE-STATE, TKT-GRAPH-ISSUE-6, TKT-SEMANTIC-ARCH-S1, TKT-PROPORTIONAL-VERIFICATION, TKT-TIMEOUT-HANDLER-REFACTOR |
| `src/model` | project default | 755 | 0 | 0 | AIWF-TICKET-RESOLUTION-FIRST-PROOF, TKT-LIFECYCLE-STATE, TKT-GRAPH-ISSUE-6, TKT-SEMANTIC-ARCH-S2, TKT-FILE-NODE-EVENTS |
| `src/public-json` | project default | 27 | 0 | 0 | None |
| `src/command-presentation` | project default | 60 | 0 | 0 | None |
| `.ollamassist` | project default | 5 | 0 | 0 | None |

## Dependency Diagram

```mermaid
graph TD
```
