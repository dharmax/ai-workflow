# Skill-manager and source-synthesis hardening

Scope: TKT-SKILL-MANAGER-UPGRADE and TKT-CODE-SYNTHESIS-ENGINE only. Accepted architecture retained.

Implemented: grounding system prompt on existing_symbol; source-only synthesis with Ticket.resolve wrapping ordinary replace_symbol; no guessed targets; investigated dossier as synthesis evidence; fresh project-specific managers; project/explicit skill sources; observable sync, retrieval and activation failures; canonical registry access for CLI kb list/search/show.

User journeys in tests/skill-synthesis-acceptance.test.ts:
- A developer discovers project frontend guidance through the CLI.
- A developer asks the real configured WorkflowActor for a checkout stylesheet. The Actor discovers and reads the project skill, writes theme.css, and runs the fixture project's CSS parser test before concluding. Successful tool observations must contain both tool definitions and the skill's actual design tokens; the final narration is not treated as activation proof. CSSStyleSheet parsing checks :root design tokens and the .checkout-card declarations, rather than accepting text or a completion claim.
- A maintainer repairs checkout totals through the real configured host and Ticket.resolve. The surcharge/discount/zero tests fail before repair and pass afterward. Only src/price.ts changes; test assertions and the exported function name are preserved. Default independent verification creates an isolated verification receipt.
- Malformed skill data produces a failing CLI exit with the actual sync error.

No model output or acceptance verdict is stubbed in these opt-in live journeys. Fixture projects isolate filesystem and graph state and use installed dependencies rather than sibling checkout content.

Acceptance evidence fixes: complete tests directly authored as verifying a Ticket supply source proof; all broader regression results remain available to the reviewer and are still executed. Missing authored execution evidence blocks review. Fixture references do not enlarge the Ticket's exact source scope. A prior VERIFY receipt is excluded from independent review so an obsolete verdict and its verbose output cannot substitute for current code and assertions. Context limits remain 64000/80000 characters.

The source ticket's obsolete mutation-returning synthesizer criterion was reconciled to the user's explicit source-only contract; the other criteria are unchanged.

Final focused: bun test tests/source-synthesis.test.ts tests/skill-manager-bridge.test.ts tests/skill-synthesis-acceptance.test.ts tests/ticket-resolution.test.ts
60 pass, 2 opt-in live skips, 0 fail; 356 assertions (21.71 seconds).

Separate live: AIWF_LIVE_ACCEPTANCE=1 bun test tests/skill-synthesis-acceptance.test.ts
4 pass, 0 fail; 33 assertions (19.28 seconds), using configured OpenRouter openai/gpt-4o-mini.
Trace: /tmp/aiwf-final-live.log.

Final full: bun test
322 pass, 2 opt-in live skips, 0 fail; 2097 assertions across 42 files (44.41 seconds).
bun run typecheck, bun run pack, and git diff --check passed.

The initial isolated live fixture used different credential defaults and failed; it was corrected to reuse repository configuration without changing model-runtime/provider/routing implementation. Failed trace: /tmp/aiwf-live-acceptance.log. Subsequent attempts also exposed overly broad verification evidence and an obsolete receipt in the review payload. These failures were retained and fixed without changing context limits or bypassing the independent verifier.

A retry caught an assertion that depended on final narration of tool names even though the correct stylesheet and activation metadata were present. The test now checks those definitions in actual successful tool observations, preserving the CSS checks. Failed trace: /tmp/aiwf-user-journey-synthesis-complete.log.

Final no-edit retries passed default independent acceptance for both existing tickets. Both are Done/verified with current VERIFY receipts; contract signatures and source hashes were checked. Acceptance traces: /tmp/aiwf-final-synthesis-acceptance.log and /tmp/aiwf-final-manager-acceptance.log. No remaining blocker. No other ticket executed.

A subsequent live retry caught an escaped newline that made the checkout selector invalid. The fixture now exposes a real project CSS test command and requires successful execution, while retaining the independent parsed CSS assertions. Failed trace: /tmp/aiwf-outcomes-synthesis-verified.log.
