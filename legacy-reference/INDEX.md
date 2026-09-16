# Legacy Knowledge & Code Reference Index

This directory archives key knowledge, rules, guidelines, and reference implementations extracted from the legacy `ai-workflow` repository prior to the full Semantika AST+ & LLM-Utils Actor rewrite (tagged at `legacy-pre-rewrite`).

---

## 📚 Extracted Knowledge & Guidelines (`legacy-reference/docs/`)

1. **`knowledge.md`**:
   - Durable lessons and workflow traps.
   - Core principle: Projections (`kanban.md`, `epics.md`, `user-stories.md`) are downstream views of the canonical graph/database; direct human edits must be reconciled rather than blindly overwritten.
   - State mutations must immediately sync both the DB and projections so context never goes stale.

2. **`project-guidelines.md`**:
   - **Deterministic State**: State mutation must remain deterministic; treat AI output as untrusted and validate at boundaries.
   - **Service Adapter Pattern**: Domain behavior belongs in cohesive modules behind stable APIs, not scattered in ad-hoc scripts.
   - **Token Economy & Context Budgeting**: High-density bounded context extraction over whole-file dumps.
   - **ESM Law**: Pure modern Bun/TypeScript with native ESM.

3. **`execution-protocol.md`**:
   - **Required Order**: Orientation -> Status/Burndown -> Next Task -> Lease Claim -> Bounded AST Context -> Blast Gate -> Implementation -> Verification -> Closure Diff/Lessons.
   - **Ticket Lifecycle & Leases**: Prevent concurrent agent collisions using time-bounded atomic claims.
   - **Burst Budgets**: Minimum token/time spend that still guarantees high-integrity verification.

4. **`enforcement.md`**:
   - Machine-enforced audit patterns: responsibility headers, no pseudo-private underscore variables, no untracked TODO/FIXME markers in production code, strict failure reporting.

5. **`SKILL.md`**:
   - The battle-tested AI agent prompt protocol and capability catalog for IDEs/CLIs (Antigravity, Claude, Cursor, Gemini CLI).

---

## 💻 Extracted Code Reference (`legacy-reference/code/`)

1. **`helpers.ts`**:
   - Workspace root resolution (`findProjectRoot`) across monorepos and subdirectories.
   - Git operations: porcelain status parsing (`getGitStatus`), commit hotspots (`getGitHotspots`), diff inspection (`getGitDiff`), snapshot checkpointing (`createSnapshotCheckpoint`).
   - AST slicing: surgical function/signature extraction (`getSymbolSource`, `getFileOutline`) and token estimation (`estimateTokenBudget`).
   - Test target resolution (`resolveTestTarget`) and test triage (`triageTestFailures`).

2. **`impact.ts`**:
   - Blast radius analysis (`getBlastRadius`) calculating incoming/outgoing dependency cascades and impacted tickets.
   - Next task recommendation heuristics (`recommendNextTask`) prioritizing active claims -> high-priority bugs -> Todo items.
   - Diagnostic health checks (`doctorCheck`).

3. **`sync.ts`**:
   - Bi-directional Obsidian Kanban Markdown parser and serializer.
   - Epic and user-story markdown projection parsers.

4. **`indexer.ts`**:
   - Codebase file walker and AST symbol/dependency extraction using `@dharmax/codebase-parser`.

5. **`compiler.ts`**:
   - Persistent codelet storage on disk (`.codelets/`) integrating `@dharmax/text-compiler`.

6. **`mcp.ts`**:
   - Stdio MCP Server initialization via `@modelcontextprotocol/sdk`.

7. **`shell.ts` & `shell-agent.ts`**:
   - Readline REPL loop with auto-completion and agent role modes (`design`, `product`, `dev`, `triage`).

8. **`registry.ts` & `types.ts`**:
   - Complete inventory of the 21+ legacy tools, schemas, and domain types.
