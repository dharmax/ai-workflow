# US-E01 — Investigate an undeclared sibling repository without modifying it

**Migration status:** implemented on `USs-and-consolidation`; new Bun verification pending. **Actual Story owner:** `tests/us/e01-investigate-sibling.test.ts`. This is a *single complete demonstration*, not a claim that all other suites have already been digested.

## Story

**Actor:** external coding/research agent connected to a configured AIWF MCP host.

**Intent:** obtain exact source evidence from a neighboring repository, even when it has never been indexed by the host, and resume investigation of the original project without inadvertently editing, initializing or assuming write authority over the sibling.

**Starting state:** host project has its own source and a host-granted write context; sibling is a separate, undeclared project containing its own package/source, optionally an existing `.ai-workflow` directory and unrelated content. No separate allowlisted write grant is issued for the sibling.

**Action:** discover the documented scoped tools; inspect host and sibling symbols, outline/slice exact sibling code (using explicit root and a path that resolves to the sibling); read sibling workspace source; reject an unknown root; attempt a write against sibling; disconnect/restart the real installed MCP host and repeat.

**Observable:** exact sibling source, default host scope restored, same results on restart, existing sibling files/state byte-for-byte unchanged, denied foreign write before persistence, and no silently invented target/authority.

## Scenarios within the ONE owning file

| Scenario | Real behavioral distinction | Source of existing proof |
|---|---|---|
| Discover investigation | External client discovers optional `projectRoot` and canonical installed research guidance; exported research schema agrees | Research portion of old `mcp-client-investigation` advertising test |
| Ordinary sibling investigation | Initially cold sibling lookup, exact symbol slice, return to host scope, sibling left uninitialized | Old `mcp-client-investigation` sibling search/slice |
| Non-pristine sequence | Sibling-first access followed by host access, then closed/reopened Client/server/store; no persistent sibling state | Old `mcp-client-investigation` cold-host/restart |
| Alternative target spelling | Relative sibling file path and absolute file path are both correctly rebased | Old `mcp-client-investigation` filePath test |
| Invalid request | Explicit missing project is refused, never replaced with default root | Old `mcp-client-investigation` negative test |
| Installed-host non-pristine authority | Configured host and real stdio restart; sibling has *existing* `.ai-workflow/existing-note` and unrelated file. Literal read and AST inspection work, read does not create `state/`, foreign `create_ticket` is refused before initialization, original source and state remain unchanged, host remains readable after both sessions | Moved P0 installed-host sibling write/refusal/restart case, refined to use this Story's existing sibling/host fixture |

## Exhaustive disposition of the touched historical tests

- Old `tests/mcp-client-investigation.test.ts`: its four sibling cases and investigation-specific guidance/schema assertions moved to US-E01. Its **other two generic MCP-surface cases** (public tool advertisement, schema export/cleanup, callable domain facilities, hidden/unknown tool refusal) moved intact to `tests/mcp-public-surface.test.ts`. These belong to candidate US-E05 and remain **explicitly pending** their own digestion; they are neither deleted nor relabeled as sibling investigation. Old mixed file removed only after both destinations exist.
- `tests/p0-engineering.test.ts`: moved **only** the sibling-grant/refusal/restart case to US-E01. The P0 installed source mutation, default read-only/self-grant refusal, and namespace/parser cases remain as historical coverage for their other US owners. Its installed fixture still supports those tests.
- Other technical and public suites are *not* silently counted as migrated. In particular, local AST symbol coverage and refactor semantics need their own US assignment; their current tests remain untouched.

## Review / correction pass

1. Confirmed both source files have a precise original-case destination; no generic MCP case was reclassified as a sibling case.
2. US-E01 includes ordinary, cold/restarted, alternative path, invalid target and an existing-state/foreign-authority case; none is a gratuitous permutation.
3. The installed-host scenario uses real `configureMcp`, a real SDK stdio client, a **separate process**, and tests no sibling `state/` creation both *before and after* the refused write, across restart. Temporary Client lifecycle is closed in `finally`.
4. In-memory SDK tests do **not** substitute for real installed-host proof. No new production code or permission bypass was introduced.
5. No new historical red run was claimed. The moved tests must pass at their new paths; until then this is a proposed verification result, **not green**.

## Verification gate

```bash
bunx tsc --noEmit
bun test tests/us/e01-investigate-sibling.test.ts tests/mcp-public-surface.test.ts tests/p0-engineering.test.ts
bun test
```

Review outcome must show actual command output and a case-level diff against this ledger. If an installed-host test fails, correct its owning fixture/flow and re-run; do not silently delete it or replace it with an internal mock.
