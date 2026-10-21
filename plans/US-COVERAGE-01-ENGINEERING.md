# Cycle 1 — Engineering and external interface Stories

**Migration note (2026-10-21):** Candidate US/source inventory for [the revised US-led test digestion plan](US-TEST-CONSOLIDATION-PLAN.md). The earlier cycle labels and file-centric retirement proposals are historical; do **not** treat them as the final accepted Story catalog, test-file organization, numerical reduction goal or instructions to discard real non-pristine/sub-flow/bug cases.
Status: **proposed for developer review**. These describe observable acceptance, not automatic approval.
Baseline: `USs-and-consolidation` from P0 repair `dec2dab`.

## Rules for all cycles
1. Accepted Story (actor, intent, initial state, action, observable result, adverse cases) → reviewed public-interface test specification → identify missing or expected-red behavior → derive/reconcile Todo Tickets from the failed obligations → implement → green → independent verification.
2. A test that already proves an obligation is reused. Do not manufacture red history or one Ticket per assertion. Technical invariants stay direct technical tests; do not invent product Stories.
3. A removal needs an oracle-to-oracle coverage map, preservation of negative safety counterexamples, and a green targeted/full run. Candidate marks are **not authorization to delete**.
4. Each batch is reviewed for meaningful missing paths, false-green internal mocks, fixture lifecycle, and cross-suite test ownership before the next batch.

## US-E01 — Investigate an undeclared sibling without modifying it
**Actor/intent:** External coding agent needs precise code evidence across neighboring repositories.
**Initial:** Installed host with one configured project, an unindexed sibling, and only a read grant there.
**Action:** Discover, find, outline and slice exact sibling symbols, then return to the default project.
**Observable:** Correct scoped evidence from both projects, exact source; no persistent sibling DB/other write, no leaked cross-project graph state.
**Adverse:** Unknown root, stale root, invalid path and inaccessible sibling are explicit failures, not fallback to the host root.
**Existing executable oracles:** `tests/mcp-client-investigation.test.ts` (five), `tests/ast-freshness-and-search.test.ts` (exact/regex/index behavior), `tests/primitive-truth.test.ts` (long slice).
**Additional needed:** Confirm read-only sibling evidence works after restart and no sibling state directory is created. No product Ticket until the test demonstrates a gap.

**US-E01 migration checkpoint (2026-10-21):** All sibling-specific and installed stdio authority/restart cases now reside in `tests/us/e01-investigate-sibling.test.ts`. The complete original-case accounting, including the two *unrelated generic MCP* cases retained for US-E05, is in [US-E01-DIGEST.md](US-E01-DIGEST.md). This changes test ownership only; its new execution is pending. The older bullet above is the historical inventory, not a second US-E01 test owner.

## US-E02 — Perform a leased, host-authorized, cohesive source change
**Actor/intent:** External agent resolves reviewed engineering work without bypassing governance.
**Initial:** Installed MCP host grants project-write to its configured project; reviewed Ticket, owning lease, public Story tests where applicable, multiple existing/planned source targets and unrelated dirty work.
**Action:** Discover typed tools; preview and apply one replace/create/delete/rename change; run actual verification; release claim.
**Observable:** Changes match exact fingerprint, source scope and attributable effects; no unrelated writes, truthful Ticket lifecycle. Failure cannot leave an earlier file silently changed.
**Adverse:** Read-only, wrong project, self-grant, foreign lease, incomplete test-first state, stale source/authorization, dirty target, invalid later operation, Product self-approval, mid-commit failure.
**Existing executable oracles:** `tests/p0-engineering.test.ts` (installed host); `tests/change-engine.test.ts`, `tests/change-bridge.test.ts`, `tests/doctrine-scope.test.ts`, `tests/pc1a-safety.test.ts`.
**Missing:** Host Story still does not establish an accepted Story test expected-red → green → independent Ticket verification. A separate *injected mid-commit failure* regression is needed; stale-preview refusal is not equivalent. Keep these as uncovered, not silently green.

## US-E03 — Use one discoverable CLI/Shell/typed-MCP grammar
**Actor/intent:** Human or coding agent invokes the same domain operation by its preferred surface.
**Initial:** Initialized project and canonical command tree.
**Action:** Invoke `source:change PREVIEW/APPLY` or `source change PREVIEW/APPLY`, Shell equivalent, or typed MCP request.
**Observable:** Identical normalized intent, validation, scope and outcomes; help precedes side effects and does not require a DB.
**Adverse:** Unknown/malformed names, conflicting flags, old syntax and unreviewed mutation refuse without speculative Actor fallback.
**Existing executable oracles:** `tests/artifact-command.test.ts`, `tests/product-operability-commands.test.ts`, `tests/p0-engineering.test.ts` canonical syntax, `tests/cli-help.test.ts`, `tests/shell.test.ts`.
**Uncovered:** An installed-host roundtrip that proves both CLI spellings execute the same authorized edit, not parser equivalence alone.

## US-E04 — Edit exact source without compromising neighboring work
**Actor/intent:** Developer selects exact text/symbol/refactor target and preserves source relationships.
**Initial:** TS7/TS6 toolchain, indexed project with callers and a reviewed edit.
**Action:** Inspect exact source/references, preview semantic rename/refactor or bounded literal change, apply and reindex.
**Observable:** No preview side effects; exact imports/callers and durable anchor migrations; unchanged external dependencies.
**Adverse:** Ambiguous target, unsupported action, stale document, symlink escape, deleted source, wrong/partial toolchain, error during commit.
**Existing executable oracles:** `tests/change-engine.test.ts`, `tests/change-bridge.test.ts`, `tests/change-foundation.test.ts`, `tests/workspace-text.test.ts`, `tests/primitive-truth.test.ts`, `tests/ts6-refactor-sync.test.ts`.
**Technical-only support:** `tests/lsp-shutdown.test.ts`, `tests/scaffold.test.ts`, `tests/debugger.test.ts` verify primitives; do not duplicate them as pseudo-Stories.

## US-E05 — Install and discover an honest MCP engineering surface
**Actor/intent:** Host installs AIWF and agent discovers only supported typed tools.
**Initial:** Host config may have existing approval settings, absent hosts, malformed config, or previous install.
**Action:** Inspect/setup, install and list tools, connect through actual MCP transport, repeat/restart.
**Observable:** Reproducible schema, correct host-owned authority, preserved settings, no unexpected writes, truthful errors and no raw writer exposure.
**Adverse:** Invalid schema/host, conflicting config, stale review, read-only mutation, reused setup.
**Existing executable oracles:** `tests/setup.test.ts`, `tests/setup-truth.test.ts`, `tests/mcp.test.ts`, `tests/product-operability-parity.test.ts`, `tests/p0-engineering.test.ts`.

## US-E06 — Complete an interactive engineering command without losing intent
**Actor/intent:** Developer works in Shell, including guided missing inputs and cancellation.
**Initial:** Interactive or noninteractive prompt, current graph and optionally a model route.
**Action:** Execute complete commands directly, fill missing values, inspect traces and use exact entity view.
**Observable:** Same durable operations as CLI, no unnecessary LLM or unsolicited side effects, correct escape/cancel and trace status.
**Adverse:** Missing input, abort, malformed explicit command, failed tool/model and restart.
**Existing executable oracles:** `tests/shell.test.ts`, `tests/shell-daily.test.ts`, `tests/shell-config-setup.test.ts`, `tests/shell-trace.test.ts`.

## Cycle 1 overlap audit — **candidate only**
| Candidate | Existing stronger owner | Required equivalence before removing |
|---|---|---|
| `tests/cli-help.test.ts` — **retain after double-check** | Its `next/init/resolve/claim` help/no-DB coverage is absent from the Product namespaced help cases | Different command families; not a duplicate |
| `tests/mcp.test.ts`: generic list assertion | `product-operability-parity.test.ts` real stdio; `p0-engineering.test.ts` installed host | Retain schema export, invocation and exact public tool-set evidence |
| `tests/change-engine.test.ts`: generic registry boundary test | P0 installed-host acceptance | Preserve distinct raw engine behavior (do not remove engine-specific assertions) |
| `tests/workspace-text.test.ts`: 3 data variants | One table-driven parameterized contract | Keep CRLF/Unicode/JSON distinction; consolidate only fixture/setup |
| `tests/setup.test.ts`: repeated config/doctor checks | `config.test.ts`, `setup-truth.test.ts` | Preserve true fresh installation and CLI-process smoke |

### Double-check
No test marked for immediate removal: these candidates have partially overlapping names but not yet proven identical observables. Distinct adversarial paths remain mandatory. A single 30-second mega-Story is a poor diagnostic owner: isolate setup, source, authorization and completion observations without fabricating more lower-level assertions.

### Cycle 6 audit resolution
`mcp.test.ts` used private SDK `_requestHandlers` (a handler mock rather than an external client). Its unique advertising, invocation, refusal and schema-export assertions have moved to `mcp-client-investigation.test.ts` using the actual SDK Client/transport. The installed stdio P0 and parity Stories remain separate. Four common CLI help commands share a single fixture/test while retaining every public binary invocation. Await Bun verification; no other candidates authorized for deletion.
