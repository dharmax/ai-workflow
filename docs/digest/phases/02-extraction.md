# Phase 2 — Grounded Semantic Extraction

## Objective

Convert only changed source slices into typed semantic candidates.

## Work

1. Implement one extractor interface with a production LLM-backed implementation and deterministic fake used only for unit tests.
2. Prompt for the minimum candidate kinds defined in architecture.md.
3. Supply document outline/nearby headings so slices retain local meaning.
4. Validate structured output strictly.
5. Reject unsupported entity/predicate kinds.
6. Preserve explicitness, confidence and exact source provenance.
7. Keep extraction separate from identity resolution and graph writes.
8. Add a token/size budget and bounded slicing policy.
9. Fail clearly on malformed semantic output; do not partially mutate state.

## Extraction rules

- Explicit source statements outrank inferred structure.
- A heading is not automatically an Epic.
- A bullet is not automatically a Ticket.
- A stated choice may become a Decision.
- An action becomes a Ticket only when it describes executable project work.
- Aspirational possibilities normally become Ideas unless the source clearly commits to them.
- Dependencies must be grounded in source text or an already-known graph fact.
- Code references are emitted as hints; extraction does not invent symbol identity.

## Gate

A representative planning corpus produces a compact, provenance-rich candidate set without touching the graph.
