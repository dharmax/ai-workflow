# Canonical definitions

**Authority:** One file per substantive concept; related fields belong together. Definitions are stable until an explicitly approved semantic change. The glossary controls terminology and exact field sets; the developer-approved charter and decisions control product intent. Historical text, generated proposals and implementation details do not silently redefine either. Documentation is not proof of runtime support.

**For AI coding agents:** read this index, then load **only relevant concept files**. During investigation identify the charter/approval basis, applicable definitions/Aspects/Rules and current code/test evidence; revisit that basis during verification. See the concise [agent entry contract](../../AGENTS.md#ai-coding-agent-entry-contract). Do not replace actual evidence with this glossary.

## Product meaning

- [Product](product.md) — **mandatory, developer-approved charter** and downstream alignment
- [Goal](goal.md) — intended outcome
- [Concept](concept.md) — shared domain meaning
- [Feature](feature.md) — specific functionality/capability
- [Aspect](aspect.md) — abstract cross-cutting expectations
- [User/Actor Story](user-story.md) — exact complete US fields and episode of use
- [Flow](flow.md) — optional significant Product journey (distinct from execution flow)
- [Proposal and Acceptance](proposal-and-acceptance.md) — candidate meaning versus developer authority

## Delivery and proof

- [Epic](epic.md) — delivery grouping and shared US context
- [Sub-US](sub-user-story.md) — full inheritance and a meaningful variation
- [Ticket](ticket.md) — canonical work item (Kanban, Gantt and Scrum perspectives)
- [Test](test.md) — US-first acceptance, distinct from skeleton/invariant tests
- [Verification and Evidence](verification.md) — current proof versus status or narration
- [Artifact](artifact.md) — an identifiable work product, distinct from the specific graph entity
- [Decision](decision.md) — approved, traceable choice

## System and engineering governance

- [AI-Workflow](ai-workflow.md) — the engineering workflow and software supporting it
- [Dharmax-way](dharmax-way.md) — governing test-first method
- [Prime Directive](prime-directive.md) — smallest correct engineering solution, whole-scope quality
- [Rules and Guidelines](rules-and-guidelines.md) — instruction versus advice
- [Project Graph](project-graph.md) — the shared Semantika-backed project model; *Canonical Project Graph* remains a proposed full name

See [Product](product.md) for the authoritative mandatory-charter/alignment contract; it is not restated here.

## Decisions still open

- Must every US have a primary Epic, automatically assigned a simple `Default` Epic when none is supplied? At most one designated primary Epic is agreed.
- Precise mechanical composition/conflict rules for shared Epic and specific US Initial State/Expected Result.
- Comments as half-formal LLM input and whether separate Requirements or Preconditions fields add value; neither is currently an approved US field.
- Domain taxonomy/tag composition and fine-grained inherited-definition editing mechanics.

**Current-state warning:** implementation and data may lag definitions. The tracked manifest reports no charter (not a fresh DB check); no default charter, fake approval or automatic migration is authorized. Validate current state.
