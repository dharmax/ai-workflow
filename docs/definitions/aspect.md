# Aspect

**One authoritative, reusable governing concern/policy** relevant across multiple product or engineering artifacts—for example, Persistency.

An Aspect owns its definition in **one place** and has explicitly established applicability (with only documented, justified inheritance). Consumers reference it through graph relationships instead of copying policy text. Only **accepted** Aspects govern applicability.

An applicable Aspect contributes relevant obligations to a Feature, Story, engineering artifact and verification, as appropriate. Revising its meaning/applicability calls for grounded impact assessment and reconsideration of affected *current* proof; it does not automatically rewrite consumers or reopen unrelated historical work. Conflicting applicable policy needs review, not an arbitrary winner.

**Distinction:** a [Rule](rules-and-guidelines.md) governs engineering action; an Aspect states a reusable concern and its expected policy. An Aspect is **not** a mandatory field inside the [US](user-story.md); applicability may be implicit in the US description or explicitly established when the developer edits it.

See [the Aspect design](../../plans/AIWF-DHARMAX-WAY-DESIGN.md#23-aspect-definition-or-applicability-changes). The exact future applicability contract must not be confused with currently implemented inference.
