# Canonical definitions

**Authority:** These files define the project terms and their approved meaning. One file per **substantive concept**; related fields belong together in their owning definition. Suggestions, older plans, generated text and existing code cannot silently add fields or redefine terms. Semantic changes require explicit developer approval. A definition is not a claim that its runtime support already exists.

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

## Agreed cross-cutting rule

Every project needs an actual, accepted **Product charter**. Every proposed/revised Aspect, Feature, Epic and US is reviewed against it. Material conflict, ambiguity or drift requires a grounded warning **and an explicit developer answer**; unanswered warnings cannot be silently treated as alignment. See [Product](product.md) for the complete rule.

## Decisions still open

- Must every US have a primary Epic, automatically assigned a simple `Default` Epic when none is supplied? At most one designated primary Epic is agreed.
- Precise mechanical composition/conflict rules for shared Epic and specific US Initial State/Expected Result.
- Comments as half-formal LLM input and whether separate Requirements or Preconditions fields add value; neither is currently an approved US field.
- Domain taxonomy/tag composition and fine-grained inherited-definition editing mechanics.

**Current-state warning:** the mandatory charter decision supersedes older optional-Product plans. Implementation and stored data need separate review/migration; the latest tracked Product manifest states no charter is defined but is not itself proof of current DB state. No default charter, fake alignment or automatic migration is authorized by this documentation.
