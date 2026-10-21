# Expected Result

**Status:** Developer-agreed field. **Use this exact term**, not “Observable Result”.

The **complete expected outcome** of the [Action](action.md) under the relevant [Initial State](initial-state.md).

Include all relevant result details: logical, functional, interactive, visual, and other product behavior needed to define the intended experience. Visual content, information and interaction belong here **when relevant**; **visual styling does not**.

- Results **may be conditional**: different legitimate outcomes can be stated for different applicable conditions, including an unsuccessful operation where appropriate.
- Be **complete enough to derive acceptance tests without inventing product requirements**, not exhaustively enumerate imagined permutations.
- An [Epic](epic.md) may specify common **parts of Expected Result**; the US supplies its own outcome.
- This defines the **expected** product reality, not an observed run, bug report, test assertion, proof status or implementation technique.

Do not add separate mandatory `Exceptions` or `Bounds` fields. If a condition changes what is expected, specify it in the relevant Initial State or conditional Expected Result, or define a [sub-US](sub-user-story.md) when it is genuinely a different episode.
