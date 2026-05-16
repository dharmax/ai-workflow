# Responsibility: Preserve completed kanban history once work leaves the live board.
# Scope: Archive-only history belongs here; live ticket state stays in kanban.md.
# Kanban Archive

Move completed tickets here once they no longer belong on the live `Done` lane.
Keep the original checked task card and its `✅ YYYY-MM-DD` date.
Group archived work by month or release when that improves scanning.

## 2026-03

## 2026-05

- [ ] BUG-CODELET-BACKINGS-001 Restore missing runtime/script backings for toolkit codelets ✅ 2026-05-08
  - Summary: Fix codelet manifests and runtime entry wiring so audit, route, guideline-audit, map-dependencies, and locate-trapped-logic resolve to real executable backings.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived

- [ ] BUG-OVERLAY-01 Restore global overlay handling for non-dialog modals after the app-shell refactor. ✅ 2026-05-08
  - State: archived

- [ ] TKT-CORE-003 Finish core/cli decoupling for packageable core/common ✅ 2026-05-08
  - Summary: Remove remaining core imports from cli/lib config-store and isolate packageable common/core boundaries for npm publication.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived

- [ ] TKT-PACKAGING-001 Scaffold the three npm package surfaces ✅ 2026-05-08
  - Summary: Define and scaffold publishable package boundaries for common/core, skill-mode support, and shell-mode support without resolving the remaining implementation gaps yet.
  - Epic: EPC-PACKAGING-SPLIT-001
  - Parent: EPC-PACKAGING-SPLIT-001
  - State: archived
