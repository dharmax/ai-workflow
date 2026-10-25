# Feature

A **specific functionality or capability the product provides**, considered against the mandatory [Product charter](product.md). Every proposed/revised Feature is reviewed for conflict, ambiguity or drift; a material issue requires a grounded warning and explicit developer answer, not implicit AI approval. Features can be identified or derived from actual [USs](user-story.md), and a Feature's definition and changes in turn affect its related USs. The relationship is meaningful in both directions, **not** a requirement to create a Feature mechanically for each Story.

Compared with an [Aspect](aspect.md), a Feature is concrete and functional. An Aspect is more abstract and cross-cutting. For example:

- **Aspect:** `Persistency` — a reusable policy relevant to many unrelated capabilities.
- **Feature:** `Saveable user-feedback` — the specific functionality that lets feedback be saved.
- **Graph relationship:** `Persistency:Aspect --applies-to--> Saveable user-feedback:Feature`.

A complete Feature has a stable ID, Title and a meaningful description of its **functionality/capability** (currently labeled *Responsibility* in parts of the existing Feature/manifest contract). Optional outcomes, scope, feature-specific behavior and priority refine it when needed; never fill fields for ceremony. A concise Product-manifest entry and detailed definition refer to the **same canonical identity/revision**.

A Feature may enable USs, and accepted applicable Aspects contribute shared expectations without copying policy text into the Feature. Feature definition acceptance is distinct from implementation and verification. **Delivery hierarchy (agreed 2026-10-25):** A Feature may have **zero or more [Epics](epic.md)**. For a small Feature, use **Feature → US → Ticket(s)** directly. For a substantial Feature, use **Feature → Epic(s) → USs → Tickets** where the Epics represent meaningful delivery increments or implementation levels (e.g. basic, complete, advanced). The US defines observable behavior and its acceptance, regardless of whether an Epic exists. A justified technical-only Ticket may relate directly to a Feature without inventing a US. Neither Epics nor their number are mandatory. A [Ticket](ticket.md) is engineering work, not functionality.

See [the agreed manifest/Feature contract](../../plans/AIWF-S5-POSTCONDITION-DESIGN.md#321-product-manifest-and-feature-definitions--2026-10-17-agreement) for existing field/storage details.
