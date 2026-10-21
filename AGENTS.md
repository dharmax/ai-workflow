# Repository Guidelines

**Active delivery checkpoint (2026-10-20):** [AIWF v1 — corrected priorities](plans/AIWF-V1-ACTIVE-CHECKPOINT.md). Read before planning/coding: **P0 AI engineering through MCP/skill/plugin; P1 native Digest; P2 ai-cli dogfooding; P3 Shell; P4 Workspace last.** I1 is spent; I2/I3 remain. No Workspace rewrite/polish now. The developer approved core P0 engineering before Workspace acceptance; use the exact release-plan amendment, with bounded S6a before S6b; safety, host authorization, independent verification and canonical Gate 5 obligations remain real.

**Governing method (all AIWF product/workflow work):** read the [canonical definitions](docs/definitions/README.md), then [plans/AIWF-DHARMAX-WAY-DESIGN.md](plans/AIWF-DHARMAX-WAY-DESIGN.md) and the authorized stage in [plans/AIWF-DHARMAX-WAY-PLAN.md](plans/AIWF-DHARMAX-WAY-PLAN.md). Dharmax-way is **test-first**: approved complete US → reviewed executable US test → actual baseline (normally expected red for missing behavior) → resolution Ticket → optional separate full-flow skeleton test for multi-component work → **one coding Ticket per temporary internal implementation stub** → real implementation under the Prime Directive → the unchanged genuine US test green without placeholders and independently verified. Skeleton green is not US acceptance. Developer owns product intent; AI proposals are not acceptance. Target constraints are not claims that a stage is implemented. Preserve existing Gate 5 safety and truthful canonical status.


## Prime Directive
The simplest correct solution wins. Reuse existing contracts and primitives before adding abstractions. Code should be no more complex than the problem. No duplicate or shadow systems, speculative compatibility layers, or branch proliferation. Make the smallest safe change, preserve working behavior, prove it, and merge/delete temporary branches at the first stable opportunity.

**The [am-i-allowed](https://github.com/dharmax/am-i-allowed) code-quality standard applies to every touched artifact, down to a variable or statement—not just the patch or its tests.** Before and after changing code, review the entire touched method and its immediate contracts:
1. **Responsibility and existence:** Can its purpose be stated precisely? Does it have one clear owner, without scattered, overlapping or fragmented responsibility? Does it earn its existence, or belong in an existing artifact?
2. **Placement:** Is it in the right method, class, module and file, with the right dependencies?
3. **Tightness:** Is every variable, character, statement and syntactic construct necessary and the clearest correct expression? Remove redundant branches, indirection, duplication and obsolete workarounds.
4. **Generality and modularity:** Is the abstraction no broader or narrower than its actual contract? Does it serve legitimate library consumers without hard-coded assumptions or unnecessary constraints?
5. **Algorithm and flow:** Is there one clear owner and purpose? Account for states, transitions, invariants, failures, cancellation, retries and boundary cases as applicable; avoid accidental or contradictory flows.
6. **API:** Export only what consumers need. Give public interfaces precise semantics, types, names and failure contracts; keep implementation details private.

**Leave each touched scope better than found; never increase avoidable technical debt.** Improve directly related defects while there; if cleanup changes unrelated behavior or expands risk, record and defer it rather than smuggling it into the patch. Passing tests is necessary but cannot excuse a confused responsibility, misplaced code or needless complexity. Verify behavior and inspect the final entire touched scope, not only diff lines.

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
- `actor/`: Cognitive Actor with dynamic mode routing (`/design`, `/dev`, `/triage`, `/product`), Ollama, OpenRouter, and model radar.

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
