# Canonical definitions

This directory is the authority for the terms below. Plans, examples, tests and existing code do not redefine them. **Change an agreed definition only with the project developer's explicit approval.** Keep undecided proposals separate from agreed rules; do not implement them as defaults.

- [User/Actor Story](user-story.md) — complete field definition and meaning
- [Epic](epic.md) — primary relationship and common Story context
- [Sub-US](sub-user-story.md) — inheritance and meaningful variants
- [US Test](us-test.md) — acceptance coverage owned by a Story

## Decisions still open

These are **not** requirements:

- Must every US have a primary Epic, assigning a simple `Default` Epic when one is not supplied? At most one designated primary Epic is already agreed.
- How should overlapping/conflicting Epic and US wording be composed? The common material is agreed; mechanical precedence is not.
- Should Comments be half-formal input from which an LLM proposes requirements? Should separate `Requirements` or `Preconditions` fields ever be added? None is currently part of the exact US field set.
- Domain taxonomy/effective tag composition, and detailed editing mechanics for replacing/refining inherited text.

The current `src/graph/ontology.ts` still contains legacy fields and does not yet implement every agreed relationship/inheritance rule. Historical plans may use older terminology. **These are implementation and documentation gaps, not alternative definitions.** Code or data migration requires separately reviewed work.
