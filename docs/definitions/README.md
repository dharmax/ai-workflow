# AIWF definitions — canonical glossary

**Authority:** These files state the developer-agreed meanings of AIWF terms. One term per Markdown file. Read the applicable definition **before** drafting a Story, proposing a design, deriving a test/Ticket or changing the associated implementation. A dated plan, example, existing field in code or AI-generated summary cannot silently redefine a term.

**Change rule:** Treat agreed wording as fixed. Amend a definition only with the project developer's explicit approval of the particular semantic change. Suggestions and unresolved questions are not rules. An assistant must identify a contradiction, point to the exact definition and seek a decision; it must **not** fill the gap with conventional agile vocabulary, inferred fields or a conveniently testable substitute. Keep changes to the relevant term file and update references rather than writing competing definitions elsewhere.

## Terms

- [User/Actor Story](user-story.md)
- [Epic](epic.md)
- [Sub-US](sub-user-story.md)
- [Actor](actor.md)
- [Intent](intent.md)
- [Initial State](initial-state.md)
- [Action](action.md)
- [Expected Result](expected-result.md)
- [Domains](domains.md)
- [Comments](comments.md)
- [US test](us-test.md)

The US's agreed fields are stable identity/title, Actor, Intent, Initial State, Action and **Expected Result**; optional Domains (a set) and Comments (a list). A US has **at most one designated primary Epic** (one when assigned; mandatory assignment is still open) and may have other non-parent graph relations. A primary Epic may supply common Initial State, part of Expected Result, Domains and Comments. A sub-US inherits its parent's entire effective definition, refining/replacing relevant parts, and is titled `Parent title - distinction`.

**Not US fields:** `Exceptions`, `Bounds`, `Applicable Aspects` and `Observable Result`. An unsuccessful or conditional outcome belongs within **Expected Result** when appropriate. Aspects remain their own independently modeled concerns; they may be inferred from the Story's description or explicitly associated during developer editing, not imposed as a mandatory Story field.

## Deliberately unresolved — no invented defaults

- **Primary Epic provision:** Should every US be required to have a primary Epic, with a simple `Default` Epic automatically used when none was supplied? **Proposed, not approved.** The *at most one designated primary Epic, with other non-parent relations permitted* rule is agreed.
- The exact composition/precedence for Epic-shared Initial State and Expected Result, including apparent contradictions.
- **Comments / Requirements:** Whether Comments provide half-formal input from which an LLM may derive candidate requirements, and the precise review/promotion rules; whether a separate optional `Requirements` field adds value.
- **Preconditions:** Whether a separate optional list is needed, given that Initial State already describes the relevant starting situation.
- Domain tag vocabulary/taxonomy and details of effective tag composition beyond their role as organizational tags.
- Detailed field-by-field implementation mechanics for sub-US refinements/replacements. **The principle of full inheritance is already agreed.**

These questions require separate developer decisions. They do **not** authorize adding schema fields or blocking all Story work.

## Implementation / historical-text mismatch

The current `src/graph/ontology.ts` UserStory template still contains legacy `exceptions` and `bounds` fields and does not yet implement the newly agreed glossary's full relationship/refinement semantics. Some older plans and journeys also say “expected observable result” or prescribe those fields. They are **implementation/history to reconcile**, not alternative canonical definitions. Changing the code or migrating old records is a separate, reviewed task; do not infer it has occurred merely because this glossary exists.

For old plans, keep their factual/provenance value but defer to this glossary for terminology. Product definition, executed test evidence and implementation work remain distinct.
