# User/Actor Story (US)

A **concrete, coherent episode of use** defining intended product behavior from an Actor's perspective. It is not an implementation task, observed bug, test, or title-only description.

## Exact US fields

The following is the **complete currently approved field set**. Do not infer additional US fields from generic agile conventions, historical code or examples.

| Field | Definition |
| --- | --- |
| **ID** | Stable identity. |
| **Title** | Short descriptive label, not a substitute for the definition. |
| **Actor** | Who or what performs the Action; may be a person or another acting entity (e.g. a coding agent). State the role, not an assumed first-person “I”. |
| **Intent** | What the Actor wants to accomplish, and why. |
| **Initial State** | Relevant situation before the Action. May be existing, partial or otherwise non-pristine; never silently assume a clean/empty starting point. |
| **Action** | What the Actor does. May be a sequence of interactions if they constitute **one coherent episode**; not an implementation procedure. |
| **Expected Result** | The **complete intended outcome**, including all relevant logical, functional, interactive, visual and other details needed to define the behavior, **without visual styling**. May contain conditional outcomes, including an unsuccessful operation where relevant. It must be sufficiently complete to derive acceptance tests **without inventing product requirements**. This is an expectation, not an observation of a test run. |
| **Domains** *(optional)* | Set of organizational tags. Not behavioral requirements. |
| **Comments** *(optional)* | List of additional context or notes. Whether comments can serve as half-formal requirements for LLM interpretation remains undecided; inferred requirements must not silently alter the accepted Expected Result. |

ID, Title, Actor, Intent, Initial State, Action and Expected Result form the required **effective definition**. Every proposed/revised US is checked against the mandatory [Product charter](product.md); material conflict, ambiguity or drift requires a specific warning and explicit developer answer before it can be considered aligned/approved. Common [Epic](epic.md) material may supply Initial State and part of Expected Result, as well as Domains and Comments; a [sub-US](sub-user-story.md) inherits its parent's effective definition and specifies what it refines or replaces.

## Rules of use

- A US has **at most one designated primary Epic** (one when assigned). Whether assignment should be mandatory with a `Default` Epic is still open. Other Epic relations do not provide additional inherited parents.
- A meaningfully different episode can be a [sub-US](sub-user-story.md). A conditional result within the same episode need not become a separate Story.
- **Aspect is not a US field.** An optional graph relation `US --has-aspect--> Aspect` explicitly associates the Story with an applicable Aspect; relevance can also come through its related Feature. See [Aspect](aspect.md). The current ontology instead exposes `Aspect --applies_to--> UserStory`; the requested `has-aspect` relation remains an implementation gap, not an extra field.
- A discovered bug or an old test may reveal a missing/unclear intended outcome; it does not define that outcome by itself.
- See [Test](test.md) for verifying the agreed definition, not replacing it.
