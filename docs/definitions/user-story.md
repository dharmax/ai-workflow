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

The core episode must have an effective Actor, Intent, Initial State, Action and Expected Result. A US has **at most one designated primary [Epic](epic.md)** (one when assigned), which may supply common Initial State and part of Expected Result (as well as Domains and Comments). Whether a US may remain unassigned or must be placed in a `Default` Epic is still under discussion. A [sub-US](sub-user-story.md) inherits its parent US's full effective definition, refining or replacing the distinctions.

## Rules

- Expected Result can be **conditional**. Not every choice or unsuccessful outcome deserves a separate field or separate Story.
- A sub-US is appropriate when a variant is a **meaningfully different episode of use**, titled `Parent title - distinction`.
- Initial State can be established or *non-pristine*; a new/empty/ideal project is never assumed by default.
- A new Story must be complete enough to derive acceptance tests **without inventing product requirements**.
- Applicable Aspects are **not** a required US field. Their relevance may be implicit in the description or explicitly established when the project developer edits the definition.
- Do not invent US fields named `Exceptions`, `Bounds` or `Observable Result`. Relevant conditions and outcomes belong in the proper existing fields; engineering constraints and verification are different concepts.
- Historical tests and discovered bugs may expose a missing scenario or needed clarification. They do not independently determine the intended Story.

**Under discussion, not extra fields:** whether free-form Comments should be usable as semi-formal input for LLM-suggested requirements, and whether separate Requirements / Preconditions lists would add value. See [Comments](comments.md) and [Initial State](initial-state.md). Do not silently introduce either schema field as a decided rule.

See [US test](us-test.md) for test ownership and historical/non-pristine scenario digestion.
