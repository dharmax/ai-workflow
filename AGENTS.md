# Repository Guidelines

## Prime Directive
The simplest correct solution wins. Reuse existing contracts and primitives before adding abstractions. Code should be no more complex than the problem. No duplicate or shadow systems, speculative compatibility layers, or branch proliferation. Make the smallest safe change, preserve working behavior, prove it, and merge/delete temporary branches at the first stable opportunity.

**The am-i-allowed standard applies to every touched artifact, down to a variable or statement—not just the patch or its tests.** Before and after changing code, review the entire touched method and its immediate contracts:
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
- `product/`: Product Intent Graph engines (`coverage.ts`, `impact.ts`, `decompose.ts`, `apply.ts`).
- `actor/`: Cognitive Actor with dynamic mode routing (`/design`, `/dev`, `/triage`, `/product`), Ollama, OpenRouter, and model radar.

Tests reside in `tests/` following the `*.test.ts` naming convention and executed via `bun test`.
Shared configuration and database live under `.ai-workflow/` (`state/`, `config.json`).
Obsidian Markdown projections sit at the project root (`kanban.md`, `epics.md`, `features.md`, `user-stories.md`, `decisions.md`, `modules.md`).

## Build, Test, and Development Commands
- `bun test`: Execute the complete Bun test suite across all 16 test specifications.
- `bun run typecheck`: Verify strict TypeScript types with `tsc --noEmit`. Zero compile errors required.
- `bun run setup`: Symlink the global executable into `~/.local/bin/aiwf` and distribute MCP host schemas.
- `bun run sync`: Bi-directionally synchronize the SQLite Graph with Markdown projections (`kanban.md`, `epics.md`, `features.md`, `user-stories.md`).
- `bun run doctor`: Run comprehensive runtime, database, git, and MCP diagnostics.

## Coding Style & Naming Conventions
- **Extreme KISS**: If a solution isn't super-simple, it's totally wrong. Avoid complex wrapper abstractions when native Semantika predicates and Bun APIs exist.
- **Strict Typing**: Use explicit types and Zod schemas for all tool parameters and return values. Avoid untyped `any` leaks.
- **Source Order Preservation**: Parsed AST symbols must preserve original line and column order (`symbols.sort((a, b) => a.line - b.line)`).
- **Sub-15ms Incremental Freshness**: Any symbol lookup or graph traversal must call `ensureAstFresh()` before querying to guarantee real-time synchronization with disk without unnecessary full-codebase re-indexing.

## Testing Guidelines
- Use Bun's native test runner (`describe`, `it`, `expect` from `bun:test`).
- Place new test suites in `tests/` named `<feature>.test.ts`.
- Every test suite must isolate its database state using temporary directories (`fs.mkdtempSync`) and close stores in `afterEach()`.
- Aim for 100% deterministic assertion coverage on all new graph predicates, symbol lookups, and CLI/shell command bridges.

## Commit & Pull Request Guidelines
- Terse imperative commits: `feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `test:`.
- Ensure `bun test` and `bun run typecheck` pass with zero failures before committing.

## Agent-Specific Notes & Safety
- **Mandatory Ticket Claim**: Never mutate code without an active lease recorded via `claim_ticket` or `aiwf claim <ticketId>`.
- **Zero Hallucinated Parameters**: All tool executions must conform strictly to their registered schemas.
- **Graph-First Discovery**: Before editing or reading large files, use `aiwf symbol`, `aiwf graph`, `aiwf callers`, and `aiwf blast` to bound your context surgically.
- **Synchronize Ledgers**: Always run `aiwf sync` or call `exportProjections()` after updating tickets or graph state.
