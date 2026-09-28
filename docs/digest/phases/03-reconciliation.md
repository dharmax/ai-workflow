# Phase 3 — Identity, Resolution, Reconciliation

## Objective

Turn semantic candidates into an idempotent graph ChangeSet.

## Work

1. Implement deterministic existing-entity lookup by explicit ID, provenance and scoped normalized title.
2. For ambiguous duplicates, expose only the small plausible candidate set to semantic matching.
3. Generate stable IDs for genuinely new digest-owned entities.
4. Resolve parent Epic relationships.
5. Resolve ticket dependencies.
6. Resolve exact Module/File/Symbol references against the current AST graph.
7. Produce create/update/relate/unlink/retire/conflict operations without mutating the graph.
8. Preserve human-owned fields/state.
9. Detect contradictions with accepted/rejected Decisions and manually modified durable entities.
10. Implement apply as one bounded graph transaction where practical.
11. Record/update digest Artifact provenance after successful apply.
12. Sync existing projections after commit.

## Important semantics

- Reconciliation is based on lineage + identity, not string similarity alone.
- Removing a source sentence cannot delete a manually owned ticket.
- Digest-owned relationships may be removed when their source disappears.
- Human ticket lane/claim/status is never reset by digest.
- A source edit that merely changes wording should normally update the same entity.

## Gate

Apply → rerun is a no-op; edit-one-file → only its semantic lineage changes; human state survives.
