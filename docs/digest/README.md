# Digest: Design/Planning Artifacts → Operational Graph

Status: design for the next ai-workflow feature.

`digest` turns a folder of design/planning material into reconciled project state in the existing ai-workflow graph.

It is **not a summarizer** and it is **not a second planning database**.

Its job is:

```text
design/planning files
        ↓
deterministic scan + change detection
        ↓
small grounded semantic extraction
        ↓
reconciliation against current graph
        ↓
epics / tickets / decisions / ideas / relations / code targets
        ↓
existing Markdown projections
```

## Why this belongs in ai-workflow

The current system already has:

- Semantika as the unified graph/store;
- durable Epic, Ticket, Decision, Idea, Module, File, Symbol, Test and Artifact entities;
- predicates such as `contains`, `depends_on`, `blocks`, `targets`, `modifies`, `governs`, and `generates`;
- AST indexing and code dependency information;
- Markdown projections;
- deterministic codelets/tools and bounded LLM execution.

Digest should compose these facilities rather than invent parallel abstractions.

## First user-facing operation

```bash
aiwf digest docs/design
```

The command produces a concise preview of graph changes and, when applied, reconciles them into the canonical DB.

Useful forms may later include:

```bash
aiwf digest docs/design --apply
aiwf digest docs/design --changed
aiwf digest docs/refactor-plan --scope src/scheduler
```

Exact CLI ergonomics are deliberately secondary to the semantic contract.

## Core guarantees

1. **DB remains source of truth.** Source documents are evidence/input; Markdown projections remain projections.
2. **Incremental.** Unchanged source files are not reinterpreted.
3. **Idempotent.** Re-running the same digest does not duplicate work items.
4. **Provenance preserving.** Every semantic assertion created by digest can be traced to source file/range and digest run.
5. **Reconciliation, not append-only extraction.** Changed or removed source material updates or retires digest-owned claims.
6. **Human decisions win.** Digest never silently overwrites an explicit human decision or a manually edited durable entity.
7. **Deterministic where possible.** Discovery, hashing, chunking, identity, graph lookup, diffing and writes are code; the LLM is used for semantic interpretation.
8. **Small model context.** No whole-folder prompt unless the folder is trivially small.
9. **No new workflow engine.** Digest is an operation over the existing graph.
10. **Refactoring-ready.** Digest output can target code modules/files/symbols and express dependencies needed for later graph-native refactoring.

## Reading order

1. [architecture.md](architecture.md)
2. [first-proof.md](first-proof.md)
3. [phases/01-foundation.md](phases/01-foundation.md)
4. [phases/02-extraction.md](phases/02-extraction.md)
5. [phases/03-reconciliation.md](phases/03-reconciliation.md)
6. [phases/04-product-integration.md](phases/04-product-integration.md)
7. [phases/05-acceptance.md](phases/05-acceptance.md)

Stop after Phase 5 and review the implementation file-by-file before generalizing.
