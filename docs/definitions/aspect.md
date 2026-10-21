# Aspect

An **abstract, cross-cutting product/engineering concern** whose single canonical definition establishes the shared expectations for the entities to which it applies. It is not a feature, a coding instruction or a repeated paragraph inside every US.

## Examples

These illustrate the *kinds* of Aspects; they do not mandate that every project or US use every one:

| Aspect | Shared concern |
| --- | --- |
| **Persistency** | Durability/survival of relevant saved state |
| **Concurrency** | Consistent behavior under simultaneous activity |
| **Authentication** | Establishing an Actor's identity where required |
| **Access Control** | Governing permitted actions on relevant entities |
| **Logging / Auditing** | Recording relevant events and traceable actions |
| **Performance** | Expected responsiveness/resource behavior |
| **UX** | Shared usability/interaction expectations |
| **Personalization / Configurability** | Behavior adapted or configured for the applicable context |
| **Setup / Deployment** | Installation, configuration and deployment expectations |
| **Self-healing / Error Handling** | Recovery and truthful handling of failures |

An Aspect is intentionally **broader and more reusable** than a [Feature](feature.md). Example: `Persistency:Aspect --applies-to--> Saveable user-feedback:Feature`. The Feature provides a specific functionality; the Aspect governs the relevant persistence expectations. Other Features may refer to the same Persistency definition.

## Graph application

- An Aspect is defined **once**, then related to the applicable Features or other supported entities; do not duplicate its policy in each consumer.
- A [US](user-story.md) has **no Aspect field**. A US may optionally have a graph relationship **`US --has-aspect--> Aspect`**, explicitly associating that Story with the Aspect. An Aspect may also be relevant through its linked Feature; the graph must show the actual grounded path.
- Only accepted Aspects govern actual applicability. Changing definition/applicability must reveal affected Stories, Features, work and *current* proof for review; it must not silently rewrite every consumer or reopen unrelated history.
- Distinguish the Aspect (what shared concern must hold) from an engineering [Rule](rules-and-guidelines.md) (how engineering action is governed).

**Implementation discrepancy:** the current ontology/mutation path uses `Aspect --applies_to--> UserStory` as well as `Aspect --applies_to--> Feature`; it does **not** yet implement the separately specified optional `US --has-aspect--> Aspect` predicate. Treat the latter as the intended graph relationship to reconcile in a reviewed implementation task, not as a claim about the live API. Avoid silently treating opposite-edge names as equivalent.

See [the existing Aspect design](../../plans/AIWF-DHARMAX-WAY-DESIGN.md#23-aspect-definition-or-applicability-changes).
