# AIWF Agent Protocol

This is a compact invariant sheet for coding agents. Use `SKILL.md` for operational commands and `docs/` for authoritative semantics.

## Default behavior

1. **Delegate artifacts first.** Given a Ticket, use `resolve_ticket`. Use `investigate_ticket` for evidence-only work and `prepare_ticket` for executable enrichment/decomposition. Given accepted Product Intent, use `process_epic`, `process_feature`, or `process_story`.
2. **Treat `needs_input` and `blocked` as truthful outcomes.** Answer the precise question or repair the concrete capability/evidence gap, then retry. Never weaken acceptance merely to reach Done.
3. **Drill down only when useful.** Graph/symbol/source/reference/blast/test/change primitives are expert tools underneath artifact operations, not a choreography the external agent should reproduce by default.
4. **Project doctrine is mandatory evidence.** Respect accepted Decisions, Lessons, coding conventions, architecture/package boundaries, relevant Aspects, and explicit repository/agent instructions.
5. **Preserve user work.** Never reset, stash, overwrite, or commit unrelated work automatically. Dirty mutation targets require explicit authorization.
6. **Verify behavior, not activity.** Passing commands are insufficient: authored acceptance and material Aspects require evidence before completion.
7. **Keep implementation simple.** Prefer entity-owned domain behavior and existing primitives. Do not invent service/manager/repository layers, generic workflow engines, shadow graphs, persisted operation sessions, or duplicate search/context/metrics systems.

## Product/work semantics

- Product work begins from concrete actor journeys. A capability sentence is not a UserStory.
- Product Intent preserves Goal → Concept/Flow → narrative UserStory → enabling Feature → Ticket meaning; Epics remain temporary work scopes targeting that intent.
- Before adding a product capability, identify the journey that gives it meaning and derive implementation/tests from that journey.
- Pure technical maintenance may remain direct Ticket work; do not manufacture Goals/Flows/Stories for ceremony.
- Use the canonical relations in `docs/product-intent-graph.md` and `docs/top-level-product-intent.md`.
- Technical work does not require ceremonial User Stories.
- Completeness controls thoroughness, not artifact counts. Depth controls expansion; `maxArtifacts` bounds breadth.
- Applicable Aspects are part of completeness.
- Ticket children are ordinary Tickets and exist only when decomposition is useful.
- Reuse existing valid intent/work rather than duplicating it.

## Safe mutation

Prefer the existing Causal Change Engine and exact language tooling for correctness-sensitive edits. Preview before apply where required. Claim before durable Ticket-associated mutation. Run targeted verification, bounded repair when appropriate, then independently verify acceptance.

## Source of truth

The repository and Semantika-backed project graph are canonical. Markdown projections are synchronized views. Conversation state is never a substitute for durable project state.

When syntax or tool schemas are uncertain, inspect live AIWF help/schema rather than guessing.
