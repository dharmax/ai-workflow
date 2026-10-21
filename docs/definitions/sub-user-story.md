# Sub-US (sub-User/Actor Story)

**Status:** Developer-agreed definition.

A variant modeled as a sub-US **when it represents a meaningfully different episode of use**. A conditional outcome within the same episode can instead remain in its parent's [Expected Result](expected-result.md).

A sub-US is still a [US](user-story.md), and **inherits its parent's complete effective definition**. It may **refine or replace** the part(s) that distinguish its episode; all unmodified parts remain inherited. Its parent US's effective definition already includes common context from its primary [Epic](epic.md). Do not demand needless repetition of inherited material.

**Title rule:** use the parent US title followed by ` - xxx`, where `xxx` names the distinction. For example, `Save avatar - Existing avatar`. This title is a label, not a substitute for defining the distinguishing behavior.

A sub-US is not a device for turning every branch, implementation step, parameter or bug assertion into a new Story. Do not invent more detailed field-by-field merge or editing mechanics before they are needed and approved.
