# Codex/AGY goal — restore strategy + composition agency

**Do not execute the older shell-centric goal.** This goal follows the stopped checkpoint at `4d25930386ae92c1aa812045163521cdcea120d6`.

Read first:

1. `docs/agency-constitution.md`
2. `docs/agency-restoration-plan.md`
3. `docs/agency-checkpoint.md`
4. J2.4 in `docs/use-story-catalog.md`
5. actual local sibling sources for `../skill-manager`, `../text-compiler`, `../llm-utils`

## Goal

Restore AIWF as a general Actor by giving it good **strategy selection + know-how acquisition + capability acquisition + deterministic composition**, rather than forcing difficult analytical goals through a long shell/ReAct loop.

Preserve the useful checkpoint work. Do not revert it wholesale.

## Required sequence

1. **Phase 0 only first:** audit the exact sibling APIs and classify the stopped failures. Report before broad implementation if any plan assumption is false.
2. Add one bounded cheap System-1 tactical assessment using existing llm-utils routing. It is advisory only; failure falls through.
3. Integrate skill-manager for runtime `find + activate` only. No skill authoring/promotion in restoration.
4. Integrate text-compiler as a thin behavior-level ephemeral composition facility over explicit input evidence.
5. Generated code must execute/verify under the same execution authority as `run_command`; no read-only bypass through in-process generated execution.
6. Simplify Actor guidance so shell is one means, not the fallback architecture.
7. Redesign/run the Agency Gate exactly as specified in `docs/agency-restoration-plan.md`.
8. Run the three live acceptance requests and independently review grounding/correctness.
9. Run focused/full/typecheck and affected sibling verification.

## Hard constraints

- Work on `master`; no new branch forest.
- No new planner/orchestrator/strategy state machine.
- No deterministic single-route dispatcher.
- No prompt-specific critical-path/ordinal/ranking handlers.
- No duplicate skill index or capability registry.
- No new compiler: use `@dharmax/text-compiler`.
- No durable skill/codelet creation for ordinary one-off analysis.
- No baseline `script_eval`.
- Do not make compiler usage mandatory for prompts that are simpler by another route.
- Do not treat generated scratch/test/example data as project facts.
- Do not claim success from HTTP 200, schema validity, component tests, or model self-review.

## Stop/report contract

When the revised Agency Gate is genuinely green, stop and report:

1. proven root causes of the stopped failures;
2. final strategy architecture in <=10 lines;
3. exact System-1 assessment contract and measured overhead;
4. exact skill-manager integration;
5. exact compiler integration and safety boundary;
6. changed production files and why;
7. mechanism + adversarial + live acceptance results;
8. before/after steps/tool calls/model calls/latency where measured;
9. full/typecheck/sibling verification;
10. remaining risks.

If a gate fails, keep it failed and report the evidence. Do not weaken acceptance or special-case the prompt.
