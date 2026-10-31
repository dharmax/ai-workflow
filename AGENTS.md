# Repository Guidelines

**Active delivery checkpoint:** [AIWF v1 — corrected priorities](plans/AIWF-V1-ACTIVE-CHECKPOINT.md). Read its actual current scope/acceptance before planning or execution. Do not advance stages or claim Gate 5 accepted from documentation alone.

## AI coding agent entry contract

1. **Load bounded context.** Start with the [definitions index](docs/definitions/README.md); read only definitions relevant to this task. For product work, inspect the actual [Product charter](docs/definitions/product.md) and effective Story/Feature/Aspect/Epic context. Then read the [governing design](plans/AIWF-DHARMAX-WAY-DESIGN.md), the authorized [stage](plans/AIWF-DHARMAX-WAY-PLAN.md) and applicable Rules. Do not paste all definitions into every prompt.
2. **Respect authority and current truth.** Developer-approved product intent/charter and decisions govern product meaning; the glossary governs terminology and exact field sets; authorized plans and effective Rules govern work. The canonical graph contains authored records/relations, and the repository contains actual source. Verify the implementation and current evidence instead of assuming design text is shipped. Older plans/projections are context, not competing authorities. When applicable approved sources disagree, surface the exact conflict; do not choose a convenient winner.
3. **Ground before acting.** In investigation, identify concisely: charter presence/identity/revision and any open alignment warning; relevant definitions and approved US/Aspect/Feature/Epic; Ticket scope and applicable Rules; current code/test/evidence basis. Record this in the work's existing investigation/verification context, **not** a new ceremony or duplicated glossary. Missing charter or an unanswered warning is an explicit product-definition gap—never invent approval or automatically erase unrelated technical work.
4. **Deliver and verify.** Follow [Dharmax-way](docs/definitions/dharmax-way.md): accepted US → genuine test first → actual baseline → resolution Ticket → optional *separate* full-flow skeleton for multi-component work (one coding Ticket per temporary internal stub) → real implementation under the [Prime Directive](docs/definitions/prime-directive.md) → unchanged genuine test and independent current verification. Before claiming completion, recheck the same definition/charter/Aspect/Rule basis, unresolved warnings, actual test execution and proof freshness. Skeleton green, AI narration and a Ticket lane are not acceptance.
5. **No semantic or implementation improvisation.** Do not invent fields, obligations, relationships, tool arguments, observed failures or acceptance history. If definition and current implementation differ, report the discrepancy and obtain the necessary decision before changing product intent.

**Documentation preflight:** `bun run check:definitions` checks glossary link targets, index coverage and the exact US field table. This is a consistency guard, not a semantic reviewer or test of product behavior.

## Prime Directive
Apply the [canonical Prime Directive](docs/definitions/prime-directive.md) to **the whole touched method/artifact and immediate contracts**, down to its variables and statements—not merely diff lines. Use [am-i-allowed](https://github.com/dharmax/am-i-allowed) as the design-quality reference. Judge purpose/existence, placement, tightness, justified generality, actual execution flow and public API. Passing tests cannot excuse misplaced responsibility or needless complexity. Leave directly affected scope better than found; visibly defer unrelated risky cleanup.

## Project Structure & Module Organization
The TypeScript sources live under `src/`:
- `cli.ts`: Entry point for the `aiwf` CLI binary.
- `shell.ts`: Interactive dual-nature REPL shell with sub-5ms command fast-paths and tab completions.
- `mcp.ts`: Stdio MCP host bridge supporting IDEs (Antigravity IDE, Claude Code, Cursor, Windsurf).
- `setup.ts`: Global environment setup, MCP configuration distribution, and `aiwf init` onboarding.
- `doctor.ts`: Diagnostic engine checking runtime, git status, SQLite graph health, and cognitive hosts.
- `graph/`: Semantika AST+ knowledge graph (`store.ts`, `ontology.ts`, `indexer.ts`, `projections.ts`).
- `tools/`: Deterministic domain tools registered into `registry.ts` (`tickets.ts`, `product.ts`, `graph-queries.ts`, `git.ts`, `compiler.ts`, `debugger.ts`, `kb.ts`, `scaffold.ts`).
- `product/`: existing Product Intent Graph owners (`mutation.ts`, `process.ts`, `context.ts`, `coverage.ts`, `impact.ts`); review current semantics before changing them.
- `helpers/actor/`: Cognitive Actor with per-operation native workload inference, independent host code permission, intelligence preferences, and llm-utils model routing.

Tests reside in `tests/` following the `*.test.ts` naming convention and executed via `bun test`.
Shared configuration and database live under `.ai-workflow/` (`state/`, `config.json`).
Obsidian Markdown projections sit at the project root (`kanban.md`, `epics.md`, `features.md`, `user-stories.md`, `decisions.md`, `modules.md`).

## Build, Test, and Development Commands
- `bun test`: Execute the complete current Bun test suite (file count varies).
- `bun run typecheck`: Verify strict TypeScript types with `tsc --noEmit`. Zero compile errors required.
- `bun run setup`: Symlink the global executable into `~/.local/bin/aiwf` and distribute MCP host schemas.
- `bun run sync`: Current legacy bi-directional SQLite/Markdown sync; retain until staged portable export/restore and UI replacement are proven, then retire it as specified by S8.
- `bun run doctor`: Run comprehensive runtime, database, git, and MCP diagnostics.

## Coding Style & Naming Conventions
- **Extreme KISS**: If a solution isn't super-simple, it's totally wrong. Avoid complex wrapper abstractions when native Semantika predicates and Bun APIs exist.
- **Strict Typing**: Use explicit types and Zod schemas for all tool parameters and return values. Avoid untyped `any` leaks.
- **Source Order Preservation**: Parsed AST symbols must preserve original line and column order (`symbols.sort((a, b) => a.line - b.line)`).
- **Sub-15ms Incremental Freshness**: Any symbol lookup or graph traversal must call `ensureAstFresh()` before querying to guarantee real-time synchronization with disk without unnecessary full-codebase re-indexing.

## Testing Guidelines
- Use Bun's native test runner (`describe`, `it`, `expect` from `bun:test`).
- Organize ordinary acceptance tests as one cohesive file per accepted US (e.g. `tests/us/<story>.test.ts`); keep justified technical/invariant tests separate. See [Test](docs/definitions/test.md).
- Every test suite must isolate its database state using temporary directories (`fs.mkdtempSync`) and close stores in `afterEach()`.
- Default: derive tests from accepted, complete User/Actor Stories; execute actual public interfaces and observable results. When work begins, activate its test and establish the true baseline (normally attributable expected red for missing new behavior; already-green and wrong-reason failures must be reported truthfully) before implementation. A separate full-flow skeleton test may aid multi-component development but never substitutes for the genuine Story test; each temporary internal implementation stub requires its own coding Ticket and real replacement. Isolated unit tests remain exceptional for a demonstrably complex component/invariant (such as atomic batches or parsers). Do not invent production abstractions just for mocking. Report skipped, unknown and unverified outcomes truthfully.

## Commit & Pull Request Guidelines
- Terse imperative commits: `feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `test:`.
- Ensure `bun test` and `bun run typecheck` pass with zero failures before committing.

## Agent-Specific Notes & Safety
- **Mandatory Ticket Claim**: Never mutate code without an active lease recorded via `claim_ticket` or `aiwf claim <ticketId>`.
- **Zero Hallucinated Parameters**: All tool executions must conform strictly to their registered schemas.
- **Graph-First Discovery**: Before editing or reading large files, use `aiwf symbol`, `aiwf graph`, `aiwf callers`, and `aiwf blast` to bound your context surgically.
- **Legacy projection compatibility**: Until S8, follow the current supported sync requirements for operations that still depend on Markdown. Do not introduce new implicit projection coupling. After S8's independently verified restore and approved removal, explicit on-demand export replaces live sync.
