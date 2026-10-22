# Definition usage check — DW-02 (provisional)

**Purpose:** exercise the canonical definitions against an **existing AIWF product-use scenario**, without manufacturing a new accepted Story or claiming that its tests ran. This is an investigation aid, not another definition or a product-approval record.

**Source:** [DW-02 — Review and edit a complete Story](journeys.md#dw-02--review-and-edit-a-complete-story). Existing implementation-related cases are in [`tests/dharmax-s3.test.ts`](../tests/dharmax-s3.test.ts). The journey document labels DW-01–09 as target material, **not** currently accepted canonical Story definitions.

## Definition basis and approval gate

| Concern | What is actually established |
| --- | --- |
| Product charter | [Mandatory](definitions/product.md), but the tracked [manifest](../product-manifest.md) reports no defined charter. That projection is not a fresh DB inspection. **No approval/alignment can be inferred.** |
| Relevant definitions | [US](definitions/user-story.md), [Product](definitions/product.md), [Proposal & Acceptance](definitions/proposal-and-acceptance.md), [Epic](definitions/epic.md), [Test](definitions/test.md), [Verification](definitions/verification.md) |
| Actor/Feature | Developer using AIWF; the scenario refers to Avatar Filters and a proposed Save filtered avatar Story |
| Epic/Aspect/Rule basis | Not specified in the source scenario; must be inspected if relevant, **not invented** |
| Status | **Provisional documentary exercise.** Developer must establish/review the charter and explicitly approve the effective Story and material alignment warnings before this becomes an authoritative acceptance test |

## Candidate US — transcribed from DW-02, not an invented specification

| Field | Source-grounded content |
| --- | --- |
| ID | `DW-02` is the existing *journey catalog ID*, not proof of a stored canonical US identity |
| Title | Review and edit a complete Story |
| Actor | Developer |
| Intent | Ensure `Save filtered avatar` expresses real user behavior rather than just a label |
| Initial State | AIWF displays an unaccepted AI-proposed Story associated with Avatar Filters |
| Action | Developer edits Actor, Intent, Initial State, Action and Expected Result, reviews the edited definition, accepts and reopens it |
| Expected Result | Exactly the developer-edited scenario persists as accepted. The source also expects rejecting/abandoning a proposal to leave canonical intent unchanged and ambiguous migrated Stories to remain visibly in need of review, not silently completed |
| Domains / Comments | Not specified; optional. Do not fill them to satisfy a form |

No extra US fields or hidden requirements are deduced. **Do not silently classify** rejection/abandonment or migrated-legacy handling as separate sub-USs; first decide whether they are different episodes or meaningful scenarios within DW-02.

## Acceptance derivation check — conditional, not runnable authority

Only **after** charter/Story approval, an acceptance file could cover these source-supported observations:

1. Given the unaccepted proposal, editing/reviewing it alone does **not** mutate canonical accepted intent.
2. After the developer explicitly accepts the edited definition, reopening retrieves **the exact accepted scenario** and its approved association.
3. Rejecting or abandoning the proposal leaves canonical product intent unchanged.
4. An ambiguous migrated legacy Story remains visible as needing review, never silently auto-completed—**confirm its scenario/sub-US ownership during approval**.

The developer-supplied edit values are test inputs, not invented fixed product requirements. A real public-interface test would need the actual approved charter and Story basis, relevant applicable policy, authoritative operation/fixture and independent result verification. **No test file was generated or executed by this dry run.**

## What comparing existing tests exposed

The current [S3 Workspace test file](../tests/dharmax-s3.test.ts) mixes DW-01, DW-02 and other journeys. It includes Story editing/reload and relationship-preservation checks, but the case labeled “DW-02 cancel and reject” primarily exercises a **Feature** proposal. Therefore its name alone cannot establish complete DW-02 ownership or acceptance. The canonical charter alignment requirement is newer than this evidence. Reconcile valuable coverage under genuine approved US ownership when consolidating; do **not** discard it or claim a new red/green run.

**Result of the exercise:** the glossary is sufficient to describe and bound the episode *without inventing fields*, and it correctly stops false approval at the missing-charter gate. The real next product action is to obtain the developer-approved charter and effective DW-02 definition; only then derive/reconcile its authoritative US test. No production, test or product-record mutation is implied here.
