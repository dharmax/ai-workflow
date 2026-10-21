# Comments

**Status:** Developer-agreed optional field; interpretation as semi-formal requirements is under discussion.

An **optional list of comments** associated with a User/Actor Story. Its primary [Epic](epic.md) may also provide comments common to its USs. A [sub-US](sub-user-story.md) inherits its parent's comments unless it explicitly refines/replaces relevant material.

Comments are useful context for a developer and for an LLM processing the Story. **Open design question:** can comments act as half-formal input from which the LLM deduces proposed requirements, without adding a separate `Requirements` field?

**Proposed handling—not yet a mandatory rule:** allow the LLM to consider all comments, but surface a consequential inferred requirement or ambiguity for developer review rather than quietly changing accepted product behavior or acceptance criteria. A developer-approved clarification can then be expressed in the relevant Initial State / Expected Result (or other approved owner). Do not discard comments merely because they are not structured.

There is **no approved decision** to add `Requirements` or `Preconditions` fields, or to treat every comment as non-normative / automatically binding.
