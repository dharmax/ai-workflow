# Digest First Proof

## Goal

Prove that ai-workflow can take a real planning/design folder and turn it into useful, stable, graph-connected project work **better than an agent manually rereading the folder**.

## Frozen scope

Input:

- one local folder under the current project;
- Markdown and text files only;
- small/medium planning corpus.

Output:

- Epics
- Tickets
- Decisions
- Ideas
- relations between them
- resolved links to existing Module/File/Symbol nodes when explicitly supportable

Behavior:

- preview
- apply
- rerun without duplication
- changed-file incremental update
- removed-source reconciliation
- conflict reporting
- projection sync

## Representative command

```bash
aiwf digest docs/refactor --apply
```

## Acceptance scenario

Prepare a fixture folder with:

- an overview naming two epics;
- implementation steps spread across multiple Markdown files;
- one explicit ADR-like decision;
- dependencies between tasks;
- references to real files/symbols;
- one duplicated/rephrased task across two documents;
- one intentionally ambiguous code reference.

Then verify:

1. first preview proposes the expected graph;
2. apply creates the expected entities/relations;
3. immediate second run produces no semantic changes;
4. editing one file reprocesses only that file;
5. renaming a heading does not duplicate the existing ticket;
6. removing a source task retires/unlinks only digest-owned material;
7. manually moving a ticket or accepting a decision survives later digests;
8. the duplicate/rephrased task is reconciled, not duplicated;
9. exact code references resolve to AST graph nodes;
10. ambiguous code references remain unresolved rather than guessed;
11. projections reflect applied graph state;
12. no whole-repository or whole-folder prompt is required.

## Success criterion

The feature is accepted only if the resulting graph is something a developer would actually trust as a working plan.

Green mocks are not sufficient. Run the acceptance case against at least one real project design folder after fixture tests pass.

Stop there. Do not begin generic ingestion or refactoring implementation in the same phase.
