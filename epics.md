# Epics

_Generated from the workflow DB._

## EPC-PACKAGING-SPLIT-001 Split ai-workflow into common-core, shell, and skill packages

### Goal

As a maintainer, I need aiwf-common-core, aiwf-shell, and aiwf-skill to exist as real sibling packages with strict ownership boundaries so the toolkit can ship shell and skill surfaces independently without duplicate implementation or root-owned source trees.

### Status

- [x] Archived
<!-- status: archived -->

### User stories
#### Story 1

**As a **maintainer****, I can import reusable workflow logic from `aiwf-common-core` without depending on shell-only or skill-only modules.

#### Story 2

**As a **tool****, I can invoke the `ai-workflow` CLI from `aiwf-shell` while keeping project init, runtime scripts, and operator surfaces packaged with the shell module.

#### Story 3

**As an **AI****, I can install and run the workflow skill from `aiwf-skill` without carrying shell-only implementation or duplicate shared code.

### Ticket batches
- Batch 1: create the sibling workspaces and package metadata, remove the fake `packages/*` re-export layer, and make the root package private workspace glue only.
- Batch 2: move reusable code into `aiwf-common-core`, move interactive/operator surfaces into `aiwf-shell`, move skill assets into `aiwf-skill`, and rewire imports through package exports only.
- Batch 3: restore green verification across build, tests, dogfood, and workflow audit, then close the migration backlog.

### Kanban tickets
- TKT-SPLIT-001 Package split epic placeholder [Archived]
- TKT-CORE-003 Finish core/cli decoupling for packageable core/common [Done]
- TKT-PACKAGING-001 Scaffold the three npm package surfaces [Done]
- BUG-CODELET-BACKINGS-001 Restore missing runtime/script backings for toolkit codelets [Done]

## EPC-SHELL-SKILL-01 EPC-SHELL-SKILL-01

### Goal

Pending natural-language scope.

### Status

- [x] Archived
<!-- status: archived -->

### User stories
#### Story 1

None captured yet.

### Ticket batches
- None captured yet.

### Kanban tickets
- none linked yet

## EPC-PROBE EPC-PROBE

### Goal

Pending natural-language scope.

### Status

- [x] Archived
<!-- status: archived -->

### User stories
#### Story 1

None captured yet.

### Ticket batches
- None captured yet.

### Kanban tickets
- TKT-EPIC-PROBE probe [Archived]
