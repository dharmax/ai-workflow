# US Test

An executable test establishes whether actual product behavior meets an accepted [US](user-story.md)'s **Expected Result**. The intended organization is **one test file per accepted US**, containing the meaningful scenarios of that episode (not one file per implementation method, subsystem or historical bug).

Its scenarios may include the ordinary episode, real non-pristine Initial States, conditional alternatives, meaningful sub-flows, discovered regressions and necessary safety/failure outcomes. A genuinely distinct [sub-US](sub-user-story.md) is itself a US.

Retain, move or refine an old case when it proves such a real flow, even if technically detailed. Before discarding an unmatched case, check whether it reveals a missing Story/sub-US or important condition. Distinct internal assertions alone neither justify a new US nor require preservation.

Tests report **observed evidence**; they do not invent the product's Expected Result. Verify existing behavior as it is, never invent historical expected-red evidence, and never count skipped/unavailable tests as passing.
