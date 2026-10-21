# Product — mandatory charter

Every AIWF project has **one canonical, developer-approved Product charter**. It establishes the product against which all subsequent product definitions are judged. It is not an optional description, a generated summary, the application binary or a second copy of its Features.

The charter explicitly covers **purpose, intended actors, scope, non-goals and relevant boundaries/constraints**. The developer must review the whole charter; a genuinely empty non-goals/boundaries entry is an explicit choice, not permission to omit consideration. Its definition and amendments require [developer acceptance](proposal-and-acceptance.md). Its identity is stable.

## Charter alignment — ongoing obligation

**Every proposed or revised Aspect, Feature, Epic and US must be examined against the current accepted charter**, including relevant inherited Epic/US context. The same principle applies to other product definitions where they materially affect charter intent.

If purpose, audience/actors, scope, non-goals or constraints conflict—or there is material ambiguity or drift—AIWF must **issue a specific, grounded warning and obtain an explicit developer answer**. The answer may revise the proposed definition, revise the charter through its own governed approval, explicitly decide an explained exception, or defer the item as unresolved. No AI inference, silence or generic acknowledgment counts as resolution. Preserve the warning, answer and relevant decision; do not treat an unanswered warning as alignment or silently accept conflicting product intent. Approval does not mean implementation or verification.

Review is repeated when an applicable definition or the charter changes; expose potentially affected relationships and stale acceptance evidence rather than automatically rewriting descendants. A charter is the product-intent anchor, not a substitute for [Aspects](aspect.md), [Features](feature.md) or complete [USs](user-story.md).

## Product manifest and existing-state gap

The **Product manifest** is a view of the charter and linked top-level Features, never another independently editable authority. A Feature's concise manifest entry and detailed definition refer to the same graph identity/revision. Missing membership does not erase a Feature.

**Implementation/migration gap:** prior Product Operability plans explicitly made the Product singleton optional; this decision supersedes that assumption. The tracked `product-manifest.md` currently says no top-level charter is defined (a projection, not a fresh DB check). AIWF must reveal any missing charter and obtain its real definition/approval, **not manufacture a default, mark a legacy project compliant or pretend the new alignment workflow is implemented**. Technical maintenance can still use a justified direct [Ticket](ticket.md) without inventing product Stories; it does not create an exemption from charter integrity.
