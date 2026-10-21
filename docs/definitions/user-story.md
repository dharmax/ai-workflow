# User/Actor Story (US)

**Status:** Developer-agreed definition, 2026-10-21.

A **concrete, coherent episode of use** from the perspective of an [Actor](actor.md). It defines intended product behavior, **not** an observed bug, an implementation function or a test. A label alone is not a Story.

## Fields

| Field | Meaning |
| --- | --- |
| ID and Title | Stable identity and a descriptive label; Title is not the definition |
| [Actor](actor.md) | Who or what is acting |
| [Intent](intent.md) | What the Actor seeks to accomplish, and why |
| [Initial State](initial-state.md) | Relevant situation before acting |
| [Action](action.md) | What the Actor does; may be a sequence forming one coherent episode |
| [Expected Result](expected-result.md) | The complete intended outcome, including all relevant logical, functional, interactive and visual details, but **not visual styling** |
| [Domains](domains.md) | **Optional:** a set of organizational tags |
| [Comments](comments.md) | **Optional:** a list |

The core episode must have an effective Actor, Intent, Initial State, Action and Expected Result; an [Epic](epic.md) may supply common Initial State and part of Expected Result. A Story relates to an Epic (exact relationship cardinality is not yet settled).

## Rules

- Expected Result can be **conditional**. Not every choice or unsuccessful outcome deserves a separate field or separate Story.
- A [sub-US](sub-user-story.md) is appropriate when a variant is a **meaningfully different episode of use**.
- Initial State can be established or *non-pristine*; a new/empty/ideal project is never assumed by default.
- A new Story must be complete enough to derive acceptance tests **without inventing product requirements**.
- Applicable Aspects are **not** a required US field. Their relevance may be implicit in the description or explicitly established when the project developer edits the definition.
- Do not invent US fields named `Exceptions`, `Bounds` or `Observable Result`. Relevant conditions and outcomes belong in the proper existing fields; engineering constraints and verification are different concepts.
- Historical tests and discovered bugs may expose a missing scenario or needed clarification. They do not independently determine the intended Story.

See [US test](us-test.md) for test ownership and historical/non-pristine scenario digestion.
