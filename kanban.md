---
kanban-plugin: board
---

# Kanban

_Generated from the workflow DB. Edit through `ai-workflow project ...` or `ai-workflow sync`._
_Core lanes are fixed. Rare lanes only render when they contain cards. `Archived` history lives in `kanban-archive.md`._

## Deep Backlog

- No items

## Backlog

- No items

## ToDo
<!-- canonical alias: ## Todo -->

- [ ] 2a5f10962269f7154a11336ae784527a4518f7ab Leaderboards Feature
  - State: open
- [ ] 69b35836fb3e8a7adb4f073b5f975d87f97217b1 Power-ups Feature
  - State: open
- [ ] 3f08e3e870e768740e48076d56cc0144a6e1d70c Scoring System Feature
  - State: open
- [ ] e12bfffb5674322c7d9545d5358f5929aa677eac Basic Game Mechanics Feature
  - State: open
- [ ] 7a054f32ec901db5d243e5b868a510c5a84692bb Multiplayer Support Epic
  - State: open
- [ ] 75dfcb10dc44152d1178e7e97e66f78d0cffd31a Level Design Epic
  - State: open
- [ ] bb543f7b2de395cf5d8041f5f416d68e43db14a6 Emoji Ships Epic
  - State: open
- [ ] 205f7b3908dc67324727f776746a2a5c92872d74 Game Engine Epic
  - State: open

## Bugs P1

- No items

## Bugs P2/P3

- No items

## In Progress

- No items

## Human Inspection

- No items

## Suggestions

- No items

## Done

- [ ] TKT-HONESTY-004 Add workflow note resolution and stale-risk retirement ✅ 2026-04-19
  - Summary: Add a DB-backed note resolution flow so stale BUG/RISK/TODO evidence can be retired with explicit reason, excluded from readiness blockers, and archived in candidate/projection state when later work closes the gap.
  - State: archived
- [ ] TKT-HONESTY-003 Add gap guardrails and escalation policy ✅ 2026-04-19
  - Summary: Detect wish-vs-done gaps, choose recovery actions such as retry/escalate/web-search/user-input/trial-and-error, persist them in the workflow DB, and surface them in verification and audit outputs.
  - State: archived
- [ ] TKT-HONESTY-002 Make dogfood and audit fail on mixed manual-plus-shell artifacts ✅ 2026-04-19
  - Summary: Detect and report when a dogfood target was repaired outside ai-workflow, persist that evidence, and fail dogfood/workflow-audit until a clean run exists.
  - State: archived
- [ ] TKT-HONESTY-001 Enforce shell honesty and manual-contamination detection ✅ 2026-04-19
  - Summary: Add first-class workflow evidence that separates ai-workflow-authored work from manual edits, blocks closure when manual contamination exists, and makes failure honesty DB/kanban-auditable.
  - State: archived
- [ ] 272af4783f188efd601c99883e18eca9320dee2d Initialize Project ✅ 2026-04-19
  - State: archived
- [ ] TKT-SHELL-AUDIT-001 Make shell dogfood evidence and metrics audit-grade ✅ 2026-04-19
  - Summary: The current dogfood/reporting path still leaves critical trust gaps: the report does not show per-turn model provenance, the raw transcript is dominated by JSON envelopes so English->JS evidence is unclear, deterministic run_codelet routing is not distinguished from model-authored JS, and metrics still show zero token usage plus weak per-session accounting. Implement audit-grade provenance, transcript artifacts, and metrics so a user can verify what the shell planned, what JS it generated, what codelet executed, which model/provider was used, and what the session actually cost.
  - State: archived
- [ ] TKT-SHELL-TRANSCRIPT-001 Harden shell transcript judge against malformed model output ✅ 2026-04-19
  - Summary: Dogfood still shows shell transcript judge returning raw numeric arrays instead of a structured verdict. Add parser hardening, routing fallback, and regression coverage.
  - State: archived
- [ ] d90a89c1cc0ce2a2b88e14a1479d9abf96c6a752 Modular, Expandable 3D Canvas Space Invaders-style Game with Emoji Ships ✅ 2026-04-19
  - State: archived
- [ ] TKT-PROGRAMMING-DOGFOOD-001 Add smart programming dogfood that generates and verifies a modular emoji Space Invaders game ✅ 2026-04-18
  - Summary: Create an ai-workflow-driven programming dogfood flow that plans, brainstorms, implements, tests, debugs, and reports on a generated dedicated-folder project: a modular expandable 3d canvas Space Invaders-style game using emoji ships, epics/features/modules/vision, and readable efficiency metrics.
  - State: archived
- [ ] TKT-METRICS-COVERAGE-005 Record smart codelet and artifact judge runs in metrics summaries ✅ 2026-04-18
  - Summary: Programming dogfood now succeeds, but metrics remain misleading because artifact evaluation and smart codelet executions do not append metric events, so the efficiency/reporting surface only reflects older shell-planning data.
  - State: archived
- [ ] TKT-ROUTE-REDACTION-004 Redact route candidate credentials in verification and smart codelet payloads ✅ 2026-04-18
  - Summary: Regression output showed that route sanitization only redacts route.providers, leaving recommended/fallbackChain/candidates entries with raw apiKey values in JSON payloads.
  - State: archived
- [ ] TKT-SMART-CODELET-003 Add routed fallback and degraded diagnostics to smart codelet runner ✅ 2026-04-18
  - Summary: Programming dogfood exposed that runSmartCodelet can fail hard on a blocked recommended provider instead of trying the router fallback chain or returning a structured degraded result with route diagnostics.
  - State: archived
- [ ] TKT-ARTIFACT-JUDGE-002 Harden artifact judge against non-structured model output and add fallback routing ✅ 2026-04-18
  - Summary: Dogfood exposed that artifact verification can accept junk non-JSON model output as a normal needs-human-review result instead of retrying alternate providers and clearly flagging an unstructured verdict failure with diagnostics.
  - State: archived
- [ ] TKT-SHELL-METRICS-001 Expose shell fallback failures and richer metrics for degraded planning runs ✅ 2026-04-18
  - Summary: Reproduce shell planning/provider fallback degradation, surface the failing phase/provider chain more clearly, and extend metrics/reporting so dogfood runs show where time and failures were spent.
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-005 Plan active guardrail compilation from guidelines ✅ 2026-04-18
  - Summary: Automatically convert repo guidelines into effective active guardrails that are enforced across all execution surfaces and modes, including shell and non-shell flows.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-001 Plan epic and projection integrity repair ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define how to repair malformed epic and projection state so new planning work lands on clean DB-backed workflow surfaces.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-002 Plan DB coverage for features modules and host surfaces ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define required DB representations for features, modules, shell surfaces, and plugin or MCP host integrations involved in the new work.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-004 Plan shell capability intelligence and project situational awareness ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define how the shell learns built-in, configured, and project-provided capabilities; explains and improves them with the user; and grounds every development discussion in live features, epics, surfaces, modules, problems, and plans.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-SHELL-MODES-001 Plan canonical shell work-mode model ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define operator-visible shell work modes for planning, fixing, feature work, auditing, bug-hunting, and auto, while keeping mutation safety enforced internally.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-WORKFLOW-INTEGRITY-003 Plan shared governance hooks for shell and host integrations ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Specify how shell, ask, operator-brain, JS orchestrator hooks, and plugin or MCP adapters consume one shared DB-backed judgment core.
  - Epic: EPIC-WORKFLOW-INTEGRITY-001
  - Parent: EPIC-WORKFLOW-INTEGRITY-001
  - State: archived
- [ ] TKT-SHELL-MODES-002 Plan shell mode inference and override UX ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define automatic mode selection plus explicit commands like mode <name>, mode auto, and mode status, including session persistence rules.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-SHELL-MODES-003 Plan mode-aware routing and execution policy ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Map each shell work mode onto task classes, routing strategy, action eligibility, mutation posture, and answer style.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-SHELL-MODES-004 Plan shell mode visibility in DB and transcripts ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define how effective mode, mode source, and mode transitions are recorded, projected, and exposed to operators and host integrations.
  - Epic: EPIC-SHELL-MODES-001
  - Parent: EPIC-SHELL-MODES-001
  - State: archived
- [ ] TKT-GOE-001 Plan fixed v1 GoE triad and iteration contract ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define the suggester, critic, and auditor or escalator loop, including bounded retries, approval rules, and third-persona escalation after repeated dissatisfaction.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-002 Plan default-on GoE policy and overrides ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define project-level default enablement, session and request overrides, and the narrow cases where trivial or deterministic work bypasses GoE.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-003 Plan GoE coverage for coding and debugging work ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define how GoE wraps most coding and debugging work by default, especially when routed through weaker or cheaper models.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-004 Plan GoE on shell interpretation and produced code ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define how GoE governs shell planning and interpretation itself and also audits the actual code or fix artifacts produced by the workflow.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived
- [ ] TKT-GOE-005 Plan GoE escalation outcomes and human handoff ✅ 2026-04-18 ✅ 2026-04-18
  - Summary: Define stronger-model escalation, unsolved-problem tickets for the user, stored evidence, and explicit approve or reject verdicts.
  - Epic: EPIC-GOE-001
  - Parent: EPIC-GOE-001
  - State: archived

%% kanban:settings
```
{"kanban-plugin":"board"}
```
%%
