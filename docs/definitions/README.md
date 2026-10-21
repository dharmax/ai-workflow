# Canonical definitions

**Authority:** These files define AIWF terminology. Plans, examples, tests and implementation details do not silently redefine them. Changing an agreed meaning requires explicit project-developer approval. Keep proposals and known implementation gaps distinguishable from approved definitions.

## Product and intent

- [AI-Workflow](ai-workflow.md) — the engineering workflow and software implementing it
- [Dharmax-way](dharmax-way.md) — its governing engineering approach
- [Product](product.md) — project charter and Feature manifest
- [Goal](goal.md) — intended outcome
- [Concept](concept.md) — domain meaning
- [Feature](feature.md) — specific product functionality/capability
- [Aspect](aspect.md) — reusable governing concern
- [User/Actor Story](user-story.md) — **complete US field definition**
- [Flow](flow.md) — optional product journey; distinct from engineering execution flow

## Work and evidence

- [Epic](epic.md) — delivery grouping and shared US context
- [Sub-US](sub-user-story.md) — meaningful inherited variation
- [Ticket](ticket.md) — bounded engineering work
- [Test](test.md) — principally US-driven behavioral proof
- [Artifact](artifact.md) — work product; distinguish the specific graph entity
- [Decision](decision.md) — recorded architectural/product choice
- [Project Graph](project-graph.md) — interconnected project knowledge and state; **Canonical Project Graph** is the proposed full name

## Engineering governance

- [Prime Directive](prime-directive.md) — simplest correct solution and whole-scope review
- [Rules and Guidelines](rules-and-guidelines.md) — normative instructions versus guidance

## Open design decisions

Only genuinely unresolved points belong here:
- Mandatory primary Epic and automatic `Default` Epic for otherwise unassigned USs. At most one **designated primary** Epic is agreed.
- Precise composition/conflict rules for shared Epic and specific US Initial State/Expected Result.
- Whether Comments may be half-formal input for LLM-deduced requirements, and whether distinct Requirements/Preconditions fields are worthwhile. They are **not** in the currently approved US field set.
- Domain taxonomy/tag composition and detailed field-editing mechanics for inherited text.

**Implementation status:** This glossary establishes intended terminology; it is not a claim that existing code and records implement every definition. In particular, legacy UserStory schema fields and parts of current Epic/sub-US relationship handling need separate reconciliation. Do not silently migrate data or infer successful verification from documentation.
